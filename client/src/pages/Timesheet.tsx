import React, { useEffect, useState, useCallback } from 'react';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import {
  getWeeklyTimesheet, upsertTimesheetEntry, deleteTimesheetEntry, getTasks, getStaff,
  getTimesheetLocks, lockWeek, unlockWeek,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

interface Task { id: number; taskId: string; taskName: string; }
interface Staff { id: number; staffName: string; }
interface TimesheetEntry {
  id: number; staffId: number; taskId: number; date: string;
  hoursSpent: number; task: { id: number; taskId: string; taskName: string; };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const Timesheet: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [allLocks, setAllLocks] = useState<{ weekStart: string; lockedBy: { staffName: string } }[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<number | undefined>(user?.staffId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [rowTaskIds, setRowTaskIds] = useState<number[]>([]);
  const [newTaskId, setNewTaskId] = useState('');
  const [warnings, setWarnings] = useState<Record<number, string>>({});
  const [lockMsg, setLockMsg] = useState('');

  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tsRes, taskRes] = await Promise.all([
        getWeeklyTimesheet(selectedStaffId, weekStartStr),
        getTasks(),
      ]);
      const tsData = tsRes.data;
      const entriesArr: TimesheetEntry[] = Array.isArray(tsData) ? tsData : (tsData.entries || []);
      const locked: boolean = Array.isArray(tsData) ? false : (tsData.isLocked || false);
      setEntries(entriesArr);
      setIsLocked(locked);
      setTasks(taskRes.data);
      const seen = new Set<number>();
      const uniqueTaskIds: number[] = [];
      entriesArr.forEach((e: TimesheetEntry) => {
        if (!seen.has(e.taskId)) { seen.add(e.taskId); uniqueTaskIds.push(e.taskId); }
      });
      setRowTaskIds(uniqueTaskIds);
    } finally {
      setLoading(false);
    }
  }, [selectedStaffId, weekStartStr]);

  useEffect(() => {
    getTasks().then((r) => setTasks(r.data));
    if (isAdmin) {
      getStaff().then((r) => setStaff(r.data));
      getTimesheetLocks().then((r) => setAllLocks(r.data || []));
    }
  }, [isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getDayDate = (dayIndex: number) => addDays(weekStart, dayIndex);

  const getEntry = (taskId: number, dayIndex: number) => {
    const date = format(getDayDate(dayIndex), 'yyyy-MM-dd');
    return entries.find((e) => e.taskId === taskId && e.date.slice(0, 10) === date);
  };

  const validateHours = (value: string, taskId: number, dayIndex: number): string | null => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) return 'Invalid hours';
    if (parsed > 24) return 'Cannot exceed 24 hours/day';
    const dayTotal = rowTaskIds.reduce((sum, tid) => {
      if (tid === taskId) return sum + parsed;
      const e = getEntry(tid, dayIndex);
      return sum + (e ? Number(e.hoursSpent) : 0);
    }, 0);
    if (dayTotal > 24) return `Day total (${dayTotal}h) exceeds 24h`;
    return null;
  };

  const handleHoursChange = async (taskId: number, dayIndex: number, hours: string) => {
    if (isLocked && !isAdmin) return;
    const date = format(getDayDate(dayIndex), 'yyyy-MM-dd');
    const key = `${taskId}-${dayIndex}`;
    const parsed = parseFloat(hours);
    const newWarnings = { ...warnings };
    if (hours && !isNaN(parsed)) {
      const error = validateHours(hours, taskId, dayIndex);
      if (error) { newWarnings[dayIndex * 1000 + taskId] = error; setWarnings(newWarnings); return; }
      if (parsed > 12) newWarnings[dayIndex * 1000 + taskId] = `⚠ ${parsed}h seems high`;
      else delete newWarnings[dayIndex * 1000 + taskId];
    } else {
      delete newWarnings[dayIndex * 1000 + taskId];
    }
    setWarnings(newWarnings);
    setSaving(key);
    try {
      const existing = getEntry(taskId, dayIndex);
      if (!hours || isNaN(parsed) || parsed === 0) {
        if (existing) await deleteTimesheetEntry(existing.id);
      } else {
        await upsertTimesheetEntry({ staffId: selectedStaffId, taskId, date, hoursSpent: parsed });
      }
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error saving entry');
    } finally {
      setSaving(null);
    }
  };

  const handleLockToggle = async () => {
    try {
      if (isLocked) {
        await unlockWeek(weekStartStr);
        setLockMsg(`✅ Week of ${weekStartStr} unlocked`);
      } else {
        await lockWeek(weekStartStr);
        setLockMsg(`🔒 Week of ${weekStartStr} locked — staff cannot backdate`);
      }
      await fetchData();
      getTimesheetLocks().then((r) => setAllLocks(r.data || []));
      setTimeout(() => setLockMsg(''), 4000);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error toggling lock');
    }
  };

  const addTaskRow = () => {
    const task = tasks.find((t) => t.taskId === newTaskId || String(t.id) === newTaskId);
    if (!task) return;
    if (!rowTaskIds.includes(task.id)) setRowTaskIds([...rowTaskIds, task.id]);
    setNewTaskId('');
  };

  const removeRow = (taskId: number) => setRowTaskIds(rowTaskIds.filter((id) => id !== taskId));

  const getDayTotal = (dayIndex: number) =>
    rowTaskIds.reduce((sum, taskId) => {
      const entry = getEntry(taskId, dayIndex);
      return sum + (entry ? Number(entry.hoursSpent) : 0);
    }, 0);

  const getRowTotal = (taskId: number) =>
    DAYS.reduce((sum, _, i) => {
      const entry = getEntry(taskId, i);
      return sum + (entry ? Number(entry.hoursSpent) : 0);
    }, 0);

  const weekTotal = DAYS.reduce((sum, _, i) => sum + getDayTotal(i), 0);
  const getTaskLabel = (taskId: number) => {
    const task = tasks.find((t) => t.id === taskId);
    return task ? `${task.taskId} — ${task.taskName}` : `Task #${taskId}`;
  };
  const staffName = isAdmin ? staff.find((s) => s.id === selectedStaffId)?.staffName : user?.staffName;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Weekly Timesheet</h2>
          {staffName && <p className="text-gray-500 text-sm mt-0.5">{staffName}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <select className="input-field w-52" value={selectedStaffId || ''}
              onChange={(e) => setSelectedStaffId(Number(e.target.value))}>
              <option value="">— Select Staff —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
            </select>
          )}
          <button className="btn-secondary" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>‹ Prev</button>
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
            {format(weekStart, 'dd MMM')} – {format(addDays(weekStart, 6), 'dd MMM yyyy')}
          </span>
          <button className="btn-secondary" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>Next ›</button>
          <button className="btn-secondary text-xs" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            This Week
          </button>
          {isAdmin && (
            <button onClick={handleLockToggle}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                isLocked ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                  : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
              }`}>
              {isLocked ? '🔒 Locked — Click to Unlock' : '🔓 Open — Click to Lock'}
            </button>
          )}
        </div>
      </div>

      {isLocked && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${isAdmin ? 'bg-orange-50 border border-orange-200' : 'bg-red-50 border border-red-200'}`}>
          <span className="text-xl">🔒</span>
          <div>
            <p className={`text-sm font-semibold ${isAdmin ? 'text-orange-700' : 'text-red-700'}`}>
              This week is locked — backdating is not allowed
            </p>
            {isAdmin && <p className="text-xs text-orange-500">As Admin you can still edit and unlock.</p>}
          </div>
        </div>
      )}

      {lockMsg && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">{lockMsg}</div>}

      {Object.values(warnings).length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          {Object.values(warnings).filter(Boolean).join(' · ')}
        </div>
      )}

      <div className="card overflow-x-auto p-0 hidden md:block">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-header w-64">Task</th>
              {DAYS.map((day, i) => (
                <th key={day} className="table-header text-center">
                  <div className="font-semibold">{day.slice(0, 3)}</div>
                  <div className="text-xs font-normal text-gray-400 mt-0.5">{format(getDayDate(i), 'dd/MM')}</div>
                </th>
              ))}
              <th className="table-header text-center">Total</th>
              <th className="table-header w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="table-cell text-center py-8 text-gray-400">Loading...</td></tr>
            ) : (
              <>
                {rowTaskIds.map((taskId) => (
                  <tr key={taskId} className="hover:bg-gray-50 border-b border-gray-100">
                    <td className="table-cell">
                      <div className="text-xs text-gray-700 font-medium leading-tight">{getTaskLabel(taskId)}</div>
                    </td>
                    {DAYS.map((_, dayIndex) => {
                      const entry = getEntry(taskId, dayIndex);
                      const key = `${taskId}-${dayIndex}`;
                      const cellLocked = isLocked && !isAdmin;
                      const hasWarning = !!warnings[dayIndex * 1000 + taskId];
                      return (
                        <td key={dayIndex} className="table-cell text-center p-1">
                          <input
                            type="number" min="0" max="24" step="0.5"
                            defaultValue={entry ? Number(entry.hoursSpent) : ''}
                            key={`${entry?.id}-${entry?.hoursSpent}`}
                            disabled={cellLocked}
                            onBlur={(e) => handleHoursChange(taskId, dayIndex, e.target.value)}
                            className={`w-16 text-center border rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 ${
                              cellLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' :
                              saving === key ? 'border-blue-300 bg-blue-50 focus:ring-blue-500' :
                              hasWarning ? 'border-yellow-400 bg-yellow-50 focus:ring-yellow-500' :
                              'border-gray-200 focus:ring-blue-500'
                            }`}
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                    <td className="table-cell text-center font-semibold text-blue-700">{getRowTotal(taskId) || '—'}</td>
                    <td className="table-cell">
                      {(!isLocked || isAdmin) && (
                        <button onClick={() => removeRow(taskId)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                  <td className="table-cell text-gray-700">Daily Total</td>
                  {DAYS.map((_, i) => (
                    <td key={i} className={`table-cell text-center ${getDayTotal(i) > 12 ? 'text-orange-500' : 'text-blue-700'}`}>
                      {getDayTotal(i) || '—'}{getDayTotal(i) > 12 && <span className="text-xs ml-0.5">⚠</span>}
                    </td>
                  ))}
                  <td className="table-cell text-center text-blue-700 text-base">{weekTotal}</td>
                  <td className="table-cell"></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {rowTaskIds.map((taskId) => (
          <div key={taskId} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-700 truncate">{getTaskLabel(taskId)}</span>
              {(!isLocked || isAdmin) && <button onClick={() => removeRow(taskId)} className="text-gray-400 hover:text-red-500 text-xs ml-2">✕</button>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {DAYS.map((day, dayIndex) => {
                const entry = getEntry(taskId, dayIndex);
                return (
                  <div key={dayIndex} className="text-center">
                    <p className="text-xs text-gray-500 mb-1">{day.slice(0, 3)}<br /><span className="text-gray-400">{format(getDayDate(dayIndex), 'dd/MM')}</span></p>
                    <input type="number" min="0" max="24" step="0.5"
                      defaultValue={entry ? Number(entry.hoursSpent) : ''}
                      key={`mobile-${entry?.id}-${entry?.hoursSpent}`}
                      disabled={isLocked && !isAdmin}
                      onBlur={(e) => handleHoursChange(taskId, dayIndex, e.target.value)}
                      className="w-full text-center border border-gray-200 rounded px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                      placeholder="0" />
                  </div>
                );
              })}
            </div>
            <div className="text-right text-sm font-semibold text-blue-700 mt-2">Total: {getRowTotal(taskId)} hrs</div>
          </div>
        ))}
        {rowTaskIds.length === 0 && !loading && <div className="text-center text-gray-400 text-sm py-8">Add task rows using the selector below</div>}
      </div>

      {(!isLocked || isAdmin) && (
        <div className="flex items-center gap-3 flex-wrap">
          <select className="input-field max-w-xs" value={newTaskId} onChange={(e) => setNewTaskId(e.target.value)}>
            <option value="">— Add a task row —</option>
            {tasks.filter((t) => !rowTaskIds.includes(t.id)).map((t) => (
              <option key={t.id} value={t.taskId}>{t.taskId} — {t.taskName}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={addTaskRow} disabled={!newTaskId}>Add Row</button>
          {weekTotal > 0 && (
            <span className="text-sm text-gray-600 ml-auto">Week Total: <span className="font-bold text-blue-700">{weekTotal} hrs</span></span>
          )}
        </div>
      )}

      {isAdmin && allLocks.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">🔒 All Locked Weeks</h3>
          <div className="flex flex-wrap gap-2">
            {allLocks.map((lock) => (
              <div key={lock.weekStart} className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-medium text-red-700">{lock.weekStart?.slice(0, 10)}</span>
                <span className="text-red-400">by {lock.lockedBy?.staffName}</span>
                <button onClick={async () => { await unlockWeek(lock.weekStart?.slice(0, 10)); getTimesheetLocks().then((r) => setAllLocks(r.data || [])); }}
                  className="text-red-400 hover:text-red-700 ml-1 font-bold">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Timesheet;
