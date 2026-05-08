import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { getClientFees, getStaffKPIs, getBillingSummary } from '../api';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LineChart, Line, Legend } from 'recharts';

type Tab = 'utilization' | 'wip' | 'profitability' | 'billing' | 'clientFees' | 'staffKpis' | 'billingSummary';

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const exportExcel = (data: any[], filename: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

const exportPDF = (columns: string[], rows: any[][], filename: string) => {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.text(filename, 14, 14);
  autoTable(doc, { head: [columns], body: rows, startY: 22, styles: { fontSize: 9 } });
  doc.save(`${filename}.pdf`);
};

const ReportsContent: React.FC = () => {
  const [tab, setTab] = useState<Tab>('utilization');
  const [billingSummary, setBillingSummary] = useState<any>({ summary: [], totals: {} });
  const [billingSummaryLoading, setBillingSummaryLoading] = useState(false);
  const [bsFrom, setBsFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [bsTo, setBsTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [bsGroupBy, setBsGroupBy] = useState<'month' | 'quarter'>('month');
  const [bsExpanded, setBsExpanded] = useState<string | null>(null);
  const [utilization, setUtilization] = useState<any[]>([]);
  const [wipAging, setWipAging] = useState<any[]>([]);
  const [profitability, setProfitability] = useState<any>({ byPartner: [], byManager: [] });
  const [clientBilling, setClientBilling] = useState<any[]>([]);
  const [clientFees, setClientFees] = useState<any[]>([]);
  const [staffKpis, setStaffKpis] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kpiMonth, setKpiMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchUtilization = async () => {
    setLoading(true);
    const params: any = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const res = await api.get('/reports/utilization', { params });
    setUtilization(res.data);
    setLoading(false);
  };

  const fetchClientFees = async () => {
    setLoading(true);
    const params: any = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const res = await getClientFees(params);
    setClientFees(res.data);
    setLoading(false);
  };

  const fetchStaffKpis = async (month = kpiMonth) => {
    setLoading(true);
    const [year, mon] = month.split('-');
    const res = await getStaffKPIs({ year: Number(year), month: Number(mon) });
    setStaffKpis(res.data);
    setLoading(false);
  };

  const fetchBillingSummary = async (from = bsFrom, to = bsTo, groupBy = bsGroupBy) => {
    setBillingSummaryLoading(true);
    try {
      const res = await getBillingSummary({ from, to, groupBy });
      setBillingSummary(res.data || { summary: [], totals: {} });
    } finally { setBillingSummaryLoading(false); }
  };

  useEffect(() => {
    if (tab === 'billingSummary') { fetchBillingSummary(); return; }
    setLoading(true);
    const fetchMap: Record<string, () => Promise<void>> = {
      utilization: () => api.get('/reports/utilization').then((r) => setUtilization(r.data)),
      wip: () => api.get('/reports/wip-aging').then((r) => setWipAging(r.data)),
      profitability: () => api.get('/reports/profitability').then((r) => setProfitability(r.data)),
      billing: () => api.get('/reports/client-billing').then((r) => setClientBilling(r.data)),
      clientFees: () => getClientFees().then((r) => setClientFees(r.data)),
      staffKpis: () => {
        const [year, mon] = kpiMonth.split('-');
        return getStaffKPIs({ year: Number(year), month: Number(mon) }).then((r) => setStaffKpis(r.data));
      },
    };
    fetchMap[tab]?.().finally(() => setLoading(false));
  }, [tab]); // eslint-disable-line

  const tabs: { key: Tab; label: string }[] = [
    { key: 'utilization',    label: 'Staff Utilization' },
    { key: 'wip',            label: 'WIP Aging' },
    { key: 'profitability',  label: 'Profitability' },
    { key: 'billing',        label: 'Client Billing' },
    { key: 'clientFees',     label: 'Client Fees & Effort' },
    { key: 'staffKpis',      label: 'Staff KPIs' },
    { key: 'billingSummary', label: '💰 Billing Summary' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Reports</h2>

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Loading report...</div>
      ) : (
        <>
          {/* Staff Utilization */}
          {tab === 'utilization' && (
            <div className="space-y-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="label">From</label>
                  <input type="date" className="input-field w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" className="input-field w-40" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <button className="btn-secondary" onClick={fetchUtilization}>Apply</button>
                <div className="ml-auto flex gap-2">
                  <button className="btn-secondary text-sm" onClick={() =>
                    exportExcel(utilization.map(r => ({
                      'Staff Name': r.staffName, 'Partner': r.isPartner ? 'Yes' : 'No',
                      'Total Hours': r.totalHours, 'Capacity (hrs)': r.totalCapacity,
                      'Utilization %': r.utilization, 'Per Hour Cost (₹)': r.perHourCost,
                    })), 'Staff_Utilization')}>
                    Export Excel
                  </button>
                  <button className="btn-secondary text-sm" onClick={() =>
                    exportPDF(
                      ['Staff Name', 'Partner', 'Hours', 'Capacity', 'Utilization %'],
                      utilization.map(r => [r.staffName, r.isPartner ? 'Yes' : 'No', r.totalHours, r.totalCapacity, `${r.utilization}%`]),
                      'Staff_Utilization'
                    )}>
                    Export PDF
                  </button>
                </div>
              </div>
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Staff Name</th>
                      <th className="table-header">Partner</th>
                      <th className="table-header text-right">Hours Logged</th>
                      <th className="table-header text-right">Capacity (hrs)</th>
                      <th className="table-header text-right">Utilization</th>
                      <th className="table-header text-right">Rate/hr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {utilization.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="table-cell font-medium">{r.staffName}</td>
                        <td className="table-cell">{r.isPartner ? <span className="badge-billed">Yes</span> : <span className="badge-closed">No</span>}</td>
                        <td className="table-cell text-right">{r.totalHours}</td>
                        <td className="table-cell text-right">{r.totalCapacity}</td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{
                                width: `${Math.min(r.utilization, 100)}%`,
                                backgroundColor: r.utilization >= 80 ? '#10b981' : r.utilization >= 50 ? '#3b82f6' : '#f59e0b',
                              }} />
                            </div>
                            <span className={r.utilization >= 80 ? 'text-green-600 font-medium' : r.utilization >= 50 ? 'text-blue-600' : 'text-orange-500'}>
                              {r.utilization}%
                            </span>
                          </div>
                        </td>
                        <td className="table-cell text-right">{fmt(r.perHourCost)}</td>
                      </tr>
                    ))}
                    {utilization.length === 0 && <tr><td colSpan={6} className="table-cell text-center py-8 text-gray-400">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* WIP Aging */}
          {tab === 'wip' && (
            <div className="space-y-4">
              <div className="flex justify-end gap-2">
                <button className="btn-secondary text-sm" onClick={() =>
                  exportExcel(wipAging.map(r => ({
                    'Task ID': r.taskId, 'Task Name': r.taskName, 'Client': r.clientName,
                    'Status': r.status, 'Cost (₹)': r.costIncurred, 'OPE (₹)': r.opeIncurred,
                    'Total WIP (₹)': r.totalWIP, 'Age (days)': r.ageDays, 'Bucket': r.ageBucket,
                  })), 'WIP_Aging')}>Export Excel</button>
                <button className="btn-secondary text-sm" onClick={() =>
                  exportPDF(
                    ['Task ID', 'Task Name', 'Client', 'Total WIP', 'Age', 'Bucket'],
                    wipAging.map(r => [r.taskId, r.taskName, r.clientName, fmt(r.totalWIP), `${r.ageDays}d`, r.ageBucket]),
                    'WIP_Aging'
                  )}>Export PDF</button>
              </div>
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Task ID</th>
                      <th className="table-header">Task Name</th>
                      <th className="table-header">Client</th>
                      <th className="table-header text-right">Cost (₹)</th>
                      <th className="table-header text-right">OPE (₹)</th>
                      <th className="table-header text-right">Total WIP</th>
                      <th className="table-header text-center">Age</th>
                      <th className="table-header">Bucket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wipAging.map((r, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${r.ageDays > 90 ? 'bg-red-50' : ''}`}>
                        <td className="table-cell font-mono text-blue-700">{r.taskId}</td>
                        <td className="table-cell font-medium">{r.taskName}</td>
                        <td className="table-cell text-gray-500">{r.clientName}</td>
                        <td className="table-cell text-right">{fmt(r.costIncurred)}</td>
                        <td className="table-cell text-right">{fmt(r.opeIncurred)}</td>
                        <td className="table-cell text-right font-semibold text-blue-700">{fmt(r.totalWIP)}</td>
                        <td className="table-cell text-center">{r.ageDays}d</td>
                        <td className="table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.ageBucket === '90+ days' ? 'bg-red-100 text-red-700' :
                            r.ageBucket === '61-90 days' ? 'bg-orange-100 text-orange-700' :
                            r.ageBucket === '31-60 days' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>{r.ageBucket}</span>
                        </td>
                      </tr>
                    ))}
                    {wipAging.length === 0 && <tr><td colSpan={8} className="table-cell text-center py-8 text-gray-400">No unbilled tasks</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Profitability */}
          {tab === 'profitability' && (
            <div className="space-y-6">
              <div className="flex justify-end gap-2">
                <button className="btn-secondary text-sm" onClick={() =>
                  exportExcel([...profitability.byPartner.map((r: any) => ({ ...r, type: 'Partner' })),
                    ...profitability.byManager.map((r: any) => ({ ...r, type: 'Manager' }))],
                    'Profitability')}>Export Excel</button>
              </div>
              {[{ label: 'By Partner', data: profitability.byPartner }, { label: 'By Manager', data: profitability.byManager }].map(({ label, data }) => (
                <div key={label}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>
                  <div className="card overflow-x-auto p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="table-header">Name</th>
                          <th className="table-header text-right">Tasks</th>
                          <th className="table-header text-right">Total Cost</th>
                          <th className="table-header text-right">Billed Amount</th>
                          <th className="table-header text-right">Margin %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="table-cell font-medium">{r.name}</td>
                            <td className="table-cell text-right">{r.taskCount}</td>
                            <td className="table-cell text-right">{fmt(r.totalCost)}</td>
                            <td className="table-cell text-right">{fmt(r.totalBilled)}</td>
                            <td className="table-cell text-right">
                              {r.margin !== null ? (
                                <span className={r.margin >= 30 ? 'text-green-600 font-medium' : r.margin >= 0 ? 'text-orange-500' : 'text-red-600 font-medium'}>
                                  {r.margin}%
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                        {data.length === 0 && <tr><td colSpan={5} className="table-cell text-center py-6 text-gray-400">No data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Client Fees & Effort */}
          {tab === 'clientFees' && (
            <div className="space-y-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="label">From</label>
                  <input type="date" className="input-field w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" className="input-field w-40" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <button className="btn-secondary" onClick={fetchClientFees}>Apply</button>
                <div className="ml-auto">
                  <button className="btn-secondary text-sm" onClick={() =>
                    exportExcel(clientFees.map(r => ({
                      'Client Code': r.clientCode, 'Client Name': r.clientName,
                      'Total Hours': r.totalHours, 'Total Cost (₹)': r.totalCost,
                      'Total Billed (₹)': r.totalBilled, 'Realisation Rate %': r.realisationRate,
                    })), 'Client_Fees_Effort')}>Export Excel</button>
                </div>
              </div>
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Client Code</th>
                      <th className="table-header">Client Name</th>
                      <th className="table-header text-right">Hours</th>
                      <th className="table-header text-right">Cost (₹)</th>
                      <th className="table-header text-right">Billed (₹)</th>
                      <th className="table-header text-right">Realisation %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientFees.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="table-cell font-mono font-medium text-blue-700">{r.clientCode}</td>
                        <td className="table-cell font-medium">{r.clientName}</td>
                        <td className="table-cell text-right">{r.totalHours}</td>
                        <td className="table-cell text-right">{fmt(r.totalCost)}</td>
                        <td className="table-cell text-right">{fmt(r.totalBilled)}</td>
                        <td className="table-cell text-right">
                          <span className={`font-semibold ${r.realisationRate >= 80 ? 'text-green-600' : r.realisationRate >= 50 ? 'text-blue-600' : 'text-orange-500'}`}>
                            {r.realisationRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {clientFees.length === 0 && <tr><td colSpan={6} className="table-cell text-center py-8 text-gray-400">No data</td></tr>}
                  </tbody>
                </table>
              </div>
              {clientFees.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Clients by Billed Amount</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[...clientFees].sort((a, b) => b.totalBilled - a.totalBilled).slice(0, 10)} barSize={24}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="clientName" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [fmt(v), 'Billed']} />
                      <Bar dataKey="totalBilled" radius={[4, 4, 0, 0]}>
                        {clientFees.slice(0, 10).map((_: any, i: number) => (
                          <Cell key={i} fill={['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6'][i % 10]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Staff KPIs */}
          {tab === 'staffKpis' && (
            <div className="space-y-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="label">Month</label>
                  <input
                    type="month"
                    className="input-field w-44"
                    value={kpiMonth}
                    onChange={(e) => setKpiMonth(e.target.value)}
                  />
                </div>
                <button className="btn-secondary" onClick={() => fetchStaffKpis(kpiMonth)}>Apply</button>
                <div className="ml-auto">
                  <button className="btn-secondary text-sm" onClick={() =>
                    exportExcel(staffKpis.map(r => ({
                      'Staff Name': r.staffName, 'Partner': r.isPartner ? 'Yes' : 'No',
                      'Hours (Month)': r.hoursMonth, 'Hours (Year)': r.hoursYear,
                      'Tasks Open': r.tasksOpen, 'Tasks Closed': r.tasksClosed,
                      'Utilization %': r.utilization,
                      'Leaves (Month)': r.leavesMonth, 'Pending Reimb.': r.pendingReimbursements,
                    })), `Staff_KPIs_${kpiMonth}`)}>Export Excel</button>
                </div>
              </div>
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Staff</th>
                      <th className="table-header">Partner</th>
                      <th className="table-header text-right">Hrs (Month)</th>
                      <th className="table-header text-right">Hrs (Year)</th>
                      <th className="table-header text-right">Tasks Open</th>
                      <th className="table-header text-right">Tasks Closed</th>
                      <th className="table-header text-center">Utilization</th>
                      <th className="table-header text-right">Leaves</th>
                      <th className="table-header text-right">Reimb. Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffKpis.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="table-cell font-medium">{r.staffName}</td>
                        <td className="table-cell">{r.isPartner ? <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Partner</span> : '—'}</td>
                        <td className="table-cell text-right">{r.hoursMonth}</td>
                        <td className="table-cell text-right">{r.hoursYear}</td>
                        <td className="table-cell text-right text-orange-600">{r.tasksOpen}</td>
                        <td className="table-cell text-right text-green-600">{r.tasksClosed}</td>
                        <td className="table-cell text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-16 bg-gray-200 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{
                                width: `${Math.min(r.utilization, 100)}%`,
                                backgroundColor: r.utilization >= 80 ? '#10b981' : r.utilization >= 50 ? '#3b82f6' : '#f59e0b',
                              }} />
                            </div>
                            <span className={`text-xs font-medium ${r.utilization >= 80 ? 'text-green-600' : r.utilization >= 50 ? 'text-blue-600' : 'text-orange-500'}`}>
                              {r.utilization}%
                            </span>
                          </div>
                        </td>
                        <td className="table-cell text-right">{r.leavesMonth}</td>
                        <td className="table-cell text-right">{r.pendingReimbursements > 0 ? <span className="text-red-600 font-medium">{r.pendingReimbursements}</span> : '—'}</td>
                      </tr>
                    ))}
                    {staffKpis.length === 0 && <tr><td colSpan={9} className="table-cell text-center py-8 text-gray-400">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Client Billing */}
          {tab === 'billing' && (
            <div className="space-y-4">
              <div className="flex justify-end gap-2">
                <button className="btn-secondary text-sm" onClick={() =>
                  exportExcel(clientBilling.map(r => ({
                    'Client Code': r.clientCode, 'Client Name': r.clientName,
                    'Total Tasks': r.totalTasks, 'Billed Tasks': r.billedTasks,
                    'Open Tasks': r.openTasks, 'Total Cost (₹)': r.totalCost, 'Open WIP (₹)': r.openWIP,
                  })), 'Client_Billing')}>Export Excel</button>
                <button className="btn-secondary text-sm" onClick={() =>
                  exportPDF(
                    ['Client', 'Total Tasks', 'Billed', 'Open', 'Total Cost', 'Open WIP'],
                    clientBilling.map(r => [r.clientName, r.totalTasks, r.billedTasks, r.openTasks, fmt(r.totalCost), fmt(r.openWIP)]),
                    'Client_Billing'
                  )}>Export PDF</button>
              </div>
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Client Code</th>
                      <th className="table-header">Client Name</th>
                      <th className="table-header text-right">Total Tasks</th>
                      <th className="table-header text-right">Billed</th>
                      <th className="table-header text-right">Open</th>
                      <th className="table-header text-right">Total Cost</th>
                      <th className="table-header text-right">Open WIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientBilling.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="table-cell font-mono font-medium">{r.clientCode}</td>
                        <td className="table-cell">{r.clientName}</td>
                        <td className="table-cell text-right">{r.totalTasks}</td>
                        <td className="table-cell text-right text-green-600">{r.billedTasks}</td>
                        <td className="table-cell text-right text-orange-500">{r.openTasks}</td>
                        <td className="table-cell text-right">{fmt(r.totalCost)}</td>
                        <td className="table-cell text-right font-semibold text-blue-700">{fmt(r.openWIP)}</td>
                      </tr>
                    ))}
                    {clientBilling.length === 0 && <tr><td colSpan={7} className="table-cell text-center py-8 text-gray-400">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── BILLING SUMMARY TAB ── */}
      {tab === 'billingSummary' && (
        <div className="space-y-5">
          {/* Filters */}
          <div className="card">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="label">From</label>
                <input type="date" className="input-field" value={bsFrom} onChange={(e) => setBsFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input type="date" className="input-field" value={bsTo} onChange={(e) => setBsTo(e.target.value)} />
              </div>
              <div>
                <label className="label">Group By</label>
                <select className="input-field" value={bsGroupBy} onChange={(e) => setBsGroupBy(e.target.value as any)}>
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                </select>
              </div>
              <button className="btn-primary text-sm" onClick={() => fetchBillingSummary(bsFrom, bsTo, bsGroupBy)}>
                Apply
              </button>
              {billingSummary.summary.length > 0 && (
                <button className="btn-secondary text-sm" onClick={() => {
                  const rows = billingSummary.summary.map((g: any) => ({
                    'Period': g.period, 'Tasks': g.taskCount,
                    'Billed (₹)': g.billedAmount.toFixed(2),
                    'Collected (₹)': g.collectedAmount.toFixed(2),
                    'Cost (₹)': g.costIncurred.toFixed(2),
                    'OPE (₹)': g.opeIncurred.toFixed(2),
                    'Margin (%)': g.margin,
                  }));
                  exportExcel(rows, `Billing-Summary-${bsFrom}-${bsTo}`);
                }}>Export Excel</button>
              )}
            </div>
          </div>

          {billingSummaryLoading ? (
            <p className="text-gray-400 text-sm text-center py-10">Loading billing summary...</p>
          ) : billingSummary.summary.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">💰</p>
              <p>No billed tasks in the selected period.</p>
            </div>
          ) : (
            <>
              {/* Totals row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'Total Billed', value: fmt(billingSummary.totals.billedAmount ?? 0), color: 'text-blue-700' },
                  { label: 'Collected', value: fmt(billingSummary.totals.collectedAmount ?? 0), color: 'text-green-700' },
                  { label: 'Cost Incurred', value: fmt(billingSummary.totals.costIncurred ?? 0), color: 'text-orange-600' },
                  { label: 'OPE Incurred', value: fmt(billingSummary.totals.opeIncurred ?? 0), color: 'text-amber-600' },
                  { label: 'Tasks Billed', value: billingSummary.totals.taskCount ?? 0, color: 'text-gray-700' },
                ].map((kpi) => (
                  <div key={kpi.label} className="card text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{kpi.label}</p>
                    <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Billed vs Collected vs Cost</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={billingSummary.summary} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [fmt(v), '']} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="billedAmount" name="Billed" stroke="#3b82f6" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="collectedAmount" name="Collected" stroke="#10b981" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="costIncurred" name="Cost" stroke="#f59e0b" strokeWidth={2} dot strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Period breakdown table */}
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Period</th>
                      <th className="table-header text-right">Tasks</th>
                      <th className="table-header text-right">Billed</th>
                      <th className="table-header text-right">Collected</th>
                      <th className="table-header text-right">Cost</th>
                      <th className="table-header text-right">OPE</th>
                      <th className="table-header text-right">Margin %</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingSummary.summary.map((g: any) => (
                      <>
                        <tr key={g.period} className="hover:bg-gray-50 cursor-pointer" onClick={() => setBsExpanded(bsExpanded === g.period ? null : g.period)}>
                          <td className="table-cell font-semibold text-gray-800">{g.period}</td>
                          <td className="table-cell text-right">{g.taskCount}</td>
                          <td className="table-cell text-right font-medium text-blue-700">{fmt(g.billedAmount)}</td>
                          <td className="table-cell text-right text-green-700">{fmt(g.collectedAmount)}</td>
                          <td className="table-cell text-right text-orange-600">{fmt(g.costIncurred)}</td>
                          <td className="table-cell text-right text-amber-600">{fmt(g.opeIncurred)}</td>
                          <td className={`table-cell text-right font-bold ${g.margin >= 50 ? 'text-green-600' : g.margin >= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {g.margin}%
                          </td>
                          <td className="table-cell text-center text-gray-400 text-xs">{bsExpanded === g.period ? '▲' : '▼'}</td>
                        </tr>
                        {bsExpanded === g.period && g.billedTasks?.map((t: any) => (
                          <tr key={t.taskId} className="bg-blue-50/40 text-xs">
                            <td className="table-cell pl-8 font-mono text-blue-700">{t.taskId}</td>
                            <td className="table-cell text-gray-600" colSpan={1}>{t.taskName}</td>
                            <td className="table-cell text-right">{fmt(t.billedAmount)}</td>
                            <td className="table-cell text-right text-green-600">{fmt(t.collected)}</td>
                            <td className="table-cell text-right text-orange-500">{fmt(t.costIncurred)}</td>
                            <td className="table-cell text-right text-amber-500">{fmt(t.opeIncurred)}</td>
                            <td className={`table-cell text-right font-semibold ${t.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {fmt(t.profit)}
                            </td>
                            <td className="table-cell text-gray-400">{t.client?.clientName}</td>
                          </tr>
                        ))}
                      </>
                    ))}
                    <tr className="bg-gray-100 font-bold">
                      <td className="table-cell">Total</td>
                      <td className="table-cell text-right">{billingSummary.totals.taskCount}</td>
                      <td className="table-cell text-right text-blue-700">{fmt(billingSummary.totals.billedAmount ?? 0)}</td>
                      <td className="table-cell text-right text-green-700">{fmt(billingSummary.totals.collectedAmount ?? 0)}</td>
                      <td className="table-cell text-right text-orange-600">{fmt(billingSummary.totals.costIncurred ?? 0)}</td>
                      <td className="table-cell text-right text-amber-600">{fmt(billingSummary.totals.opeIncurred ?? 0)}</td>
                      <td className="table-cell text-right">
                        {billingSummary.totals.billedAmount > 0
                          ? `${Math.round(((billingSummary.totals.billedAmount - billingSummary.totals.costIncurred - billingSummary.totals.opeIncurred) / billingSummary.totals.billedAmount) * 100)}%`
                          : '—'}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Reports: React.FC = () => {
  const { isAdmin, isPartner } = useAuth();
  if (!isAdmin && !isPartner) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-4xl">🔒</div>
        <h2 className="text-xl font-semibold text-gray-700">Access Restricted</h2>
        <p className="text-gray-500 text-sm">Reports are available to Partners and Administrators only.</p>
      </div>
    );
  }
  return <ReportsContent />;
};

export default Reports;
