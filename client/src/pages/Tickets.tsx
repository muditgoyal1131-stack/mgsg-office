import React, { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  getTickets, getTicket, createTicket, updateTicket, deleteTicket,
  assignTicket, requestCostApproval, approveTicketCost, rejectTicketCost,
  resolveTicket, closeTicket, reopenTicket, addTicketComment, deleteTicketAttachment,
  getStaff,
} from '../api';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import ITAssets from './ITAssets';

interface Staff { id: number; staffName: string; isPartner?: boolean; role?: string; }
interface Attachment { id: number; fileName: string; originalName: string; fileSize: number; mimeType: string; createdAt: string; }
interface Comment { id: number; authorName: string; comment: string; createdAt: string; }
interface Ticket {
  id: number; ticketNumber: string; title: string; description: string;
  raisedBy: Staff; assignedTo?: Staff;
  type: 'SOFTWARE' | 'HARDWARE' | 'NETWORK' | 'ACCESS' | 'OTHER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'RESOLVED' | 'CLOSED';
  resolutionNotes?: string;
  estimatedCost?: number; costDescription?: string;
  costStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: Staff; approvedAt?: string; rejectionReason?: string;
  attachments: Attachment[]; comments: Comment[];
  createdAt: string; updatedAt: string; resolvedAt?: string; closedAt?: string;
}

const TYPES = ['SOFTWARE', 'HARDWARE', 'NETWORK', 'ACCESS', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const defaultForm = { title: '', description: '', type: 'SOFTWARE', priority: 'MEDIUM' };

const priorityBadge = (p: string) => {
  if (p === 'URGENT') return 'bg-red-100 text-red-700';
  if (p === 'HIGH') return 'bg-orange-100 text-orange-700';
  if (p === 'MEDIUM') return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
};

const statusBadge = (s: string) => {
  if (s === 'OPEN') return 'bg-blue-100 text-blue-700';
  if (s === 'IN_PROGRESS') return 'bg-indigo-100 text-indigo-700';
  if (s === 'PENDING_APPROVAL') return 'bg-yellow-100 text-yellow-700';
  if (s === 'RESOLVED') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-600';
};

const typeIcon = (t: string) => {
  if (t === 'SOFTWARE') return '💻';
  if (t === 'HARDWARE') return '🖥️';
  if (t === 'NETWORK') return '🌐';
  if (t === 'ACCESS') return '🔑';
  return '📌';
};

const fmtMoney = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fileSizeStr = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const TicketsContent: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [error, setError] = useState('');

  const [costForm, setCostForm] = useState({ estimatedCost: '', costDescription: '' });
  const [resolveForm, setResolveForm] = useState({ resolutionNotes: '' });
  const [rejectForm, setRejectForm] = useState({ rejectionReason: '' });
  const [commentText, setCommentText] = useState('');
  const [showCost, setShowCost] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const myStaff = staff.find((s) => s.id === user?.staffId);
  const isIT = user?.role === 'IT' || isAdmin;
  const isPartner = myStaff?.isPartner || isAdmin;

  const fetchAll = async () => {
    const [tRes, sRes] = await Promise.all([getTickets(), getStaff()]);
    setTickets(tRes.data);
    setStaff(sRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const refreshDetail = async (id: number) => {
    const res = await getTicket(id);
    setDetail(res.data);
    fetchAll();
  };

  const openCreate = () => { setEditing(null); setForm(defaultForm); setError(''); setShowForm(true); };

  const openEdit = (t: Ticket) => {
    setEditing(t);
    setForm({ title: t.title, description: t.description, type: t.type, priority: t.priority });
    setError(''); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      if (editing) await updateTicket(editing.id, form);
      else await createTicket(form);
      setShowForm(false);
      fetchAll();
    } catch (err: any) { setError(err.response?.data?.message || 'Error'); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this ticket?')) return;
    try { await deleteTicket(id); fetchAll(); if (detail?.id === id) setDetail(null); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleAssignToMe = async () => {
    if (!detail || !user?.staffId) return;
    try { await assignTicket(detail.id, { assignedToId: user.staffId }); await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleRequestCost = async () => {
    if (!detail) return;
    if (!costForm.estimatedCost || !costForm.costDescription) return;
    try {
      await requestCostApproval(detail.id, {
        estimatedCost: Number(costForm.estimatedCost),
        costDescription: costForm.costDescription,
      });
      setShowCost(false); setCostForm({ estimatedCost: '', costDescription: '' });
      await refreshDetail(detail.id);
    } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleApprove = async () => {
    if (!detail) return;
    try { await approveTicketCost(detail.id); await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleReject = async () => {
    if (!detail) return;
    try {
      await rejectTicketCost(detail.id, { rejectionReason: rejectForm.rejectionReason });
      setShowReject(false); setRejectForm({ rejectionReason: '' });
      await refreshDetail(detail.id);
    } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleResolve = async () => {
    if (!detail) return;
    if (!resolveForm.resolutionNotes.trim()) return;
    try {
      await resolveTicket(detail.id, { resolutionNotes: resolveForm.resolutionNotes });
      setShowResolve(false); setResolveForm({ resolutionNotes: '' });
      await refreshDetail(detail.id);
    } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleClose = async () => {
    if (!detail) return;
    try { await closeTicket(detail.id); await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleReopen = async () => {
    if (!detail) return;
    try { await reopenTicket(detail.id); await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !commentText.trim()) return;
    try {
      await addTicketComment(detail.id, { comment: commentText });
      setCommentText('');
      await refreshDetail(detail.id);
    } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!detail || !e.target.files?.[0]) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', e.target.files[0]);
    try {
      await api.post(`/tickets/${detail.id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await refreshDetail(detail.id);
    } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDeleteAttachment = async (id: number) => {
    if (!detail) return;
    if (!window.confirm('Delete this attachment? This cannot be undone.')) return;
    try { await deleteTicketAttachment(id); await refreshDetail(detail.id); }
    catch (err: any) { alert(err.response?.data?.message || 'Error'); }
  };

  const filtered = tickets.filter((t) => {
    const matchSearch = !search ||
      t.ticketNumber.toLowerCase().includes(search.toLowerCase()) ||
      t.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus ? t.status === filterStatus : true;
    const matchPriority = filterPriority ? t.priority === filterPriority : true;
    const matchType = filterType ? t.type === filterType : true;
    return matchSearch && matchStatus && matchPriority && matchType;
  });

  const myOpen = tickets.filter(t =>
    t.raisedBy.id === user?.staffId &&
    t.status !== 'CLOSED' && t.status !== 'RESOLVED'
  ).length;
  const pendingApprovals = tickets.filter(t => t.status === 'PENDING_APPROVAL').length;
  const unassigned = tickets.filter(t => t.status === 'OPEN' && !t.assignedTo).length;

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">IT Tickets</h2>
          <p className="text-sm text-gray-500 mt-1">Raise and track IT issues — hardware costs need partner approval</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ New Ticket</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-blue-700">{myOpen}</p>
          <p className="text-xs text-gray-500 mt-1">My Open Tickets</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-yellow-600">{pendingApprovals}</p>
          <p className="text-xs text-gray-500 mt-1">Pending Cost Approval</p>
        </div>
        {isIT && (
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-indigo-700">{unassigned}</p>
            <p className="text-xs text-gray-500 mt-1">Unassigned (Open)</p>
          </div>
        )}
      </div>

      {isPartner && pendingApprovals > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          {pendingApprovals} ticket{pendingApprovals > 1 ? 's' : ''} awaiting your cost approval.
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4">
          <input className="input-field max-w-xs" placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input-field max-w-[160px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select className="input-field max-w-[140px]" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input-field max-w-[140px]" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-sm text-gray-400 self-center">{filtered.length} tickets</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Ticket #</th>
                <th className="table-header">Title</th>
                <th className="table-header">Type</th>
                <th className="table-header">Priority</th>
                <th className="table-header">Raised By</th>
                <th className="table-header">Assigned To</th>
                <th className="table-header">Status</th>
                <th className="table-header">Cost</th>
                <th className="table-header">Created</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => getTicket(t.id).then((r) => setDetail(r.data))}>
                  <td className="table-cell font-mono font-medium text-blue-700">{t.ticketNumber}</td>
                  <td className="table-cell font-medium max-w-[200px] truncate">{t.title}</td>
                  <td className="table-cell text-xs">
                    <span className="mr-1">{typeIcon(t.type)}</span>{t.type}
                  </td>
                  <td className="table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityBadge(t.priority)}`}>{t.priority}</span>
                  </td>
                  <td className="table-cell">{t.raisedBy.staffName}</td>
                  <td className="table-cell text-gray-500">{t.assignedTo?.staffName || '—'}</td>
                  <td className="table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="table-cell text-right text-xs">
                    {t.estimatedCost != null ? (
                      <span className={t.costStatus === 'APPROVED' ? 'text-green-700' : t.costStatus === 'REJECTED' ? 'text-red-500' : 'text-yellow-700'}>
                        {fmtMoney(Number(t.estimatedCost))}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="table-cell text-xs text-gray-500">{format(new Date(t.createdAt), 'dd-MMM-yy')}</td>
                  <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button className="text-green-600 hover:text-green-800 text-xs font-medium"
                        onClick={() => getTicket(t.id).then((r) => setDetail(r.data))}>View</button>
                      {t.raisedBy.id === user?.staffId && t.status === 'OPEN' && (
                        <button className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          onClick={() => openEdit(t)}>Edit</button>
                      )}
                      {isAdmin && (
                        <button className="text-red-600 hover:text-red-800 text-xs font-medium"
                          onClick={() => handleDelete(t.id)}>Del</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="table-cell text-center text-gray-400 py-8">No tickets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{editing ? 'Edit Ticket' : 'Raise New Ticket'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input className="input-field" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input-field" rows={4} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select className="input-field" value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {TYPES.map((t) => <option key={t} value={t}>{typeIcon(t)} {t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select className="input-field" value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              {!editing && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                  Images and other attachments can be added after creating the ticket.
                </p>
              )}
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Submit Ticket'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-bold text-blue-700">{detail.ticketNumber}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(detail.status)}`}>
                    {detail.status.replace('_', ' ')}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityBadge(detail.priority)}`}>{detail.priority}</span>
                </div>
                <h3 className="text-lg font-semibold">{detail.title}</h3>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-4">
                <div><span className="text-gray-500">Type:</span> <span className="font-medium">{typeIcon(detail.type)} {detail.type}</span></div>
                <div><span className="text-gray-500">Raised By:</span> <span className="font-medium">{detail.raisedBy.staffName}</span></div>
                <div><span className="text-gray-500">Assigned To:</span> <span className="font-medium">{detail.assignedTo?.staffName || 'Unassigned'}</span></div>
                <div><span className="text-gray-500">Created:</span> <span className="font-medium">{format(new Date(detail.createdAt), 'dd-MMM-yyyy HH:mm')}</span></div>
                {detail.resolvedAt && <div><span className="text-gray-500">Resolved:</span> <span className="font-medium">{format(new Date(detail.resolvedAt), 'dd-MMM-yyyy HH:mm')}</span></div>}
                {detail.closedAt && <div><span className="text-gray-500">Closed:</span> <span className="font-medium">{format(new Date(detail.closedAt), 'dd-MMM-yyyy HH:mm')}</span></div>}
              </div>

              {/* Description */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-2 text-sm">Description</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">{detail.description}</p>
              </div>

              {/* Cost approval panel */}
              {detail.estimatedCost != null && (
                <div className={`rounded-lg p-4 border ${
                  detail.costStatus === 'APPROVED' ? 'bg-green-50 border-green-200' :
                  detail.costStatus === 'REJECTED' ? 'bg-red-50 border-red-200' :
                  'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-800 text-sm">Hardware Cost</h4>
                    <span className="text-xs font-medium">
                      {detail.costStatus === 'APPROVED' && <span className="text-green-700">✓ Approved</span>}
                      {detail.costStatus === 'REJECTED' && <span className="text-red-700">✗ Rejected</span>}
                      {detail.costStatus === 'PENDING' && <span className="text-yellow-700">⏳ Pending</span>}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{fmtMoney(Number(detail.estimatedCost))}</p>
                  <p className="text-sm text-gray-700 mt-1">{detail.costDescription}</p>
                  {detail.approvedBy && (
                    <p className="text-xs text-gray-500 mt-2">
                      By {detail.approvedBy.staffName} on {detail.approvedAt && format(new Date(detail.approvedAt), 'dd-MMM-yy')}
                      {detail.rejectionReason && <span className="block italic text-red-600 mt-1">Reason: {detail.rejectionReason}</span>}
                    </p>
                  )}
                  {detail.costStatus === 'PENDING' && isPartner && (
                    <div className="flex gap-2 mt-3">
                      <button className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700"
                        onClick={handleApprove}>Approve</button>
                      <button className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700"
                        onClick={() => setShowReject(true)}>Reject</button>
                    </div>
                  )}
                </div>
              )}

              {/* Resolution */}
              {detail.resolutionNotes && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 text-sm mb-1">Resolution</h4>
                  <p className="text-sm text-green-900 whitespace-pre-wrap">{detail.resolutionNotes}</p>
                </div>
              )}

              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-800 text-sm">Attachments ({detail.attachments.length})</h4>
                  {detail.status !== 'CLOSED' && (
                    <div>
                      <input ref={fileRef} type="file" className="hidden" id="ticket-upload" onChange={handleUpload}
                        accept=".jpg,.jpeg,.png,.gif,.pdf" />
                      <label htmlFor="ticket-upload" className={`btn-secondary text-xs cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
                        {uploading ? 'Uploading...' : '+ Add Image / File'}
                      </label>
                    </div>
                  )}
                </div>
                {detail.attachments.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {detail.attachments.map((a) => (
                      <div key={a.id} className="border border-gray-200 rounded-lg p-2 text-center">
                        {a.mimeType.startsWith('image') ? (
                          <a href={`/uploads/${a.fileName}`} target="_blank" rel="noreferrer">
                            <img src={`/uploads/${a.fileName}`} alt={a.originalName}
                              className="w-full h-24 object-cover rounded" />
                          </a>
                        ) : (
                          <a href={`/uploads/${a.fileName}`} target="_blank" rel="noreferrer"
                            className="block h-24 flex items-center justify-center bg-gray-50 rounded">
                            <span className="text-3xl">📄</span>
                          </a>
                        )}
                        <p className="text-xs text-gray-600 truncate mt-1" title={a.originalName}>{a.originalName}</p>
                        <p className="text-xs text-gray-400">{fileSizeStr(a.fileSize)}</p>
                        <button className="text-red-500 hover:text-red-700 text-xs"
                          onClick={() => handleDeleteAttachment(a.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-sm">No attachments.</p>}
              </div>

              {/* Comments */}
              <div>
                <h4 className="font-semibold text-gray-800 text-sm mb-3">Activity ({detail.comments.length})</h4>
                {detail.comments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {detail.comments.map((c) => (
                      <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">{c.authorName}</span>
                          <span className="text-xs text-gray-400">{format(new Date(c.createdAt), 'dd-MMM HH:mm')}</span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
                {detail.status !== 'CLOSED' && (
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input className="input-field flex-1" placeholder="Add a comment..."
                      value={commentText} onChange={(e) => setCommentText(e.target.value)} />
                    <button type="submit" className="btn-primary text-sm">Post</button>
                  </form>
                )}
              </div>

              {/* Action bar */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
                {isIT && detail.status === 'OPEN' && !detail.assignedTo && (
                  <button className="btn-primary text-sm" onClick={handleAssignToMe}>Take Ticket (Assign to Me)</button>
                )}
                {isIT && detail.status === 'IN_PROGRESS' && (
                  <>
                    <button className="btn-secondary text-sm" onClick={() => setShowCost(true)}>
                      {detail.costStatus === 'REJECTED' ? 'Re-request Cost Approval' : 'Request Cost Approval'}
                    </button>
                    <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 font-medium"
                      onClick={() => setShowResolve(true)}>Mark Resolved</button>
                  </>
                )}
                {isIT && detail.status === 'RESOLVED' && (
                  <>
                    <button className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 font-medium"
                      onClick={handleClose}>Close Ticket</button>
                    <button className="btn-secondary text-sm" onClick={handleReopen}>Reopen</button>
                  </>
                )}
                {isIT && detail.status === 'CLOSED' && (
                  <button className="btn-secondary text-sm" onClick={handleReopen}>Reopen</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cost Request Modal */}
      {showCost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Request Hardware Cost Approval</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Estimated Cost (₹)</label>
                <input type="number" min="0" step="0.01" className="input-field"
                  value={costForm.estimatedCost}
                  onChange={(e) => setCostForm({ ...costForm, estimatedCost: e.target.value })} />
              </div>
              <div>
                <label className="label">Cost Breakdown / Justification</label>
                <textarea className="input-field" rows={3}
                  value={costForm.costDescription}
                  onChange={(e) => setCostForm({ ...costForm, costDescription: e.target.value })}
                  placeholder="What needs to be purchased and why..." />
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                A partner will need to approve this cost before procurement.
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setShowCost(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleRequestCost}>Submit for Approval</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Reject Cost</h3>
            <label className="label">Reason (optional)</label>
            <textarea className="input-field" rows={3}
              value={rejectForm.rejectionReason}
              onChange={(e) => setRejectForm({ rejectionReason: e.target.value })}
              placeholder="Reason for rejection..." />
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setShowReject(false)}>Cancel</button>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 font-medium"
                onClick={handleReject}>Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolve && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Mark as Resolved</h3>
            <label className="label">Resolution Notes</label>
            <textarea className="input-field" rows={4}
              value={resolveForm.resolutionNotes}
              onChange={(e) => setResolveForm({ resolutionNotes: e.target.value })}
              placeholder="How was this ticket resolved?" />
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setShowResolve(false)}>Cancel</button>
              <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 font-medium"
                onClick={handleResolve}>Mark Resolved</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Outer Tickets page with tabs ─────────────────────────────────────────────

const Tickets: React.FC = () => {
  const { isAdmin, isHR, isPartner } = useAuth();
  const [pageTab, setPageTab] = useState<'tickets' | 'assets'>('tickets');

  return (
    <div className="space-y-0">
      {/* Page-level tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setPageTab('tickets')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            pageTab === 'tickets' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🎫 IT Tickets
        </button>
        {(isAdmin || isHR || isPartner) && (
          <button
            onClick={() => setPageTab('assets')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              pageTab === 'assets' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🖥️ IT Assets
          </button>
        )}
      </div>

      {pageTab === 'tickets' && <TicketsContent />}
      {pageTab === 'assets' && <ITAssets />}
    </div>
  );
};

export default Tickets;
