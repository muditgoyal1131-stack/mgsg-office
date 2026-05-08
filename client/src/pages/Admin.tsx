import React, { useEffect, useState } from 'react';
import { getStaff, createStaff, updateStaff, deleteStaff, toggleStaffActive } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface Staff {
  id: number;
  staffName: string;
  isPartner: boolean;
  perHourCost: number;
  email: string;
  role?: string;
  isActive: boolean;
  reportingPartner?: { id: number; staffName: string } | null;
  reportingPartnerId?: number | null;
  dateOfBirth?: string | null;
  joiningDate?: string | null;
}

const defaultForm = {
  staffName: '', isPartner: false, perHourCost: '', email: '', password: '',
  role: 'STAFF', reportingPartnerId: '', dateOfBirth: '', joiningDate: '',
};

const roleBadge = (role?: string) => {
  if (role === 'ADMIN') return 'bg-purple-100 text-purple-700';
  if (role === 'IT') return 'bg-indigo-100 text-indigo-700';
  if (role === 'HR') return 'bg-pink-100 text-pink-700';
  return 'bg-gray-100 text-gray-600';
};

const Admin: React.FC = () => {
  const { isAdmin, isHR } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');

  useEffect(() => { fetchStaff(); }, []);

  const fetchStaff = async () => {
    try {
      const res = await getStaff();
      setStaff(res.data);
    } finally {
      setLoading(false);
    }
  };

  const partners = staff.filter((s) => s.isPartner && s.isActive);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({
      staffName: s.staffName,
      isPartner: s.isPartner,
      perHourCost: String(s.perHourCost),
      email: s.email,
      password: '',
      role: s.role || 'STAFF',
      reportingPartnerId: s.reportingPartnerId ? String(s.reportingPartnerId) : '',
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : '',
      joiningDate: s.joiningDate ? s.joiningDate.slice(0, 10) : '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: any = {
      staffName: form.staffName,
      email: form.email,
      password: form.password,
      reportingPartnerId: form.reportingPartnerId || null,
      dateOfBirth: form.dateOfBirth || null,
      joiningDate: form.joiningDate || null,
    };
    if (isAdmin) {
      payload.isPartner = form.isPartner;
      payload.perHourCost = Number(form.perHourCost);
      payload.role = form.role;
    } else {
      // HR: limited fields
      payload.role = form.role === 'IT' ? 'IT' : 'STAFF';
    }
    try {
      if (editing) {
        await updateStaff(editing.id, payload);
      } else {
        await createStaff(payload);
      }
      setShowModal(false);
      fetchStaff();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving staff');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this staff member? This cannot be undone.')) return;
    try {
      await deleteStaff(id);
      fetchStaff();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Cannot delete staff');
    }
  };

  const handleToggleActive = async (id: number, name: string, currentlyActive: boolean) => {
    const action = currentlyActive ? 'disable' : 'enable';
    if (!window.confirm(`${action === 'disable' ? 'Disable' : 'Enable'} ${name}?`)) return;
    try {
      await toggleStaffActive(id);
      fetchStaff();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error updating staff');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Admin</h2>
          <p className="text-gray-500 text-sm mt-1">Manage staff members and their access</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Add Staff</button>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Email</th>
                  <th className="table-header">Role</th>
                  <th className="table-header">Partner</th>
                  <th className="table-header">Reporting To</th>
                  {isAdmin && <th className="table-header">Rate/hr</th>}
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className={`hover:bg-gray-50 ${!s.isActive ? 'opacity-50 bg-gray-50' : ''}`}>
                    <td className="table-cell font-medium">{s.staffName}</td>
                    <td className="table-cell text-gray-500">{s.email}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge(s.role)}`}>
                        {s.role || 'STAFF'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={s.isPartner ? 'text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium' : 'text-gray-400 text-xs'}>
                        {s.isPartner ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="table-cell text-gray-500 text-xs">
                      {s.reportingPartner?.staffName || '—'}
                    </td>
                    {isAdmin && (
                      <td className="table-cell">₹{Number(s.perHourCost).toLocaleString('en-IN')}</td>
                    )}
                    <td className="table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {s.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2 flex-wrap">
                        {isAdmin && (
                          <button className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={() => openEdit(s)}>
                            Edit
                          </button>
                        )}
                        <button
                          className={`text-xs font-medium ${s.isActive ? 'text-orange-600 hover:text-orange-800' : 'text-green-600 hover:text-green-800'}`}
                          onClick={() => handleToggleActive(s.id, s.staffName, s.isActive)}
                        >
                          {s.isActive ? 'Disable' : 'Enable'}
                        </button>
                        {isAdmin && (
                          <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={() => handleDelete(s.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={8} className="table-cell text-center text-gray-400 py-8">No staff members found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editing ? 'Edit Staff Member' : 'Add Staff Member'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Staff Name</label>
                <input className="input-field" value={form.staffName}
                  onChange={(e) => setForm({ ...form, staffName: e.target.value })} required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input-field" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              {!editing && (
                <div>
                  <label className="label">Password (default: Welcome@123)</label>
                  <input type="password" className="input-field" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Leave blank for default" />
                </div>
              )}
              <div>
                <label className="label">Role</label>
                <select className="input-field" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="STAFF">Staff</option>
                  <option value="IT">IT (can resolve tickets)</option>
                  {isAdmin && <option value="HR">HR (reviews reimbursements)</option>}
                  {isAdmin && <option value="ADMIN">Admin (full access)</option>}
                </select>
              </div>
              {isAdmin && (
                <>
                  <div>
                    <label className="label">Per Hour Cost (₹)</label>
                    <input type="number" className="input-field" value={form.perHourCost} min="0"
                      onChange={(e) => setForm({ ...form, perHourCost: e.target.value })} required />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="isPartner" className="w-4 h-4 text-blue-600 rounded"
                      checked={form.isPartner}
                      onChange={(e) => setForm({ ...form, isPartner: e.target.checked })} />
                    <label htmlFor="isPartner" className="text-sm font-medium text-gray-700">Is Partner</label>
                  </div>
                </>
              )}
              <div>
                <label className="label">Reporting Partner</label>
                <select className="input-field" value={form.reportingPartnerId}
                  onChange={(e) => setForm({ ...form, reportingPartnerId: e.target.value })}>
                  <option value="">— None —</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.staffName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date of Birth</label>
                  <input type="date" className="input-field" value={form.dateOfBirth}
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                </div>
                <div>
                  <label className="label">Joining Date</label>
                  <input type="date" className="input-field" value={form.joiningDate}
                    onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
