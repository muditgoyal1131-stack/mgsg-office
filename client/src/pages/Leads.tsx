import React, { useEffect, useState, useCallback } from 'react';
import {
  getLeads, getLead, getLeadStats, createLead, updateLead, deleteLead,
  addLeadNote, deleteLeadNote, convertLeadToClient, getClients, getStaff,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStage    = 'NEW' | 'CONTACTED' | 'PROPOSAL_SENT' | 'NEGOTIATING' | 'WON' | 'LOST';
type LeadSource   = 'REFERRAL' | 'COLD_OUTREACH' | 'WEBSITE' | 'EVENT' | 'EXISTING_CLIENT' | 'OTHER';
type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH';

interface LeadNote {
  id: number;
  note: string;
  authorName: string;
  createdAt: string;
}

interface Lead {
  id: number;
  leadName: string;
  contactPerson: string;
  phone?: string;
  email?: string;
  source: LeadSource;
  referredById?: number;
  referredBy?: { id: number; clientName: string } | null;
  estimatedFee?: number | null;
  servicesInterested?: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  assignedToId?: number;
  assignedTo?: { id: number; staffName: string } | null;
  expectedCloseDate?: string | null;
  nextFollowUpDate?: string | null;
  lostReason?: string | null;
  wonFee?: number | null;
  convertedClientId?: number | null;
  convertedClient?: { id: number; clientName: string; clientCode: string } | null;
  notes: LeadNote[];
  createdBy: { id: number; staffName: string };
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalLeads: number;
  activeLeads: number;
  pipelineValue: number;
  wonThisMonth: number;
  totalWonValue: number;
  followUpToday: number;
  stageCounts: Record<LeadStage, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: { key: LeadStage; label: string; color: string; bg: string }[] = [
  { key: 'NEW',           label: 'New',           color: 'text-gray-700',  bg: 'bg-gray-100'   },
  { key: 'CONTACTED',     label: 'Contacted',     color: 'text-blue-700',  bg: 'bg-blue-100'   },
  { key: 'PROPOSAL_SENT', label: 'Proposal Sent', color: 'text-purple-700',bg: 'bg-purple-100' },
  { key: 'NEGOTIATING',   label: 'Negotiating',   color: 'text-yellow-700',bg: 'bg-yellow-100' },
  { key: 'WON',           label: 'Won',           color: 'text-green-700', bg: 'bg-green-100'  },
  { key: 'LOST',          label: 'Lost',          color: 'text-red-700',   bg: 'bg-red-100'    },
];

const SOURCE_LABELS: Record<LeadSource, string> = {
  REFERRAL: 'Referral', COLD_OUTREACH: 'Cold Outreach', WEBSITE: 'Website',
  EVENT: 'Event', EXISTING_CLIENT: 'Existing Client', OTHER: 'Other',
};

const PRIORITY_STYLES: Record<LeadPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-red-100 text-red-700',
};

const emptyForm = {
  leadName: '', contactPerson: '', phone: '', email: '',
  source: 'REFERRAL' as LeadSource, referredById: '',
  estimatedFee: '', servicesInterested: '',
  stage: 'NEW' as LeadStage, priority: 'MEDIUM' as LeadPriority,
  assignedToId: '', expectedCloseDate: '', nextFollowUpDate: '',
  lostReason: '', wonFee: '',
};

function fmt(n?: number | null) {
  if (n == null) return '—';
  return '₹' + Number(n).toLocaleString('en-IN');
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── StageBadge ───────────────────────────────────────────────────────────────

const StageBadge: React.FC<{ stage: LeadStage }> = ({ stage }) => {
  const s = STAGES.find((x) => x.key === stage)!;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>
      {s.label}
    </span>
  );
};

// ─── LeadFormModal ────────────────────────────────────────────────────────────

const LeadFormModal: React.FC<{
  initial?: Lead | null;
  clients: { id: number; clientName: string }[];
  partners: { id: number; staffName: string }[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}> = ({ initial, clients, partners, onSave, onClose }) => {
  const [form, setForm] = useState(
    initial
      ? {
          leadName: initial.leadName,
          contactPerson: initial.contactPerson,
          phone: initial.phone || '',
          email: initial.email || '',
          source: initial.source,
          referredById: initial.referredById ? String(initial.referredById) : '',
          estimatedFee: initial.estimatedFee != null ? String(initial.estimatedFee) : '',
          servicesInterested: initial.servicesInterested || '',
          stage: initial.stage,
          priority: initial.priority,
          assignedToId: initial.assignedToId ? String(initial.assignedToId) : '',
          expectedCloseDate: initial.expectedCloseDate ? initial.expectedCloseDate.slice(0, 10) : '',
          nextFollowUpDate: initial.nextFollowUpDate ? initial.nextFollowUpDate.slice(0, 10) : '',
          lostReason: initial.lostReason || '',
          wonFee: initial.wonFee != null ? String(initial.wonFee) : '',
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.leadName.trim() || !form.contactPerson.trim()) {
      setError('Lead name and contact person are required');
      return;
    }
    setSaving(true); setError('');
    try {
      await onSave({
        ...form,
        referredById: form.referredById || null,
        assignedToId: form.assignedToId || null,
        estimatedFee: form.estimatedFee || null,
        wonFee: form.wonFee || null,
        expectedCloseDate: form.expectedCloseDate || null,
        nextFollowUpDate: form.nextFollowUpDate || null,
        lostReason: form.lostReason || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving lead');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">{initial ? 'Edit Lead' : 'New Lead'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Lead / Company Name *</label>
              <input className="input-field" value={form.leadName} onChange={(e) => set('leadName', e.target.value)} required />
            </div>
            <div>
              <label className="label">Contact Person *</label>
              <input className="input-field" value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phone</label>
              <input className="input-field" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input-field" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Source</label>
              <select className="input-field" value={form.source} onChange={(e) => set('source', e.target.value as LeadSource)}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {(form.source === 'REFERRAL' || form.source === 'EXISTING_CLIENT') && (
              <div>
                <label className="label">Referred by Client</label>
                <select className="input-field" value={form.referredById} onChange={(e) => set('referredById', e.target.value)}>
                  <option value="">— None —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.clientName}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Stage</label>
              <select className="input-field" value={form.stage} onChange={(e) => set('stage', e.target.value as LeadStage)}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input-field" value={form.priority} onChange={(e) => set('priority', e.target.value as LeadPriority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Estimated Fee (₹)</label>
              <input type="number" className="input-field" value={form.estimatedFee}
                onChange={(e) => set('estimatedFee', e.target.value)} />
            </div>
            <div>
              <label className="label">Assigned Partner</label>
              <select className="input-field" value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)}>
                <option value="">— Unassigned —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.staffName}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Services Interested In</label>
            <input className="input-field" placeholder="e.g. Audit, Tax, Advisory"
              value={form.servicesInterested} onChange={(e) => set('servicesInterested', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Expected Close Date</label>
              <input type="date" className="input-field" value={form.expectedCloseDate}
                onChange={(e) => set('expectedCloseDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Next Follow-up Date</label>
              <input type="date" className="input-field" value={form.nextFollowUpDate}
                onChange={(e) => set('nextFollowUpDate', e.target.value)} />
            </div>
          </div>

          {form.stage === 'WON' && (
            <div>
              <label className="label">Won Fee (₹)</label>
              <input type="number" className="input-field" value={form.wonFee}
                onChange={(e) => set('wonFee', e.target.value)} />
            </div>
          )}

          {form.stage === 'LOST' && (
            <div>
              <label className="label">Lost Reason</label>
              <input className="input-field" value={form.lostReason}
                onChange={(e) => set('lostReason', e.target.value)} />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── LeadDetailModal ──────────────────────────────────────────────────────────

const LeadDetailModal: React.FC<{
  lead: Lead;
  canConvert: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddNote: (note: string) => Promise<void>;
  onDeleteNote: (noteId: number) => Promise<void>;
  onConvert: () => void;
  onStageChange: (stage: LeadStage) => Promise<void>;
  onClose: () => void;
}> = ({ lead, canConvert, onEdit, onDelete, onAddNote, onDeleteNote, onConvert, onStageChange, onClose }) => {
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setAddingNote(true);
    await onAddNote(newNote.trim());
    setNewNote('');
    setAddingNote(false);
  };

  const handleStageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStageChanging(true);
    await onStageChange(e.target.value as LeadStage);
    setStageChanging(false);
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const followUp = lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate) : null;
  const followUpOverdue = followUp && followUp < today && !['WON','LOST'].includes(lead.stage);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-gray-900 truncate">{lead.leadName}</h3>
              <StageBadge stage={lead.stage} />
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[lead.priority]}`}>
                {lead.priority}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{lead.contactPerson}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="btn-secondary text-xs" onClick={onEdit}>Edit</button>
            <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={onDelete}>Delete</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-2">✕</button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: details */}
          <div className="md:col-span-2 space-y-4">
            {/* Quick stage change */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Move to stage:</label>
              <select className="input-field text-sm flex-1" value={lead.stage}
                onChange={handleStageChange} disabled={stageChanging}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {lead.stage === 'WON' && canConvert && !lead.convertedClientId && (
                <button className="btn-primary text-xs whitespace-nowrap" onClick={onConvert}>
                  → Convert to Client
                </button>
              )}
              {lead.convertedClient && (
                <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full whitespace-nowrap">
                  ✓ Client: {lead.convertedClient.clientName}
                </span>
              )}
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Phone', lead.phone || '—'],
                ['Email', lead.email || '—'],
                ['Source', SOURCE_LABELS[lead.source]],
                ['Referred By', lead.referredBy?.clientName || '—'],
                ['Services', lead.servicesInterested || '—'],
                ['Assigned To', lead.assignedTo?.staffName || '—'],
                ['Estimated Fee', fmt(lead.estimatedFee)],
                ['Won Fee', lead.wonFee != null ? fmt(lead.wonFee) : '—'],
                ['Expected Close', fmtDate(lead.expectedCloseDate)],
                ['Added By', lead.createdBy.staffName],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="font-medium text-gray-800 break-all">{value}</p>
                </div>
              ))}
            </div>

            {/* Follow-up banner */}
            {followUpOverdue && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-700">
                ⚠️ Follow-up was due on {fmtDate(lead.nextFollowUpDate)}
              </div>
            )}
            {lead.nextFollowUpDate && !followUpOverdue && !['WON','LOST'].includes(lead.stage) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                📅 Follow-up scheduled: {fmtDate(lead.nextFollowUpDate)}
              </div>
            )}

            {lead.lostReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                Lost reason: {lead.lostReason}
              </div>
            )}
          </div>

          {/* Right: notes */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-gray-700">Activity Log</h4>
            <form onSubmit={handleAddNote} className="flex flex-col gap-2">
              <textarea
                className="input-field text-sm resize-none"
                rows={3}
                placeholder="Add a note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button type="submit" className="btn-primary text-xs self-end" disabled={addingNote}>
                {addingNote ? 'Adding…' : '+ Add Note'}
              </button>
            </form>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {lead.notes.length === 0 && (
                <p className="text-xs text-gray-400">No notes yet.</p>
              )}
              {lead.notes.map((n) => (
                <div key={n.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs group relative">
                  <p className="text-gray-800 whitespace-pre-wrap">{n.note}</p>
                  <p className="text-gray-400 mt-1">
                    {n.authorName} · {new Date(n.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </p>
                  <button
                    className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    onClick={() => onDeleteNote(n.id)}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ConvertToClientModal ─────────────────────────────────────────────────────

const ConvertToClientModal: React.FC<{
  lead: Lead;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}> = ({ lead, onSave, onClose }) => {
  const [form, setForm] = useState({
    clientCode: '',
    clientName: lead.leadName,
    legalName: '',
    gstin: '',
    address: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientCode.trim() || !form.clientName.trim()) {
      setError('Client code and name are required');
      return;
    }
    setSaving(true); setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error converting lead');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Convert Lead to Client</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div>
            <label className="label">Client Code *</label>
            <input className="input-field" value={form.clientCode}
              onChange={(e) => setForm((f) => ({ ...f, clientCode: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Client Name *</label>
            <input className="input-field" value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Legal Name</label>
            <input className="input-field" value={form.legalName}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input className="input-field" value={form.gstin}
              onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} />
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input-field" value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Converting…' : 'Convert to Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Leads Page ──────────────────────────────────────────────────────────

const Leads: React.FC = () => {
  const { isAdmin, isPartner, user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [clients, setClients] = useState<{ id: number; clientName: string }[]>([]);
  const [partners, setPartners] = useState<{ id: number; staffName: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [stageFilter, setStageFilter] = useState<LeadStage | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | ''>('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'kanban'>('table');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);

  // Redirect if not partner/admin
  useEffect(() => {
    if (!loading && !isAdmin && !isPartner) navigate('/dashboard');
  }, [loading, isAdmin, isPartner, navigate]);

  const fetchAll = useCallback(async () => {
    try {
      const [leadsRes, statsRes, clientsRes, staffRes] = await Promise.all([
        getLeads(),
        getLeadStats(),
        getClients(),
        getStaff(),
      ]);
      setLeads(leadsRes.data);
      setStats(statsRes.data);
      setClients(clientsRes.data);
      setPartners(staffRes.data.filter((s: any) => s.isPartner && s.isActive));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Refresh detail modal when leads refresh
  useEffect(() => {
    if (detailLead) {
      const updated = leads.find((l) => l.id === detailLead.id);
      if (updated) setDetailLead(updated);
    }
  }, [leads]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const handleCreate = async (data: any) => {
    await createLead(data);
    await fetchAll();
  };

  const handleEdit = async (data: any) => {
    await updateLead(editingLead!.id, data);
    await fetchAll();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this lead?')) return;
    await deleteLead(id);
    setDetailLead(null);
    await fetchAll();
  };

  const handleAddNote = async (note: string) => {
    await addLeadNote(detailLead!.id, { note });
    await fetchAll();
  };

  const handleDeleteNote = async (noteId: number) => {
    await deleteLeadNote(noteId);
    await fetchAll();
  };

  const handleStageChange = async (id: number, stage: LeadStage) => {
    await updateLead(id, { stage });
    await fetchAll();
  };

  const handleConvert = async (data: any) => {
    await convertLeadToClient(convertLead!.id, data);
    setConvertLead(null);
    await fetchAll();
  };

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtered = leads.filter((l) => {
    if (stageFilter    && l.stage    !== stageFilter)    return false;
    if (priorityFilter && l.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.leadName.toLowerCase().includes(q) &&
        !l.contactPerson.toLowerCase().includes(q) &&
        !(l.email || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // ── Follow-up due today ──────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today.getTime() + 86400000);

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lead Generation</h2>
          <p className="text-sm text-gray-500 mt-1">Track and manage prospective clients</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditingLead(null); setShowForm(true); }}>
          + New Lead
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Leads',     value: stats.totalLeads,                        color: 'text-gray-800' },
            { label: 'Active Pipeline', value: stats.activeLeads,                       color: 'text-blue-700' },
            { label: 'Pipeline Value',  value: '₹' + (stats.pipelineValue / 100000).toFixed(1) + 'L', color: 'text-purple-700' },
            { label: 'Won This Month',  value: stats.wonThisMonth,                      color: 'text-green-700' },
            { label: 'Total Won Value', value: '₹' + (stats.totalWonValue / 100000).toFixed(1) + 'L', color: 'text-green-700' },
            { label: 'Follow-ups Today',value: stats.followUpToday,                     color: stats.followUpToday > 0 ? 'text-orange-600' : 'text-gray-800' },
          ].map((c) => (
            <div key={c.label} className="card text-center py-3">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-gray-500 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Stage summary bar */}
      {stats && (
        <div className="card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pipeline by Stage</p>
          <div className="flex flex-wrap gap-3">
            {STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStageFilter(stageFilter === s.key ? '' : s.key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                  ${stageFilter === s.key ? `${s.bg} ${s.color} border-current` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}
              >
                <span>{s.label}</span>
                <span className={`font-bold ${stageFilter === s.key ? s.color : 'text-gray-500'}`}>
                  {stats.stageCounts[s.key] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters & View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input-field w-56"
          placeholder="Search leads…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input-field w-40" value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as any)}>
          <option value="">All Stages</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="input-field w-36" value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as any)}>
          <option value="">All Priorities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <div className="ml-auto flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setView('table')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'table' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            ☰ Table
          </button>
          <button onClick={() => setView('kanban')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            ▦ Kanban
          </button>
        </div>
      </div>

      {/* ── Table View ── */}
      {view === 'table' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Lead / Company','Contact','Source','Stage','Priority','Est. Fee','Follow-up','Assigned To',''].map((h) => (
                  <th key={h} className="table-header whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">No leads found.</td></tr>
              )}
              {filtered.map((lead) => {
                const fu = lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate) : null;
                const fuDue = fu && fu >= today && fu < tomorrow;
                const fuOverdue = fu && fu < today && !['WON','LOST'].includes(lead.stage);
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailLead(lead)}>
                    <td className="table-cell">
                      <p className="font-medium text-gray-900">{lead.leadName}</p>
                      {lead.convertedClient && (
                        <span className="text-xs text-green-600">✓ Converted</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <p>{lead.contactPerson}</p>
                      {lead.phone && <p className="text-xs text-gray-400">{lead.phone}</p>}
                    </td>
                    <td className="table-cell text-gray-500">{SOURCE_LABELS[lead.source]}</td>
                    <td className="table-cell"><StageBadge stage={lead.stage} /></td>
                    <td className="table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[lead.priority]}`}>
                        {lead.priority}
                      </span>
                    </td>
                    <td className="table-cell">{fmt(lead.estimatedFee)}</td>
                    <td className="table-cell">
                      {fu ? (
                        <span className={`text-xs font-medium ${fuOverdue ? 'text-red-600' : fuDue ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                          {fuOverdue ? '⚠️ ' : fuDue ? '📅 ' : ''}{fmtDate(lead.nextFollowUpDate)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="table-cell text-gray-500">{lead.assignedTo?.staffName || '—'}</td>
                    <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                      <button className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2"
                        onClick={() => { setEditingLead(lead); setShowForm(true); }}>Edit</button>
                      <button className="text-red-600 hover:text-red-800 text-xs font-medium"
                        onClick={() => handleDelete(lead.id)}>Del</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Kanban View ── */}
      {view === 'kanban' && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-max">
            {STAGES.map((s) => {
              const cards = filtered.filter((l) => l.stage === s.key);
              const stageValue = cards.reduce((sum, l) => sum + (l.estimatedFee ? Number(l.estimatedFee) : 0), 0);
              return (
                <div key={s.key} className="w-64 flex flex-col gap-2">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${s.bg}`}>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${s.color}`}>{s.label}</span>
                    <div className="flex items-center gap-2">
                      {stageValue > 0 && <span className={`text-xs font-medium ${s.color}`}>₹{(stageValue/100000).toFixed(1)}L</span>}
                      <span className={`text-xs font-bold ${s.color} bg-white/60 rounded-full px-1.5`}>{cards.length}</span>
                    </div>
                  </div>
                  <div className="space-y-2 min-h-[40px]">
                    {cards.map((lead) => {
                      const fu = lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate) : null;
                      const fuOverdue = fu && fu < today && !['WON','LOST'].includes(lead.stage);
                      return (
                        <div key={lead.id}
                          className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setDetailLead(lead)}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="font-medium text-sm text-gray-900 leading-tight">{lead.leadName}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 font-medium ${PRIORITY_STYLES[lead.priority]}`}>
                              {lead.priority[0]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{lead.contactPerson}</p>
                          {lead.estimatedFee != null && (
                            <p className="text-xs font-semibold text-blue-700 mt-1">{fmt(lead.estimatedFee)}</p>
                          )}
                          {lead.assignedTo && (
                            <p className="text-xs text-gray-400 mt-1">→ {lead.assignedTo.staffName}</p>
                          )}
                          {fuOverdue && (
                            <p className="text-xs text-red-500 mt-1">⚠️ Follow-up overdue</p>
                          )}
                          {lead.convertedClient && (
                            <p className="text-xs text-green-600 mt-1">✓ Converted</p>
                          )}
                          {lead.notes.length > 0 && (
                            <p className="text-xs text-gray-400 mt-1">💬 {lead.notes.length} note{lead.notes.length > 1 ? 's' : ''}</p>
                          )}
                        </div>
                      );
                    })}
                    {cards.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">No leads</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showForm && (
        <LeadFormModal
          initial={editingLead}
          clients={clients}
          partners={partners}
          onSave={editingLead ? handleEdit : handleCreate}
          onClose={() => { setShowForm(false); setEditingLead(null); }}
        />
      )}

      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          canConvert={isAdmin || isPartner}
          onEdit={() => { setEditingLead(detailLead); setShowForm(true); }}
          onDelete={() => handleDelete(detailLead.id)}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onConvert={() => { setConvertLead(detailLead); }}
          onStageChange={(stage) => handleStageChange(detailLead.id, stage)}
          onClose={() => setDetailLead(null)}
        />
      )}

      {convertLead && (
        <ConvertToClientModal
          lead={convertLead}
          onSave={handleConvert}
          onClose={() => setConvertLead(null)}
        />
      )}
    </div>
  );
};

export default Leads;
