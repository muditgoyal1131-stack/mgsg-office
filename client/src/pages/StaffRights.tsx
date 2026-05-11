import React from 'react';

interface RightRow {
  feature: string;
  admin: string;
  hr: string;
  partner: string;
  it: string;
  staff: string;
}

const YES = '✅';
const NO = '❌';
const LIMITED = '⚠️ Limited';

const RIGHTS: RightRow[] = [
  { feature: 'Dashboard',            admin: YES,             hr: YES,            partner: YES,           it: YES,             staff: YES },
  { feature: 'Tasks (view/manage)',  admin: YES,             hr: YES,            partner: YES,           it: YES,             staff: YES },
  { feature: 'Timesheets',           admin: YES,             hr: YES,            partner: YES,           it: YES,             staff: YES },
  { feature: 'Clients (search)',     admin: YES,             hr: YES,            partner: YES,           it: NO,              staff: NO },
  { feature: 'Reports',              admin: YES,             hr: YES,            partner: YES,           it: YES,             staff: YES },
  { feature: 'UDIN Tracker',         admin: YES,             hr: YES,            partner: YES,           it: YES,             staff: YES },
  { feature: 'Reimbursements',       admin: YES + ' Approve',hr: YES + ' Approve',partner: YES + ' Submit',it: YES + ' Submit',staff: YES + ' Submit' },
  { feature: 'Tickets',              admin: YES + ' Manage', hr: YES,            partner: YES,           it: YES + ' Resolve',staff: YES + ' Raise' },
  { feature: 'Leaves & Attendance',  admin: YES,             hr: YES,            partner: YES,           it: YES,             staff: YES },
  { feature: 'Invoices',             admin: YES + ' All PCs',hr: YES + ' All PCs',partner: LIMITED + ' Assigned PCs only', it: NO, staff: NO },
  { feature: 'Leads & Tenders',      admin: YES,             hr: NO,             partner: YES,           it: NO,              staff: NO },
  { feature: 'Announcements',        admin: YES + ' Create', hr: YES + ' Create',partner: YES + ' Create',it: YES,            staff: YES },
  { feature: 'IT Assets',            admin: YES,             hr: YES,            partner: YES,           it: YES,             staff: YES },
  { feature: 'Staff Management',     admin: YES + ' Full',   hr: YES + ' Add/Disable', partner: NO,     it: NO,              staff: NO },
  { feature: 'Audit Log',            admin: YES,             hr: YES,            partner: NO,            it: NO,              staff: NO },
  { feature: 'Masters',              admin: YES,             hr: YES,            partner: NO,            it: NO,              staff: NO },
  { feature: 'Add Staff',            admin: YES,             hr: YES,            partner: NO,            it: NO,              staff: NO },
  { feature: 'Edit Staff & Set Cost', admin: YES,             hr: YES,            partner: NO,            it: NO,              staff: NO },
  { feature: 'Invoice Settings',     admin: YES,             hr: NO,             partner: NO,            it: NO,              staff: NO },
  { feature: 'Delete Staff',         admin: YES,             hr: NO,             partner: NO,            it: NO,              staff: NO },
  { feature: 'Delete Client/Invoice',admin: YES,             hr: NO,             partner: NO,            it: NO,              staff: NO },
];

const cell = (value: string) => {
  if (value.startsWith('✅')) {
    return <span className="text-green-700 font-medium text-xs">{value}</span>;
  }
  if (value.startsWith('❌')) {
    return <span className="text-red-400 text-xs">{value}</span>;
  }
  return <span className="text-yellow-700 text-xs">{value}</span>;
};

const StaffRights: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium">📋 Role Permissions Overview</p>
        <p className="text-xs text-blue-600 mt-1">
          This table summarises which roles can access each feature. Admins have full access.
          HR manages staff (including editing costs), approvals, and all invoices. Partners can access invoices
          only for their assigned <strong>Profit Centres</strong> (managed under Invoices → Profit Centres tab).
          IT resolves tickets. Staff have basic access.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="table-header text-left">Feature / Module</th>
              <th className="table-header text-center">
                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold">Admin</span>
              </th>
              <th className="table-header text-center">
                <span className="bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full text-xs font-semibold">HR</span>
              </th>
              <th className="table-header text-center">
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">Partner</span>
              </th>
              <th className="table-header text-center">
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-semibold">IT</span>
              </th>
              <th className="table-header text-center">
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-semibold">Staff</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {RIGHTS.map((row, i) => (
              <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="table-cell font-medium text-gray-800">{row.feature}</td>
                <td className="table-cell text-center">{cell(row.admin)}</td>
                <td className="table-cell text-center">{cell(row.hr)}</td>
                <td className="table-cell text-center">{cell(row.partner)}</td>
                <td className="table-cell text-center">{cell(row.it)}</td>
                <td className="table-cell text-center">{cell(row.staff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
        <span>✅ — Full access</span>
        <span>⚠️ — Partial / limited access</span>
        <span>❌ — No access</span>
      </div>
    </div>
  );
};

export default StaffRights;
