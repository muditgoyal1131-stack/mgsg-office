import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getStaffDocuments, getExpiryAlerts, uploadStaffDocument,
  updateStaffDocumentMeta, deleteStaffDocument, getStaff,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

type StaffDocCategory = 'IDENTITY' | 'EDUCATIONAL' | 'PROFESSIONAL' | 'EMPLOYMENT' | 'OTHER';

interface StaffDoc {
  id: number; staffId: number; title: string; category: StaffDocCategory;
  fileName: string; originalName: string; fileSize: number; mimeType: string;
  expiryDate?: string | null; notes?: string | null;
  staff: { id: number; staffName: string };
  uploadedBy: { id: number; staffName: string };
  createdAt: string; updatedAt: string;
}
interface StaffItem { id: number; staffName: string; isActive: boolean; }

const CAT_LABELS: Record<StaffDocCategory, string> = {
  IDENTITY: 'Identity', EDUCATIONAL: 'Educational', PROFESSIONAL: 'Professional',
  EMPLOYMENT: 'Employment', OTHER: 'Other',
};
const CAT_COLOR: Record<StaffDocCategory, string> = {
  IDENTITY: 'bg-blue-100 text-blue-700', EDUCATIONAL: 'bg-purple-100 text-purple-700',
  PROFESSIONAL: 'bg-green-100 text-green-700', EMPLOYMENT: 'bg-orange-100 text-orange-700',
  OTHER: 'bg-gray-100 text-gray-600',
};
const fmtSize = (b: number) => b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function expiryStatus(d?: string | null): null | 'expired' | 'critical' | 'warning' {
  if (!d) return null;
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 15) return 'critical';
  if (days <= 30) return 'warning';
  return null;
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
const UploadModal: React.FC<{
  allStaff: StaffItem[]; myStaffId?: number; isHRAdmin: boolean;
  onSave: (fd: FormData) => Promise<void>; onClose: () => void;
}> = ({ allStaff, myStaffId, isHRAdmin, onSave, onClose }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [staffId, setStaffId] = useState(isHRAdmin ? '' : String(myStaffId || ''));
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<StaffDocCategory>('OTHER');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }
    if (!staffId) { setError('Please select a staff member'); return; }
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('staffId', staffId);
      fd.append('title', title.trim()); fd.append('category', category);
      if (expiryDate) fd.append('expiryDate', expiryDate);
      if (notes.trim()) fd.append('notes', notes.trim());
      await onSave(fd); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Upload failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Upload Document</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>}
          {isHRAdmin && (
            <div>
              <label className="label">Staff Member *</label>
              <select className="input-field" value={staffId} onChange={e => setStaffId(e.target.value)} required>
                <option value="">— Select Staff —</option>
                {allStaff.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.staffName}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Document Title *</label>
            <input className="input-field" placeholder="e.g. PAN Card, CA Certificate"
              value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select className="input-field" value={category} onChange={e => setCategory(e.target.value as StaffDocCategory)}>
                {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Expiry Date</label>
              <input type="date" className="input-field" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input-field" placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="label">File *</label>
            <input ref={fileRef} type="file" className="input-field py-1.5"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
              onChange={e => setFile(e.target.files?.[0] || null)} required />
            <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, or image files accepted</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Uploading…' : 'Upload'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────
const EditMetaModal: React.FC<{
  doc: StaffDoc; onSave: (id: number, data: any) => Promise<void>; onClose: () => void;
}> = ({ doc, onSave, onClose }) => {
  const [title, setTitle] = useState(doc.title);
  const [category, setCategory] = useState<StaffDocCategory>(doc.category);
  const [expiryDate, setExpiryDate] = useState(doc.expiryDate ? doc.expiryDate.slice(0, 10) : '');
  const [notes, setNotes] = useState(doc.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      await onSave(doc.id, { title: title.trim(), category, expiryDate: expiryDate || null, notes: notes || null });
      onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Edit Document Info</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div><label className="label">Title *</label><input className="input-field" value={title} onChange={e => setTitle(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select className="input-field" value={category} onChange={e => setCategory(e.target.value as StaffDocCategory)}>
                {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="label">Expiry Date</label><input type="date" className="input-field" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></div>
          </div>
          <div><label className="label">Notes</label><input className="input-field" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── DocRow ───────────────────────────────────────────────────────────────────
const DocRow: React.FC<{ doc: StaffDoc; isHRAdmin: boolean; onEdit: () => void; onDelete: () => void; }> = ({ doc, isHRAdmin, onEdit, onDelete }) => {
  const status = expiryStatus(doc.expiryDate);
  const icon = doc.mimeType.includes('pdf') ? '📄' : doc.mimeType.includes('word') ? '📝' :
    (doc.mimeType.includes('sheet') || doc.mimeType.includes('excel')) ? '📊' :
    doc.mimeType.includes('image') ? '🖼️' : '📎';
  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 group border-b border-gray-50 last:border-0">
      <span className="text-xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <a href={`/uploads/${doc.fileName}`} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-blue-700 hover:underline">{doc.title}</a>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CAT_COLOR[doc.category]}`}>{CAT_LABELS[doc.category]}</span>
          {status === 'expired'  && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Expired</span>}
          {status === 'critical' && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">Expires soon ⚠️</span>}
          {status === 'warning'  && <span className="text-xs bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded-full font-medium">Expires in 30d</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {doc.originalName} · {fmtSize(doc.fileSize)}
          {doc.expiryDate && ` · Expires ${fmtDate(doc.expiryDate)}`}
          {doc.notes && ` · ${doc.notes}`}
          {' · Uploaded by '}{doc.uploadedBy.staffName}
        </p>
      </div>
      {isHRAdmin && (
        <div className="flex gap-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={onEdit}>Edit</button>
          <button className="text-red-500 hover:text-red-700 text-xs font-medium" onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const StaffDocuments: React.FC = () => {
  const { isAdmin, isHR, user } = useAuth();
  const isHRAdmin = isAdmin || isHR;
  const [docs, setDocs] = useState<StaffDoc[]>([]);
  const [alerts, setAlerts] = useState<StaffDoc[]>([]);
  const [allStaff, setAllStaff] = useState<StaffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffFilter, setStaffFilter] = useState('');
  const [catFilter, setCatFilter] = useState<StaffDocCategory | ''>('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editingDoc, setEditingDoc] = useState<StaffDoc | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const params: any = {};
      if (isHRAdmin && staffFilter) params.staffId = staffFilter;
      const [docsRes, staffRes] = await Promise.all([
        getStaffDocuments(params),
        isHRAdmin ? getStaff() : Promise.resolve({ data: [] }),
      ]);
      setDocs(docsRes.data);
      if (isHRAdmin) {
        setAllStaff(staffRes.data);
        const alertsRes = await getExpiryAlerts();
        setAlerts(alertsRes.data);
      }
    } finally { setLoading(false); }
  }, [isHRAdmin, staffFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleUpload  = async (fd: FormData) => { await uploadStaffDocument(fd); await fetchAll(); };
  const handleEdit    = async (id: number, data: any) => { await updateStaffDocumentMeta(id, data); await fetchAll(); };
  const handleDelete  = async (doc: StaffDoc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    await deleteStaffDocument(doc.id); await fetchAll();
  };

  const filtered = docs.filter(d => {
    if (catFilter && d.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !d.staff.staffName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const grouped = new Map<number, { staffName: string; docs: StaffDoc[] }>();
  filtered.forEach(d => {
    if (!grouped.has(d.staffId)) grouped.set(d.staffId, { staffName: d.staff.staffName, docs: [] });
    grouped.get(d.staffId)!.docs.push(d);
  });

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Document Vault</h2>
          <p className="text-sm text-gray-500 mt-1">{isHRAdmin ? 'Manage documents for all staff' : 'Your stored documents'}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>+ Upload Document</button>
      </div>

      {/* Expiry alerts */}
      {isHRAdmin && alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-2">
            ⚠️ {alerts.length} document{alerts.length > 1 ? 's' : ''} expiring within 30 days
          </p>
          <div className="space-y-1">
            {alerts.map(a => {
              const s = expiryStatus(a.expiryDate);
              return (
                <div key={a.id} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s === 'expired' ? 'bg-red-500' : s === 'critical' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                  <span className="font-medium text-gray-800">{a.staff.staffName}</span>
                  <span className="text-gray-600">— {a.title}</span>
                  <span className={`text-xs font-medium ${s === 'expired' ? 'text-red-600' : 'text-orange-600'}`}>
                    {s === 'expired' ? 'EXPIRED' : `Expires ${fmtDate(a.expiryDate)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input className="input-field w-52" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input-field w-40" value={catFilter} onChange={e => setCatFilter(e.target.value as any)}>
          <option value="">All Categories</option>
          {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {isHRAdmin && (
          <select className="input-field w-44" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
            <option value="">All Staff</option>
            {allStaff.filter(s => s.isActive).map(s => <option key={s.id} value={s.id}>{s.staffName}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card text-center py-14 text-gray-400">
          <p className="text-4xl mb-3">🗂️</p>
          <p className="font-medium">No documents found.</p>
          <p className="text-sm mt-1">Upload a document using the button above.</p>
        </div>
      ) : isHRAdmin ? (
        <div className="space-y-4">
          {Array.from(grouped.values()).map(({ staffName, docs: sd }) => (
            <div key={staffName} className="card p-0 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">👤 {staffName}</h4>
                <span className="text-xs text-gray-400">{sd.length} doc{sd.length !== 1 ? 's' : ''}</span>
              </div>
              {sd.map(d => <DocRow key={d.id} doc={d} isHRAdmin={isHRAdmin} onEdit={() => setEditingDoc(d)} onDelete={() => handleDelete(d)} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {filtered.map(d => <DocRow key={d.id} doc={d} isHRAdmin={isHRAdmin} onEdit={() => setEditingDoc(d)} onDelete={() => handleDelete(d)} />)}
        </div>
      )}

      {showUpload && <UploadModal allStaff={allStaff} myStaffId={user?.staffId} isHRAdmin={isHRAdmin} onSave={handleUpload} onClose={() => setShowUpload(false)} />}
      {editingDoc && <EditMetaModal doc={editingDoc} onSave={handleEdit} onClose={() => setEditingDoc(null)} />}
    </div>
  );
};

export default StaffDocuments;
