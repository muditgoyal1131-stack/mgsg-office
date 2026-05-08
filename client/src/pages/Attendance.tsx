import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, isToday, isFuture, isSameMonth, getDay, isPast,
} from 'date-fns';
import {
  getAttendance, getAllAttendance, getAttendanceSummary, markAttendance,
  getCorrectionRequests, requestAttendanceCorrection,
  approveAttendanceCorrection, rejectAttendanceCorrection,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import HolidaysTab from './Holidays';

// ── Types ─────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'PRESENT' | 'WFH' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE';

interface AttendanceRecord { id: number; staffId: number; date: string; status: AttendanceStatus; notes?: string; }

interface SummaryRow {
  staff: { id: number; staffName: string };
  present: number; wfh: number; halfDay: number; absent: number; onLeave: number; total: number;
}

interface CorrectionRequest {
  id: number; staffId: number;
  staff: { id: number; staffName: string; reportingPartnerId?: number };
  date: string; requestedStatus: AttendanceStatus; reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: { id: number; staffName: string };
  reviewedAt?: string; rejectionReason?: string; createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'WFH', 'HALF_DAY', 'ABSENT', 'ON_LEAVE'];
const STATUS_LABEL: Record<AttendanceStatus, string> = { PRESENT: 'Present', WFH: 'Work From Home', HALF_DAY: 'Half Day', ABSENT: 'Absent', ON_LEAVE: 'On Leave' };
const STATUS_BG: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-100 text-green-800 border-green-200',
  WFH: 'bg-blue-100 text-blue-800 border-blue-200',
  HALF_DAY: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ABSENT: 'bg-red-100 text-red-800 border-red-200',
  ON_LEAVE: 'bg-purple-100 text-purple-800 border-purple-200',
};
const STATUS_DOT: Record<AttendanceStatus, string> = { PRESENT: 'bg-green-500', WFH: 'bg-blue-500', HALF_DAY: 'bg-yellow-400', ABSENT: 'bg-red-500', ON_LEAVE: 'bg-purple-500' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CORR_STATUS_COLOR: Record<string, string> = { PENDING: 'bg-yellow-100 text-yellow-700', APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700' };

// ── Component ─────────────────────────────────────────────────────────────────

const Attendance: React.FC = () => {
  const { user, isAdmin, isHR, isPartner } = useAuth();
  const canManage = isAdmin || isHR;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [activeTab, setActiveTab] = useState<'my' | 'team' | 'corrections' | 'holidays'>('my');

  // My attendance
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);

  // Team summary
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Correction requests
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [loadingCorr, setLoadingCorr] = useState(false);

  // Mark attendance popover (today only)
  const [popoverDate, setPopoverDate] = useState<string | null>(null);
  const [popoverStatus, setPopoverStatus] = useState<AttendanceStatus>('PRESENT');
  const [popoverNotes, setPopoverNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Correction request modal
  const [corrModal, setCorrModal] = useState<{ dateStr: string; currentStatus?: AttendanceStatus } | null>(null);
  const [corrStatus, setCorrStatus] = useState<AttendanceStatus>('PRESENT');
  const [corrReason, setCorrReason] = useState('');
  const [corrSubmitting, setCorrSubmitting] = useState(false);
  const [corrError, setCorrError] = useState('');

  // Reject correction modal
  const [rejectCorrId, setRejectCorrId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const monthParam = `${year}-${String(month).padStart(2, '0')}`;

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchMyAttendance = useCallback(async () => {
    setLoadingMy(true);
    try {
      const res = await getAttendance({ month: monthParam });
      setRecords(res.data);
    } finally { setLoadingMy(false); }
  }, [monthParam]);

  const fetchTeamSummary = useCallback(async () => {
    if (!canManage) return;
    setLoadingTeam(true);
    try {
      const res = await getAttendanceSummary({ month: monthParam });
      setSummary(res.data);
    } finally { setLoadingTeam(false); }
  }, [canManage, monthParam]);

  const fetchCorrections = useCallback(async () => {
    setLoadingCorr(true);
    try {
      const res = await getCorrectionRequests();
      setCorrections(res.data || []);
    } finally { setLoadingCorr(false); }
  }, []);

  useEffect(() => { fetchMyAttendance(); }, [fetchMyAttendance]);
  useEffect(() => { if (activeTab === 'team') fetchTeamSummary(); }, [activeTab, fetchTeamSummary]);
  useEffect(() => { if (activeTab === 'corrections') fetchCorrections(); }, [activeTab, fetchCorrections]);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverDate(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Month navigation ──────────────────────────────────────────────────────

  const changeMonth = (delta: number) => {
    let m = month + delta; let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m); setYear(y);
  };

  // ── Calendar logic ────────────────────────────────────────────────────────

  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart);
  const gridOffset = startDow === 0 ? 6 : startDow - 1;

  const recordMap: Record<string, AttendanceRecord> = {};
  records.forEach(r => { recordMap[r.date.slice(0, 10)] = r; });

  const todayStr = format(today, 'yyyy-MM-dd');

  const openPopover = (dateStr: string) => {
    const existing = recordMap[dateStr];
    setPopoverStatus(existing?.status ?? 'PRESENT');
    setPopoverNotes(existing?.notes ?? '');
    setPopoverDate(dateStr);
  };

  const openCorrModal = (dateStr: string) => {
    const existing = recordMap[dateStr];
    setCorrStatus(existing?.status ?? 'PRESENT');
    setCorrReason('');
    setCorrError('');
    setCorrModal({ dateStr, currentStatus: existing?.status });
  };

  const handleSave = async () => {
    if (!popoverDate) return;
    setSaving(true);
    try {
      await markAttendance({ date: popoverDate, status: popoverStatus, notes: popoverNotes });
      setPopoverDate(null);
      await fetchMyAttendance();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save attendance');
    } finally { setSaving(false); }
  };

  const handleCorrSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setCorrError('');
    if (!corrReason.trim()) { setCorrError('Reason is required'); return; }
    setCorrSubmitting(true);
    try {
      await requestAttendanceCorrection({ date: corrModal!.dateStr, requestedStatus: corrStatus, reason: corrReason });
      setCorrModal(null); setCorrReason('');
      fetchCorrections();
    } catch (err: any) {
      setCorrError(err.response?.data?.message || 'Error submitting request');
    } finally { setCorrSubmitting(false); }
  };

  const handleApproveCorr = async (id: number) => {
    try { await approveAttendanceCorrection(id); fetchCorrections(); fetchMyAttendance(); }
    catch (err: any) { alert(err.response?.data?.message || 'Error approving'); }
  };

  const handleRejectCorr = async () => {
    if (!rejectCorrId) return;
    try { await rejectAttendanceCorrection(rejectCorrId, { rejectionReason: rejectReason }); setRejectCorrId(null); setRejectReason(''); fetchCorrections(); }
    catch (err: any) { alert(err.response?.data?.message || 'Error rejecting'); }
  };

  // ── Summary counts ────────────────────────────────────────────────────────

  const counts: Record<AttendanceStatus, number> = { PRESENT: 0, WFH: 0, HALF_DAY: 0, ABSENT: 0, ON_LEAVE: 0 };
  records.forEach(r => { if (r.status in counts) counts[r.status]++; });
  const summaryItems = [
    { label: 'Present', count: counts.PRESENT, color: 'text-green-600' },
    { label: 'WFH', count: counts.WFH, color: 'text-blue-600' },
    { label: 'Half Day', count: counts.HALF_DAY, color: 'text-yellow-600' },
    { label: 'Absent', count: counts.ABSENT, color: 'text-red-600' },
    { label: 'On Leave', count: counts.ON_LEAVE, color: 'text-purple-600' },
  ];

  const pendingCorr = corrections.filter(c => c.status === 'PENDING').length;

  const canApproveCorr = (req: CorrectionRequest) => {
    if (canManage) return true;
    if (isPartner && req.staff.reportingPartnerId === user?.staffId) return true;
    return false;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Attendance &amp; Holidays</h2>
          <p className="text-sm text-gray-500 mt-1">Track daily attendance — only today can be marked directly</p>
        </div>
        {activeTab !== 'holidays' && <div className="flex items-center gap-2">
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => changeMonth(-1)}>&#8249;</button>
          <select className="input-field py-1.5 text-sm" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{format(new Date(year, i, 1), 'MMMM')}</option>
            ))}
          </select>
          <select className="input-field py-1.5 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => changeMonth(1)}>&#8250;</button>
        </div>}
      </div>

      {/* Pending corrections alert */}
      {pendingCorr > 0 && (canManage || isPartner) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 cursor-pointer" onClick={() => setActiveTab('corrections')}>
          ✏️ <strong>{pendingCorr}</strong> attendance correction request{pendingCorr > 1 ? 's' : ''} pending review — <span className="underline">click to review</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        <button onClick={() => setActiveTab('my')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'my' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          My Attendance
        </button>
        {canManage && (
          <button onClick={() => setActiveTab('team')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'team' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Team Overview
          </button>
        )}
        <button onClick={() => setActiveTab('corrections')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'corrections' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          ✏️ Corrections{pendingCorr > 0 ? ` (${pendingCorr})` : ''}
        </button>
        <button onClick={() => setActiveTab('holidays')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'holidays' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          🗓️ Holidays
        </button>
      </div>

      {/* ── HOLIDAYS TAB ── */}
      {activeTab === 'holidays' && <HolidaysTab />}

      {/* ── MY ATTENDANCE ── */}
      {activeTab === 'my' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-5 gap-3">
            {summaryItems.map(s => (
              <div key={s.label} className="card text-center py-3">
                <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700">
            📅 <strong>Today only</strong> — You can mark today's attendance directly. Past dates are auto-filled as Absent. To correct a past date, use the <button className="underline font-medium" onClick={() => setActiveTab('corrections')}>Correction Requests</button> tab.
          </div>

          {loadingMy ? <p className="text-gray-500 text-sm">Loading...</p> : (
            <div className="card relative">
              <div className="grid grid-cols-7 mb-2">
                {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: gridOffset }).map((_, i) => <div key={`e-${i}`} />)}
                {daysInMonth.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const rec = recordMap[dateStr];
                  const isInFuture = isFuture(day) && !isToday(day);
                  const isInPast = isPast(day) && !isToday(day);
                  const inMonth = isSameMonth(day, monthStart);

                  const handleClick = () => {
                    if (!inMonth || isInFuture) return;
                    if (isToday(day)) {
                      openPopover(dateStr);
                    } else if (isInPast) {
                      openCorrModal(dateStr); // Past → correction request
                    }
                  };

                  return (
                    <div key={dateStr} onClick={handleClick}
                      className={[
                        'relative rounded-lg border p-1.5 min-h-[56px] flex flex-col transition-shadow',
                        isInFuture ? 'bg-gray-50 border-gray-100 cursor-default opacity-40' :
                          isToday(day) ? 'cursor-pointer hover:shadow-sm ring-2 ring-blue-400' :
                            'cursor-pointer hover:shadow-sm',
                        rec ? `${STATUS_BG[rec.status]} border` : 'bg-white border-gray-200 hover:border-blue-300',
                      ].join(' ')}
                      title={isToday(day) ? 'Click to mark today\'s attendance' : isInPast ? 'Click to request correction' : ''}
                    >
                      <span className={`text-xs font-semibold ${isToday(day) ? 'text-blue-600' : 'text-gray-600'}`}>
                        {format(day, 'd')}
                      </span>
                      {isToday(day) && !rec && (
                        <span className="text-[9px] text-blue-500 font-medium leading-tight mt-0.5">Mark</span>
                      )}
                      {isInPast && !rec && (
                        <span className="text-[9px] text-red-400 font-medium leading-tight mt-0.5">A</span>
                      )}
                      {isInPast && (
                        <span className="absolute top-0.5 right-0.5 text-[8px] text-gray-400" title="Click to request correction">✏</span>
                      )}
                      {rec && (
                        <div className="mt-auto">
                          <div className={`w-2 h-2 rounded-full mx-auto ${STATUS_DOT[rec.status]}`} />
                          <p className="text-center text-[10px] font-medium leading-tight mt-0.5 truncate">
                            {rec.status === 'HALF_DAY' ? 'Half' : rec.status === 'ON_LEAVE' ? 'Leave' : rec.status === 'WFH' ? 'WFH' : rec.status === 'PRESENT' ? 'P' : 'A'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
                {STATUS_OPTIONS.map(s => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s]}`} />
                    <span className="text-xs text-gray-500">{STATUS_LABEL[s]}</span>
                  </div>
                ))}
              </div>

              {/* Today popover */}
              {popoverDate && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
                  <div ref={popoverRef} className="bg-white rounded-xl shadow-xl w-full max-w-xs p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-900">{format(parseISO(popoverDate), 'EEEE, dd MMMM yyyy')}</h4>
                      <button className="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={() => setPopoverDate(null)}>✕</button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="label text-xs">Status</label>
                        <select className="input-field" value={popoverStatus} onChange={e => setPopoverStatus(e.target.value as AttendanceStatus)}>
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">Notes (optional)</label>
                        <input className="input-field" value={popoverNotes} onChange={e => setPopoverNotes(e.target.value)} placeholder="Any notes..." />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button className="btn-secondary flex-1 text-sm" onClick={() => setPopoverDate(null)}>Cancel</button>
                        <button className="btn-primary flex-1 text-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TEAM OVERVIEW ── */}
      {activeTab === 'team' && canManage && (
        <div className="card">
          {loadingTeam ? <p className="text-gray-500 text-sm">Loading...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className="table-header">Staff Name</th>
                  <th className="table-header text-center text-green-700">Present</th>
                  <th className="table-header text-center text-blue-700">WFH</th>
                  <th className="table-header text-center text-yellow-700">Half Day</th>
                  <th className="table-header text-center text-red-700">Absent</th>
                  <th className="table-header text-center text-purple-700">On Leave</th>
                  <th className="table-header text-center">Total</th>
                </tr></thead>
                <tbody>
                  {summary.map(row => (
                    <tr key={row.staff.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{row.staff.staffName}</td>
                      <td className="table-cell text-center font-semibold text-green-700">{row.present}</td>
                      <td className="table-cell text-center font-semibold text-blue-700">{row.wfh}</td>
                      <td className="table-cell text-center font-semibold text-yellow-700">{row.halfDay}</td>
                      <td className="table-cell text-center font-semibold text-red-700">{row.absent}</td>
                      <td className="table-cell text-center font-semibold text-purple-700">{row.onLeave}</td>
                      <td className="table-cell text-center font-semibold text-gray-700">{row.total}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && (
                    <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-10">No data for {format(new Date(year, month - 1, 1), 'MMMM yyyy')}</td></tr>
                  )}
                </tbody>
                {summary.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="table-cell font-bold">Total</td>
                      <td className="table-cell text-center font-bold text-green-700">{summary.reduce((s, r) => s + r.present, 0)}</td>
                      <td className="table-cell text-center font-bold text-blue-700">{summary.reduce((s, r) => s + r.wfh, 0)}</td>
                      <td className="table-cell text-center font-bold text-yellow-700">{summary.reduce((s, r) => s + r.halfDay, 0)}</td>
                      <td className="table-cell text-center font-bold text-red-700">{summary.reduce((s, r) => s + r.absent, 0)}</td>
                      <td className="table-cell text-center font-bold text-purple-700">{summary.reduce((s, r) => s + r.onLeave, 0)}</td>
                      <td className="table-cell text-center font-bold text-gray-700">{summary.reduce((s, r) => s + r.total, 0)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CORRECTION REQUESTS ── */}
      {activeTab === 'corrections' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700">
            ℹ️ Attendance correction requests are reviewed by your <strong>Reporting Partner</strong> or HR/Admin. Once approved, your attendance record is updated automatically.
          </div>
          <div className="card overflow-x-auto">
            {loadingCorr ? <p className="text-gray-500 text-sm py-4 text-center">Loading...</p> : (
              <table className="w-full text-sm">
                <thead><tr>
                  {(canManage || isPartner) && <th className="table-header">Staff</th>}
                  <th className="table-header">Date</th>
                  <th className="table-header">Current</th>
                  <th className="table-header">Requested</th>
                  <th className="table-header">Reason</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Reviewed By</th>
                  <th className="table-header">Actions</th>
                </tr></thead>
                <tbody>
                  {corrections.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      {(canManage || isPartner) && <td className="table-cell font-medium">{c.staff.staffName}</td>}
                      <td className="table-cell text-xs font-mono">{format(new Date(c.date), 'dd-MMM-yyyy')}</td>
                      <td className="table-cell">
                        {(() => { const rec = recordMap[c.date.slice(0, 10)]; return rec ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BG[rec.status]}`}>{STATUS_LABEL[rec.status]}</span> : <span className="text-xs text-gray-400">—</span>; })()}
                      </td>
                      <td className="table-cell">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BG[c.requestedStatus]}`}>{STATUS_LABEL[c.requestedStatus]}</span>
                      </td>
                      <td className="table-cell max-w-[160px]"><span className="text-xs text-gray-600 line-clamp-2">{c.reason}</span></td>
                      <td className="table-cell">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CORR_STATUS_COLOR[c.status]}`}>{c.status}</span>
                        {c.status === 'REJECTED' && c.rejectionReason && (
                          <p className="text-xs text-red-500 mt-0.5 truncate max-w-[100px]" title={c.rejectionReason}>{c.rejectionReason}</p>
                        )}
                      </td>
                      <td className="table-cell text-xs text-gray-500">
                        {c.reviewedBy ? <><div>{c.reviewedBy.staffName}</div><div className="text-gray-400">{format(new Date(c.reviewedAt!), 'dd-MMM-yy')}</div></> : '—'}
                      </td>
                      <td className="table-cell">
                        {c.status === 'PENDING' && canApproveCorr(c) && (
                          <div className="flex gap-2">
                            <button className="text-green-600 hover:text-green-800 text-xs font-medium" onClick={() => handleApproveCorr(c.id)}>Approve</button>
                            <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={() => { setRejectCorrId(c.id); setRejectReason(''); }}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {corrections.length === 0 && (
                    <tr><td colSpan={canManage || isPartner ? 8 : 7} className="table-cell text-center text-gray-400 py-10">No correction requests yet</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Correction Request Modal ── */}
      {corrModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">✏️ Request Attendance Correction</h3>
            <p className="text-xs text-gray-500 mb-4">{format(parseISO(corrModal.dateStr), 'EEEE, dd MMMM yyyy')}</p>
            <form onSubmit={handleCorrSubmit} className="space-y-4">
              <div>
                <label className="label text-xs">Correct Status To</label>
                <select className="input-field" value={corrStatus} onChange={e => setCorrStatus(e.target.value as AttendanceStatus)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Reason for Correction *</label>
                <textarea className="input-field" rows={3} value={corrReason} onChange={e => setCorrReason(e.target.value)}
                  placeholder="Explain why the correction is needed..." required />
              </div>
              {corrError && <p className="text-red-600 text-sm">{corrError}</p>}
              <div className="flex gap-3 justify-end">
                <button type="button" className="btn-secondary" onClick={() => setCorrModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={corrSubmitting}>{corrSubmitting ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reject Correction Modal ── */}
      {rejectCorrId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Reject Correction Request</h3>
            <label className="label">Rejection Reason (optional)</label>
            <textarea className="input-field" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setRejectCorrId(null)}>Cancel</button>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 font-medium" onClick={handleRejectCorr}>Confirm Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
