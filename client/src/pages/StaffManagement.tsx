import React, { useState } from 'react';
import Admin from './Admin';
import StaffDocuments from './StaffDocuments';
import StaffKPI from './StaffKPI';

type Tab = 'staff' | 'documents' | 'kpis';

const StaffManagement: React.FC = () => {
  const [tab, setTab] = useState<Tab>('staff');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'staff',     label: '⚙️ Staff List' },
    { key: 'documents', label: '🗃️ Documents' },
    { key: 'kpis',      label: '🎯 KPIs' },
  ];

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
        <p className="text-sm text-gray-500 mt-1">Manage staff, documents, and performance KPIs</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'staff'     && <Admin />}
      {tab === 'documents' && <StaffDocuments />}
      {tab === 'kpis'      && <StaffKPI />}
    </div>
  );
};

export default StaffManagement;
