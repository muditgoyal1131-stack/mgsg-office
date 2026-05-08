import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  getClients, createClient, updateClient, deleteClient, getClientHealthScores,
  getClientGstins, createClientGstin, updateClientGstin, deleteClientGstin,
  getClientDocuments, uploadClientDocument, deleteClientDocument,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

interface Client {
  id: number; clientCode: string; clientName: string; legalName?: string;
  gstin?: string; address?: string;
}
interface HealthScore {
  clientId: number; clientCode: string; clientName: string; score: number;
  health: 'GOOD' | 'AT_RISK' | 'CRITICAL'; billingRealization: number;
  overdueTasks: number; overdueInvoices: number; collectionRate: number; totalTasks: number;
}

type GstType = 'REGISTERED' | 'B2C' | 'EXPORT';

interface ClientGstin {
  id: number;
  clientId: number;
  label: string;
  gstin?: string;
  gstType: GstType;
  address?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  isPrimary: boolean;
}

const GST_TYPE_OPTIONS: GstType[] = ['REGISTERED', 'B2C', 'EXPORT'];

const emptyGstinForm = () => ({
  label: '',
  gstin: '',
  gstType: 'REGISTERED' as GstType,
  address: '',
  city: '',
  state: '',
  stateCode: '',
  isPrimary: false,
});

const healthColor = (h: string) =>
  h === 'GOOD' ? 'bg-green-100 text-green-700 border-green-300'
  : h === 'AT_RISK' ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
  : 'bg-red-100 text-red-700 border-red-300';
const healthIcon = (h: string) => h === 'GOOD' ? '🟢' : h === 'AT_RISK' ? '🟡' : '🔴';

// ─── GSTIN Panel ─────────────────────────────────────────────────────────────

interface GstinPanelProps {
  client: Client;
  onClose: () => void;
  isAdmin: boolean;
}

const GstinPanel: React.FC<GstinPanelProps> = ({ client, onClose, isAdmin }) => {
  const [gstins, setGstins] = useState<ClientGstin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGstin, setEditingGstin] = useState<ClientGstin | null>(null);
  const [form, setForm] = useState(emptyGstinForm());
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getClientGstins(client.id);
      setGstins(res.data || []);
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => { fetch(); }, [fetch]);

  const gstinRequired = form.gstType === 'REGISTERED';
  const gstinDisabled = form.gstType === 'B2C' || form.gstType === 'EXPORT';

  const validate = (): string | null => {
    if (!form.label.trim()) return 'Label is required.';
    if (gstinRequired) {
      if (!form.gstin.trim()) return 'GSTIN is required for Registered type.';
      if (form.gstin.trim().length !== 15) return 'GSTIN must be exactly 15 characters.';
      if (form.gstin !== form.gstin.toUpperCase()) return 'GSTIN must be uppercase.';
    }
    return null;
  };

  const openCreate = () => {
    setEditingGstin(null);
    setForm(emptyGstinForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (g: ClientGstin) => {
    setEditingGstin(g);
    setForm({
      label: g.label,
      gstin: g.gstin || '',
      gstType: g.gstType,
      address: g.address || '',
      city: g.city || '',
      state: g.state || '',
      stateCode: g.stateCode || '',
      isPrimary: g.isPrimary,
    });
    setError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    const payload = {
      ...form,
      gstin: gstinDisabled ? undefined : form.gstin.toUpperCase() || undefined,
    };
    try {
      if (editingGstin) {
        await updateClientGstin(client.id, editingGstin.id, payload);
      } else {
        await createClientGstin(client.id, payload);
      }
      setShowForm(false);
      fetch();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving GSTIN entry');
    }
  };

  const handleDelete = async (g: ClientGstin) => {
    if (!window.confirm(`Delete GSTIN entry "${g.label}"?`)) return;
    try {
      await deleteClientGstin(client.id, g.id);
      fetch();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Cannot delete');
    }
  };

  const handleSetPrimary = async (g: ClientGstin) => {
    if (g.isPrimary) return;
    try {
      await updateClientGstin(client.id, g.id, { ...g, isPrimary: true });
      fetch();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">GSTIN / Addresses</h3>
            <p className="text-xs text-gray-500 mt-0.5">{client.clientCode} — {client.clientName}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary text-sm" onClick={openCreate}>+ Add GSTIN</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
          ) : gstins.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-sm">No GSTIN entries yet.</p>
              <p className="text-gray-300 text-xs mt-1">Click "+ Add GSTIN" to add one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gstins.map((g) => (
                <div key={g.id} className={`border rounded-xl p-4 ${g.isPrimary ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{g.label}</span>
                        {g.isPrimary && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-200">
                            ★ Primary
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          g.gstType === 'REGISTERED' ? 'bg-green-100 text-green-700'
                          : g.gstType === 'B2C' ? 'bg-purple-100 text-purple-700'
                          : 'bg-orange-100 text-orange-700'
                        }`}>{g.gstType}</span>
                      </div>
                      {g.gstin && (
                        <p className="text-xs font-mono text-gray-700 mt-1">{g.gstin}</p>
                      )}
                      {(g.address || g.city || g.state) && (
                        <p className="text-xs text-gray-500 mt-1">
                          {[g.address, g.city, g.state, g.stateCode].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!g.isPrimary && (
                        <button
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          onClick={() => handleSetPrimary(g)}
                          title="Set as primary"
                        >
                          ☆ Set Primary
                        </button>
                      )}
                      <button className="text-xs text-blue-600 hover:text-blue-800 font-medium" onClick={() => openEdit(g)}>Edit</button>
                      {isAdmin && (
                        <button className="text-xs text-red-600 hover:text-red-800 font-medium" onClick={() => handleDelete(g)}>Delete</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Form (inline in panel) */}
        {showForm && (
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-800 mb-4">
              {editingGstin ? 'Edit GSTIN Entry' : 'Add GSTIN Entry'}
            </h4>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Label *</label>
                  <input className="input-field" placeholder="e.g. Head Office" value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })} required />
                </div>
                <div>
                  <label className="label">GST Type *</label>
                  <select className="input-field" value={form.gstType}
                    onChange={(e) => setForm({ ...form, gstType: e.target.value as GstType, gstin: '' })}>
                    {GST_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">
                  GSTIN {gstinRequired ? '*' : '(not applicable)'}
                </label>
                <input
                  className={`input-field font-mono ${gstinDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                  placeholder={gstinDisabled ? 'N/A for this type' : '22AAAAA0000A1Z5 (15 chars)'}
                  value={form.gstin}
                  disabled={gstinDisabled}
                  maxLength={15}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                />
                {gstinRequired && form.gstin && form.gstin.length !== 15 && (
                  <p className="text-xs text-red-500 mt-0.5">Must be exactly 15 characters ({form.gstin.length}/15)</p>
                )}
              </div>

              <div>
                <label className="label">Address</label>
                <textarea className="input-field" rows={2} value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">City</label>
                  <input className="input-field" value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div>
                  <label className="label">State</label>
                  <input className="input-field" value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })} />
                </div>
                <div>
                  <label className="label">State Code</label>
                  <input className="input-field" placeholder="e.g. 27" value={form.stateCode}
                    onChange={(e) => setForm({ ...form, stateCode: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="isPrimary" checked={form.isPrimary}
                  onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} />
                <label htmlFor="isPrimary" className="text-sm text-gray-700">Set as Primary GSTIN</label>
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" className="btn-secondary text-sm" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary text-sm">{editingGstin ? 'Update' : 'Add'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Client Document Vault Panel ─────────────────────────────────────────────

const VAULT_CATEGORIES = ['PAN', 'GST_CERTIFICATE', 'INCORPORATION', 'BANK_DETAILS', 'BOARD_RESOLUTION', 'POWER_OF_ATTORNEY', 'FINANCIAL_STATEMENT', 'OTHER'] as const;
type VaultCategory = typeof VAULT_CATEGORIES[number];

interface VaultDoc {
  id: number; title: string; category: VaultCategory;
  fileName: string; originalName: string; fileSize: number; mimeType: string;
  notes?: string; createdAt: string;
  uploadedBy: { id: number; staffName: string };
}

interface VaultPanelProps { client: Client; onClose: () => void; isAdmin: boolean; }

const VaultPanel: React.FC<VaultPanelProps> = ({ client, onClose, isAdmin }) => {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'OTHER' as VaultCategory, notes: '' });
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try { const res = await getClientDocuments(client.id); setDocs(res.data || []); }
    finally { setLoading(false); }
  }, [client.id]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!form.title.trim()) { setError('Please enter a document title first'); return; }
    setError(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', form.title.trim());
      fd.append('category', form.category);
      if (form.notes.trim()) fd.append('notes', form.notes.trim());
      await uploadClientDocument(client.id, fd);
      setForm({ title: '', category: 'OTHER', notes: '' });
      if (fileRef.current) fileRef.current.value = '';
      fetchDocs();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDelete = async (doc: VaultDoc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try { await deleteClientDocument(doc.id); fetchDocs(); }
    catch (err: any) { alert(err.response?.data?.message || 'Cannot delete'); }
  };

  const fileSizeStr = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const mimeIcon = (mime: string) => {
    if (mime === 'application/pdf') return '📄';
    if (mime.startsWith('image')) return '🖼️';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
    return '📎';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">📁 Document Vault</h3>
            <p className="text-sm text-gray-500">{client.clientCode} — {client.clientName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Upload form */}
        <div className="p-5 border-b border-gray-100 bg-gray-50 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Upload Document</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Title *</label>
              <input className="input-field" placeholder="e.g. PAN Card" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input-field" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as VaultCategory })}>
                {VAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Notes (optional)</label>
              <input className="input-field" placeholder="Any notes about this document" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" className="hidden" id="vault-upload" onChange={handleUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip" disabled={uploading} />
            <label htmlFor="vault-upload"
              className={`btn-primary text-sm cursor-pointer ${uploading || !form.title.trim() ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? 'Uploading...' : '+ Upload File'}
            </label>
            <p className="text-xs text-gray-400">PDF, Word, Excel, Images, ZIP · max 20 MB</p>
          </div>
        </div>

        {/* Documents list */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-6">Loading vault...</p>
          ) : docs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📂</p>
              <p className="text-sm">No documents in the vault yet.</p>
              <p className="text-xs mt-1">Upload the client's permanent documents (PAN, GST cert, etc.)</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200">
                  <span className="text-2xl shrink-0">{mimeIcon(doc.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a href={`/uploads/client-vault/${doc.fileName}`} target="_blank" rel="noreferrer"
                        className="text-sm font-semibold text-blue-600 hover:underline truncate">{doc.title}</a>
                      <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0">
                        {doc.category.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {doc.originalName} · {fileSizeStr(doc.fileSize)} · {format(new Date(doc.createdAt), 'dd MMM yyyy')} · by {doc.uploadedBy.staffName}
                    </p>
                    {doc.notes && <p className="text-xs text-gray-500 italic mt-0.5">{doc.notes}</p>}
                  </div>
                  {(isAdmin || doc.uploadedBy.id === user?.staffId) && (
                    <button className="text-xs text-red-500 hover:text-red-700 shrink-0" onClick={() => handleDelete(doc)}>Delete</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Clients component ───────────────────────────────────────────────────

const Clients: React.FC = () => {
  const { isAdmin, isHR, isPartner } = useAuth();
  const canAccess = isAdmin || isHR || isPartner;
  const [clients, setClients] = useState<Client[]>([]);
  const [healthScores, setHealthScores] = useState<HealthScore[]>([]);
  const [search, setSearch] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ clientName: '', legalName: '', gstin: '', address: '' });
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'search' | 'health'>('search');
  const [gstinClient, setGstinClient] = useState<Client | null>(null);
  const [vaultClient, setVaultClient] = useState<Client | null>(null);

  useEffect(() => {
    if (tab === 'health' && canAccess) {
      setHealthLoading(true);
      getClientHealthScores().then((r) => setHealthScores(r.data || [])).finally(() => setHealthLoading(false));
    }
  }, [tab]); // eslint-disable-line

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setClients([]); setSearched(false); return; }
    setLoading(true); setSearched(true);
    try { const res = await getClients(q.trim()); setClients(res.data); } finally { setLoading(false); }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value; setSearch(v); doSearch(v); };
  const openCreate = () => { setEditing(null); setForm({ clientName: '', legalName: '', gstin: '', address: '' }); setError(''); setShowModal(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ clientName: c.clientName, legalName: c.legalName || '', gstin: c.gstin || '', address: c.address || '' }); setError(''); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      if (editing) await updateClient(editing.id, form); else await createClient(form);
      setShowModal(false); doSearch(search);
    } catch (err: any) { setError(err.response?.data?.message || 'Error saving client'); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this client?')) return;
    try { await deleteClient(id); doSearch(search); } catch (err: any) { alert(err.response?.data?.message || 'Cannot delete'); }
  };

  if (!canAccess) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-gray-500 text-lg font-medium">Access Restricted</p>
        <p className="text-gray-400 text-sm mt-1">Client management is available to Partners, HR, and Admins only.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Client Management</h2>
        <button className="btn-primary" onClick={openCreate}>+ Add Client</button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(['search', 'health'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'search' ? '🔍 Search Clients' : '❤️ Health Scores'}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <div className="card">
          <div className="mb-4">
            <input className="input-field max-w-sm" placeholder="Search by name or code... (min 2 chars)" value={search} onChange={handleSearchChange} />
          </div>
          {!searched ? (
            <p className="text-gray-400 text-sm py-8 text-center">Type to search clients</p>
          ) : loading ? (
            <p className="text-gray-500 text-sm">Searching...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className="table-header">Code</th><th className="table-header">Client Name</th>
                  <th className="table-header">Legal Name</th><th className="table-header">GSTIN</th>
                  <th className="table-header">Actions</th>
                </tr></thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="table-cell font-mono font-medium text-blue-700">{c.clientCode}</td>
                      <td className="table-cell font-medium">{c.clientName}</td>
                      <td className="table-cell text-gray-500">{c.legalName || '—'}</td>
                      <td className="table-cell text-gray-500 font-mono text-xs">{c.gstin || '—'}</td>
                      <td className="table-cell">
                        <div className="flex gap-2 flex-wrap">
                          <button className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={() => openEdit(c)}>Edit</button>
                          <button className="text-indigo-600 hover:text-indigo-800 text-xs font-medium" onClick={() => setGstinClient(c)}>GSTIN</button>
                          <button className="text-emerald-600 hover:text-emerald-800 text-xs font-medium" onClick={() => setVaultClient(c)}>📁 Vault</button>
                          {isAdmin && <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={() => handleDelete(c.id)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {clients.length === 0 && <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">No clients found for "{search}"</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'health' && (
        <div className="space-y-4">
          {!healthLoading && healthScores.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {(['GOOD', 'AT_RISK', 'CRITICAL'] as const).map((h) => (
                <div key={h} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${healthColor(h)}`}>
                  {healthIcon(h)} {h.replace('_', ' ')} <span className="font-bold">{healthScores.filter((s) => s.health === h).length}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-800">Client Health Dashboard</h3>
              <span className="text-xs text-gray-400">Score = 100 minus penalties for overdue items & low realization</span>
            </div>
            {healthLoading ? (
              <p className="text-gray-400 text-sm text-center py-8">Computing health scores...</p>
            ) : healthScores.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No client data with tasks or invoices found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-header">Client</th>
                    <th className="table-header text-center">Score</th>
                    <th className="table-header text-center">Status</th>
                    <th className="table-header text-center">Billing %</th>
                    <th className="table-header text-center">Overdue Tasks</th>
                    <th className="table-header text-center">Overdue Inv.</th>
                    <th className="table-header text-center">Collection %</th>
                    <th className="table-header text-center">Tasks</th>
                  </tr></thead>
                  <tbody>
                    {healthScores.map((s) => (
                      <tr key={s.clientId} className={`hover:bg-gray-50 ${s.health === 'CRITICAL' ? 'bg-red-50' : s.health === 'AT_RISK' ? 'bg-yellow-50/40' : ''}`}>
                        <td className="table-cell">
                          <div className="font-medium">{s.clientName}</div>
                          <div className="text-xs text-gray-400 font-mono">{s.clientCode}</div>
                        </td>
                        <td className="table-cell text-center">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 mx-auto"
                            style={{ borderColor: s.score >= 75 ? '#22c55e' : s.score >= 50 ? '#eab308' : '#ef4444', color: s.score >= 75 ? '#16a34a' : s.score >= 50 ? '#a16207' : '#dc2626' }}>
                            {s.score}
                          </div>
                        </td>
                        <td className="table-cell text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${healthColor(s.health)}`}>
                            {healthIcon(s.health)} {s.health.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`table-cell text-center font-medium ${s.billingRealization < 50 ? 'text-red-600' : s.billingRealization < 70 ? 'text-yellow-600' : 'text-green-600'}`}>{s.billingRealization}%</td>
                        <td className={`table-cell text-center font-medium ${s.overdueTasks > 0 ? 'text-red-600' : 'text-gray-400'}`}>{s.overdueTasks || '—'}</td>
                        <td className={`table-cell text-center font-medium ${s.overdueInvoices > 0 ? 'text-red-600' : 'text-gray-400'}`}>{s.overdueInvoices || '—'}</td>
                        <td className={`table-cell text-center font-medium ${s.collectionRate < 60 ? 'text-red-600' : s.collectionRate < 80 ? 'text-yellow-600' : 'text-green-600'}`}>{s.collectionRate}%</td>
                        <td className="table-cell text-center text-gray-600">{s.totalTasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{editing ? `Edit: ${editing.clientCode} — ${editing.clientName}` : 'Add Client'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">Client Name *</label><input className="input-field" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} required /></div>
              <div><label className="label">Legal Name</label><input className="input-field" value={form.legalName} placeholder="Full legal entity name" onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></div>
              <div><label className="label">GSTIN</label><input className="input-field font-mono" value={form.gstin} placeholder="22AAAAA0000A1Z5" onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} /></div>
              <div><label className="label">Address</label><textarea className="input-field" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GSTIN Panel Modal */}
      {gstinClient && (
        <GstinPanel client={gstinClient} onClose={() => setGstinClient(null)} isAdmin={isAdmin} />
      )}

      {/* Vault Panel Modal */}
      {vaultClient && (
        <VaultPanel client={vaultClient} onClose={() => setVaultClient(null)} isAdmin={isAdmin} />
      )}
    </div>
  );
};

export default Clients;
