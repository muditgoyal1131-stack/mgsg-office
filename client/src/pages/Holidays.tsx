import React, { useCallback, useEffect, useState } from 'react';
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from '../api';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type HolidayType = 'NATIONAL' | 'REGIONAL' | 'FIRM';

interface Holiday {
  id: number;
  date: string;
  name: string;
  type: HolidayType;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getMonthIndex(dateStr: string): number {
  return new Date(dateStr).getMonth();
}

function getMonthName(dateStr: string): string {
  return MONTH_NAMES[getMonthIndex(dateStr)];
}

const TYPE_BADGE: Record<HolidayType, string> = {
  NATIONAL: 'bg-blue-100 text-blue-800',
  REGIONAL: 'bg-green-100 text-green-800',
  FIRM:     'bg-orange-100 text-orange-800',
};

// ─── Add / Edit Form ──────────────────────────────────────────────────────────

interface HolidayFormProps {
  initial?: { date: string; name: string; type: HolidayType };
  onSubmit: (data: { date: string; name: string; type: HolidayType }) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  compact?: boolean;
}

const HolidayForm: React.FC<HolidayFormProps> = ({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Add',
  compact = false,
}) => {
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<HolidayType>(initial?.type ?? 'NATIONAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) { setError('Date and name are required.'); return; }
    setError(''); setSaving(true);
    try {
      await onSubmit({ date, name: name.trim(), type });
      if (!initial) { setDate(''); setName(''); setType('NATIONAL'); }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save holiday.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? 'flex flex-wrap gap-2 items-end' : 'flex flex-wrap gap-2 items-end'}>
      <div className={compact ? '' : 'flex-none'}>
        <label className="label block mb-1">Date</label>
        <input
          type="date"
          className="input-field"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="label block mb-1">Holiday Name</label>
        <input
          type="text"
          className="input-field w-full"
          placeholder="e.g. Republic Day"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex-none">
        <label className="label block mb-1">Type</label>
        <select
          className="input-field"
          value={type}
          onChange={(e) => setType(e.target.value as HolidayType)}
        >
          <option value="NATIONAL">National</option>
          <option value="REGIONAL">Regional</option>
          <option value="FIRM">Firm</option>
        </select>
      </div>
      <div className="flex gap-2 items-end pb-0.5">
        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="w-full text-red-600 text-sm mt-1">{error}</p>}
    </form>
  );
};

// ─── Holidays Page ─────────────────────────────────────────────────────────────

const Holidays: React.FC = () => {
  const { isAdmin, isHR } = useAuth();
  const canEdit = isAdmin || isHR;

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<number | null>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getHolidays(year);
      const sorted: Holiday[] = [...(res.data as Holiday[])].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setHolidays(sorted);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load holidays.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  // ─── Add ────────────────────────────────────────────────────────────────────
  const handleAdd = async (data: { date: string; name: string; type: HolidayType }) => {
    await createHoliday(data);
    await fetchHolidays();
  };

  // ─── Edit ───────────────────────────────────────────────────────────────────
  const handleEdit = async (data: { date: string; name: string; type: HolidayType }) => {
    if (editId === null) return;
    await updateHoliday(editId, data);
    setEditId(null);
    await fetchHolidays();
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete holiday "${name}"?`)) return;
    try {
      await deleteHoliday(id);
      await fetchHolidays();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete holiday.');
    }
  };

  // ─── Summary counts ─────────────────────────────────────────────────────────
  const counts: Record<HolidayType, number> = { NATIONAL: 0, REGIONAL: 0, FIRM: 0 };
  holidays.forEach((h) => { counts[h.type]++; });

  // ─── Group by month ─────────────────────────────────────────────────────────
  const grouped: { monthLabel: string; items: Holiday[] }[] = [];
  let lastMonth = -1;
  holidays.forEach((h) => {
    const m = getMonthIndex(h.date);
    if (m !== lastMonth) {
      grouped.push({ monthLabel: MONTH_NAMES[m], items: [] });
      lastMonth = m;
    }
    grouped[grouped.length - 1].items.push(h);
  });

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Holiday Master</h2>
          <p className="text-sm text-gray-500 mt-1">Official holidays observed by the firm</p>
        </div>
        {/* Year Selector */}
        <div className="flex items-center gap-2">
          <label className="label text-sm font-medium text-gray-700">Year</label>
          <select
            className="input-field"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Badges */}
      <div className="flex flex-wrap gap-3">
        {(['NATIONAL', 'REGIONAL', 'FIRM'] as HolidayType[]).map((t) => (
          <span
            key={t}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${TYPE_BADGE[t]}`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
            <span className="bg-white bg-opacity-60 rounded-full px-1.5 py-0.5 font-bold text-[11px]">
              {counts[t]}
            </span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
          Total
          <span className="bg-white bg-opacity-60 rounded-full px-1.5 py-0.5 font-bold text-[11px]">
            {holidays.length}
          </span>
        </span>
      </div>

      {/* Add Form — HR/Admin only */}
      {canEdit && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Holiday</h3>
          <HolidayForm onSubmit={handleAdd} submitLabel="+ Add Holiday" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="card text-center py-10 text-gray-400 text-sm">Loading holidays…</div>
      ) : holidays.length === 0 ? (
        <div className="card text-center py-10 text-gray-400 text-sm">
          No holidays found for {year}.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Date</th>
                <th className="table-header">Holiday</th>
                <th className="table-header">Type</th>
                {canEdit && <th className="table-header">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ monthLabel, items }) => (
                <React.Fragment key={monthLabel}>
                  {/* Month group header row */}
                  <tr>
                    <td
                      colSpan={canEdit ? 4 : 3}
                      className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-t border-b border-gray-200"
                    >
                      {monthLabel}
                    </td>
                  </tr>
                  {items.map((holiday) => (
                    <tr key={holiday.id} className="hover:bg-gray-50">
                      {editId === holiday.id ? (
                        /* Inline edit row */
                        <td colSpan={canEdit ? 4 : 3} className="table-cell py-3">
                          <HolidayForm
                            initial={{ date: holiday.date, name: holiday.name, type: holiday.type }}
                            onSubmit={handleEdit}
                            onCancel={() => setEditId(null)}
                            submitLabel="Save"
                            compact
                          />
                        </td>
                      ) : (
                        <>
                          <td className="table-cell whitespace-nowrap">
                            <span className="font-medium text-gray-800">{formatDate(holiday.date)}</span>
                          </td>
                          <td className="table-cell font-medium text-gray-900">{holiday.name}</td>
                          <td className="table-cell">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${TYPE_BADGE[holiday.type]}`}
                            >
                              {holiday.type.charAt(0) + holiday.type.slice(1).toLowerCase()}
                            </span>
                          </td>
                          {canEdit && (
                            <td className="table-cell">
                              <div className="flex gap-3">
                                <button
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                  onClick={() => { setEditId(holiday.id); setError(''); }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="text-red-600 hover:text-red-800 text-xs font-medium"
                                  onClick={() => handleDelete(holiday.id, holiday.name)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Holidays;
