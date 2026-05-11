import React, { useEffect, useState, useCallback } from 'react';
import {
  getProfitCentres, getStaff,
  assignPartnerToProfitCentre, removePartnerFromProfitCentre,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

interface StaffMini { id: number; staffName: string; email: string; isPartner: boolean; }
interface AccessEntry { id: number; staffId: number; staff: StaffMini; }
interface ProfitCentre {
  id: number; name: string;
  staffAccess: AccessEntry[];
  _count: { invoices: number };
}

const ProfitCentreAccess: React.FC = () => {
  const { isAdmin, isHR } = useAuth();
  const canManage = isAdmin || isHR;

  const [profitCentres, setProfitCentres] = useState<ProfitCentre[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ pcId: number; staffId: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pcRes, staffRes] = await Promise.all([getProfitCentres(), getStaff()]);
      setProfitCentres(pcRes.data || []);
      // Only show partners in the dropdown (non-partner staff don't need PC access)
      setAllStaff((staffRes.data || []).filter((s: any) => s.isPartner && s.isActive));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (pcId: number) => {
    if (!adding || adding.pcId !== pcId || !adding.staffId) return;
    setError('');
    try {
      await assignPartnerToProfitCentre(pcId, Number(adding.staffId));
      setAdding(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error assigning partner');
    }
  };

  const handleRemove = async (pcId: number, staffId: number, name: string) => {
    if (!window.confirm(`Remove ${name} from this profit centre?`)) return;
    try {
      await removePartnerFromProfitCentre(pcId, staffId);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error removing partner');
    }
  };

  if (loading) return <p className="text-gray-400 text-sm py-8 text-center">Loading profit centres...</p>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium">🏦 Profit Centre Invoice Access</p>
        <p className="text-xs text-blue-600 mt-1">
          Each invoice is linked to a profit centre (auto-set from its task). Partners can only see invoices
          for profit centres they are assigned to. Admin and HR always see all invoices.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      <div className="space-y-3">
        {profitCentres.map((pc) => {
          const isOpen = expanded === pc.id;
          const assignedIds = new Set(pc.staffAccess.map((a) => a.staffId));
          const available = allStaff.filter((s) => !assignedIds.has(s.id));

          return (
            <div key={pc.id} className="card border border-gray-200 rounded-xl overflow-hidden">
              {/* Header row */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(isOpen ? null : pc.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🏦</span>
                  <div>
                    <p className="font-semibold text-gray-900">{pc.name}</p>
                    <p className="text-xs text-gray-400">
                      {pc._count.invoices} invoice{pc._count.invoices !== 1 ? 's' : ''} ·{' '}
                      {pc.staffAccess.length === 0
                        ? 'No partners assigned'
                        : `${pc.staffAccess.length} partner${pc.staffAccess.length > 1 ? 's' : ''} assigned`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pc.staffAccess.length > 0 && (
                    <div className="flex -space-x-1">
                      {pc.staffAccess.slice(0, 4).map((a) => (
                        <div key={a.id} title={a.staff.staffName}
                          className="w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-xs font-bold text-blue-700">
                          {a.staff.staffName.charAt(0)}
                        </div>
                      ))}
                    </div>
                  )}
                  <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/50">
                  {/* Current assignments */}
                  {pc.staffAccess.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      No partners assigned — partners cannot see any invoices in this profit centre.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned Partners</p>
                      {pc.staffAccess.map((a) => (
                        <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{a.staff.staffName}</span>
                            <span className="text-xs text-gray-400 ml-2">{a.staff.email}</span>
                          </div>
                          {canManage && (
                            <button
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                              onClick={() => handleRemove(pc.id, a.staffId, a.staff.staffName)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add partner */}
                  {canManage && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assign a Partner</p>
                      {available.length === 0 ? (
                        <p className="text-xs text-gray-400">All active partners are already assigned.</p>
                      ) : (
                        <div className="flex gap-2">
                          <select
                            className="input-field flex-1 text-sm"
                            value={adding?.pcId === pc.id ? adding.staffId : ''}
                            onChange={(e) => setAdding({ pcId: pc.id, staffId: e.target.value })}
                          >
                            <option value="">— Select partner —</option>
                            {available.map((s) => (
                              <option key={s.id} value={s.id}>{s.staffName}</option>
                            ))}
                          </select>
                          <button
                            className="btn-primary text-sm px-4"
                            disabled={!adding || adding.pcId !== pc.id || !adding.staffId}
                            onClick={() => handleAssign(pc.id)}
                          >
                            Assign
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {profitCentres.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🏦</p>
          <p className="text-sm">No profit centres found.</p>
          <p className="text-xs mt-1">Add profit centres via <strong>Masters → Profit Centres</strong> first.</p>
        </div>
      )}
    </div>
  );
};

export default ProfitCentreAccess;
