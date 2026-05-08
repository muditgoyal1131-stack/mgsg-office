import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getTenders, getTenderStats, createTender, updateTender, deleteTender,
  uploadTenderDocument, deleteTenderDocument,
  uploadTenderSubmissionFile, deleteTenderSubmissionFile,
  addTenderComment, deleteTenderComment,
  getStaff,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

type TenderStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_EVALUATION' | 'WON' | 'LOST' | 'WITHDRAWN';
type TenderSource = 'GOVERNMENT' | 'PSU' | 'PRIVATE' | 'NGO' | 'OTHER';

interface TenderFile { id: number; originalName: string; fileName: string; fileSize: number; mimeType: string; createdAt: string; }
interface TenderComment { id: number; comment: string; authorName: string; createdAt: string; }
interface StaffMini { id: number; staffName: string; }

interface Tender {
  id: number;
  tenderNumber: string;
  title: string;
  clientName: string;
  tenderSource: TenderSource;
  description?: string | null;
  bidValue?: number | null;
  estimatedValue?: number | null;
  emdAmount?: number | null;
  emdRefunded: boolean;
  status: TenderStatus;
  preBidDate?: string | null;
  submissionDeadline?: string | null;
  submittedAt?: string | null;
  dueDate?: string | null;
  resultDate?: string | null;
  lostReason?: string | null;
  createdBy: StaffMini;
  assignedStaff: { id: number; staff: StaffMini }[];
  tenderDocuments: TenderFile[];
  submissionFiles: TenderFile[];
  comments: TenderComment[];
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number; active: number; dueThisWeek: number;
  wonThisMonth: number; totalBidValue: number; wonValue: number;
  winRate: number; statusCounts: Record<TenderStatus, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES: { key: TenderStatus; label: string; color: string; bg: string }[] = [
  { key: 'DRAFT',            label: 'Draft',            color: 'text-gray-600',   bg: 'bg-gray-100'    },
  { key: 'SUBMITTED',        label: 'Submitted',        color: 'text-blue-700',   bg: 'bg-blue-100'    },
  { key: 'UNDER_EVALUATION', label: 'Under Evaluation', color: 'text-purple-700', bg: 'bg-purple-100'  },
  { key: 'WON',              label: 'Won',              color: 'text-green-700',  bg: 'bg-green-100'   },
  { key: 'LOST',             label: 'Lost',             color: 'text-red-700',    bg: 'bg-red-100'     },
  { key: 'WITHDRAWN',        label: 'Withdrawn',        color: 'text-yellow-700', bg: 'bg-yellow-100'  },
];

const SOURCE_LABELS: Record<TenderSource, string> = {
  GOVERNMENT: 'Government', PSU: 'PSU', PRIVATE: 'Private', NGO: 'NGO', OTHER: 'Other',
};

const emptyForm = {
  title: '', clientName: '', tenderSource: 'GOVERNMENT' as TenderSource,
  description: '', bidValue: '', estimatedValue: '', emdAmount: '',
  status: 'DRAFT' as TenderStatus, preBidDate: '', submissionDeadline: '',
  submittedAt: '', dueDate: '', resultDate: '', lostReason: '',
  assignedStaffIds: [] as number[],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmt = (n?: number | null) =>
  n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN');

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const StatusBadge: React.FC<{ status: TenderStatus }> = ({ status }) => {
  const s = STATUSES.find((x) => x.key === status)!;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>{s.label}</span>;
};

const FileIcon: React.FC<{ mime: string }> = ({ mime }) => {
  if (mime.includes('pdf')) return <span>📄</span>;
  if (mime.includes('word')) return <span>📝</span>;
  if (mime.includes('sheet') || mime.includes('excel')) return <span>📊</span>;
  if (mime.includes('image')) return <span>🖼️</span>;
  return <span>📎</span>;
};

// ─── TenderFormModal ──────────────────────────────────────────────────────────

const TenderFormModal: React.FC<{
  initial?: Tender | null;
  allStaff: StaffMini[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}> = ({ initial, allStaff, onSave, onClose }) => {
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title,
          clientName: initial.clientName,
          tenderSource: initial.tenderSource,
          description: initial.description || '',
          bidValue: initial.bidValue != null ? String(initial.bidValue) : '',
          estimatedValue: initial.estimatedValue != null ? String(initial.estimatedValue) : '',
          emdAmount: initial.emdAmount != null ? String(initial.emdAmount) : '',
          status: initial.status,
          preBidDate: initial.preBidDate ? initial.preBidDate.slice(0, 10) : '',
          submissionDeadline: initial.submissionDeadline ? initial.submissionDeadline.slice(0, 10) : '',
          submittedAt: initial.submittedAt ? initial.submittedAt.slice(0, 10) : '',
          dueDate: initial.dueDate ? initial.dueDate.slice(0, 10) : '',
          resultDate: initial.resultDate ? initial.resultDate.slice(0, 10) : '',
          lostReason: initial.lostReason || '',
          assignedStaffIds: initial.assignedStaff.map((a) => a.staff.id),
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof emptyForm, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const toggleStaff = (id: number) =>
    setForm((f) => ({
      ...f,
      assignedStaffIds: f.assignedStaffIds.includes(id)
        ? f.assignedStaffIds.filter((x) => x !== id)
        : [...f.assignedStaffIds, id],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.clientName.trim()) {
      setError('Title and client name are required'); return;
    }
    setSaving(true); setError('');
    try {
      await onSave({
        ...form,
        bidValue:           form.bidValue        || null,
        estimatedValue:     form.estimatedValue  || null,
        emdAmount:          form.emdAmount       || null,
        preBidDate:         form.preBidDate      || null,
        submissionDeadline: form.submissionDeadline || null,
        submittedAt:        form.submittedAt     || null,
        dueDate:            form.dueDate         || null,
        resultDate:         form.resultDate      || null,
        lostReason:         form.lostReason      || null,
        description:        form.description     || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving tender');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold">{initial ? 'Edit Tender' : 'New Tender'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Tender Title *</label>
              <input className="input-field" value={form.title} onChange={(e) => set('title', e.target.value)} required />
            </div>
            <div>
              <label className="label">Client / Organisation *</label>
              <input className="input-field" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} required />
            </div>
            <div>
              <label className="label">Source</label>
              <select className="input-field" value={form.tenderSource} onChange={(e) => set('tenderSource', e.target.value as TenderSource)}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input-field resize-none" rows={2} value={form.description}
              onChange={(e) => set('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Bid Value (₹)</label>
              <input type="number" className="input-field" value={form.bidValue}
                onChange={(e) => set('bidValue', e.target.value)} />
            </div>
            <div>
              <label className="label">Estimated Contract Value (₹)</label>
              <input type="number" className="input-field" value={form.estimatedValue}
                onChange={(e) => set('estimatedValue', e.target.value)} />
            </div>
            <div>
              <label className="label">EMD Amount (₹)</label>
              <input type="number" className="input-field" value={form.emdAmount}
                onChange={(e) => set('emdAmount', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select className="input-field" value={form.status} onChange={(e) => set('status', e.target.value as TenderStatus)}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Pre-Bid Meeting Date</label>
              <input type="date" className="input-field" value={form.preBidDate}
                onChange={(e) => set('preBidDate', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Submission Deadline</label>
              <input type="date" className="input-field" value={form.submissionDeadline}
                onChange={(e) => set('submissionDeadline', e.target.value)} />
            </div>
            <div>
              <label className="label">Submitted On</label>
              <input type="date" className="input-field" value={form.submittedAt}
                onChange={(e) => set('submittedAt', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Due / Closing Date</label>
              <input type="date" className="input-field" value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Result Date</label>
              <input type="date" className="input-field" value={form.resultDate}
                onChange={(e) => set('resultDate', e.target.value)} />
            </div>
          </div>

          {form.status === 'LOST' && (
            <div>
              <label className="label">Lost Reason</label>
              <input className="input-field" value={form.lostReason}
                onChange={(e) => set('lostReason', e.target.value)} />
            </div>
          )}

          {/* Staff Assignment */}
          <div>
            <label className="label">Assign Staff</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {allStaff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" className="w-3.5 h-3.5 rounded text-blue-600"
                    checked={form.assignedStaffIds.includes(s.id)}
                    onChange={() => toggleStaff(s.id)} />
                  <span className="truncate">{s.staffName}</span>
                </label>
              ))}
              {allStaff.length === 0 && <p className="text-xs text-gray-400 col-span-3">No active staff</p>}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Tender'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── FileSection ──────────────────────────────────────────────────────────────

const FileSection: React.FC<{
  title: string;
  files: TenderFile[];
  canUpload: boolean;
  canDelete: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}> = ({ title, files, canUpload, canDelete, onUpload, onDelete }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await onUpload(file); } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</h5>
        {canUpload && (
          <label className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 font-medium">
            {uploading ? 'Uploading…' : '+ Attach File'}
            <input ref={inputRef} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              onChange={handleFile} disabled={uploading} />
          </label>
        )}
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-gray-400">No files attached.</p>
      ) : (
        <div className="space-y-1">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 group">
              <FileIcon mime={f.mimeType} />
              <div className="flex-1 min-w-0">
                <a
                  href={`/uploads/${f.fileName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-700 hover:underline truncate block"
                >
                  {f.originalName}
                </a>
                <p className="text-[10px] text-gray-400">{fmtSize(f.fileSize)} · {fmtDate(f.createdAt)}</p>
              </div>
              {canDelete && (
                <button
                  className="text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onDelete(f.id)}
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── TenderDetailModal ────────────────────────────────────────────────────────

const TenderDetailModal: React.FC<{
  tender: Tender;
  isPartnerOrAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: TenderStatus) => Promise<void>;
  onUploadDoc: (file: File) => Promise<void>;
  onDeleteDoc: (id: number) => Promise<void>;
  onUploadSub: (file: File) => Promise<void>;
  onDeleteSub: (id: number) => Promise<void>;
  onAddComment: (c: string) => Promise<void>;
  onDeleteComment: (id: number) => Promise<void>;
  onToggleEmd: () => Promise<void>;
  onClose: () => void;
}> = ({
  tender, isPartnerOrAdmin, onEdit, onDelete, onStatusChange,
  onUploadDoc, onDeleteDoc, onUploadSub, onDeleteSub,
  onAddComment, onDeleteComment, onToggleEmd, onClose,
}) => {
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  const today = new Date(); today.setHours(0,0,0,0);
  const due = tender.dueDate ? new Date(tender.dueDate) : null;
  const subDead = tender.submissionDeadline ? new Date(tender.submissionDeadline) : null;
  const isOverdue = due && due < today && !['WON','LOST','WITHDRAWN'].includes(tender.status);
  const subOverdue = subDead && subDead < today && !tender.submittedAt && !['WON','LOST','WITHDRAWN'].includes(tender.status);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setAddingComment(true);
    await onAddComment(newComment.trim());
    setNewComment('');
    setAddingComment(false);
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusChanging(true);
    await onStatusChange(e.target.value as TenderStatus);
    setStatusChanging(false);
  };

  const INFO: [string, React.ReactNode][] = [
    ['Tender No.',      tender.tenderNumber],
    ['Client',          tender.clientName],
    ['Source',          SOURCE_LABELS[tender.tenderSource]],
    ['Bid Value',       fmt(tender.bidValue)],
    ['Est. Contract',   fmt(tender.estimatedValue)],
    ['EMD Amount',      tender.emdAmount != null ? (
      <span className="flex items-center gap-2">
        {fmt(tender.emdAmount)}
        <button onClick={onToggleEmd} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tender.emdRefunded ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          {tender.emdRefunded ? '✓ Refunded' : 'Mark Refunded'}
        </button>
      </span>
    ) : '—'],
    ['Pre-Bid Date',    fmtDate(tender.preBidDate)],
    ['Sub. Deadline',   tender.submissionDeadline ? (
      <span className={subOverdue ? 'text-red-600 font-semibold' : ''}>{fmtDate(tender.submissionDeadline)}{subOverdue ? ' ⚠️' : ''}</span>
    ) : '—'],
    ['Submitted On',    fmtDate(tender.submittedAt)],
    ['Closing Date',    tender.dueDate ? (
      <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>{fmtDate(tender.dueDate)}{isOverdue ? ' ⚠️' : ''}</span>
    ) : '—'],
    ['Result Date',     fmtDate(tender.resultDate)],
    ['Created By',      tender.createdBy.staffName],
    ['Assigned To',     tender.assignedStaff.length > 0 ? tender.assignedStaff.map(a => a.staff.staffName).join(', ') : '—'],
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b sticky top-0 bg-white z-10 gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 font-mono">{tender.tenderNumber}</span>
              <StatusBadge status={tender.status} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mt-0.5 leading-tight">{tender.title}</h3>
            <p className="text-sm text-gray-500">{tender.clientName} · {SOURCE_LABELS[tender.tenderSource]}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isPartnerOrAdmin && <button className="btn-secondary text-xs" onClick={onEdit}>Edit</button>}
            {isPartnerOrAdmin && <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={onDelete}>Delete</button>}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-2">✕</button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: info + files */}
          <div className="lg:col-span-2 space-y-5">
            {/* Status change */}
            {isPartnerOrAdmin && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Status:</label>
                <select className="input-field text-sm flex-1" value={tender.status}
                  onChange={handleStatusChange} disabled={statusChanging}>
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            )}

            {tender.description && (
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
                {tender.description}
              </div>
            )}

            {tender.lostReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                Lost reason: {tender.lostReason}
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {INFO.map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="font-medium text-gray-800 mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            <hr className="border-gray-100" />

            {/* Tender documents */}
            <FileSection
              title="Tender Documents (Received)"
              files={tender.tenderDocuments}
              canUpload={isPartnerOrAdmin}
              canDelete={isPartnerOrAdmin}
              onUpload={onUploadDoc}
              onDelete={onDeleteDoc}
            />

            <hr className="border-gray-100" />

            {/* Submission files */}
            <FileSection
              title="Submission Files (Submitted)"
              files={tender.submissionFiles}
              canUpload={true}
              canDelete={isPartnerOrAdmin}
              onUpload={onUploadSub}
              onDelete={onDeleteSub}
            />
          </div>

          {/* Right column: comments */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-gray-700">Activity / Comments</h4>
            <form onSubmit={handleAddComment} className="flex flex-col gap-2">
              <textarea
                className="input-field text-sm resize-none"
                rows={3}
                placeholder="Add a comment or update…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button type="submit" className="btn-primary text-xs self-end" disabled={addingComment}>
                {addingComment ? 'Posting…' : '+ Post'}
              </button>
            </form>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {tender.comments.length === 0 && (
                <p className="text-xs text-gray-400">No comments yet.</p>
              )}
              {[...tender.comments].reverse().map((c) => (
                <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs group relative">
                  <p className="text-gray-800 whitespace-pre-wrap">{c.comment}</p>
                  <p className="text-gray-400 mt-1">
                    {c.authorName} · {new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {isPartnerOrAdmin && (
                    <button
                      className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onDeleteComment(c.id)}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Tenders Page ────────────────────────────────────────────────────────

const Tenders: React.FC = () => {
  const { isAdmin, isPartner } = useAuth();
  const navigate = useNavigate();
  const isPA = isAdmin || isPartner;

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [allStaff, setAllStaff] = useState<StaffMini[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<TenderStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<TenderSource | ''>('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingTender, setEditingTender] = useState<Tender | null>(null);
  const [detailTender, setDetailTender] = useState<Tender | null>(null);

  // Redirect if not allowed
  useEffect(() => {
    if (!loading && !isPA) navigate('/dashboard');
  }, [loading, isPA, navigate]);

  const fetchAll = useCallback(async () => {
    try {
      const [tendersRes, statsRes, staffRes] = await Promise.all([
        getTenders(),
        getTenderStats(),
        getStaff(),
      ]);
      setTenders(tendersRes.data);
      setStats(statsRes.data);
      setAllStaff(staffRes.data.filter((s: any) => s.isActive));
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Keep detail modal in sync
  useEffect(() => {
    if (detailTender) {
      const updated = tenders.find((t) => t.id === detailTender.id);
      if (updated) setDetailTender(updated);
    }
  }, [tenders]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const handleCreate = async (data: any) => { await createTender(data); await fetchAll(); };
  const handleEdit   = async (data: any) => { await updateTender(editingTender!.id, data); await fetchAll(); };
  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this tender and all attached files?')) return;
    await deleteTender(id);
    setDetailTender(null);
    await fetchAll();
  };
  const handleStatusChange = async (id: number, status: TenderStatus) => {
    await updateTender(id, { status });
    await fetchAll();
  };
  const handleToggleEmd = async (id: number, current: boolean) => {
    await updateTender(id, { emdRefunded: !current });
    await fetchAll();
  };

  // ── File uploads ─────────────────────────────────────────────────────────────

  const handleUploadDoc = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    await uploadTenderDocument(detailTender!.id, fd);
    await fetchAll();
  };
  const handleDeleteDoc = async (docId: number) => {
    await deleteTenderDocument(detailTender!.id, docId);
    await fetchAll();
  };
  const handleUploadSub = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    await uploadTenderSubmissionFile(detailTender!.id, fd);
    await fetchAll();
  };
  const handleDeleteSub = async (fileId: number) => {
    await deleteTenderSubmissionFile(detailTender!.id, fileId);
    await fetchAll();
  };
  const handleAddComment = async (comment: string) => {
    await addTenderComment(detailTender!.id, { comment });
    await fetchAll();
  };
  const handleDeleteComment = async (commentId: number) => {
    await deleteTenderComment(detailTender!.id, commentId);
    await fetchAll();
  };

  // ── Filter ──────────────────────────────────────────────────────────────────

  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today.getTime() + 7 * 86400000);

  const filtered = tenders.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (sourceFilter && t.tenderSource !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) &&
          !t.clientName.toLowerCase().includes(q) &&
          !t.tenderNumber.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tender Management</h2>
          <p className="text-sm text-gray-500 mt-1">Track tenders, bids, and submissions</p>
        </div>
        {isPA && (
          <button className="btn-primary" onClick={() => { setEditingTender(null); setShowForm(true); }}>
            + New Tender
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && isPA && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: 'Total',         value: stats.total,          color: 'text-gray-800' },
            { label: 'Active',        value: stats.active,         color: 'text-blue-700' },
            { label: 'Due This Week', value: stats.dueThisWeek,    color: stats.dueThisWeek > 0 ? 'text-orange-600' : 'text-gray-800' },
            { label: 'Won This Month',value: stats.wonThisMonth,   color: 'text-green-700' },
            { label: 'Win Rate',      value: stats.winRate + '%',  color: stats.winRate >= 50 ? 'text-green-700' : 'text-gray-800' },
            { label: 'Active Bid Val',value: '₹' + (stats.totalBidValue / 100000).toFixed(1) + 'L', color: 'text-purple-700' },
            { label: 'Won Value',     value: '₹' + (stats.wonValue / 100000).toFixed(1) + 'L',      color: 'text-green-700' },
          ].map((c) => (
            <div key={c.label} className="card text-center py-3">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-gray-500 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Status filter pills */}
      {isPA && stats && (
        <div className="card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Filter by Status</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setStatusFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                ${statusFilter === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}>
              All ({stats.total})
            </button>
            {STATUSES.map((s) => (
              <button key={s.key} onClick={() => setStatusFilter(statusFilter === s.key ? '' : s.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                  ${statusFilter === s.key ? `${s.bg} ${s.color} border-current` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                {s.label} ({stats.statusCounts[s.key] ?? 0})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input className="input-field w-56" placeholder="Search tenders…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field w-40" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="input-field w-36" value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as any)}>
          <option value="">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {['No.','Title','Client','Source','Status','Bid Value','Closing Date','Assigned','Files',''].map((h) => (
                <th key={h} className="table-header whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="table-cell text-center text-gray-400 py-8">No tenders found.</td></tr>
            )}
            {filtered.map((t) => {
              const due = t.dueDate ? new Date(t.dueDate) : null;
              const isOverdue = due && due < today && !['WON','LOST','WITHDRAWN'].includes(t.status);
              const dueThisWeek = due && due >= today && due <= weekEnd && !['WON','LOST','WITHDRAWN'].includes(t.status);
              const totalFiles = t.tenderDocuments.length + t.submissionFiles.length;
              return (
                <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailTender(t)}>
                  <td className="table-cell font-mono text-xs text-gray-500">{t.tenderNumber}</td>
                  <td className="table-cell max-w-[200px]">
                    <p className="font-medium text-gray-900 truncate">{t.title}</p>
                    {t.assignedStaff.length > 0 && (
                      <p className="text-xs text-gray-400 truncate">
                        {t.assignedStaff.map(a => a.staff.staffName).join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="table-cell text-gray-600">{t.clientName}</td>
                  <td className="table-cell text-gray-500 text-xs">{SOURCE_LABELS[t.tenderSource]}</td>
                  <td className="table-cell"><StatusBadge status={t.status} /></td>
                  <td className="table-cell font-medium">{fmt(t.bidValue)}</td>
                  <td className="table-cell">
                    {due ? (
                      <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : dueThisWeek ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                        {isOverdue ? '⚠️ ' : dueThisWeek ? '⏰ ' : ''}{fmtDate(t.dueDate)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {t.assignedStaff.length > 0
                      ? <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full text-xs">{t.assignedStaff.length}</span>
                      : '—'}
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {totalFiles > 0
                      ? <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-xs">📎 {totalFiles}</span>
                      : '—'}
                  </td>
                  <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                    {isPA && (
                      <>
                        <button className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2"
                          onClick={() => { setEditingTender(t); setShowForm(true); }}>Edit</button>
                        <button className="text-red-600 hover:text-red-800 text-xs font-medium"
                          onClick={() => handleDelete(t.id)}>Del</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showForm && (
        <TenderFormModal
          initial={editingTender}
          allStaff={allStaff}
          onSave={editingTender ? handleEdit : handleCreate}
          onClose={() => { setShowForm(false); setEditingTender(null); }}
        />
      )}

      {detailTender && (
        <TenderDetailModal
          tender={detailTender}
          isPartnerOrAdmin={isPA}
          onEdit={() => { setEditingTender(detailTender); setShowForm(true); }}
          onDelete={() => handleDelete(detailTender.id)}
          onStatusChange={(status) => handleStatusChange(detailTender.id, status)}
          onUploadDoc={handleUploadDoc}
          onDeleteDoc={handleDeleteDoc}
          onUploadSub={handleUploadSub}
          onDeleteSub={handleDeleteSub}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          onToggleEmd={() => handleToggleEmd(detailTender.id, detailTender.emdRefunded)}
          onClose={() => setDetailTender(null)}
        />
      )}
    </div>
  );
};

export default Tenders;
