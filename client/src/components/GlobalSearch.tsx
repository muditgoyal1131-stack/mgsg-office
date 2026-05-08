import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

interface SearchResults {
  tasks:    { id: number; taskId: string; taskName: string; status: string; client?: { clientName: string } }[];
  clients:  { id: number; clientCode: string; clientName: string }[];
  staff:    { id: number; staffName: string; isPartner: boolean; email: string }[];
  subtasks: { id: number; subTaskNumber: string; name: string; status: string; task?: { taskId: string; taskName: string; client?: { clientName: string } } }[];
  tickets:  { id: number; ticketNumber: string; title: string; status: string; priority: string; raisedBy?: { staffName: string } }[];
}

interface Props {
  onClose: () => void;
}

const EMPTY: SearchResults = { tasks: [], clients: [], staff: [], subtasks: [], tickets: [] };

const GlobalSearch: React.FC<Props> = ({ onClose }) => {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults(EMPTY); return; }
    setLoading(true);
    try {
      const res = await api.get('/search', { params: { q } });
      setResults({ ...EMPTY, ...res.data });
      setSelected(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  const statusColor = (s: string) => {
    if (s === 'OPEN')        return 'bg-green-100 text-green-700';
    if (s === 'CLOSED')      return 'bg-gray-100 text-gray-600';
    if (s === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
    if (s === 'RESOLVED')    return 'bg-teal-100 text-teal-700';
    return 'bg-gray-100 text-gray-500';
  };

  type Item = { type: string; label: string; sub: string; meta: string; id: number; status: string };

  const allItems: Item[] = [
    ...results.tasks.map((t) => ({
      type: 'task', label: t.taskId, sub: t.taskName,
      meta: t.client?.clientName ?? '', id: t.id, status: t.status,
    })),
    ...results.subtasks.map((s) => ({
      type: 'subtask', label: s.subTaskNumber, sub: s.name,
      meta: s.task ? `${s.task.taskId} · ${s.task.client?.clientName ?? ''}` : '',
      id: s.id, status: s.status,
    })),
    ...results.tickets.map((t) => ({
      type: 'ticket', label: t.ticketNumber, sub: t.title,
      meta: t.raisedBy?.staffName ?? '',
      id: t.id, status: t.status,
    })),
    ...results.clients.map((c) => ({
      type: 'client', label: c.clientCode, sub: c.clientName, meta: '', id: c.id, status: '',
    })),
    ...results.staff.map((s) => ({
      type: 'staff', label: s.staffName, sub: s.email,
      meta: s.isPartner ? 'Partner' : 'Staff', id: s.id, status: '',
    })),
  ];

  const handleSelect = (item: Item) => {
    if (item.type === 'task' || item.type === 'subtask') navigate('/tasks');
    if (item.type === 'ticket')  navigate('/tickets');
    if (item.type === 'client')  navigate('/clients');
    if (item.type === 'staff')   navigate('/staff-management');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, allItems.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && allItems[selected]) handleSelect(allItems[selected]);
    if (e.key === 'Escape') onClose();
  };

  const typeIcon:  Record<string, string> = { task: '📋', subtask: '🔖', ticket: '🎫', client: '🏢', staff: '👤' };
  const typeLabel: Record<string, string> = { task: 'Task', subtask: 'Sub-Task', ticket: 'Ticket', client: 'Client', staff: 'Staff' };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <span className="text-gray-400 text-lg">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 text-base outline-none placeholder-gray-400"
            placeholder="Search tasks, sub-tasks, tickets, clients, staff..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <span className="text-xs text-gray-400 animate-pulse">Searching...</span>}
          <kbd className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Esc</kbd>
        </div>

        {query.length >= 2 && (
          <div className="max-h-96 overflow-y-auto">
            {allItems.length === 0 && !loading && (
              <p className="text-center text-gray-400 text-sm py-8">No results found for "{query}"</p>
            )}
            {allItems.length > 0 && (
              <ul className="py-2">
                {allItems.map((item, i) => (
                  <li
                    key={`${item.type}-${item.id}`}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      i === selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className="text-base shrink-0">{typeIcon[item.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{item.label}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">{typeLabel[item.type]}</span>
                        {item.status && (
                          <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${statusColor(item.status)}`}>
                            {item.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{item.sub}{item.meta ? ` · ${item.meta}` : ''}</p>
                    </div>
                    <span className="text-gray-300 text-xs shrink-0">↵</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!query && (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">
            Type at least 2 characters to search
            <div className="mt-3 flex items-center justify-center gap-6 text-xs text-gray-300">
              <span>📋 Tasks</span><span>🔖 Sub-Tasks</span><span>🎫 Tickets</span><span>🏢 Clients</span><span>👤 Staff</span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-gray-300">
              <span>↑↓ Navigate</span><span>↵ Open</span><span>Esc Close</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalSearch;
