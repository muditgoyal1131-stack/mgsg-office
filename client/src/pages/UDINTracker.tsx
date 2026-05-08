import React, { useEffect, useState } from 'react';
import { getTasks } from '../api';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface Task {
  id: number; taskId: string; taskName: string; udin?: string; udinDate?: string;
  client?: { clientCode: string; clientName: string };
  partner?: { staffName: string };
  status: string; billingStatus: string;
}

const UDINTracker: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getTasks().then((r) => {
      setTasks(r.data.filter((t: Task) => t.udin));
      setLoading(false);
    });
  }, []);

  const filtered = tasks.filter(
    (t) =>
      t.udin?.toLowerCase().includes(search.toLowerCase()) ||
      t.taskId.toLowerCase().includes(search.toLowerCase()) ||
      t.taskName.toLowerCase().includes(search.toLowerCase()) ||
      (t.client?.clientName || '').toLowerCase().includes(search.toLowerCase())
  );

  const exportExcel = () => {
    const data = filtered.map((t) => ({
      'Task ID': t.taskId,
      'Task Name': t.taskName,
      'Client': t.client?.clientName || '—',
      'UDIN': t.udin,
      'UDIN Date': t.udinDate ? format(new Date(t.udinDate), 'dd-MMM-yyyy') : '—',
      'Partner': t.partner?.staffName || '—',
      'Task Status': t.status,
      'Billing Status': t.billingStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'UDIN_Tracker');
    XLSX.writeFile(wb, 'UDIN_Tracker.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">UDIN Tracker</h2>
          <p className="text-sm text-gray-500 mt-1">All tasks with UDIN numbers — required for ICAI compliance</p>
        </div>
        <button className="btn-secondary text-sm" onClick={exportExcel}>Export Excel</button>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <input
            className="input-field max-w-sm"
            placeholder="Search UDIN, task, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-sm text-gray-500">{filtered.length} records</span>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Task ID</th>
                  <th className="table-header">Task Name</th>
                  <th className="table-header">Client</th>
                  <th className="table-header">UDIN</th>
                  <th className="table-header">UDIN Date</th>
                  <th className="table-header">Partner</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Billing</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-blue-700">{task.taskId}</td>
                    <td className="table-cell font-medium">{task.taskName}</td>
                    <td className="table-cell text-gray-500">{task.client?.clientName || '—'}</td>
                    <td className="table-cell font-mono text-xs bg-yellow-50 text-yellow-800 font-medium">
                      {task.udin}
                    </td>
                    <td className="table-cell text-gray-500">
                      {task.udinDate ? format(new Date(task.udinDate), 'dd-MMM-yyyy') : '—'}
                    </td>
                    <td className="table-cell">{task.partner?.staffName || '—'}</td>
                    <td className="table-cell">
                      <span className={task.status === 'OPEN' ? 'badge-open' : 'badge-closed'}>{task.status}</span>
                    </td>
                    <td className="table-cell">
                      <span className={task.billingStatus === 'BILLED' ? 'badge-billed' : 'badge-unbilled'}>
                        {task.billingStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="table-cell text-center py-8 text-gray-400">
                      {tasks.length === 0 ? 'No tasks with UDIN numbers found' : 'No matching results'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UDINTracker;
