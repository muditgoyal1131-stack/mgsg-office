import React, { useEffect, useState, useCallback } from 'react';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import {
  getLeaves, getLeaveBalance, applyLeave, cancelLeave, approveLeave, rejectLeave,
  exportLeaves, getStaff,
  getCompLeaveRequests, requestCompLeave, approveCompLeave, rejectCompLeave,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import LeaveCalendarTab from './LeaveCalendar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Leave {
  id: number; staffId: number;
  staff: { id: number; staffName: string };
  fromDate: string; toDate: string; days: number; reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewedBy?: { id: number; staffName: string };
  reviewedAt?: string; rejectionReason?: string; createdAt: string;
}

interface CompLeaveRequest {
  id: number; staffId: number;
  staff: { id: number; staffName: string; reportingPartnerId?: number };
  days: number; reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: { id: number; staffName: string };
  reviewedAt?: string; rejectionReason?: string; createdAt: string;
}

interface LeaveBalance {
  allowed: number; taken: number; remaining: number;
  compAdded: number; annualBase: number;
}

interface StaffInfo { id: number; staffName: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const fmtD = (d?: string) => d ? format(new Date(d), 'dd-MMM-yyyy') : '—';
const fmtDT = (d?: string) => d ? format(new Date(d), 'dd-MMM-yy HH:mm') : '—';

function calcDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const diff = differenceInCalendarDays(parseISO(to), parseISO(from));
  return diff < 0 ? 0 : diff + 1;
}

// ── Component ─────────────────────────────────────────────────────────────────

const Leave: React.FC = () => {
  const { user, isAdmin, isHR, isPartner } = useAuth();

  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [compRequests, setCompRequests] = useState<CompLeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [staff, setStaff] = useState<StaffInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'leaves' | 'comp' | 'calendar'>('leaves');

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStaffId, setFilterStaffId] = useState('');

  // Apply leave modal
  const [showApply, setShowApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyForm, setApplyForm] = useState({ fromDate: '', toDate: '', reason: '' });

  // Comp leave modal
  const [showComp, setShowComp] = useState(false);
  const [compForm, setCompForm] = useState({ days: '', reason: '' });
  const [compError, setCompError] = useState('');
  const [compSubmitting, setCompSubmitting] = useState(false);

  // Reject modals
  const [rejectModal, setRejectModal] = useState<{ id: number; type: 'leave' | 'comp' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const canManage = isAdmin || isHR;

  const fetchAll = useCallback(async () => {
    try {
      const promises: Promise<any>[] = [getLeaves(), getCompLeaveRequests()];
      if (canManage || isPartner) promises.push(getStaff());
      if (user?.staffId) promises.push(getLeaveBalance(user.staffId));

      const results = await Promise.all(promises.map(p => p.catch(() => ({ data: null }))));
      setLeaves(results[0].data || []);
      setCompRequests(results[1].data || []);
      let idx = 2;
      if (canManage || isPartner) { setStaff(results[idx]?.data || []); idx++; }
      if (user?.staffId && results[idx]) setBalance(results[idx].data);
    } finally {
      setLoading(false);
    }
  }, [canManage, isPartner, user?.staffId]); // eslint-disable-line

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const res = await exportLeaves();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = `Leaves_${format(new Date(), 'yyyy-MM-dd')}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault(); setApplyError('');
    if (!applyForm.fromDate || !applyForm.toDate) { setApplyError('Select from and to dates'); return; }
    if (calcDays(applyForm.fromDate, applyForm.toDate) <= 0) { setApplyError('To date must be on or after from date'); return; }
    setApplying(true);
    try {
      await applyLeave({ fromDate: applyForm.fromDate, toDate: applyForm.toDate, reason: applyForm.reason });
      setShowApply(false); fetchAll();
    } catch (err: any) {
      setApplyError(err.response?.data?.message || 'Failed to apply leave');
    } finally { setApplying(false); }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('Cancel this leave request?')) return;
    try { await cancelLeave(id); fetchAll(); }
    catch (err: any) { alert(err.response?.data?.message || 'Error cancelling leave'); }
  };

  const handleApprove = async (id: number) => {
    try { await approveLeave(id); fetchAll(); }
    catch (err: any) { alert(err.response?.data?.message || 'Error approving leave'); }
  };

  const handleApproveComp = async (id: number) => {
    try { await approveCompLeave(id); fetchAll(); }
    catch (err: any) { alert(err.response?.data?.message || 'Error approving comp leave'); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      if (rejectModal.type === 'leave') await rejectLeave(rejectModal.id, { rejectionReason });
      else await rejectCompLeave(rejectModal.id, { rejectionReason });
      setRejectModal(null); setRejectionReason(''); fetchAll();
    } catch (err: any) { alert(err.response?.data?.message || 'Error rejecting'); }
  };

  const handleCompSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setCompError('');
    if (!compForm.days || Number(compForm.days) <= 0) { setCompError('Enter valid days'); return; }
    if (!compForm.reason.trim()) { setCompError('Reason is required'); return; }
    setCompSubmitting(true);
    try {
      await requestCompLeave({ days: Number(compForm.days), reason: compForm.reason });
      setShowComp(false); setCompForm({ days: '', reason: '' }); fetchAll();
    } catch (err: any) {
      setCompError(err.response?.data?.message || 'Error submitting request');
    } finally { setCompSubmitting(false); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filteredLeaves = leaves.filter(l => {
    if (filterStatus && l.status !== filterStatus) return false;
    if (filterStaffId && String(l.staffId) !== filterStaffId) return false;
    return true;
  });

  const filteredComp = compRequests.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterStaffId && String(c.staffId) !== filterStaffId) return false;
    return true;
  });

  const pendingLeaves = leaves.filter(l => l.status === 'PENDING').length;
  const pendingComp = compRequests.filter(c => c.status === 'PENDING').length;
  const appliedDays = calcDays(applyForm.fromDate, applyForm.toDate);

  // Can the current user approve comp leaves? (reporting partner or HR/Admin)
  const canApproveComp = (req: CompLeaveRequest) => {
    if (isAdmin || isHR) return true;
    if (isPartner && req.staff.reportingPartnerId === user?.staffId) return true;
    return false;
  };

  if (loading) return <p className="text-gray-500 text-sm py-10 text-center">Loading...</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leave Management</h2>
          <p className="text-sm text-gray-500 mt-1">Apply and track leave requests</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={handleExport}>Export Excel</button>
          <button className="btn-secondary text-sm" onClick={() => { setCompForm({ days: '', reason: '' }); setCompError(''); setShowComp(true); }}>
            🔄 Request Comp Leave
          </button>
          <button className="btn-primary" onClick={() => { setApplyForm({ fromDate: '', toDate: '', reason: '' }); setApplyError(''); setShowApply(true); }}>
            + Apply Leave
          </button>
        </div>
      </div>

      {/* Pending alerts */}
      {(pendingLeaves > 0 || pendingComp > 0) && (canManage || isPartner) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-sm text-amber-800">
          {pendingLeaves > 0 && <span>📋 <strong>{pendingLeaves}</strong> leave request{pendingLeaves > 1 ? 's' : ''} pending</span>}
          {pendingComp > 0 && <span>🔄 <strong>{pendingComp}</strong> comp leave request{pendingComp > 1 ? 's' : ''} pending</span>}
        </div>
      )}

      {/* Balance card */}
      {balance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card text-center py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Annual Base</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{balance.annualBase}</p>
            <p className="text-xs text-gray-400 mt-0.5">days / year</p>
          </div>
          {balance.compAdded > 0 && (
            <div className="card text-center py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comp Added</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">+{balance.compAdded}</p>
              <p className="text-xs text-gray-400 mt-0.5">compensatory days</p>
            </div>
          )}
          <div className="card text-center py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Taken</p>
            <p className="text-3xl font-bold text-orange-500 mt-1">{balance.taken}</p>
            <p className="text-xs text-gray-400 mt-0.5">days used</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining</p>
            <p className={`text-3xl font-bold mt-1 ${balance.remaining > 5 ? 'text-green-600' : balance.remaining > 0 ? 'text-orange-500' : 'text-red-600'}`}>
              {balance.remaining}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">of {balance.allowed} days</p>
            <div className="mt-2 h-1.5 rounded-full bg-gray-200 mx-3">
              <div className={`h-1.5 rounded-full ${balance.remaining > 5 ? 'bg-green-500' : balance.remaining > 0 ? 'bg-orange-400' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, Math.round((balance.taken / balance.allowed) * 100))}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setTab('leaves')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'leaves' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          📋 Leave Requests{pendingLeaves > 0 ? ` (${pendingLeaves} pending)` : ''}
        </button>
        <button onClick={() => setTab('comp')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'comp' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          🔄 Comp Leave{pendingComp > 0 ? ` (${pendingComp} pending)` : ''}
        </button>
        <button onClick={() => setTab('calendar')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'calendar' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          📆 Calendar
        </button>
      </div>

      {/* Calendar Tab */}
      {tab === 'calendar' && <LeaveCalendarTab />}

      {/* Filters — only for leave/comp tabs */}
      {tab !== 'calendar' && (
      <div className="flex flex-wrap gap-3 items-center">
        <select className="input-field max-w-[180px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          {tab === 'leaves' && <option value="CANCELLED">Cancelled</option>}
        </select>
        {(canManage || isPartner) && (
          <select className="input-field max-w-[200px]" value={filterStaffId} onChange={e => setFilterStaffId(e.target.value)}>
            <option value="">All Staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.staffName}</option>)}
          </select>
        )}
        <span className="text-sm text-gray-400 ml-auto">
          {tab === 'leaves' ? filteredLeaves.length : filteredComp.length} record{(tab === 'leaves' ? filteredLeaves.length : filteredComp.length) !== 1 ? 's' : ''}
        </span>
      </div>
      )}

      {/* ── LEAVE REQUESTS TABLE ── */}
      {tab === 'leaves' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>
              {(canManage || isPartner) && <th className="table-header">Staff</th>}
              <th className="table-header">From</th>
              <th className="table-header">To</th>
              <th className="table-header text-center">Days</th>
              <th className="table-header">Reason</th>
              <th className="table-header">Status</th>
              <th className="table-header">Reviewed By</th>
              <th className="table-header">Actions</th>
            </tr></thead>
            <tbody>
              {filteredLeaves.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  {(canManage || isPartner) && <td className="table-cell font-medium">{l.staff.staffName}</td>}
                  <td className="table-cell text-xs">{fmtD(l.fromDate)}</td>
                  <td className="table-cell text-xs">{fmtD(l.toDate)}</td>
                  <td className="table-cell text-center font-bold">{l.days}</td>
                  <td className="table-cell max-w-[160px]"><span className="text-xs text-gray-600 line-clamp-2">{l.reason || '—'}</span></td>
                  <td className="table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[l.status]}`}>{l.status}</span>
                    {l.status === 'REJECTED' && l.rejectionReason && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={l.rejectionReason}>{l.rejectionReason}</p>
                    )}
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {l.reviewedBy ? <><div>{l.reviewedBy.staffName}</div><div className="text-gray-400">{fmtDT(l.reviewedAt)}</div></> : '—'}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2 flex-wrap">
                      {canManage && l.status === 'PENDING' && (
                        <>
                          <button className="text-green-600 hover:text-green-800 text-xs font-medium" onClick={() => handleApprove(l.id)}>Approve</button>
                          <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={() => { setRejectModal({ id: l.id, type: 'leave' }); setRejectionReason(''); }}>Reject</button>
                        </>
                      )}
                      {!canManage && l.status === 'PENDING' && l.staffId === user?.staffId && (
                        <button className="text-gray-500 hover:text-gray-700 text-xs font-medium" onClick={() => handleCancel(l.id)}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLeaves.length === 0 && (
                <tr><td colSpan={canManage || isPartner ? 8 : 7} className="table-cell text-center text-gray-400 py-10">No leave records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── COMP LEAVE REQUESTS TABLE ── */}
      {tab === 'comp' && (
        <div className="card overflow-x-auto">
          <div className="mb-3">
            <p className="text-xs text-gray-500">Compensatory leave is granted for extra work/overtime. Your reporting partner must approve. Approved days are added to your leave balance.</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr>
              {(canManage || isPartner) && <th className="table-header">Staff</th>}
              <th className="table-header">Applied On</th>
              <th className="table-header text-center">Days</th>
              <th className="table-header">Reason</th>
              <th className="table-header">Status</th>
              <th className="table-header">Reviewed By</th>
              <th className="table-header">Actions</th>
            </tr></thead>
            <tbody>
              {filteredComp.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  {(canManage || isPartner) && <td className="table-cell font-medium">{c.staff.staffName}</td>}
                  <td className="table-cell text-xs">{fmtD(c.createdAt)}</td>
                  <td className="table-cell text-center font-bold">{c.days}</td>
                  <td className="table-cell max-w-[200px]"><span className="text-xs text-gray-600 line-clamp-2">{c.reason}</span></td>
                  <td className="table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                    {c.status === 'REJECTED' && c.rejectionReason && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={c.rejectionReason}>{c.rejectionReason}</p>
                    )}
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {c.reviewedBy ? <><div>{c.reviewedBy.staffName}</div><div className="text-gray-400">{fmtDT(c.reviewedAt)}</div></> : '—'}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2 flex-wrap">
                      {c.status === 'PENDING' && canApproveComp(c) && (
                        <>
                          <button className="text-green-600 hover:text-green-800 text-xs font-medium" onClick={() => handleApproveComp(c.id)}>Approve</button>
                          <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={() => { setRejectModal({ id: c.id, type: 'comp' }); setRejectionReason(''); }}>Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredComp.length === 0 && (
                <tr><td colSpan={canManage || isPartner ? 7 : 6} className="table-cell text-center text-gray-400 py-10">No compensatory leave requests yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Apply Leave Modal ── */}
      {showApply && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-6 pb-3 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Apply for Leave</h3>
              {balance && <p className="text-sm text-gray-500 mt-1">Balance: <span className="font-semibold text-green-600">{balance.remaining}</span> of {balance.allowed} days remaining</p>}
            </div>
            <form onSubmit={handleApply} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">From Date *</label>
                  <input type="date" className="input-field" value={applyForm.fromDate}
                    onChange={e => setApplyForm({ ...applyForm, fromDate: e.target.value })} required />
                </div>
                <div>
                  <label className="label">To Date *</label>
                  <input type="date" className="input-field" value={applyForm.toDate}
                    min={applyForm.fromDate || undefined}
                    onChange={e => setApplyForm({ ...applyForm, toDate: e.target.value })} required />
                </div>
              </div>
              {applyForm.fromDate && applyForm.toDate && appliedDays > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700 font-medium">
                  Duration: {appliedDays} day{appliedDays > 1 ? 's' : ''}
                  {balance && appliedDays > balance.remaining && (
                    <span className="ml-2 text-orange-600 font-semibold">⚠ Exceeds balance!</span>
                  )}
                </div>
              )}
              <div>
                <label className="label">Reason (optional)</label>
                <textarea className="input-field" rows={3} value={applyForm.reason}
                  onChange={e => setApplyForm({ ...applyForm, reason: e.target.value })} placeholder="Brief reason for leave..." />
              </div>
              {applyError && <p className="text-red-600 text-sm">{applyError}</p>}
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" className="btn-secondary" onClick={() => setShowApply(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={applying}>{applying ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Comp Leave Modal ── */}
      {showComp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-6 pb-3 border-b">
              <h3 className="text-lg font-semibold text-gray-900">🔄 Request Compensatory Leave</h3>
              <p className="text-xs text-gray-500 mt-1">For extra days worked. Approved by your reporting partner. Added to your leave balance.</p>
            </div>
            <form onSubmit={handleCompSubmit} className="p-6 space-y-4">
              <div>
                <label className="label">Number of Days *</label>
                <input type="number" min="0.5" step="0.5" className="input-field" value={compForm.days}
                  onChange={e => setCompForm({ ...compForm, days: e.target.value })} placeholder="e.g. 1 or 0.5" required />
              </div>
              <div>
                <label className="label">Reason / Justification *</label>
                <textarea className="input-field" rows={4} value={compForm.reason}
                  onChange={e => setCompForm({ ...compForm, reason: e.target.value })}
                  placeholder="Describe the extra work done (e.g. worked on Saturday for client deadline, attended weekend conference...)" required />
              </div>
              {compError && <p className="text-red-600 text-sm">{compError}</p>}
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" className="btn-secondary" onClick={() => setShowComp(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={compSubmitting}>{compSubmitting ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reject Modal ── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Reject {rejectModal.type === 'leave' ? 'Leave' : 'Comp Leave'} Request
            </h3>
            <label className="label">Rejection Reason (optional)</label>
            <textarea className="input-field" rows={3} value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)} placeholder="Reason for rejection..." />
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 font-medium" onClick={handleReject}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leave;
