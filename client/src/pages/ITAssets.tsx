import React, { useState, useEffect, useCallback } from 'react';
import { format, isAfter, addDays } from 'date-fns';
import {
  getITAssets, createITAsset, updateITAsset, deleteITAsset,
  assignITAsset, returnITAsset, getStaff,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetStatus = 'IN_STOCK' | 'ASSIGNED' | 'UNDER_REPAIR' | 'DISPOSED' | 'LOST';
type AssetCategory =
  | 'LAPTOP' | 'DESKTOP' | 'MONITOR' | 'KEYBOARD' | 'MOUSE'
  | 'PRINTER' | 'SCANNER' | 'PHONE' | 'TABLET' | 'SERVER'
  | 'NETWORKING' | 'UPS' | 'PROJECTOR' | 'CAMERA' | 'OTHER';

const ASSET_CATEGORIES: AssetCategory[] = [
  'LAPTOP', 'DESKTOP', 'MONITOR', 'KEYBOARD', 'MOUSE',
  'PRINTER', 'SCANNER', 'PHONE', 'TABLET', 'SERVER',
  'NETWORKING', 'UPS', 'PROJECTOR', 'CAMERA', 'OTHER',
];

interface Staff { id: number; staffName: string; }
interface ITAsset {
  id: number;
  assetCode: string;
  name: string;
  category: AssetCategory;
  brand?: string;
  model?: string;
  serialNumber?: string;
  status: AssetStatus;
  assignedTo?: Staff;
  purchaseDate?: string;
  purchasePrice?: number;
  warrantyExpiry?: string;
  location?: string;
  notes?: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusBadge = (s: AssetStatus): string => {
  switch (s) {
    case 'IN_STOCK':     return 'bg-green-100 text-green-700';
    case 'ASSIGNED':     return 'bg-blue-100 text-blue-700';
    case 'UNDER_REPAIR': return 'bg-yellow-100 text-yellow-700';
    case 'DISPOSED':
    case 'LOST':         return 'bg-red-100 text-red-700';
    default:             return 'bg-gray-100 text-gray-600';
  }
};

const warrantyClass = (expiry?: string): string => {
  if (!expiry) return 'text-gray-400';
  const exp = new Date(expiry);
  const now = new Date();
  if (!isAfter(exp, now)) return 'text-red-600 font-semibold'; // expired
  if (!isAfter(exp, addDays(now, 30))) return 'text-orange-500 font-semibold'; // within 30 days
  return 'text-gray-600';
};

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd-MMM-yy') : '—';
const fmtMoney = (n?: number) =>
  n != null ? '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '—';

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = () => ({
  name: '',
  category: 'LAPTOP' as AssetCategory,
  brand: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchasePrice: '',
  warrantyExpiry: '',
  location: '',
  notes: '',
});

// ─── Component ────────────────────────────────────────────────────────────────

const ITAssets: React.FC = () => {
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState<ITAsset[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ITAsset | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState('');

  // Assign modal
  const [assignAsset, setAssignAsset] = useState<ITAsset | null>(null);
  const [assigneeId, setAssigneeId] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, sRes] = await Promise.all([getITAssets(), getStaff()]);
      setAssets(aRes.data || []);
      setStaff(sRes.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = assets.filter((a) => {
    if (filterCategory && a.category !== filterCategory) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    if (filterAssignee) {
      if (!a.assignedTo || String(a.assignedTo.id) !== filterAssignee) return false;
    }
    return true;
  });

  // ── Add/Edit ───────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingAsset(null);
    setForm(emptyForm());
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (a: ITAsset) => {
    setEditingAsset(a);
    setForm({
      name: a.name,
      category: a.category,
      brand: a.brand || '',
      model: a.model || '',
      serialNumber: a.serialNumber || '',
      purchaseDate: a.purchaseDate ? a.purchaseDate.split('T')[0] : '',
      purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : '',
      warrantyExpiry: a.warrantyExpiry ? a.warrantyExpiry.split('T')[0] : '',
      location: a.location || '',
      notes: a.notes || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const payload = {
      ...form,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
      purchaseDate: form.purchaseDate || undefined,
      warrantyExpiry: form.warrantyExpiry || undefined,
    };
    try {
      if (editingAsset) await updateITAsset(editingAsset.id, payload);
      else await createITAsset(payload);
      setShowModal(false);
      fetchAll();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Error saving asset');
    }
  };

  const handleDelete = async (a: ITAsset) => {
    if (!window.confirm(`Delete asset "${a.assetCode} — ${a.name}"?`)) return;
    try { await deleteITAsset(a.id); fetchAll(); }
    catch (err: any) { alert(err.response?.data?.message || 'Cannot delete'); }
  };

  // ── Assign / Return ────────────────────────────────────────────────────────

  const handleAssign = async () => {
    if (!assignAsset || !assigneeId) return;
    try {
      await assignITAsset(assignAsset.id, Number(assigneeId));
      setAssignAsset(null);
      setAssigneeId('');
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error assigning asset');
    }
  };

  const handleReturn = async (a: ITAsset) => {
    if (!window.confirm(`Return "${a.name}" from ${a.assignedTo?.staffName}?`)) return;
    try { await returnITAsset(a.id); fetchAll(); }
    catch (err: any) { alert(err.response?.data?.message || 'Error returning asset'); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-gray-400 text-sm py-8 text-center">Loading IT Assets...</p>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">IT Asset Management</h2>
        <button className="btn-primary" onClick={openCreate}>+ Add Asset</button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4">
          <select className="input-field max-w-[160px]" value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input-field max-w-[160px]" value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="UNDER_REPAIR">Under Repair</option>
            <option value="DISPOSED">Disposed</option>
            <option value="LOST">Lost</option>
          </select>
          <select className="input-field max-w-[200px]" value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}>
            <option value="">All Assignees</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
          </select>
          <span className="text-sm text-gray-400 self-center">{filtered.length} asset{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Asset Code</th>
                <th className="table-header">Name</th>
                <th className="table-header">Category</th>
                <th className="table-header">Brand / Model</th>
                <th className="table-header">Serial #</th>
                <th className="table-header">Status</th>
                <th className="table-header">Assigned To</th>
                <th className="table-header">Warranty Expiry</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="table-cell font-mono font-medium text-blue-700 text-xs">{a.assetCode}</td>
                  <td className="table-cell font-medium">{a.name}</td>
                  <td className="table-cell text-xs text-gray-600">{a.category}</td>
                  <td className="table-cell text-xs text-gray-500">
                    {[a.brand, a.model].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="table-cell text-xs font-mono text-gray-500">{a.serialNumber || '—'}</td>
                  <td className="table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(a.status)}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{a.assignedTo?.staffName || '—'}</td>
                  <td className={`table-cell text-xs ${warrantyClass(a.warrantyExpiry)}`}>
                    {fmtDate(a.warrantyExpiry)}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2 flex-wrap">
                      <button className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={() => openEdit(a)}>Edit</button>
                      {a.status !== 'ASSIGNED' && a.status !== 'DISPOSED' && a.status !== 'LOST' && (
                        <button className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                          onClick={() => { setAssignAsset(a); setAssigneeId(''); }}>
                          Assign
                        </button>
                      )}
                      {a.status === 'ASSIGNED' && (
                        <button className="text-orange-600 hover:text-orange-800 text-xs font-medium"
                          onClick={() => handleReturn(a)}>
                          Return
                        </button>
                      )}
                      {isAdmin && (
                        <button className="text-red-600 hover:text-red-800 text-xs font-medium"
                          onClick={() => handleDelete(a)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="table-cell text-center text-gray-400 py-8">
                    No assets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingAsset ? `Edit Asset — ${editingAsset.assetCode}` : 'Add IT Asset'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Name *</label>
                  <input className="input-field" required value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Category *</label>
                  <select className="input-field" value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as AssetCategory })}>
                    {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Brand</label>
                  <input className="input-field" value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </div>
                <div>
                  <label className="label">Model</label>
                  <input className="input-field" value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })} />
                </div>
                <div>
                  <label className="label">Serial Number</label>
                  <input className="input-field font-mono" value={form.serialNumber}
                    onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
                </div>
                <div>
                  <label className="label">Purchase Date</label>
                  <input type="date" className="input-field" value={form.purchaseDate}
                    onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">Purchase Price (₹)</label>
                  <input type="number" min="0" step="0.01" className="input-field" value={form.purchasePrice}
                    onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
                </div>
                <div>
                  <label className="label">Warranty Expiry</label>
                  <input type="date" className="input-field" value={form.warrantyExpiry}
                    onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
                </div>
                <div>
                  <label className="label">Location</label>
                  <input className="input-field" placeholder="e.g. Server Room, Floor 2" value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Notes</label>
                  <textarea className="input-field" rows={2} value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              {formError && <p className="text-red-600 text-sm">{formError}</p>}

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingAsset ? 'Update' : 'Add Asset'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignAsset && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Assign Asset</h3>
            <p className="text-sm text-gray-500 mb-4">
              {assignAsset.assetCode} — {assignAsset.name}
            </p>
            <label className="label">Assign To *</label>
            <select className="input-field mb-4" value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Select staff member...</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setAssignAsset(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleAssign} disabled={!assigneeId}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ITAssets;
