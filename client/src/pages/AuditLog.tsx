import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { format } from 'date-fns';

interface LogEntry {
  id: number;
  entity: string;
  entityId: number;
  action: string;
  changes: any;
  createdAt: string;
  user: { email: string; staff?: { staffName: string } };
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterEntity, setFilterEntity] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (filterEntity) params.entity = filterEntity;
      const res = await api.get('/audit', { params });
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [page, filterEntity]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-500 mt-1">{total} total records</p>
        </div>
        <select
          className="input-field w-44"
          value={filterEntity}
          onChange={(e) => { setFilterEntity(e.target.value); setPage(1); }}
        >
          <option value="">All Entities</option>
          <option value="task">Tasks</option>
          <option value="expense">Expenses</option>
          <option value="staff">Staff</option>
          <option value="client">Clients</option>
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Date & Time</th>
              <th className="table-header">User</th>
              <th className="table-header">Entity</th>
              <th className="table-header">Action</th>
              <th className="table-header">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="table-cell text-center py-8 text-gray-400">Loading...</td></tr>
            ) : logs.map((log) => (
              <React.Fragment key={log.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                  <td className="table-cell text-gray-500 text-xs">
                    {format(new Date(log.createdAt), 'dd MMM yyyy HH:mm')}
                  </td>
                  <td className="table-cell font-medium">
                    {log.user.staff?.staffName || log.user.email}
                  </td>
                  <td className="table-cell capitalize">{log.entity}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="table-cell text-gray-400 text-xs">
                    {log.changes ? 'Click to expand' : '—'}
                    {expanded === log.id ? ' ▲' : log.changes ? ' ▼' : ''}
                  </td>
                </tr>
                {expanded === log.id && log.changes && (
                  <tr>
                    <td colSpan={5} className="px-4 pb-3">
                      <pre className="bg-gray-50 text-xs rounded p-3 text-gray-700 overflow-x-auto max-h-48">
                        {JSON.stringify(log.changes, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={5} className="table-cell text-center py-8 text-gray-400">No audit logs found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary py-1 px-3" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
            <button className="btn-secondary py-1 px-3" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
