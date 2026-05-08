import React, { useEffect, useState, useCallback } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  addMonths, subMonths, isWeekend, parseISO, isSameDay,
} from 'date-fns';
import { getLeaves, getTasks } from '../api';

interface LeaveEntry {
  id: number;
  staff: { id: number; staffName: string };
  fromDate: string;
  toDate: string;
  days: number;
  status: string;
  leaveType: { name: string };
}
interface TaskEntry { id: number; taskId: string; taskName: string; dueDate?: string; }

const STAFF_COLORS = [
  'bg-blue-200 text-blue-800', 'bg-green-200 text-green-800', 'bg-purple-200 text-purple-800',
  'bg-orange-200 text-orange-800', 'bg-pink-200 text-pink-800', 'bg-teal-200 text-teal-800',
  'bg-yellow-200 text-yellow-800', 'bg-red-200 text-red-800', 'bg-indigo-200 text-indigo-800',
];

const LeaveCalendar: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffColorMap, setStaffColorMap] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'ALL' | 'APPROVED' | 'PENDING'>('APPROVED');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, tRes] = await Promise.all([
        getLeaves().catch(() => ({ data: [] })),
        getTasks().catch(() => ({ data: [] })),
      ]);
      setLeaves(lRes.data || []);
      setTasks(tRes.data || []);

      // Assign colors to unique staff
      const colorMap: Record<number, string> = {};
      let ci = 0;
      (lRes.data || []).forEach((l: LeaveEntry) => {
        if (!colorMap[l.staff.id]) {
          colorMap[l.staff.id] = STAFF_COLORS[ci % STAFF_COLORS.length];
          ci++;
        }
      });
      setStaffColorMap(colorMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad to start on Monday
  const startPad = (monthStart.getDay() + 6) % 7;
  const paddedDays: (Date | null)[] = [...Array(startPad).fill(null), ...days];

  const filteredLeaves = leaves.filter((l) =>
    filter === 'ALL' ? true : l.status === filter
  );

  const getLeavesForDay = (day: Date): LeaveEntry[] => {
    return filteredLeaves.filter((l) => {
      const from = parseISO(l.fromDate.slice(0, 10));
      const to = parseISO(l.toDate.slice(0, 10));
      return day >= from && day <= to;
    });
  };

  const getDeadlinesForDay = (day: Date): TaskEntry[] => {
    return tasks.filter((t) => {
      if (!t.dueDate) return false;
      return isSameDay(parseISO(t.dueDate.slice(0, 10)), day);
    });
  };

  // Who's out today
  const today = new Date();
  const outToday = filteredLeaves.filter((l) => {
    const from = parseISO(l.fromDate.slice(0, 10));
    const to = parseISO(l.toDate.slice(0, 10));
    return today >= from && today <= to;
  });

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leave Calendar</h2>
          <p className="text-sm text-gray-500">Team view — who's out when</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="input-field w-40 text-sm"
          >
            <option value="APPROVED">Approved Only</option>
            <option value="PENDING">Pending Only</option>
            <option value="ALL">All Leaves</option>
          </select>
          <button className="btn-secondary" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>‹ Prev</button>
          <span className="text-sm font-semibold text-gray-700 min-w-[130px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button className="btn-secondary" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>Next ›</button>
          <button className="btn-secondary text-xs" onClick={() => setCurrentMonth(new Date())}>Today</button>
        </div>
      </div>

      {/* Who's Out Today */}
      {outToday.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">
            🏖 Out Today ({outToday.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {outToday.map((l) => (
              <span
                key={l.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${staffColorMap[l.staff.id] || 'bg-gray-100 text-gray-700'}`}
              >
                {l.staff.staffName}
                <span className="opacity-70">({l.leaveType.name})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">Loading calendar...</div>
      ) : (
        <>
          {/* Calendar Grid */}
          <div className="card p-0 overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className={`py-2 text-center text-xs font-semibold uppercase tracking-wide ${d === 'Sat' || d === 'Sun' ? 'text-red-400 bg-red-50' : 'text-gray-500'}`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {paddedDays.map((day, idx) => {
                if (!day) {
                  return <div key={`pad-${idx}`} className="min-h-[100px] bg-gray-50 border-b border-r border-gray-100" />;
                }
                const dayLeaves = getLeavesForDay(day);
                const deadlines = getDeadlinesForDay(day);
                const isToday = isSameDay(day, today);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isWknd = isWeekend(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[100px] p-1.5 border-b border-r border-gray-100
                      ${!isCurrentMonth ? 'bg-gray-50 opacity-40' : ''}
                      ${isWknd ? 'bg-red-50/30' : ''}
                      ${isToday ? 'bg-blue-50/50 ring-1 ring-inset ring-blue-400' : ''}
                    `}
                  >
                    <div className={`text-right text-xs font-semibold mb-1 ${
                      isToday ? 'text-blue-700' : isWknd ? 'text-red-400' : 'text-gray-600'
                    }`}>
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs">
                          {format(day, 'd')}
                        </span>
                      ) : format(day, 'd')}
                    </div>

                    {/* Leave blocks */}
                    <div className="space-y-0.5">
                      {dayLeaves.slice(0, 3).map((l) => (
                        <div
                          key={l.id}
                          title={`${l.staff.staffName} — ${l.leaveType.name} (${l.status})`}
                          className={`truncate text-xs px-1 py-0.5 rounded ${staffColorMap[l.staff.id] || 'bg-gray-200 text-gray-700'} ${l.status === 'PENDING' ? 'opacity-60 border border-dashed border-current' : ''}`}
                        >
                          {l.staff.staffName.split(' ')[0]}
                        </div>
                      ))}
                      {dayLeaves.length > 3 && (
                        <div className="text-xs text-gray-400 pl-1">+{dayLeaves.length - 3} more</div>
                      )}

                      {/* Task deadlines */}
                      {deadlines.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          title={`DEADLINE: ${t.taskId} — ${t.taskName}`}
                          className="truncate text-xs px-1 py-0.5 rounded bg-red-100 text-red-700 border border-red-300"
                        >
                          ⏰ {t.taskId}
                        </div>
                      ))}
                      {deadlines.length > 2 && (
                        <div className="text-xs text-red-400 pl-1">+{deadlines.length - 2} deadlines</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Staff Legend</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(staffColorMap).map(([staffId, color]) => {
                const staffName = leaves.find((l) => l.staff.id === Number(staffId))?.staff.staffName;
                if (!staffName) return null;
                return (
                  <span key={staffId} className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
                    {staffName}
                  </span>
                );
              })}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-300">
                ⏰ Task Deadline
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Dashed border = pending leave request</p>
          </div>

          {/* Leave list for month */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Leaves in {format(currentMonth, 'MMMM yyyy')} ({filteredLeaves.filter((l) => {
                const from = parseISO(l.fromDate.slice(0, 10));
                const to = parseISO(l.toDate.slice(0, 10));
                return from <= monthEnd && to >= monthStart;
              }).length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Staff</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">From</th>
                    <th className="table-header">To</th>
                    <th className="table-header">Days</th>
                    <th className="table-header">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaves
                    .filter((l) => {
                      const from = parseISO(l.fromDate.slice(0, 10));
                      const to = parseISO(l.toDate.slice(0, 10));
                      return from <= monthEnd && to >= monthStart;
                    })
                    .sort((a, b) => a.fromDate.localeCompare(b.fromDate))
                    .map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="table-cell font-medium">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${(staffColorMap[l.staff.id] || 'bg-gray-300').split(' ')[0]}`} />
                          {l.staff.staffName}
                        </td>
                        <td className="table-cell text-gray-600">{l.leaveType.name}</td>
                        <td className="table-cell text-gray-600">{l.fromDate.slice(0, 10)}</td>
                        <td className="table-cell text-gray-600">{l.toDate.slice(0, 10)}</td>
                        <td className="table-cell font-medium">{l.days}</td>
                        <td className="table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            l.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                            l.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                            l.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{l.status}</span>
                        </td>
                      </tr>
                    ))}
                  {filteredLeaves.filter((l) => {
                    const from = parseISO(l.fromDate.slice(0, 10));
                    const to = parseISO(l.toDate.slice(0, 10));
                    return from <= monthEnd && to >= monthStart;
                  }).length === 0 && (
                    <tr>
                      <td colSpan={6} className="table-cell text-center text-gray-400 py-6">
                        No leaves in this month
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LeaveCalendar;
