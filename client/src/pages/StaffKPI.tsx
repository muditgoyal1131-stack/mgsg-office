import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format } from 'date-fns';
import { getStaffKPIs, getStaff } from '../api';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';

interface StaffKPI {
  staffId: number;
  staffName: string;
  isPartner: boolean;
  role: string;
  hoursThisMonth: number;
  hoursThisYear: number;
  billableTasksAssigned: number;
  tasksClosedThisYear: number;
  billableRateThisMonth: number;
  leavesTakenThisYear: number;
  leavePending: number;
  reimbursementsPending: number;
}

const MONTH_HOURS = 160;

function utilizationColor(rate: number): string {
  if (rate >= 80) return '#10b981';
  if (rate >= 50) return '#f59e0b';
  return '#ef4444';
}

function hoursBarColor(hours: number): string {
  const pct = (hours / MONTH_HOURS) * 100;
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#3b82f6';
  return '#f97316';
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

const SummaryCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}> = ({ label, value, sub, color = 'text-gray-900' }) => (
  <div className="card flex flex-col gap-1">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-3xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400">{sub}</p>}
  </div>
);

const HoursBar: React.FC<{ hours: number }> = ({ hours }) => {
  const pct = Math.min((hours / MONTH_HOURS) * 100, 100);
  const color = hoursBarColor(hours);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-gray-700 w-10 text-right">{hours.toFixed(1)}</span>
    </div>
  );
};

const UtilBadge: React.FC<{ rate: number }> = ({ rate }) => {
  let cls = 'bg-green-100 text-green-700';
  if (rate < 80 && rate >= 50) cls = 'bg-yellow-100 text-yellow-700';
  if (rate < 50) cls = 'bg-red-100 text-red-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {rate.toFixed(1)}%
    </span>
  );
};

const CountBadge: React.FC<{ count: number; color?: string }> = ({
  count,
  color = 'bg-orange-100 text-orange-700',
}) => {
  if (count <= 0) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {count}
    </span>
  );
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const StaffKPI: React.FC = () => {
  const { user, isAdmin, isHR } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [kpis, setKpis] = useState<StaffKPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // isPartner: user whose role includes "Partner"
  const isPartner = user?.role?.toLowerCase().includes('partner') ?? false;
  const canSeeAll = isAdmin || isHR || isPartner;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getStaffKPIs({ month, year });
      let data: StaffKPI[] = res.data ?? [];
      if (!canSeeAll && user?.staffId) {
        data = data.filter((k) => k.staffId === user.staffId);
      }
      setKpis(data);
    } catch {
      setError('Failed to load KPI data.');
    } finally {
      setLoading(false);
    }
  }, [month, year, canSeeAll, user?.staffId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Summary stats
  const totalStaff = kpis.length;
  const avgUtil =
    totalStaff > 0
      ? kpis.reduce((s, k) => s + k.billableRateThisMonth, 0) / totalStaff
      : 0;
  const totalHoursMonth = kpis.reduce((s, k) => s + k.hoursThisMonth, 0);
  const totalPendingLeaves = kpis.reduce((s, k) => s + k.leavePending, 0);

  // Chart: top 10 by hours this month
  const chartData = [...kpis]
    .sort((a, b) => b.hoursThisMonth - a.hoursThisMonth)
    .slice(0, 10)
    .map((k) => ({
      name: k.staffName.split(' ')[0],
      hours: parseFloat(k.hoursThisMonth.toFixed(1)),
      util: k.billableRateThisMonth,
    }));

  const handleExport = () => {
    const rows = kpis.map((k) => ({
      'Staff Name': k.staffName,
      'Role': k.role,
      'Partner': k.isPartner ? 'Yes' : 'No',
      'Hours (Month)': k.hoursThisMonth,
      'Hours (Year)': k.hoursThisYear,
      'Open Tasks': k.billableTasksAssigned,
      'Tasks Closed (Year)': k.tasksClosedThisYear,
      'Utilization %': k.billableRateThisMonth,
      'Leaves Taken (Year)': k.leavesTakenThisYear,
      'Leave Pending': k.leavePending,
      'Reimbursements Pending': k.reimbursementsPending,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff KPIs');
    XLSX.writeFile(wb, `Staff_KPIs_${MONTHS[month - 1]}_${year}.xlsx`);
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Staff KPIs</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="label">Month</label>
            <select
              className="input-field py-1.5 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="label">Year</label>
            <select
              className="input-field py-1.5 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button className="btn-secondary text-sm" onClick={handleExport} disabled={kpis.length === 0}>
            Export to Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Total Staff" value={totalStaff} />
        <SummaryCard
          label="Avg Utilization"
          value={`${avgUtil.toFixed(1)}%`}
          color={avgUtil >= 80 ? 'text-green-600' : avgUtil >= 50 ? 'text-yellow-600' : 'text-red-600'}
        />
        <SummaryCard
          label="Total Hours (Month)"
          value={totalHoursMonth.toFixed(1)}
          sub={`Across ${totalStaff} staff`}
        />
        <SummaryCard
          label="Total Pending Leaves"
          value={totalPendingLeaves}
          color={totalPendingLeaves > 0 ? 'text-orange-600' : 'text-gray-900'}
        />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Top {chartData.length} Staff by Hours This Month
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: any, name: any) =>
                  name === 'hours' ? [`${value} hrs`, 'Hours'] : [value, String(name)]
                }
              />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={utilizationColor(entry.util)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-2">
            Color: green ≥80% utilization · yellow ≥50% · red &lt;50%
          </p>
        </div>
      )}

      {/* KPI Table */}
      <div className="card overflow-x-auto p-0">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Loading KPI data…
          </div>
        ) : kpis.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No KPI data for {MONTHS[month - 1]} {year}.
          </div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header text-left">Staff Name</th>
                <th className="table-header">Hours (Month)</th>
                <th className="table-header">Hours (Year)</th>
                <th className="table-header">Open Tasks</th>
                <th className="table-header">Tasks Closed (Yr)</th>
                <th className="table-header">Utilization %</th>
                <th className="table-header">Leaves (Yr)</th>
                <th className="table-header">Leave Pending</th>
                <th className="table-header">Reimb. Pending</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.staffId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  {/* Staff Name */}
                  <td className="table-cell">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-900">{k.staffName}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {k.isPartner && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                            Partner
                          </span>
                        )}
                        {k.role && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                            {k.role}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Hours (Month) — bar */}
                  <td className="table-cell w-36">
                    <HoursBar hours={k.hoursThisMonth} />
                  </td>

                  {/* Hours (Year) */}
                  <td className="table-cell text-center text-gray-700">
                    {k.hoursThisYear.toFixed(1)}
                  </td>

                  {/* Open Tasks */}
                  <td className="table-cell text-center">
                    {k.billableTasksAssigned > 0 ? (
                      <span className="text-blue-700 font-medium">{k.billableTasksAssigned}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>

                  {/* Tasks Closed (Year) */}
                  <td className="table-cell text-center text-gray-700">
                    {k.tasksClosedThisYear}
                  </td>

                  {/* Utilization % */}
                  <td className="table-cell text-center">
                    <UtilBadge rate={k.billableRateThisMonth} />
                  </td>

                  {/* Leaves Taken (Year) */}
                  <td className="table-cell text-center text-gray-700">
                    {k.leavesTakenThisYear}
                  </td>

                  {/* Leave Pending */}
                  <td className="table-cell text-center">
                    <CountBadge count={k.leavePending} color="bg-yellow-100 text-yellow-700" />
                  </td>

                  {/* Reimbursements Pending */}
                  <td className="table-cell text-center">
                    <CountBadge count={k.reimbursementsPending} color="bg-orange-100 text-orange-700" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StaffKPI;
