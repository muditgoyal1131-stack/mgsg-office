import React, { useEffect, useState, useCallback } from 'react';
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface Announcement {
  id: number;
  title: string;
  content: string;
  isPinned: boolean;
  expiresAt?: string | null;
  createdBy: { id: number; staffName: string };
  createdAt: string;
  updatedAt: string;
}

function relTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const AnnouncementModal: React.FC<{
  initial?: Announcement | null;
  canPin: boolean;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}> = ({ initial, canPin, onSave, onClose }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [isPinned, setIsPinned] = useState(initial?.isPinned || false);
  const [expiresAt, setExpiresAt] = useState(
    initial?.expiresAt ? initial.expiresAt.slice(0, 10) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) { setError('Title and content are required'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ title: title.trim(), content: content.trim(), isPinned, expiresAt: expiresAt || null });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">{initial ? 'Edit Announcement' : 'New Announcement'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div>
            <label className="label">Title *</label>
            <input className="input-field" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Content *</label>
            <textarea className="input-field resize-none" rows={5} value={content}
              onChange={e => setContent(e.target.value)} required placeholder="Write your announcement…" />
          </div>
          <div>
            <label className="label">Expires On (optional)</label>
            <input type="date" className="input-field" value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Announcement auto-hides after this date.</p>
          </div>
          {canPin && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 text-blue-600 rounded"
                checked={isPinned} onChange={e => setIsPinned(e.target.checked)} />
              <span className="text-sm font-medium text-gray-700">📌 Pin this announcement</span>
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Post Announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const Announcements: React.FC = () => {
  const { isAdmin, isHR, isPartner, user } = useAuth();
  const canPost = isAdmin || isHR || isPartner;
  const canPin  = isAdmin || isHR;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await getAnnouncements();
      setAnnouncements(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSave = async (data: any) => {
    if (editing) await updateAnnouncement(editing.id, data);
    else await createAnnouncement(data);
    await fetchAll();
  };

  const handleDelete = async (a: Announcement) => {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    await deleteAnnouncement(a.id);
    await fetchAll();
  };

  const handleTogglePin = async (a: Announcement) => {
    await updateAnnouncement(a.id, { isPinned: !a.isPinned });
    await fetchAll();
  };

  const canEdit   = (a: Announcement) => isAdmin || isHR || a.createdBy.id === user?.staffId;
  const canDelete = (a: Announcement) => isAdmin || isHR || a.createdBy.id === user?.staffId;

  const now = new Date();
  const isExpired = (a: Announcement) => !!a.expiresAt && new Date(a.expiresAt) < now;

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Announcements</h2>
          <p className="text-sm text-gray-500 mt-1">Company-wide notices and updates</p>
        </div>
        {canPost && (
          <button className="btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            + Post Announcement
          </button>
        )}
      </div>

      {/* List */}
      {announcements.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📢</p>
          <p className="font-medium">No announcements yet.</p>
          {canPost && <p className="text-sm mt-1">Be the first to post one.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map(a => {
            const expired = isExpired(a);
            return (
              <div
                key={a.id}
                className={`card relative pl-5 border-l-4 transition-opacity
                  ${a.isPinned ? 'border-l-amber-400' : 'border-l-transparent'}
                  ${expired ? 'opacity-60' : ''}
                `}
              >
                {/* Pin stripe left indicator */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Tags row */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.isPinned && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          📌 Pinned
                        </span>
                      )}
                      {expired && (
                        <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                          Expired
                        </span>
                      )}
                      {a.expiresAt && !expired && (
                        <span className="text-xs text-gray-400">
                          Expires {new Date(a.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-gray-900 leading-snug">{a.title}</h3>

                    {/* Content */}
                    <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.content}</p>

                    {/* Footer */}
                    <p className="mt-3 text-xs text-gray-400">
                      Posted by <span className="font-medium text-gray-600">{a.createdBy.staffName}</span>
                      {' · '}{relTime(a.createdAt)}
                      {a.updatedAt !== a.createdAt && ' · edited'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {canPin && (
                      <button
                        title={a.isPinned ? 'Unpin' : 'Pin'}
                        className="text-gray-400 hover:text-amber-500 transition-colors text-sm"
                        onClick={() => handleTogglePin(a)}
                      >
                        {a.isPinned ? '📌' : '📎'}
                      </button>
                    )}
                    {canEdit(a) && (
                      <button className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        onClick={() => { setEditing(a); setShowModal(true); }}>
                        Edit
                      </button>
                    )}
                    {canDelete(a) && (
                      <button className="text-red-500 hover:text-red-700 text-xs font-medium"
                        onClick={() => handleDelete(a)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <AnnouncementModal
          initial={editing}
          canPin={canPin}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

export default Announcements;
