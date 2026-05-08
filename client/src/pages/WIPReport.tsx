import React, { useEffect, useState, useCallback } from 'react';
import { getWIPReport } from '../api';

interface StaffBreakdown { staffName: string; hours: number; cost: number; }
interface WIPRow {
  taskId: string; taskName: string;
  client: { id: number; clientCode: string; clientName: string } | null;
  partner: { id: number; staffName: string } | null;
  manager: { id: number; staffName: string } | null;
  category: string | null;
  dueDate: string | null; isOverdue: boolean;
  totalHours: number; staffCost: number; expenses: number; totalCost: number;
  ageDays: number; ageBucket: string;
  staffBreakdown: StaffBreakdown[];
  createdAt: string;
}
interface ClientGroup {
  clientId: number | null; clientCode: string; clientName: string;
  taskCount: number; totalHours: number; totalCost: number; tasks: WIPRow[];
}
interface AgeBucket { bucket: string; count: number; cost: number; }
interface Summary {
  totalTasks: number; totalHours: number; totalCost: number;
  overdueCount: number; ageBuckets: AgeBucket[];
}
interface WIPData { summary: Summary; byClient: ClientGroup[]; rows: WIPRow[]; }

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtH = (h: number) => h.toFixed(1) + 'h';
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const BUCKET_COLOR: Record<string, string> = {
  '0–30 days':  'bg-green-100 text-green-700',
  '31–60 days': 'bg-yellow-100 text-yellow-700',
  '61–90 days': 'bg-orange-100 text-orange-700',
  '90+ days':   'bg-red-100 text-red-700',
};

const WIPReport: React.FC = () => {
  const [data, setData] = useState<WIPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedClient, setExpandedClient] = useState<Set<string>>(new Set());
  const [expandedTask, setExpandedTask] = useState<Set<string>>(new Set());
  const [bucketFilter, setBucketFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'client' | 'flat'>('client');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getWIPReport();
      setData(res.data);
      // Expand all clients by default
      const keys = new Set<string>(res.data.byClient.map((c: ClientGroup) => String(c.clientId ?? '__no_client__')));
      setExpandedClient(keys);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load WIP report');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleClient = (key: string) => setExpandedClient(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const toggleTask = (key: string) => setExpandedTask(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  // All unique partners across rows
  const allPartners = Array.from(new Set(
    (data?.rows ?? []).map(r => r.partner?.staffName).filter(Boolean) as string[]
  )).sort();

  // Filtered rows
  const filteredRows = (data?.rows ?? []).filter(r => {
    if (bucketFilter && r.ageBucket !== bucketFilter) return false;
    if (partnerFilter && r.partner?.staffName !== partnerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.taskName.toLowerCase().includes(q) &&
          !(r.client?.clientName || '').toLowerCase().includes(q) &&
          !r.taskId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Re-group by client after filters
  const filteredByClient = new Map<string, ClientGroup>();
  filteredRows.forEach(r => {
    const key = String(r.client?.id ?? '__no_client__');
    if (!filteredByClient.has(key)) {
      filteredByClient.set(key, {
        clientId: r.client?.id ?? null,
        clientCode: r.client?.clientCode ?? '—',
        clientName: r.client?.clientName ?? 'No Client',
        taskCount: 0, totalHours: 0, totalCost: 0, tasks: [],
      });
    }
    const g = filteredByClient.get(key)!;
    g.taskCount++; g.totalHours += r.totalHours; g.totalCost += r.totalCost; g.tasks.push(r);
  });

  if (loading) return <p className="text-gray-500 text-sm">Loading WIP Report…</p>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>;
  if (!data) return null;

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">WIP Report</h2>
          <p className="text-sm text-gray-500 mt-1">Open unbilled tasks — work in progress</p>
        </div>
        <button className="btn-secondary text-sm" onClick={fetchData}>↻ Refresh</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card text-center py-3">
          <p className="text-2xl font-bold text-blue-700">{summary.totalTasks}</p>
          <p className="text-xs text-gray-500 mt-1">Open Tasks</p>
        </div>
        <div className="card text-center py-3">
          <p className="text-2xl font-bold text-gray-800">{fmtH(summary.totalHours)}</p>
          <p className="text-xs text-gray-500 mt-1">Total Hours</p>
        </div>
        <div className="card text-center py-3">
          <p className="text-2xl font-bold text-purple-700">
            ₹{(summary.totalCost / 100000).toFixed(1)}L
          </p>
          <p className="text-xs text-gray-500 mt-1">Total WIP Cost</p>
        </div>
        <div className={`card text-center py-3 ${summary.overdueCount > 0 ? 'border-red-200 bg-red-50' : ''}`}>
          <p className={`text-2xl font-bold ${summary.overdueCount > 0 ? 'text-red-600' : 'text-gray-800'}`}>{summary.overdueCount}</p>
          <p className="text-xs text-gray-500 mt-1">Overdue Tasks</p>
        </div>
      </div>

      {/* Age breakdown */}
      <div className="card">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Age Analysis</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summary.ageBuckets.map(b => (
            <button key={b.bucket}
              onClick={() => setBucketFilter(bucketFilter === b.bucket ? '' : b.bucket)}
              className={`text-center px-3 py-3 rounded-lg border transition-all text-sm
                ${bucketFilter === b.bucket ? `${BUCKET_COLOR[b.bucket]} border-current` : 'bg-white border-gray-200 hover:border-gray-400'}`}>
              <p className="font-bold text-lg">{b.count}</p>
              <p className="text-xs text-gray-500">{b.bucket}</p>
              {b.cost > 0 && <p className="text-xs font-medium mt-0.5">₹{(b.cost / 100000).toFixed(1)}L</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Filters + View toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <input className="input-field w-52" placeholder="Search task / client…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input-field w-40" value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}>
          <option value="">All Partners</option>
          {allPartners.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="input-field w-40" value={bucketFilter} onChange={e => setBucketFilter(e.target.value)}>
          <option value="">All Ages</option>
          {['0–30 days','31–60 days','61–90 days','90+ days'].map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="ml-auto flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setView('client')}
            className={`px-3 py-1.5 text-sm font-medium ${view === 'client' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            By Client
          </button>
          <button onClick={() => setView('flat')}
            className={`px-3 py-1.5 text-sm font-medium ${view === 'flat' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            All Tasks
          </button>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">✅</p>
          <p className="font-medium">No open unbilled tasks matching your filters.</p>
        </div>
      ) : view === 'client' ? (
        /* ── Client grouped view ── */
        <div className="space-y-3">
          {Array.from(filteredByClient.values()).map(group => {
            const key = String(group.clientId ?? '__no_client__');
            const isOpen = expandedClient.has(key);
            return (
              <div key={key} className="card p-0 overflow-hidden">
                {/* Client header */}
                <button
                  onClick={() => toggleClient(key)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{isOpen ? '▼' : '▶'}</span>
                    <div className="text-left">
                      <p className="font-semibold text-gray-800 text-sm">{group.clientName}</p>
                      <p className="text-xs text-gray-400">{group.clientCode} · {group.taskCount} task{group.taskCount !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-xs text-gray-400">Hours</p>
                      <p className="text-sm font-semibold text-gray-700">{fmtH(group.totalHours)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">WIP Cost</p>
                      <p className="text-sm font-bold text-purple-700">{fmt(group.totalCost)}</p>
                    </div>
                  </div>
                </button>

                {/* Task rows */}
                {isOpen && (
                  <div className="divide-y divide-gray-50">
                    {group.tasks.map(task => {
                      const tKey = task.taskId;
                      const taskOpen = expandedTask.has(tKey);
                      return (
                        <div key={task.taskId}>
                          <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                            <button onClick={() => toggleTask(tKey)} className="text-gray-400 hover:text-gray-600 text-xs w-4">{taskOpen ? '▼' : '▶'}</button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-gray-800 truncate">{task.taskName}</span>
                                <span className="font-mono text-xs text-gray-400">{task.taskId}</span>
                                {task.category && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{task.category}</span>}
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${BUCKET_COLOR[task.ageBucket]}`}>{task.ageBucket}</span>
                                {task.isOverdue && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">⚠️ Overdue</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {task.partner && `Partner: ${task.partner.staffName}`}
                                {task.manager && ` · Manager: ${task.manager.staffName}`}
                                {task.dueDate && ` · Due: ${fmtDate(task.dueDate)}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-6 text-right shrink-0">
                              <div>
                                <p className="text-xs text-gray-400">Hours</p>
                                <p className="text-sm font-medium">{fmtH(task.totalHours)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400">Staff Cost</p>
                                <p className="text-sm font-medium">{fmt(task.staffCost)}</p>
                              </div>
                              {task.expenses > 0 && (
                                <div>
                                  <p className="text-xs text-gray-400">Expenses</p>
                                  <p className="text-sm font-medium">{fmt(task.expenses)}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs text-gray-400">Total</p>
                                <p className="text-sm font-bold text-purple-700">{fmt(task.totalCost)}</p>
                              </div>
                            </div>
                          </div>
                          {/* Staff breakdown */}
                          {taskOpen && task.staffBreakdown.length > 0 && (
                            <div className="bg-blue-50/40 px-10 py-2 border-t border-blue-100">
                              <p className="text-xs font-semibold text-gray-500 mb-1.5">Staff Breakdown</p>
                              <div className="flex flex-wrap gap-4">
                                {task.staffBreakdown.map(sb => (
                                  <div key={sb.staffName} className="text-xs">
                                    <span className="font-medium text-gray-700">{sb.staffName}</span>
                                    <span className="text-gray-400 ml-1">— {fmtH(sb.hours)} · {fmt(sb.cost)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Flat table view ── */
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Task','Client','Partner','Category','Age','Hours','Staff Cost','Expenses','Total','Due'].map(h => (
                  <th key={h} className="table-header whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(task => (
                <tr key={task.taskId} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <p className="font-medium text-gray-800 max-w-[180px] truncate">{task.taskName}</p>
                    <p className="text-xs text-gray-400 font-mono">{task.taskId}</p>
                  </td>
                  <td className="table-cell text-gray-600 whitespace-nowrap">{task.client?.clientName ?? '—'}</td>
                  <td className="table-cell text-gray-600 whitespace-nowrap">{task.partner?.staffName ?? '—'}</td>
                  <td className="table-cell text-xs text-gray-500">{task.category ?? '—'}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${BUCKET_COLOR[task.ageBucket]}`}>{task.ageBucket}</span>
                  </td>
                  <td className="table-cell text-right font-medium">{fmtH(task.totalHours)}</td>
                  <td className="table-cell text-right font-medium">{fmt(task.staffCost)}</td>
                  <td className="table-cell text-right text-gray-500">{task.expenses > 0 ? fmt(task.expenses) : '—'}</td>
                  <td className="table-cell text-right font-bold text-purple-700">{fmt(task.totalCost)}</td>
                  <td className="table-cell text-xs whitespace-nowrap">
                    {task.dueDate ? (
                      <span className={task.isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                        {task.isOverdue ? '⚠️ ' : ''}{fmtDate(task.dueDate)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                <td className="table-cell" colSpan={5}>Total ({filteredRows.length} tasks)</td>
                <td className="table-cell text-right">{fmtH(filteredRows.reduce((s,r) => s+r.totalHours,0))}</td>
                <td className="table-cell text-right">{fmt(filteredRows.reduce((s,r) => s+r.staffCost,0))}</td>
                <td className="table-cell text-right">{fmt(filteredRows.reduce((s,r) => s+r.expenses,0))}</td>
                <td className="table-cell text-right text-purple-700">{fmt(filteredRows.reduce((s,r) => s+r.totalCost,0))}</td>
                <td className="table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default WIPReport;
