import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import {
  getMonthlyRevenue, getTasks, getTickets, getReimbursements,
  getLeaves, getAttendance, markAttendance, approveLeave, rejectLeave,
  approveReimbursement, rejectReimbursement, approveTicketCost, rejectTicketCost,
  getWeeklyTimesheet, getUpcomingEvents, getAllSubTasks, triggerDueAlerts,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';
import { format, startOfWeek, isToday } from 'date-fns';

interface KPIs {
  openTasks: number; closedTasks: number; overdueTasks: number;
  totalWIP: number; billingRealization: number; thisMonthHours: number;
}
interface Utilization { staffName: string; totalHours: number; utilization: number; }
interface WIPBucket { ageBucket: string; totalWIP: number; }
interface MonthlyRevenue { month: string; billed: number; collected: number; wip: number; }

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
function getTodayStr() { return format(new Date(), 'yyyy-MM-dd'); }
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Shared Components ──────────────────────────────────────────────────────────
const KPICard: React.FC<{
  label: string; value: string | number; sub?: string;
  color?: string; alert?: boolean; onClick?: () => void;
}> = ({ label, value, sub, color = 'text-gray-900', alert, onClick }) => (
  <div
    className={`card flex flex-col gap-1 ${alert ? 'border-red-300 bg-red-50' : ''} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    onClick={onClick}
  >
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-3xl font-bold ${alert ? 'text-red-600' : color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400">{sub}</p>}
    {onClick && <p className="text-xs text-blue-500 mt-1">Click to view →</p>}
  </div>
);

interface ActionChipProps {
  label: string; count: number; color: 'red' | 'orange' | 'yellow' | 'blue' | 'green';
  onClick: () => void;
}
const ActionChip: React.FC<ActionChipProps> = ({ label, count, color, onClick }) => {
  const palette: Record<string, string> = {
    red: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    green: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
  };
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${palette[color]}`}
    >
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${
        color === 'red' ? 'bg-red-500' : color === 'orange' ? 'bg-orange-500' :
        color === 'yellow' ? 'bg-yellow-500' : color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
      }`}>{count > 99 ? '99+' : count}</span>
      {label}
    </button>
  );
};

const QuickAction: React.FC<{ icon: string; label: string; onClick: () => void; variant?: 'primary' | 'secondary' }> = ({
  icon, label, onClick, variant = 'secondary',
}) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      variant === 'primary'
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
    }`}
  >
    <span>{icon}</span>{label}
  </button>
);

const EmptyState: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-400">
    <span className="text-3xl">{icon}</span>
    <p className="text-sm">{text}</p>
  </div>
);

// ── Birthday / Anniversary Widget ─────────────────────────────────────────────
const BirthdayWidget: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => { getUpcomingEvents().then((r) => setEvents(r.data || [])).catch(() => {}); }, []);
  if (events.length === 0) return null;
  return (
    <div className="card">
      <h3 className="text-base font-semibold text-gray-800 mb-3">🎉 Upcoming Celebrations</h3>
      <div className="space-y-2">
        {events.map((e, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{e.type === 'BIRTHDAY' ? '🎂' : '🏆'}</span>
              <div>
                <p className="text-sm font-medium text-gray-800">{e.staffName}</p>
                <p className="text-xs text-gray-400">
                  {e.type === 'BIRTHDAY' ? 'Birthday' : `${e.years}-year Work Anniversary`}
                  {' · '}{e.date}
                </p>
              </div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              e.daysUntil === 0 ? 'bg-yellow-100 text-yellow-700' :
              e.daysUntil <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {e.daysUntil === 0 ? 'Today! 🎊' : e.daysUntil === 1 ? 'Tomorrow' : `${e.daysUntil}d`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── STAFF PERSONAL DASHBOARD ───────────────────────────────────────────────────
const StaffDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [myReimbursements, setMyReimbursements] = useState<any[]>([]);
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [timesheet, setTimesheet] = useState<any[]>([]);
  const [mySubTasks, setMySubTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState('');

  const currentMonth = format(new Date(), 'yyyy-MM');
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const fetchAll = useCallback(() => {
    Promise.all([
      getTasks().catch(() => ({ data: [] })),
      getTickets().catch(() => ({ data: [] })),
      getReimbursements().catch(() => ({ data: [] })),
      getLeaves().catch(() => ({ data: [] })),
      getAttendance({ month: currentMonth }).catch(() => ({ data: [] })),
      getWeeklyTimesheet(undefined, weekStart).catch(() => ({ data: [] })),
      getAllSubTasks().catch(() => ({ data: [] })),
    ]).then(([tasks, tickets, reimbs, leaves, att, ts, sts]) => {
      setMyTasks(tasks.data || []);
      setMyTickets(tickets.data || []);
      setMyReimbursements(reimbs.data || []);
      setMyLeaves(leaves.data || []);
      setAttendance(att.data || []);
      setTimesheet(Array.isArray(ts.data) ? ts.data : (ts.data?.entries || []));
      // Only show sub-tasks assigned to current user
      const allSts = sts.data || [];
      setMySubTasks(allSts.filter((st: any) => st.assignedTo?.id === user?.staffId));
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line

  // Trigger due-date alerts once on mount (fire-and-forget)
  useEffect(() => { triggerDueAlerts().catch(() => {}); }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleMarkAttendance = async (status: string) => {
    setMarkingAttendance(true);
    try {
      await markAttendance({ date: getTodayStr(), status });
      setAttendanceMsg(`Marked as ${status.replace('_', ' ')}`);
      fetchAll();
    } catch (e: any) {
      setAttendanceMsg(e?.response?.data?.message || 'Already marked today');
    } finally {
      setMarkingAttendance(false);
      setTimeout(() => setAttendanceMsg(''), 3000);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;

  const openTasks = myTasks.filter((t) => t.status === 'OPEN');
  const overdueTasks = myTasks.filter((t) => t.isOverdue);
  const returnedReimbs = myReimbursements.filter((r) => r.status === 'RETURNED');
  const pendingLeaves = myLeaves.filter((l) => l.status === 'PENDING');
  const openTickets = myTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
  const approvedLeaves = myLeaves.filter((l) => l.status === 'APPROVED');

  const presentDays = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'WFH').length;
  const absentDays = attendance.filter((a) => a.status === 'ABSENT').length;
  const leaveDays = attendance.filter((a) => a.status === 'ON_LEAVE').length;

  // Timesheet completion this week
  const thisWeekHours = timesheet.reduce((s: number, ts: any) => s + Number(ts.hoursSpent || 0), 0);
  const workDaysThisWeek = 5; // Mon-Fri
  const targetHours = workDaysThisWeek * 8;
  const tsPercent = Math.min(100, Math.round((thisWeekHours / targetHours) * 100));

  // Today's attendance
  const todayAtt = attendance.find((a) => a.date?.slice(0, 10) === getTodayStr());

  // Upcoming deadlines (next 7 days)
  const next7Days = new Date(); next7Days.setDate(next7Days.getDate() + 7);
  const upcoming = openTasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= new Date() && d <= next7Days;
  }).sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const hasActions = overdueTasks.length > 0 || returnedReimbs.length > 0 || !todayAtt;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{getGreeting()}, {user?.staffName?.split(' ')[0]} 👋</h2>
          <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
      </div>

      {/* Smart Nudge / Action Strip */}
      {hasActions && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">⚡ Your Action Items</p>
          <div className="flex flex-wrap gap-2">
            <ActionChip label="Overdue Tasks" count={overdueTasks.length} color="red" onClick={() => navigate('/tasks')} />
            <ActionChip label="Returned Claims" count={returnedReimbs.length} color="orange" onClick={() => navigate('/reimbursements')} />
            <ActionChip label="Pending Leaves" count={pendingLeaves.length} color="yellow" onClick={() => navigate('/leaves')} />
            {!todayAtt && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-300 bg-purple-100 text-purple-800 text-xs font-semibold">
                ⚠ Attendance not marked today
              </span>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap gap-2">
        <QuickAction icon="🏖" label="Apply Leave" onClick={() => navigate('/leaves')} />
        <QuickAction icon="🎫" label="Raise Ticket" onClick={() => navigate('/tickets')} />
        <QuickAction icon="💰" label="New Reimbursement" onClick={() => navigate('/reimbursements')} />
        <QuickAction icon="⏱" label="Log Time" onClick={() => navigate('/timesheets')} />
        <QuickAction icon="✅" label="View Tasks" onClick={() => navigate('/tasks')} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Open Tasks" value={openTasks.length} color="text-green-600" sub="Assigned to me" onClick={() => navigate('/tasks')} />
        <KPICard label="Overdue Tasks" value={overdueTasks.length} alert={overdueTasks.length > 0} sub="Need attention" onClick={() => navigate('/tasks')} />
        <KPICard label="Open Tickets" value={openTickets.length} color="text-blue-600" sub="IT tickets" onClick={() => navigate('/tickets')} />
        <KPICard label="Pending Reimb." value={myReimbursements.filter(r => r.status === 'PENDING' || r.status === 'REVIEWED').length} color="text-orange-600" sub="Awaiting approval" onClick={() => navigate('/reimbursements')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Attendance today + quick mark */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">Today's Attendance</h3>
            <span className="text-xs text-gray-400">{format(new Date(), 'd MMM yyyy')}</span>
          </div>
          {todayAtt ? (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              todayAtt.status === 'PRESENT' ? 'bg-green-50 text-green-700' :
              todayAtt.status === 'WFH' ? 'bg-blue-50 text-blue-700' :
              todayAtt.status === 'ABSENT' ? 'bg-red-50 text-red-700' :
              todayAtt.status === 'HALF_DAY' ? 'bg-yellow-50 text-yellow-700' :
              'bg-gray-50 text-gray-700'
            }`}>
              <span className="text-lg">
                {todayAtt.status === 'PRESENT' ? '✅' : todayAtt.status === 'WFH' ? '🏠' :
                 todayAtt.status === 'ABSENT' ? '❌' : todayAtt.status === 'HALF_DAY' ? '🌓' : '📅'}
              </span>
              <span className="font-semibold">{todayAtt.status.replace('_', ' ')}</span>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-3">Not marked yet — quick mark:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { status: 'PRESENT', label: '✅ Present', cls: 'bg-green-600' },
                  { status: 'WFH', label: '🏠 WFH', cls: 'bg-blue-600' },
                  { status: 'HALF_DAY', label: '🌓 Half Day', cls: 'bg-yellow-500' },
                ].map(({ status, label, cls }) => (
                  <button
                    key={status}
                    disabled={markingAttendance}
                    onClick={() => handleMarkAttendance(status)}
                    className={`px-3 py-1.5 rounded-lg text-white text-sm font-medium ${cls} hover:opacity-90 disabled:opacity-50`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {attendanceMsg && <p className="text-xs text-green-600 mt-2">{attendanceMsg}</p>}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{format(new Date(), 'MMMM')} Summary</p>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-semibold">{presentDays}d present</span>
              {absentDays > 0 && <span className="text-red-500 font-semibold">{absentDays}d absent</span>}
              {leaveDays > 0 && <span className="text-blue-600 font-semibold">{leaveDays}d leave</span>}
            </div>
          </div>
        </div>

        {/* Timesheet Completion */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">Timesheet This Week</h3>
            <button
              onClick={() => navigate('/timesheets')}
              className="text-xs text-blue-600 hover:underline"
            >
              Log Time →
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Hours logged</span>
              <span className={`font-bold ${tsPercent >= 80 ? 'text-green-600' : tsPercent >= 50 ? 'text-orange-500' : 'text-red-600'}`}>
                {thisWeekHours.toFixed(1)}h / {targetHours}h
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${tsPercent >= 80 ? 'bg-green-500' : tsPercent >= 50 ? 'bg-orange-400' : 'bg-red-400'}`}
                style={{ width: `${tsPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">
              {tsPercent >= 100 ? '🎉 Target met for this week!' :
               tsPercent >= 80 ? `Almost there — ${(targetHours - thisWeekHours).toFixed(1)}h to go` :
               `${(targetHours - thisWeekHours).toFixed(1)}h remaining to meet this week's target`}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Leave Balance</p>
            <div className="flex gap-4 text-sm">
              <span className="text-orange-600 font-medium">{pendingLeaves.length} pending request{pendingLeaves.length !== 1 ? 's' : ''}</span>
              <span className="text-green-600 font-medium">{approvedLeaves.length} approved</span>
            </div>
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">Due in Next 7 Days</h3>
            <span className="text-xs text-gray-400">{upcoming.length} task{upcoming.length !== 1 ? 's' : ''}</span>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState icon="🎯" text="No upcoming deadlines — you're clear!" />
          ) : (
            <div className="space-y-1.5">
              {upcoming.slice(0, 5).map((t: any) => {
                const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000);
                return (
                  <button
                    key={t.id}
                    onClick={() => navigate('/tasks')}
                    className="w-full flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-blue-600 text-xs shrink-0">{t.taskId}</span>
                      <span className="truncate text-gray-700">{t.taskName}</span>
                    </div>
                    <span className={`shrink-0 ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      daysLeft <= 1 ? 'bg-red-100 text-red-700' :
                      daysLeft <= 3 ? 'bg-orange-100 text-orange-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d`}
                    </span>
                  </button>
                );
              })}
              {upcoming.length > 5 && (
                <button onClick={() => navigate('/tasks')} className="text-xs text-blue-500 hover:underline pl-2">
                  +{upcoming.length - 5} more →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Celebrations */}
        <BirthdayWidget />

        {/* My Sub-Tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">🔖 My Sub-Tasks</h3>
            <button onClick={() => navigate('/tasks')} className="text-xs text-blue-600 hover:underline">View All →</button>
          </div>
          {mySubTasks.filter((st: any) => st.status !== 'CLOSED').length === 0 ? (
            <EmptyState icon="✅" text="No open sub-tasks assigned to you" />
          ) : (
            <div className="space-y-1.5">
              {mySubTasks.filter((st: any) => st.status !== 'CLOSED').slice(0, 6).map((st: any) => {
                const isOverdue = st.dueDate && new Date(st.dueDate) < new Date();
                return (
                  <div key={st.id} className={`flex items-center justify-between text-sm py-1.5 px-2 rounded-lg ${isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${st.status === 'OPEN' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-800">{st.name}</p>
                        <p className="text-xs text-gray-400 truncate">{st.subTaskNumber} · {st.task?.taskName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {st.dueDate && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {isOverdue ? 'Overdue' : st.dueDate.slice(0, 10)}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        st.status === 'SENT_FOR_REVIEW' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>{st.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                );
              })}
              {mySubTasks.filter((st: any) => st.status !== 'CLOSED').length > 6 && (
                <button onClick={() => navigate('/tasks')} className="text-xs text-blue-500 hover:underline pl-2">
                  +{mySubTasks.filter((st: any) => st.status !== 'CLOSED').length - 6} more →
                </button>
              )}
            </div>
          )}
        </div>

        {/* IT Tickets */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">My IT Tickets</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs text-blue-600 hover:underline">View All →</button>
          </div>
          {myTickets.length === 0 ? (
            <EmptyState icon="🎫" text="No tickets raised yet" />
          ) : (
            <div className="space-y-1.5">
              {myTickets.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      t.status === 'OPEN' ? 'bg-orange-400' :
                      t.status === 'IN_PROGRESS' ? 'bg-blue-400' :
                      t.status === 'RESOLVED' ? 'bg-green-400' : 'bg-gray-300'
                    }`} />
                    <span className="truncate">{t.title}</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                    t.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                    t.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{t.priority}</span>
                </div>
              ))}
              {myTickets.length > 5 && <p className="text-xs text-gray-400 mt-1">+{myTickets.length - 5} more</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── IT STAFF DASHBOARD ─────────────────────────────────────────────────────────
const ITDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState('');

  const currentMonth = format(new Date(), 'yyyy-MM');

  const fetchAll = useCallback(() => {
    Promise.all([
      getTickets().catch(() => ({ data: [] })),
      getAttendance({ month: currentMonth }).catch(() => ({ data: [] })),
    ]).then(([tix, att]) => {
      setTickets(tix.data || []);
      setAttendance(att.data || []);
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleMarkAttendance = async (status: string) => {
    setMarkingAttendance(true);
    try {
      await markAttendance({ date: getTodayStr(), status });
      setAttendanceMsg(`Marked as ${status}`);
      fetchAll();
    } catch (e: any) {
      setAttendanceMsg(e?.response?.data?.message || 'Already marked today');
    } finally {
      setMarkingAttendance(false);
      setTimeout(() => setAttendanceMsg(''), 3000);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;

  const assignedTickets = tickets.filter((t) => t.assignedTo?.id === user?.staffId || !t.assignedToId);
  const openTickets = assignedTickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL'].includes(t.status));
  const urgentTickets = openTickets.filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH');
  const pendingApproval = assignedTickets.filter((t) => t.status === 'PENDING_APPROVAL');

  const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedOpen = [...openTickets].sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4));

  const todayAtt = attendance.find((a) => a.date?.slice(0, 10) === getTodayStr());

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{getGreeting()}, {user?.staffName?.split(' ')[0]} 👋</h2>
          <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, d MMMM yyyy')} · IT Support</p>
        </div>
      </div>

      {/* Action Strip */}
      {(urgentTickets.length > 0 || !todayAtt) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">⚡ Needs Attention</p>
          <div className="flex flex-wrap gap-2">
            <ActionChip label="Urgent/High Tickets" count={urgentTickets.length} color="red" onClick={() => navigate('/tickets')} />
            <ActionChip label="Pending Cost Approval" count={pendingApproval.length} color="orange" onClick={() => navigate('/tickets')} />
            {!todayAtt && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-300 bg-purple-100 text-purple-800 text-xs font-semibold">
                ⚠ Attendance not marked
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Open Tickets" value={openTickets.length} color="text-orange-600" onClick={() => navigate('/tickets')} />
        <KPICard label="Urgent / High" value={urgentTickets.length} alert={urgentTickets.length > 0} sub="Priority queue" onClick={() => navigate('/tickets')} />
        <KPICard label="Pending Approval" value={pendingApproval.length} color="text-blue-600" sub="Cost approvals" onClick={() => navigate('/tickets')} />
        <KPICard label="Resolved (All)" value={tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length} color="text-green-600" sub="Total resolved" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ticket Queue */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">Assigned Ticket Queue</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs text-blue-600 hover:underline">View All →</button>
          </div>
          {sortedOpen.length === 0 ? (
            <EmptyState icon="✅" text="All caught up! No open tickets assigned to you." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Ticket #</th>
                    <th className="table-header">Title</th>
                    <th className="table-header">Priority</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOpen.slice(0, 10).map((t: any) => (
                    <tr key={t.id} className={`hover:bg-gray-50 ${t.priority === 'URGENT' ? 'bg-red-50' : t.priority === 'HIGH' ? 'bg-orange-50' : ''}`}>
                      <td className="table-cell font-mono text-xs text-blue-700">{t.ticketNumber}</td>
                      <td className="table-cell font-medium">{t.title}</td>
                      <td className="table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                          t.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                          t.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{t.priority}</span>
                      </td>
                      <td className="table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.status === 'OPEN' ? 'bg-blue-100 text-blue-700' :
                          t.status === 'IN_PROGRESS' ? 'bg-purple-100 text-purple-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{t.status.replace('_', ' ')}</span>
                      </td>
                      <td className="table-cell text-gray-500 text-xs">{t.type}</td>
                      <td className="table-cell text-gray-400 text-xs">{t.createdAt?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Today's Attendance */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Today's Attendance</h3>
          {todayAtt ? (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              todayAtt.status === 'PRESENT' ? 'bg-green-50 text-green-700' :
              todayAtt.status === 'WFH' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-700'
            }`}>
              <span className="text-lg">{todayAtt.status === 'PRESENT' ? '✅' : todayAtt.status === 'WFH' ? '🏠' : '📅'}</span>
              <span className="font-semibold">{todayAtt.status.replace('_', ' ')}</span>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-3">Mark attendance:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { status: 'PRESENT', label: '✅ Present', cls: 'bg-green-600' },
                  { status: 'WFH', label: '🏠 WFH', cls: 'bg-blue-600' },
                ].map(({ status, label, cls }) => (
                  <button key={status} disabled={markingAttendance} onClick={() => handleMarkAttendance(status)}
                    className={`px-3 py-1.5 rounded-lg text-white text-sm font-medium ${cls} hover:opacity-90 disabled:opacity-50`}>
                    {label}
                  </button>
                ))}
              </div>
              {attendanceMsg && <p className="text-xs text-green-600 mt-2">{attendanceMsg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── MANAGEMENT / PARTNER DASHBOARD ─────────────────────────────────────────────
const ManagementDashboard: React.FC = () => {
  const { isAdmin, isHR, isPartner, user } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [utilization, setUtilization] = useState<Utilization[]>([]);
  const [wipAging, setWipAging] = useState<WIPBucket[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [allLeaves, setAllLeaves] = useState<any[]>([]);
  const [allReimbs, setAllReimbs] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inlineAction, setInlineAction] = useState<{ type: string; id: number; action: string } | null>(null);
  const [rejectModal, setRejectModal] = useState<{ type: string; id: number } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchAll = useCallback(() => {
    const calls: Promise<any>[] = [
      getTasks().catch(() => ({ data: [] })),
      getMonthlyRevenue().catch(() => ({ data: [] })),
      getLeaves({ status: 'PENDING' }).catch(() => ({ data: [] })),
      getReimbursements().catch(() => ({ data: [] })),
      getTickets().catch(() => ({ data: [] })),
    ];
    if (isAdmin || isHR) {
      calls.push(api.get('/reports/kpis').catch(() => ({ data: null })));
      calls.push(api.get('/reports/utilization').catch(() => ({ data: [] })));
      calls.push(api.get('/reports/wip-aging').catch(() => ({ data: [] })));
    }

    Promise.all(calls).then(([tasks, mr, leaves, reimbs, tickets, k, u, w]) => {
      setMyTasks(tasks.data || []);
      setMonthlyRevenue(mr.data || []);
      setAllLeaves(leaves.data || []);
      setAllReimbs(reimbs.data || []);
      setAllTickets(tickets.data || []);
      if (k?.data) setKpis(k.data);
      if (u?.data) setUtilization(u.data.slice(0, 8));
      if (w?.data) {
        const buckets: Record<string, number> = {};
        w.data.forEach((t: any) => { buckets[t.ageBucket] = (buckets[t.ageBucket] || 0) + t.totalWIP; });
        setWipAging(Object.entries(buckets).map(([ageBucket, totalWIP]) => ({ ageBucket, totalWIP })));
      }
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleApprove = async (type: string, id: number) => {
    setInlineAction({ type, id, action: 'approve' });
    try {
      if (type === 'leave') await approveLeave(id);
      else if (type === 'reimbursement') await approveReimbursement(id);
      else if (type === 'ticketCost') await approveTicketCost(id);
      fetchAll();
    } catch {}
    setInlineAction(null);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setInlineAction({ type: rejectModal.type, id: rejectModal.id, action: 'reject' });
    try {
      if (rejectModal.type === 'leave') await rejectLeave(rejectModal.id, { rejectionReason: rejectReason });
      else if (rejectModal.type === 'reimbursement') await rejectReimbursement(rejectModal.id, { rejectionReason: rejectReason });
      else if (rejectModal.type === 'ticketCost') await rejectTicketCost(rejectModal.id, { rejectionReason: rejectReason });
      fetchAll();
    } catch {}
    setInlineAction(null);
    setRejectModal(null);
    setRejectReason('');
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading dashboard...</div>;

  // Partner-computed KPIs from filtered tasks
  const partnerOpen = myTasks.filter((t) => t.status === 'OPEN').length;
  const partnerClosed = myTasks.filter((t) => t.status === 'CLOSED').length;
  const partnerOverdue = myTasks.filter((t) => t.isOverdue);
  const partnerBilledCount = myTasks.filter((t) => t.billingStatus === 'BILLED').length;
  const partnerBillingRealization = myTasks.length > 0 ? Math.round((partnerBilledCount / myTasks.length) * 100) : 0;

  const displayOpen = (isAdmin || isHR) ? (kpis?.openTasks ?? 0) : partnerOpen;
  const displayClosed = (isAdmin || isHR) ? (kpis?.closedTasks ?? 0) : partnerClosed;
  const displayOverdue = (isAdmin || isHR) ? (kpis?.overdueTasks ?? 0) : partnerOverdue.length;
  const displayBR = (isAdmin || isHR) ? (kpis?.billingRealization ?? 0) : partnerBillingRealization;

  // Approvals inbox
  const pendingLeaves = allLeaves.filter((l) => l.status === 'PENDING');
  const pendingReimbs = allReimbs.filter((r) => r.status === 'PENDING' || r.status === 'REVIEWED');
  const pendingTicketCosts = allTickets.filter((t) => t.status === 'PENDING_APPROVAL' && t.estimatedCost);

  // Ready to bill: OPEN tasks, UNBILLED, with billedAmount === null
  const readyToBill = myTasks.filter((t) =>
    t.status === 'OPEN' && t.billingStatus === 'UNBILLED' &&
    (isAdmin || isHR || t.partner?.id === user?.staffId || t.partner?.reportingPartnerId === user?.staffId)
  );

  // WIP > 60 days
  const now = Date.now();
  const wipOver60 = myTasks.filter((t) => {
    if (t.billingStatus !== 'UNBILLED') return false;
    const created = new Date(t.createdAt).getTime();
    return (now - created) / 86400000 > 60;
  });

  // Overdue (partner view)
  const overdueList = partnerOverdue.slice(0, 10);

  // Category breakdown
  const catMap: Record<string, number> = {};
  myTasks.forEach((t) => { const k = t.category?.name || 'Uncategorized'; catMap[k] = (catMap[k] || 0) + 1; });
  const catData = Object.entries(catMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const totalActionItems = pendingLeaves.length + pendingReimbs.length + pendingTicketCosts.length +
    (displayOverdue > 0 ? 1 : 0) + wipOver60.length;

  const roleLabel = isAdmin ? 'Admin' : isHR ? 'HR' : 'Partner';

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{getGreeting()}, {user?.staffName?.split(' ')[0]} 👋</h2>
          <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, d MMMM yyyy')} · {roleLabel} View</p>
        </div>
      </div>

      {/* Needs Your Attention Strip */}
      {totalActionItems > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">⚡ Needs Your Attention</p>
          <div className="flex flex-wrap gap-2">
            <ActionChip label="Overdue Tasks" count={displayOverdue} color="red" onClick={() => navigate('/tasks')} />
            <ActionChip label="Pending Leave Approvals" count={pendingLeaves.length} color="orange" onClick={() => navigate('/leaves')} />
            <ActionChip label="Pending Reimbursements" count={pendingReimbs.length} color="yellow" onClick={() => navigate('/reimbursements')} />
            <ActionChip label="Pending Ticket Cost Approvals" count={pendingTicketCosts.length} color="blue" onClick={() => navigate('/tickets')} />
            <ActionChip label="WIP > 60 Days (Unbilled)" count={wipOver60.length} color="orange" onClick={() => navigate('/reports')} />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Open Tasks" value={displayOpen} color="text-green-600" onClick={() => navigate('/tasks')} />
        <KPICard label="Closed Tasks" value={displayClosed} color="text-gray-600" onClick={() => navigate('/tasks')} />
        <KPICard label="Overdue Tasks" value={displayOverdue} alert={displayOverdue > 0} sub="Need immediate attention" onClick={() => navigate('/tasks')} />
        <KPICard label="Total WIP" value={(isAdmin || isHR) ? fmt(kpis?.totalWIP ?? 0) : `${myTasks.length} tasks`} sub={(isAdmin || isHR) ? 'Unbilled cost' : 'Under management'} color="text-blue-700" />
        <KPICard label="Billing Realization" value={`${displayBR}%`} sub="Tasks billed" color={displayBR >= 70 ? 'text-green-600' : 'text-orange-500'} onClick={() => navigate('/reports')} />
        <KPICard label={(isAdmin || isHR) ? 'Hours This Month' : 'Total Tasks'} value={(isAdmin || isHR) ? (kpis?.thisMonthHours ?? 0) : myTasks.length} sub={(isAdmin || isHR) ? 'Across all staff' : 'In your portfolio'} color="text-purple-600" />
      </div>

      {/* Unified Approvals Inbox (Admin / HR) */}
      {(isAdmin || isHR) && (pendingLeaves.length > 0 || pendingReimbs.length > 0 || pendingTicketCosts.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">📥 Approvals Inbox</h3>
            <span className="text-xs text-gray-400">{pendingLeaves.length + pendingReimbs.length + pendingTicketCosts.length} pending</span>
          </div>
          <div className="space-y-1">
            {/* Pending Leaves */}
            {pendingLeaves.slice(0, 5).map((l: any) => (
              <div key={`leave-${l.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium shrink-0">Leave</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{l.staff?.staffName}</p>
                    <p className="text-xs text-gray-400">{l.leaveType?.name} · {l.days}d · {l.fromDate?.slice(0, 10)}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  <button
                    disabled={!!inlineAction}
                    onClick={() => handleApprove('leave', l.id)}
                    className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                  >✓ Approve</button>
                  <button
                    disabled={!!inlineAction}
                    onClick={() => { setRejectModal({ type: 'leave', id: l.id }); setRejectReason(''); }}
                    className="text-xs px-2.5 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                  >✕ Reject</button>
                </div>
              </div>
            ))}
            {pendingLeaves.length > 5 && (
              <button onClick={() => navigate('/leaves')} className="text-xs text-blue-500 hover:underline pl-3">
                +{pendingLeaves.length - 5} more leaves →
              </button>
            )}

            {/* Pending Reimbursements */}
            {pendingReimbs.slice(0, 5).map((r: any) => (
              <div key={`reimb-${r.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium shrink-0">Reimb.</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.staff?.staffName} — {r.claimNumber}</p>
                    <p className="text-xs text-gray-400">
                      {fmt(r.items?.reduce((s: number, i: any) => s + Number(i.amount), 0) || 0)} ·
                      Status: {r.status}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  <button
                    disabled={!!inlineAction}
                    onClick={() => handleApprove('reimbursement', r.id)}
                    className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                  >✓ Approve</button>
                  <button
                    disabled={!!inlineAction}
                    onClick={() => { setRejectModal({ type: 'reimbursement', id: r.id }); setRejectReason(''); }}
                    className="text-xs px-2.5 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                  >✕ Reject</button>
                </div>
              </div>
            ))}
            {pendingReimbs.length > 5 && (
              <button onClick={() => navigate('/reimbursements')} className="text-xs text-blue-500 hover:underline pl-3">
                +{pendingReimbs.length - 5} more reimbursements →
              </button>
            )}

            {/* Pending Ticket Cost Approvals */}
            {pendingTicketCosts.slice(0, 3).map((t: any) => (
              <div key={`ticket-${t.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium shrink-0">Ticket Cost</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.ticketNumber} · Est. {fmt(Number(t.estimatedCost))}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-3">
                  <button
                    disabled={!!inlineAction}
                    onClick={() => handleApprove('ticketCost', t.id)}
                    className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                  >✓ Approve</button>
                  <button
                    disabled={!!inlineAction}
                    onClick={() => { setRejectModal({ type: 'ticketCost', id: t.id }); setRejectReason(''); }}
                    className="text-xs px-2.5 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                  >✕ Reject</button>
                </div>
              </div>
            ))}
            {pendingTicketCosts.length > 3 && (
              <button onClick={() => navigate('/tickets')} className="text-xs text-blue-500 hover:underline pl-3">
                +{pendingTicketCosts.length - 3} more ticket approvals →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Partner: Approvals Inbox (partner-only, no admin actions — just navigate) */}
      {isPartner && !isAdmin && !isHR && (pendingLeaves.length > 0 || pendingReimbs.length > 0 || pendingTicketCosts.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-800">📥 Pending Approvals</h3>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {pendingLeaves.length > 0 && (
              <button onClick={() => navigate('/leaves')} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium">
                🏖 {pendingLeaves.length} leave{pendingLeaves.length !== 1 ? 's' : ''} pending
              </button>
            )}
            {pendingReimbs.length > 0 && (
              <button onClick={() => navigate('/reimbursements')} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 font-medium">
                💰 {pendingReimbs.length} reimbursement{pendingReimbs.length !== 1 ? 's' : ''} pending
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Task Status Pie */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Task Status Overview</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Open', value: displayOpen },
                  { name: 'Closed', value: displayClosed },
                  { name: 'Overdue', value: displayOverdue },
                ]}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={85}
                paddingAngle={3} dataKey="value"
              >
                {['#10b981', '#6b7280', '#ef4444'].map((color, i) => <Cell key={i} fill={color} />)}
              </Pie>
              <Legend />
              <Tooltip formatter={(v: any) => [v, 'Tasks']} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Staff Utilization (admin/HR) OR Tasks by Category (partner) */}
        {(isAdmin || isHR) ? (
          <div className="card">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Staff Utilization (%)</h3>
            {utilization.length === 0 ? (
              <EmptyState icon="📊" text="No timesheet data this month" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={utilization} barSize={24}>
                  <XAxis dataKey="staffName" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Utilization']} />
                  <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
                    {utilization.map((entry, i) => (
                      <Cell key={i} fill={entry.utilization >= 80 ? '#10b981' : entry.utilization >= 50 ? '#3b82f6' : '#f59e0b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ) : (
          <div className="card">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Tasks by Category</h3>
            {catData.length === 0 ? (
              <EmptyState icon="📂" text="No tasks yet" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catData} barSize={24}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: any) => [v, 'Tasks']} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* WIP Aging (admin/HR only) */}
        {(isAdmin || isHR) && (
          <div className="card">
            <h3 className="text-base font-semibold text-gray-800 mb-4">WIP Aging (Unbilled)</h3>
            {wipAging.length === 0 ? (
              <EmptyState icon="🎉" text="No unbilled tasks" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={wipAging} barSize={32}>
                  <XAxis dataKey="ageBucket" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [fmt(v), 'WIP Value']} />
                  <Bar dataKey="totalWIP" radius={[4, 4, 0, 0]}>
                    {wipAging.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Monthly Revenue Trend */}
        <div className={`card ${(isAdmin || isHR) ? '' : 'lg:col-span-2'}`}>
          <h3 className="text-base font-semibold text-gray-800 mb-4">Monthly Revenue Trend (Last 12 Months)</h3>
          {monthlyRevenue.length === 0 ? (
            <EmptyState icon="📈" text="No billing data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyRevenue} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [fmt(v), '']} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="billed" name="Billed" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="wip" name="WIP" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Ready to Bill (partner / admin) */}
        {readyToBill.length > 0 && (
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-green-700">💵 Ready to Bill ({readyToBill.length})</h3>
              <button onClick={() => navigate('/tasks')} className="text-xs text-blue-600 hover:underline">Open Tasks →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Task ID</th>
                    <th className="table-header">Task Name</th>
                    <th className="table-header">Client</th>
                    <th className="table-header">Manager</th>
                    <th className="table-header">Category</th>
                    <th className="table-header">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {readyToBill.slice(0, 8).map((t: any) => (
                    <tr key={t.id} className="hover:bg-green-50 cursor-pointer" onClick={() => navigate('/tasks')}>
                      <td className="table-cell font-mono text-blue-700 text-xs">{t.taskId}</td>
                      <td className="table-cell font-medium">{t.taskName}</td>
                      <td className="table-cell text-gray-500">{t.client?.clientName || '—'}</td>
                      <td className="table-cell">{t.manager?.staffName || '—'}</td>
                      <td className="table-cell text-gray-500">{t.category?.name || '—'}</td>
                      <td className="table-cell text-gray-400 text-xs">{t.createdAt?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {readyToBill.length > 8 && (
                <button onClick={() => navigate('/tasks')} className="text-xs text-blue-500 hover:underline mt-2 ml-1">
                  +{readyToBill.length - 8} more →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Overdue Tasks table (partner / admin) */}
        {overdueList.length > 0 && (
          <div className="card lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-red-700">⚠ Overdue Tasks ({partnerOverdue.length || displayOverdue})</h3>
              <button onClick={() => navigate('/tasks')} className="text-xs text-blue-600 hover:underline">View All →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Task ID</th>
                    <th className="table-header">Task Name</th>
                    <th className="table-header">Client</th>
                    <th className="table-header">Manager</th>
                    <th className="table-header">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueList.map((t: any) => (
                    <tr key={t.id} className="bg-red-50 hover:bg-red-100 cursor-pointer" onClick={() => navigate('/tasks')}>
                      <td className="table-cell font-mono text-blue-700 text-xs">{t.taskId}</td>
                      <td className="table-cell font-medium">{t.taskName}</td>
                      <td className="table-cell text-gray-500">{t.client?.clientName || '—'}</td>
                      <td className="table-cell">{t.manager?.staffName || '—'}</td>
                      <td className="table-cell text-red-600 font-medium text-xs">
                        {t.dueDate ? t.dueDate.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-3">Reject — Reason</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={3}
              placeholder="Enter rejection reason (optional)"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={handleReject}
                disabled={!!inlineAction}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >Confirm Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const { isAdmin, isHR, isPartner, user } = useAuth();
  // IT role
  if (user?.role === 'IT') return <ITDashboard />;
  if (isAdmin || isHR || isPartner) return <ManagementDashboard />;
  return <StaffDashboard />;
};

export default Dashboard;
