import React, { useEffect, useState, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import {
  getReimbursements, createReimbursement,
  approveReimbursement, rejectReimbursement, deleteReimbursement,
  reviewReimbursement, returnReimbursement,
  addReimbursementItem, deleteReimbursementItem,
  uploadReimbursementAttachment, deleteReimbursementAttachment,
  exportReimbursements,
  getExpenseCategories, getTasks, getStaff, getClients, getReimbursement,
  extractReceiptOCR,
  // getClients used only inside ClientSearch component via live search
} from '../api';
import { useAuth } from '../contexts/AuthContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpenseCategory { id: number; name: string; }
interface ClientOption { id: number; clientCode: string; clientName: string; }
interface TaskOption { id: number; taskId: string; taskName: string; status: string; clientId?: number; }
interface StaffInfo { id: number; staffName: string; isPartner?: boolean; }

interface RAttachment { id: number; fileName: string; originalName: string; fileSize: number; mimeType: string; }
interface RItem { id: number; description: string; amount: number; date: string; category: ExpenseCategory; attachments: RAttachment[]; }
interface Reimbursement {
  id: number; claimNumber: string;
  staff: { id: number; staffName: string };
  task: { id: number; taskId: string; taskName: string; status: string };
  notes?: string;
  status: 'PENDING' | 'REVIEWED' | 'RETURNED' | 'APPROVED' | 'REJECTED';
  reviewedBy?: { id: number; staffName: string };
  reviewedAt?: string;
  returnReason?: string;
  approvedBy?: { id: number; staffName: string };
  approvedAt?: string;
  rejectionReason?: string;
  items: RItem[];
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending Review', REVIEWED: 'Reviewed', RETURNED: 'Returned',
  APPROVED: 'Approved', REJECTED: 'Rejected',
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  REVIEWED: 'bg-blue-100 text-blue-700',
  RETURNED: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDT = (d?: string) => d ? format(new Date(d), 'dd-MMM-yy HH:mm') : '—';
const fmtD = (d?: string) => d ? format(new Date(d), 'dd-MMM-yyyy') : '';
const claimTotal = (r: Reimbursement) => r.items.reduce((s, i) => s + Number(i.amount), 0);
const emptyItem = (date: string) => ({ description: '', amount: '', date, categoryId: '' });

// ── Client Search Input ────────────────────────────────────────────────────────

// ClientSearch — does live API search so staff don't need full client list access
const ClientSearch: React.FC<{
  value: number | '';
  initialLabel?: string;
  onChange: (id: number | '', client?: ClientOption) => void;
}> = ({ value, initialLabel, onChange }) => {
  const [query, setQuery] = useState(initialLabel || '');
  const [results, setResults] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync label when external value cleared
  useEffect(() => {
    if (value === '') setQuery('');
  }, [value]);

  useEffect(() => {
    if (initialLabel) setQuery(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = async (q: string) => {
    setQuery(q);
    onChange('');
    if (q.trim().length >= 2) {
      try {
        const res = await getClients(q.trim());
        setResults(res.data);
        setOpen(true);
      } catch {
        setResults([]);
      }
    } else {
      setResults([]);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <input
        className="input-field"
        placeholder="Type client name or code (min 2 chars)..."
        value={query}
        onChange={e => handleChange(e.target.value)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex gap-2"
              onMouseDown={() => {
                onChange(c.id, c);
                setQuery(`${c.clientCode} — ${c.clientName}`);
                setOpen(false);
              }}
            >
              <span className="font-mono text-xs text-blue-600 shrink-0">{c.clientCode}</span>
              <span className="text-gray-800 truncate">{c.clientName}</span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow p-3 text-sm text-gray-400">
          No clients found for "{query}"
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const Reimbursements: React.FC = () => {
  const { user, isAdmin, isHR } = useAuth();
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [allTasks, setAllTasks] = useState<TaskOption[]>([]);
  const [staff, setStaff] = useState<StaffInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  // Create claim modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');
  const [claimForm, setClaimForm] = useState({
    taskId: '', notes: '',
    items: [emptyItem(format(new Date(), 'yyyy-MM-dd'))],
  });
  const [itemFiles, setItemFiles] = useState<Record<number, File[]>>({});

  // Detail modal
  const [detail, setDetail] = useState<Reimbursement | null>(null);

  // Add item in detail modal
  const [addItemForm, setAddItemForm] = useState(emptyItem(format(new Date(), 'yyyy-MM-dd')));
  const [addItemFile, setAddItemFile] = useState<File | null>(null);
  const [addItemError, setAddItemError] = useState('');
  const addFileRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<string>('');

  // Modals
  const [returnModal, setReturnModal] = useState<number | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [rejectModal, setRejectModal] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const isPartnerOrAdmin = isAdmin || !!staff.find(s => s.id === user?.staffId)?.isPartner;

  // Tasks filtered to selected client (open only)
  const filteredTasks = selectedClientId
    ? allTasks.filter(t => t.clientId != null && t.clientId === selectedClientId)
    : [];

  const fetchAll = useCallback(async () => {
    const [rRes, tRes, sRes, cRes] = await Promise.all([
      getReimbursements(), getTasks(), getStaff(), getExpenseCategories(),
    ]);
    setReimbursements(rRes.data);
    setAllTasks(tRes.data
      .filter((t: any) => t.status === 'OPEN')
      .map((t: any) => ({ id: t.id, taskId: t.taskId, taskName: t.taskName, status: t.status, clientId: t.clientId }))
    );
    setStaff(sRes.data);
    setCategories(cRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const refreshDetail = async (id: number) => {
    await fetchAll();
    const res = await getReimbursement(id);
    setDetail(res.data);
  };

  // ── Reset create form ───────────────────────────────────────────────────────

  const openCreate = () => {
    setSelectedClientId('');
    setClaimForm({ taskId: '', notes: '', items: [emptyItem(format(new Date(), 'yyyy-MM-dd'))] });
    setItemFiles({});
    setCreateError('');
    setShowCreate(true);
  };

  // When client changes, clear task selection
  const handleClientChange = (id: number | '') => {
    setSelectedClientId(id);
    setClaimForm(f => ({ ...f, taskId: '' }));
  };

  // ── Create claim ────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!selectedClientId) { setCreateError('Please select a client'); return; }
    if (!claimForm.taskId) { setCreateError('Please select a task'); return; }
    const validItems = claimForm.items.filter(i => i.description && i.amount && i.date && i.categoryId);
    if (validItems.length === 0) { setCreateError('Add at least one complete line item'); return; }
    setCreating(true);
    try {
      const payload = {
        taskId: claimForm.taskId,
        notes: claimForm.notes,
        items: validItems.map(i => ({
          description: i.description,
          amount: Number(i.amount),
          date: i.date,
          categoryId: Number(i.categoryId),
        })),
      };
      const res = await createReimbursement(payload);
      const created: Reimbursement = res.data;
      // Upload attachments
      for (let idx = 0; idx < claimForm.items.length; idx++) {
        const files = itemFiles[idx] || [];
        const serverItem = created.items[idx];
        if (!serverItem) continue;
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          await uploadReimbursementAttachment(serverItem.id, fd);
        }
      }
      setShowCreate(false);
      fetchAll();
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Error submitting claim');
    } finally { setCreating(false); }
  };

  // ── Add item to existing claim ──────────────────────────────────────────────

  const handleAddItem = async () => {
    if (!detail) return;
    if (!addItemForm.description || !addItemForm.amount || !addItemForm.date || !addItemForm.categoryId) {
      setAddItemError('Fill in all fields'); return;
    }
    setAddItemError('');
    try {
      const res = await addReimbursementItem(detail.id, {
        description: addItemForm.description,
        amount: Number(addItemForm.amount),
        date: addItemForm.date,
        categoryId: Number(addItemForm.categoryId),
      });
      if (addItemFile) {
        const fd = new FormData();
        fd.append('file', addItemFile);
        await uploadReimbursementAttachment(res.data.id, fd);
      }
      setAddItemForm(emptyItem(format(new Date(), 'yyyy-MM-dd')));
      setAddItemFile(null);
      if (addFileRef.current) addFileRef.current.value = '';
      await refreshDetail(detail.id);
    } catch (err: any) { setAddItemError(err.response?.data?.message || 'Error adding item'); }
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrResult('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await extractReceiptOCR(fd);
      const d = res.data;
      setAddItemForm((prev) => ({
        ...prev,
        description: d.merchant || prev.description,
        amount: d.amount ? String(d.amount) : prev.amount,
        date: d.date || prev.date,
        categoryId: d.categoryId ? String(d.categoryId) : prev.categoryId,
      }));
      setOcrResult(`✅ Extracted: ${d.merchant ? `"${d.merchant}"` : ''} ${d.amount ? `₹${d.amount}` : ''} ${d.date || ''}`);
    } catch {
      setOcrResult('⚠️ Could not extract details — please fill manually');
    } finally {
      setOcrLoading(false);
      if (ocrFileRef.current) ocrFileRef.current.value = '';
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!detail || !window.confirm('Delete this line item?')) return;
    try { await deleteReimbursementItem(itemId); await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleUploadToItem = async (itemId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try { await uploadReimbursementAttachment(itemId, fd); if (detail) await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Upload failed'); }
  };

  const handleDeleteAttachment = async (attId: number) => {
    if (!detail || !window.confirm('Delete this attachment?')) return;
    try { await deleteReimbursementAttachment(attId); await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  // ── Workflow ────────────────────────────────────────────────────────────────

  const handleReview = async (id: number) => {
    try { await reviewReimbursement(id); fetchAll(); if (detail?.id === id) await refreshDetail(id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleReturn = async () => {
    if (!returnModal) return;
    try {
      await returnReimbursement(returnModal, { returnReason });
      setReturnModal(null); setReturnReason('');
      fetchAll(); if (detail?.id === returnModal) await refreshDetail(returnModal);
    } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleApprove = async (id: number) => {
    if (!window.confirm('Approve this claim? Expenses will be added to the task.')) return;
    try { await approveReimbursement(id); fetchAll(); if (detail?.id === id) await refreshDetail(id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await rejectReimbursement(rejectModal, { rejectionReason: rejectReason });
      setRejectModal(null); setRejectReason(''); fetchAll();
    } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this claim?')) return;
    try { await deleteReimbursement(id); fetchAll(); setDetail(null); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleExport = async () => {
    try {
      const res = await exportReimbursements();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reimbursements_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  };

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filtered = reimbursements.filter(r => filterStatus ? r.status === filterStatus : true);
  const pendingReview = reimbursements.filter(r => r.status === 'PENDING').length;
  const pendingApproval = reimbursements.filter(r => r.status === 'REVIEWED').length;
  const totalApproved = reimbursements.filter(r => r.status === 'APPROVED').reduce((s, r) => s + claimTotal(r), 0);

  // canEdit: staff who raised it, or admin
  const canEdit = (r: Reimbursement) =>
    ['PENDING', 'RETURNED'].includes(r.status) && (r.staff.id === user?.staffId || isAdmin);

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reimbursements</h2>
          <p className="text-sm text-gray-500 mt-1">Staff expense claims — approved amounts are added to task OPE</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-1.5" onClick={handleExport}>
            📥 Export Excel
          </button>
          <button className="btn-primary" onClick={openCreate}>+ New Claim</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-yellow-600">{pendingReview}</p>
          <p className="text-xs text-gray-500 mt-1">Pending HR Review</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-blue-600">{pendingApproval}</p>
          <p className="text-xs text-gray-500 mt-1">Awaiting Approval</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-green-600">{reimbursements.filter(r => r.status === 'APPROVED').length}</p>
          <p className="text-xs text-gray-500 mt-1">Approved</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-xl font-bold text-blue-700">{fmt(totalApproved)}</p>
          <p className="text-xs text-gray-500 mt-1">Total Approved</p>
        </div>
      </div>

      {/* Alerts */}
      {isHR && pendingReview > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          ⚠️ {pendingReview} claim{pendingReview > 1 ? 's' : ''} pending your HR review.
        </div>
      )}
      {isPartnerOrAdmin && pendingApproval > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          ✅ {pendingApproval} reviewed claim{pendingApproval > 1 ? 's' : ''} awaiting your approval.
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <select className="input-field max-w-[200px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="text-sm text-gray-400">{filtered.length} claim{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Claim #</th>
                {(isPartnerOrAdmin || isHR) && <th className="table-header">Staff</th>}
                <th className="table-header">Task</th>
                <th className="table-header text-center">Items</th>
                <th className="table-header text-right">Total</th>
                <th className="table-header">Status</th>
                <th className="table-header">Submitted</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetail(r)}>
                  <td className="table-cell font-mono text-xs text-blue-700 font-medium">{r.claimNumber}</td>
                  {(isPartnerOrAdmin || isHR) && <td className="table-cell">{r.staff.staffName}</td>}
                  <td className="table-cell">
                    <div className="text-xs font-mono text-blue-600">{r.task.taskId}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[130px]">{r.task.taskName}</div>
                  </td>
                  <td className="table-cell text-center text-gray-600">{r.items.length}</td>
                  <td className="table-cell text-right font-medium">{fmt(claimTotal(r))}</td>
                  <td className="table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{fmtDT(r.createdAt)}</td>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2 flex-wrap">
                      {isHR && r.status === 'PENDING' && (
                        <>
                          <button className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            onClick={() => handleReview(r.id)}>Mark Reviewed</button>
                          <button className="text-orange-600 hover:text-orange-800 text-xs font-medium"
                            onClick={() => { setReturnModal(r.id); setReturnReason(''); }}>Return</button>
                        </>
                      )}
                      {isPartnerOrAdmin && r.status === 'REVIEWED' && (
                        <>
                          <button className="text-green-600 hover:text-green-800 text-xs font-medium"
                            onClick={() => handleApprove(r.id)}>Approve</button>
                          <button className="text-red-600 hover:text-red-800 text-xs font-medium"
                            onClick={() => { setRejectModal(r.id); setRejectReason(''); }}>Reject</button>
                        </>
                      )}
                      {canEdit(r) && (
                        <button className="text-gray-400 hover:text-gray-600 text-xs"
                          onClick={() => handleDelete(r.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={(isPartnerOrAdmin || isHR) ? 8 : 7} className="table-cell text-center text-gray-400 py-8">
                    No claims found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create Claim Modal ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 pt-6 pb-3 border-b">
              <h3 className="text-lg font-semibold text-gray-900">New Reimbursement Claim</h3>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-5">

              {/* Step 1: Client search */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Client *</label>
                  <ClientSearch
                    value={selectedClientId}
                    onChange={handleClientChange}
                  />
                  <p className="text-xs text-gray-400 mt-1">Type to search by name or code</p>
                </div>

                {/* Step 2: Task (filtered to selected client) */}
                <div>
                  <label className="label">Task *</label>
                  <select
                    className="input-field"
                    value={claimForm.taskId}
                    onChange={e => setClaimForm({ ...claimForm, taskId: e.target.value })}
                    disabled={!selectedClientId}
                    required
                  >
                    <option value="">{selectedClientId ? '— Select open task —' : '— Select client first —'}</option>
                    {filteredTasks.map(t => (
                      <option key={t.id} value={t.id}>{t.taskId} — {t.taskName}</option>
                    ))}
                  </select>
                  {selectedClientId && filteredTasks.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No open tasks for this client.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Claim Notes (optional)</label>
                <input className="input-field" value={claimForm.notes}
                  onChange={e => setClaimForm({ ...claimForm, notes: e.target.value })}
                  placeholder="Overall notes for this claim..." />
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Line Items *</label>
                  <button type="button" className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    onClick={() => setClaimForm({
                      ...claimForm,
                      items: [...claimForm.items, emptyItem(format(new Date(), 'yyyy-MM-dd'))],
                    })}>
                    + Add Row
                  </button>
                </div>

                <div className="space-y-3">
                  {claimForm.items.map((item, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                        <div className="md:col-span-2">
                          <label className="label text-xs">Description *</label>
                          <input className="input-field" value={item.description}
                            onChange={e => {
                              const items = [...claimForm.items];
                              items[idx] = { ...items[idx], description: e.target.value };
                              setClaimForm({ ...claimForm, items });
                            }} placeholder="e.g. Cab fare to client office" />
                        </div>
                        <div>
                          <label className="label text-xs">Category *</label>
                          <select className="input-field" value={item.categoryId}
                            onChange={e => {
                              const items = [...claimForm.items];
                              items[idx] = { ...items[idx], categoryId: e.target.value };
                              setClaimForm({ ...claimForm, items });
                            }}>
                            <option value="">— Select —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">Date *</label>
                          <input type="date" className="input-field" value={item.date}
                            onChange={e => {
                              const items = [...claimForm.items];
                              items[idx] = { ...items[idx], date: e.target.value };
                              setClaimForm({ ...claimForm, items });
                            }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 items-end">
                        <div>
                          <label className="label text-xs">Amount (₹) *</label>
                          <input type="number" min="0.01" step="0.01" className="input-field"
                            value={item.amount}
                            onChange={e => {
                              const items = [...claimForm.items];
                              items[idx] = { ...items[idx], amount: e.target.value };
                              setClaimForm({ ...claimForm, items });
                            }} placeholder="0.00" />
                        </div>
                        <div>
                          <label className="label text-xs">Bills / Receipts</label>
                          <input type="file" multiple accept="image/*,application/pdf"
                            className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700"
                            onChange={e => {
                              const files = Array.from(e.target.files || []);
                              setItemFiles(prev => ({ ...prev, [idx]: files }));
                            }} />
                          {(itemFiles[idx]?.length || 0) > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">{itemFiles[idx].length} file(s) selected</p>
                          )}
                        </div>
                      </div>
                      {claimForm.items.length > 1 && (
                        <button type="button" className="mt-2 text-red-500 hover:text-red-700 text-xs"
                          onClick={() => {
                            const items = claimForm.items.filter((_, i) => i !== idx);
                            const newFiles: Record<number, File[]> = {};
                            Object.entries(itemFiles).forEach(([k, v]) => {
                              const ki = Number(k);
                              if (ki < idx) newFiles[ki] = v;
                              else if (ki > idx) newFiles[ki - 1] = v;
                            });
                            setClaimForm({ ...claimForm, items });
                            setItemFiles(newFiles);
                          }}>
                          Remove row
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-right text-sm font-semibold text-gray-700">
                  Claim Total: {fmt(claimForm.items.reduce((s, i) => s + (Number(i.amount) || 0), 0))}
                </div>
              </div>

              {createError && <p className="text-red-600 text-sm">{createError}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Submitting...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 pt-5 pb-3 border-b flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-blue-700 font-bold">{detail.claimNumber}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[detail.status]}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {detail.task.taskId} — {detail.task.taskName} &nbsp;·&nbsp; by {detail.staff.staffName} &nbsp;·&nbsp; {fmtDT(detail.createdAt)}
                </p>
              </div>
              <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={() => setDetail(null)}>✕</button>
            </div>

            <div className="p-6 space-y-5">
              {detail.notes && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700">
                  <span className="font-medium">Notes: </span>{detail.notes}
                </div>
              )}

              {/* Status trail */}
              {detail.status === 'RETURNED' && detail.returnReason && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800">
                  <strong>Returned by {detail.reviewedBy?.staffName} (HR):</strong> {detail.returnReason}
                </div>
              )}
              {detail.status === 'REJECTED' && detail.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                  <strong>Rejected by {detail.approvedBy?.staffName}:</strong> {detail.rejectionReason}
                </div>
              )}
              {['REVIEWED', 'APPROVED'].includes(detail.status) && detail.reviewedBy && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                  ✔ Reviewed by <strong>{detail.reviewedBy.staffName}</strong> on {fmtDT(detail.reviewedAt)}
                </div>
              )}
              {detail.status === 'APPROVED' && detail.approvedBy && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                  ✔ Approved by <strong>{detail.approvedBy.staffName}</strong> on {fmtDT(detail.approvedAt)}
                </div>
              )}

              {/* Line items */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Line Items</h4>
                <div className="space-y-3">
                  {detail.items.map(item => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-800">{item.description}</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{item.category.name}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{fmtD(item.date)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-gray-800">{fmt(item.amount)}</div>
                          {canEdit(detail) && (
                            <button className="text-xs text-red-500 hover:text-red-700 mt-0.5"
                              onClick={() => handleDeleteItem(item.id)}>Remove</button>
                          )}
                        </div>
                      </div>

                      {/* Attachments */}
                      {item.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.attachments.map(att => (
                            <div key={att.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                              <a href={`/uploads/${att.fileName}`} target="_blank" rel="noreferrer"
                                className="text-blue-600 text-xs hover:underline">
                                {att.mimeType.startsWith('image/') ? '🖼' : '📄'} {att.originalName}
                              </a>
                              {canEdit(detail) && (
                                <button className="text-red-400 hover:text-red-600 text-xs ml-1"
                                  onClick={() => handleDeleteAttachment(att.id)}>✕</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {canEdit(detail) && (
                        <div className="mt-2">
                          <label className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-medium">
                            + Attach bill
                            <input type="file" className="hidden" accept="image/*,application/pdf"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (file) await handleUploadToItem(item.id, file);
                                e.target.value = '';
                              }} />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-right text-sm font-bold text-gray-800">
                  Total: {fmt(claimTotal(detail))}
                </div>
              </div>

              {/* Add item (only while editable) */}
              {canEdit(detail) && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">Add Line Item</h4>
                    <div className="flex items-center gap-2">
                      <label className={`flex items-center gap-1.5 cursor-pointer text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${ocrLoading ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'}`}>
                        {ocrLoading ? '⏳ Scanning...' : '📷 Scan Receipt (OCR)'}
                        <input ref={ocrFileRef} type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={handleOcrUpload} disabled={ocrLoading} />
                      </label>
                    </div>
                  </div>
                  {ocrResult && (
                    <div className={`text-xs px-3 py-2 rounded-lg mb-3 ${ocrResult.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
                      {ocrResult}
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                    <div className="md:col-span-2">
                      <label className="label text-xs">Description</label>
                      <input className="input-field" value={addItemForm.description}
                        onChange={e => setAddItemForm({ ...addItemForm, description: e.target.value })} />
                    </div>
                    <div>
                      <label className="label text-xs">Category</label>
                      <select className="input-field" value={addItemForm.categoryId}
                        onChange={e => setAddItemForm({ ...addItemForm, categoryId: e.target.value })}>
                        <option value="">— Select —</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Date</label>
                      <input type="date" className="input-field" value={addItemForm.date}
                        onChange={e => setAddItemForm({ ...addItemForm, date: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="label text-xs">Amount (₹)</label>
                      <input type="number" min="0.01" step="0.01" className="input-field"
                        value={addItemForm.amount}
                        onChange={e => setAddItemForm({ ...addItemForm, amount: e.target.value })} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="label text-xs">Attachment (optional)</label>
                      <input ref={addFileRef} type="file" accept="image/*,application/pdf"
                        className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700"
                        onChange={e => setAddItemFile(e.target.files?.[0] || null)} />
                    </div>
                  </div>
                  {addItemError && <p className="text-red-600 text-xs mb-2">{addItemError}</p>}
                  <button type="button" className="btn-primary text-sm" onClick={handleAddItem}>+ Add Item</button>
                </div>
              )}

              {/* Action bar */}
              <div className="border-t pt-4 flex flex-wrap gap-2 justify-end">
                {isHR && detail.status === 'PENDING' && (
                  <>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium"
                      onClick={() => handleReview(detail.id)}>✔ Mark Reviewed</button>
                    <button className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600 font-medium"
                      onClick={() => { setReturnModal(detail.id); setReturnReason(''); }}>↩ Return to Staff</button>
                  </>
                )}
                {isPartnerOrAdmin && detail.status === 'REVIEWED' && (
                  <>
                    <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 font-medium"
                      onClick={() => handleApprove(detail.id)}>✔ Approve Claim</button>
                    <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 font-medium"
                      onClick={() => { setRejectModal(detail.id); setRejectReason(''); }}>✕ Reject</button>
                  </>
                )}
                {canEdit(detail) && (
                  <button className="btn-secondary text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => handleDelete(detail.id)}>Delete Claim</button>
                )}
                <button className="btn-secondary" onClick={() => setDetail(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Return Reason Modal ────────────────────────────────────────────────── */}
      {returnModal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Return to Staff</h3>
            <label className="label">Comments for staff *</label>
            <textarea className="input-field" rows={3} value={returnReason}
              onChange={e => setReturnReason(e.target.value)}
              placeholder="What needs to be corrected or clarified?" />
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setReturnModal(null)}>Cancel</button>
              <button className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600 font-medium"
                onClick={handleReturn}>Return Claim</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ───────────────────────────────────────────────────────── */}
      {rejectModal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Reject Claim</h3>
            <label className="label">Reason (optional)</label>
            <textarea className="input-field" rows={3} value={rejectReason}
              onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 font-medium"
                onClick={handleReject}>Confirm Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reimbursements;
