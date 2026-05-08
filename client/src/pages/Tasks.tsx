import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTasks, createTask, updateTask, deleteTask, getStaff, getClients,
  addExpense, deleteExpense, getProfitCentres, getCategories, getBillingEntities,
  getTaskTemplates, createTaskTemplate, updateTaskTemplate, deleteTaskTemplate,
  bulkUpdateTasks, confirmTaskArchive, freezeTask, unfreezeTask,
  getAllSubTasks,
  getSubTasks, createSubTask as createSubTaskApi, updateSubTask as updateSubTaskApi,
  closeSubTask as closeSubTaskApi, deleteSubTask as deleteSubTaskApi,
  getTaskComments, createTaskComment, deleteTaskComment,
} from '../api';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface Staff { id: number; staffName: string; isPartner?: boolean; isActive?: boolean; reportingPartnerId?: number; }
interface Client { id: number; clientCode: string; clientName: string; }
interface Master { id: number; name: string; }
interface Expense { id: number; description: string; amount: number; date: string; category: string; receiptUrl?: string; }
interface Document { id: number; fileName: string; originalName: string; fileSize: number; mimeType: string; createdAt: string; uploadedBy?: any; }
interface SubTask {
  id: number; subTaskNumber: string; name: string; description?: string;
  assignedTo?: Staff; dueDate?: string;
  status: 'OPEN' | 'SENT_FOR_REVIEW' | 'CLOSED';
  createdAt: string;
}
interface Task {
  id: number; taskId: string; taskName: string; udin?: string; udinDate?: string;
  partner?: Staff; manager?: Staff; client?: Client;
  profitCentre?: Master; category?: Master; billingEntity?: Master;
  billedAmount?: number;
  status: 'OPEN' | 'CLOSED'; billingStatus: 'BILLED' | 'UNBILLED';
  billDetails?: string; costIncurred?: number; opeIncurred?: number;
  isOverdue?: boolean; dueDate?: string;
  archiveLink?: string; archivingConfirmed?: boolean;
  isFrozen?: boolean;
  reference?: string; terms?: string;
  expenses?: Expense[]; documents?: any[]; _count?: { documents: number };
}

const EXPENSE_CATEGORIES = ['TRAVEL', 'COURIER', 'FILING_FEES', 'PRINTING', 'FOOD', 'ACCOMMODATION', 'OTHER'];

const defaultCreateForm = {
  taskName: '', partnerId: '', managerId: '',
  clientId: '', categoryId: '', dueDate: '',
};

const defaultEditForm = {
  taskName: '', udin: '', udinDate: '', partnerId: '', managerId: '',
  clientId: '', profitCentreId: '', categoryId: '', billedAmount: '',
  billingEntityId: '', status: 'OPEN', billingStatus: 'UNBILLED', billDetails: '',
  dueDate: '', archiveLink: '', archivingConfirmed: false as boolean,
  reference: '', terms: '',
};

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatusDot: React.FC<{ status: 'OPEN' | 'CLOSED'; billing: 'BILLED' | 'UNBILLED' }> = ({ status, billing }) => (
  <div className="flex items-center gap-1.5" title={`${status} · ${billing}`}>
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${status === 'OPEN' ? 'bg-green-500' : 'bg-gray-400'}`} title={status} />
    <span className={`inline-block w-2.5 h-2.5 rounded-full border-2 ${billing === 'BILLED' ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-400'}`} title={billing} />
  </div>
);

const TasksContent: React.FC = () => {
  const { user, isAdmin, isHR, isPartner } = useAuth();
  const navigate = useNavigate();

  // Per-task permission helpers
  const canSeeCostForTask = (task: Task) =>
    isAdmin ||
    user?.staffId === task.partner?.id ||
    (task.partner as any)?.reportingPartnerId === user?.staffId;

  const canSeeBillingForTask = (task: Task) =>
    isAdmin || isHR ||
    user?.staffId === task.partner?.id ||
    (task.partner as any)?.reportingPartnerId === user?.staffId;

  const canSeeRefTermsForTask = (task: Task) => canSeeCostForTask(task);

  const canUpdateTask = (task: Task) =>
    isAdmin || isHR ||
    user?.staffId === task.partner?.id ||
    user?.staffId === task.manager?.id ||
    (task.partner as any)?.reportingPartnerId === user?.staffId;

  const canDeleteTask = (_task: Task) => isAdmin || isPartner;

  const canConfirmArchiving = (task: Task) =>
    isAdmin || user?.staffId === task.manager?.id;

  // Column-level visibility (for header rendering)
  const canSeeCostColumn = isAdmin || isPartner;
  const canSeeBillingColumn = isAdmin || isHR || isPartner;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [profitCentres, setProfitCentres] = useState<Master[]>([]);
  const [categories, setCategories] = useState<Master[]>([]);
  const [billingEntities, setBillingEntities] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBilling, setFilterBilling] = useState('');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), category: 'OTHER' });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Inline edit state: { taskId, field, value }
  const [inlineEdit, setInlineEdit] = useState<{ taskId: number; field: string; value: string } | null>(null);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [clientDropOpen, setClientDropOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Task Templates
  interface TaskTemplate { id: number; name: string; description?: string; categoryId?: number; checklist: string[]; }
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', categoryId: '', checklist: '' });
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Sub-tasks
  const [detailTab, setDetailTab] = useState<'info' | 'expenses' | 'documents' | 'subtasks' | 'comments' | 'history'>('info');
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [subTasksLoading, setSubTasksLoading] = useState(false);
  const [showSubTaskForm, setShowSubTaskForm] = useState(false);
  const [editingSubTask, setEditingSubTask] = useState<SubTask | null>(null);
  const [subTaskForm, setSubTaskForm] = useState({ name: '', description: '', assignedToId: '', dueDate: '' });

  // Comments
  interface TaskComment { id: number; content: string; createdAt: string; author: { id: number; staffName: string }; }
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Audit history
  interface AuditEntry { id: number; action: string; entity: string; changes: any; createdAt: string; user: { email: string; staff?: { staffName: string } }; }
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Bulk operations
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<'CLOSE' | 'REASSIGN_MANAGER' | 'REASSIGN_PARTNER'>('CLOSE');
  const [bulkStaffId, setBulkStaffId] = useState('');
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number; results: any[] } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    const [tasksRes, staffRes, pcRes, catRes, beRes, templatesRes] = await Promise.all([
      getTasks(), getStaff(),
      getProfitCentres(), getCategories(), getBillingEntities(),
      getTaskTemplates().catch(() => ({ data: [] })),
    ]);
    setTasks(tasksRes.data);
    setStaff(staffRes.data);
    setProfitCentres(pcRes.data);
    setCategories(catRes.data);
    setBillingEntities(beRes.data);
    setTemplates(templatesRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const handleClientSearch = async (q: string) => {
    setClientSearch(q);
    if (q.length >= 2) {
      const res = await getClients(q);
      setClientResults(res.data);
      setClientDropOpen(true);
    } else {
      setClientResults([]);
      setClientDropOpen(false);
    }
  };

  const selectClientForCreate = (c: Client) => {
    setSelectedClient(c);
    setCreateForm((f) => ({ ...f, clientId: String(c.id) }));
    setClientSearch(`${c.clientCode} — ${c.clientName}`);
    setClientDropOpen(false);
  };

  const openCreate = () => {
    setEditing(null);
    setCreateForm(defaultCreateForm);
    setClientSearch('');
    setClientResults([]);
    setClientDropOpen(false);
    setSelectedClient(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setEditForm({
      taskName: task.taskName,
      udin: task.udin || '',
      udinDate: task.udinDate ? task.udinDate.slice(0, 10) : '',
      partnerId: task.partner?.id ? String(task.partner.id) : '',
      managerId: task.manager?.id ? String(task.manager.id) : '',
      clientId: task.client?.id ? String(task.client.id) : '',
      profitCentreId: task.profitCentre?.id ? String(task.profitCentre.id) : '',
      categoryId: task.category?.id ? String(task.category.id) : '',
      billedAmount: task.billedAmount != null ? String(task.billedAmount) : '',
      billingEntityId: task.billingEntity?.id ? String(task.billingEntity.id) : '',
      status: task.status,
      billingStatus: task.billingStatus,
      billDetails: task.billDetails || '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      archiveLink: task.archiveLink || '',
      archivingConfirmed: task.archivingConfirmed ?? false,
      reference: task.reference || '',
      terms: task.terms || '',
    });
    if (task.client) {
      setSelectedClient(task.client);
      setClientSearch(`${task.client.clientCode} — ${task.client.clientName}`);
    } else {
      setSelectedClient(null);
      setClientSearch('');
    }
    setClientResults([]);
    setClientDropOpen(false);
    setError('');
    setShowModal(true);
  };

  const openDetail = async (task: Task) => {
    const res = await api.get(`/tasks/${task.id}`);
    setDetailTask(res.data);
    setDetailTab('info');
    setSubTasks([]);
    setComments([]);
    setAuditHistory([]);
  };

  const loadComments = async (taskId: number) => {
    setCommentsLoading(true);
    try {
      const res = await getTaskComments(taskId);
      setComments(res.data || []);
    } catch { /* ignore */ }
    finally { setCommentsLoading(false); }
  };

  const loadHistory = async (taskId: number) => {
    setHistoryLoading(true);
    try {
      const res = await api.get('/audit', { params: { taskId, limit: 50 } });
      setAuditHistory(res.data?.logs || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailTask || !commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      await createTaskComment(detailTask.id, { content: commentText.trim() });
      setCommentText('');
      loadComments(detailTask.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error posting comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!detailTask) return;
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteTaskComment(commentId);
      loadComments(detailTask.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error deleting comment');
    }
  };

  const loadSubTasks = async (taskId: number) => {
    setSubTasksLoading(true);
    try {
      const res = await getSubTasks(taskId);
      setSubTasks(res.data);
    } catch { /* silently ignore */ }
    finally { setSubTasksLoading(false); }
  };

  const handleSubTaskTabClick = (task: Task) => {
    setDetailTab('subtasks');
    loadSubTasks(task.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        const payload: any = {
          ...editForm,
          partnerId: editForm.partnerId || null,
          managerId: editForm.managerId || null,
          clientId: editForm.clientId || null,
          profitCentreId: editForm.profitCentreId || null,
          categoryId: editForm.categoryId || null,
          billingEntityId: editForm.billingEntityId || null,
          billedAmount: editForm.billedAmount || null,
        };
        await updateTask(editing.id, payload);
      } else {
        const payload: any = {
          taskName: createForm.taskName,
          partnerId: createForm.partnerId || null,
          managerId: createForm.managerId || null,
          clientId: createForm.clientId || null,
          categoryId: createForm.categoryId || null,
          dueDate: createForm.dueDate || null,
        };
        await createTask(payload);
      }
      setShowModal(false);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving task');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this task and all associated data?')) return;
    try {
      await deleteTask(id);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error deleting task');
    }
  };

  // ── Inline edit ──────────────────────────────────────────────────────────────
  const startInlineEdit = (taskId: number, field: string, value: string) => {
    setInlineEdit({ taskId, field, value });
  };

  const handleInlineSave = async () => {
    if (!inlineEdit) return;
    try {
      await updateTask(inlineEdit.taskId, { [inlineEdit.field]: inlineEdit.value || null });
      setInlineEdit(null);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error saving');
      setInlineEdit(null);
    }
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleInlineSave();
    if (e.key === 'Escape') setInlineEdit(null);
  };

  // ── Template handlers ────────────────────────────────────────────────────────
  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => String(t.id) === templateId);
    if (!tpl) return;
    setCreateForm((f) => ({
      ...f,
      taskName: tpl.name,
      categoryId: tpl.categoryId ? String(tpl.categoryId) : f.categoryId,
    }));
  };

  const openTemplateManager = () => {
    setEditingTemplate(null);
    setShowTemplateForm(false);
    setTemplateForm({ name: '', description: '', categoryId: '', checklist: '' });
    setShowTemplateModal(true);
  };

  const openEditTemplate = (t: TaskTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      description: t.description || '',
      categoryId: t.categoryId ? String(t.categoryId) : '',
      checklist: (t.checklist || []).join('\n'),
    });
    setShowTemplateForm(true);
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: templateForm.name,
      description: templateForm.description,
      categoryId: templateForm.categoryId ? Number(templateForm.categoryId) : null,
      checklist: templateForm.checklist.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editingTemplate) {
        await updateTaskTemplate(editingTemplate.id, payload);
      } else {
        await createTaskTemplate(payload);
      }
      setShowTemplateForm(false);
      setEditingTemplate(null);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error saving template');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await deleteTaskTemplate(id);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error deleting template');
    }
  };

  // ── Bulk operations ──────────────────────────────────────────────────────────
  const toggleSelectTask = (id: number) => {
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.length === filtered.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(filtered.map((t: Task) => t.id));
    }
  };

  const handleBulkSubmit = async () => {
    if (!selectedTaskIds.length) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const payload: any = { taskIds: selectedTaskIds, action: bulkAction };
      if (bulkAction === 'REASSIGN_MANAGER') payload.data = { managerId: Number(bulkStaffId) };
      if (bulkAction === 'REASSIGN_PARTNER') payload.data = { partnerId: Number(bulkStaffId) };
      const res = await bulkUpdateTasks(payload);
      setBulkResult(res.data);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Bulk update failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleQuickConfirmArchive = async (task: Task) => {
    try {
      await confirmTaskArchive(task.id);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error');
    }
  };

  const handleFreezeTask = async (task: Task) => {
    if (!window.confirm(`Freeze task "${task.taskName}"? This will lock the task from further edits.`)) return;
    try {
      await freezeTask(task.id);
      fetchAll();
      if (detailTask?.id === task.id) {
        const res = await api.get(`/tasks/${task.id}`);
        setDetailTask(res.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error freezing task');
    }
  };

  const handleUnfreezeTask = async (task: Task) => {
    if (!window.confirm(`Unfreeze task "${task.taskName}"?`)) return;
    try {
      await unfreezeTask(task.id);
      fetchAll();
      if (detailTask?.id === task.id) {
        const res = await api.get(`/tasks/${task.id}`);
        setDetailTask(res.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error unfreezing task');
    }
  };

  // ── Expense & doc handlers ───────────────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailTask) return;
    await addExpense(detailTask.id, { ...expenseForm, amount: Number(expenseForm.amount) });
    const res = await api.get(`/tasks/${detailTask.id}`);
    setDetailTask(res.data);
    setExpenseForm({ description: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), category: 'OTHER' });
    fetchAll();
  };

  const handleDeleteExpense = async (expId: number) => {
    if (!detailTask) return;
    await deleteExpense(expId);
    const res = await api.get(`/tasks/${detailTask.id}`);
    setDetailTask(res.data);
    fetchAll();
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!detailTask || !e.target.files?.[0]) return;
    setUploadingDoc(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);
    await api.post(`/documents/task/${detailTask.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    const res = await api.get(`/tasks/${detailTask.id}`);
    setDetailTask(res.data);
    setUploadingDoc(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!detailTask) return;
    await api.delete(`/documents/${docId}`);
    const res = await api.get(`/tasks/${detailTask.id}`);
    setDetailTask(res.data);
  };

  const handleSubTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailTask) return;
    try {
      if (editingSubTask) {
        await updateSubTaskApi(editingSubTask.id, {
          name: subTaskForm.name,
          description: subTaskForm.description || null,
          assignedToId: subTaskForm.assignedToId || null,
          dueDate: subTaskForm.dueDate || null,
        });
      } else {
        await createSubTaskApi(detailTask.id, {
          name: subTaskForm.name,
          description: subTaskForm.description || null,
          assignedToId: subTaskForm.assignedToId || null,
          dueDate: subTaskForm.dueDate || null,
        });
      }
      setShowSubTaskForm(false);
      setEditingSubTask(null);
      setSubTaskForm({ name: '', description: '', assignedToId: '', dueDate: '' });
      loadSubTasks(detailTask.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error saving sub-task');
    }
  };

  const handleSubTaskStatusChange = async (st: SubTask, newStatus: SubTask['status']) => {
    if (!detailTask) return;
    try {
      if (newStatus === 'CLOSED') {
        await closeSubTaskApi(st.id);
      } else {
        await updateSubTaskApi(st.id, { status: newStatus });
      }
      loadSubTasks(detailTask.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error updating sub-task');
    }
  };

  const handleDeleteSubTask = async (stId: number) => {
    if (!detailTask) return;
    if (!window.confirm('Delete this sub-task?')) return;
    try {
      await deleteSubTaskApi(stId);
      loadSubTasks(detailTask.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error deleting sub-task');
    }
  };

  const openEditSubTask = (st: SubTask) => {
    setEditingSubTask(st);
    setSubTaskForm({
      name: st.name,
      description: st.description || '',
      assignedToId: st.assignedTo?.id ? String(st.assignedTo.id) : '',
      dueDate: st.dueDate ? st.dueDate.slice(0, 10) : '',
    });
    setShowSubTaskForm(true);
  };

  const exportExcel = () => {
    const data = filtered.map((t) => ({
      'Task ID': t.taskId, 'Task Name': t.taskName,
      'Client': t.client?.clientName || '', 'UDIN': t.udin || '',
      'UDIN Date': t.udinDate ? t.udinDate.slice(0, 10) : '',
      'Partner': t.partner?.staffName || '', 'Manager': t.manager?.staffName || '',
      'Category': t.category?.name || '', 'Status': t.status,
      'Billing Status': t.billingStatus, 'Due Date': t.dueDate ? t.dueDate.slice(0, 10) : '',
      'Cost Incurred (₹)': t.costIncurred ?? '', 'OPE Incurred (₹)': t.opeIncurred ?? '',
      'Billed Amount (₹)': t.billedAmount ?? '',
      'Archive Link': t.archiveLink || '', 'Archiving Confirmed': t.archivingConfirmed ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, 'Tasks.xlsx');
  };

  const filtered = tasks.filter((t) => {
    const matchSearch =
      (t.taskId || '').toLowerCase().includes(search.toLowerCase()) ||
      t.taskName.toLowerCase().includes(search.toLowerCase()) ||
      (t.client?.clientName || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus ? t.status === filterStatus : true;
    const matchBilling = filterBilling ? t.billingStatus === filterBilling : true;
    return matchSearch && matchStatus && matchBilling;
  });

  const fileSizeStr = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const activeStaff = staff.filter((s: any) => s.isActive !== false);
  const partners = staff.filter((s: any) => s.isPartner && s.isActive !== false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Task List</h2>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={exportExcel}>Export Excel</button>
          {(isAdmin || isPartner) && (
            <button className="btn-secondary text-sm" onClick={openTemplateManager}>📋 Templates</button>
          )}
          <button className="btn-primary" onClick={openCreate}>+ Add Task</button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedTaskIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">{selectedTaskIds.length} task{selectedTaskIds.length !== 1 ? 's' : ''} selected</span>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={() => setSelectedTaskIds([])}>Clear</button>
            <button className="btn-primary text-sm" onClick={() => { setBulkResult(null); setBulkAction('CLOSE'); setBulkStaffId(''); setShowBulkModal(true); }}>
              Bulk Actions
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Open</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" /> Closed</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Billed</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-400 inline-block" /> Unbilled</span>
        <span className="text-gray-400">· Click Task ID or Name to view details · Click UDIN / Archive to edit inline</span>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4">
          <input className="input-field max-w-xs" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input-field max-w-[160px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select className="input-field max-w-[160px]" value={filterBilling} onChange={(e) => setFilterBilling(e.target.value)}>
            <option value="">All Billing</option>
            <option value="BILLED">Billed</option>
            <option value="UNBILLED">Unbilled</option>
          </select>
          <span className="text-sm text-gray-400 self-center">{filtered.length} tasks</span>
        </div>

        {loading ? <p className="text-gray-500 text-sm">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header w-8">
                    <input type="checkbox" className="w-4 h-4 rounded"
                      checked={filtered.length > 0 && selectedTaskIds.length === filtered.length}
                      onChange={toggleSelectAll} />
                  </th>
                  <th className="table-header">Task ID</th>
                  <th className="table-header">Task Name</th>
                  <th className="table-header">Client</th>
                  <th className="table-header">UDIN</th>
                  <th className="table-header">Partner</th>
                  <th className="table-header">Manager</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Due Date</th>
                  {canSeeCostColumn && <th className="table-header text-right" title="Time cost incurred">Cost</th>}
                  {canSeeCostColumn && <th className="table-header text-right" title="Out-of-pocket expenses">OPE</th>}
                  {canSeeBillingColumn && <th className="table-header text-right">Billed</th>}
                  {canSeeBillingColumn && <th className="table-header">Billing Entity</th>}
                  <th className="table-header">Archive</th>
                  <th className="table-header" title="Status · Billing"></th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id} className={`hover:bg-gray-50 ${task.isOverdue ? 'bg-red-50 hover:bg-red-100' : ''} ${selectedTaskIds.includes(task.id) ? 'bg-blue-50' : ''}`}>
                    <td className="table-cell w-8">
                      <input type="checkbox" className="w-4 h-4 rounded"
                        checked={selectedTaskIds.includes(task.id)}
                        onChange={() => toggleSelectTask(task.id)} />
                    </td>

                    {/* Task ID — click to open detail */}
                    <td className="table-cell">
                      <button
                        className="font-mono font-medium text-blue-700 hover:text-blue-900 hover:underline text-left whitespace-nowrap"
                        onClick={() => openDetail(task)}
                        title="Click to view details"
                      >
                        {task.taskId}
                      </button>
                    </td>

                    {/* Task Name — click to open detail */}
                    <td className="table-cell font-medium max-w-[160px]">
                      <button
                        className="text-left hover:text-blue-700 w-full"
                        onClick={() => openDetail(task)}
                        title="Click to view details"
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate">{task.taskName}</span>
                          {task.isOverdue && <span className="text-red-500 text-xs font-bold shrink-0">!</span>}
                        </div>
                      </button>
                    </td>

                    <td className="table-cell text-gray-500 max-w-[120px] truncate">{task.client?.clientName || '—'}</td>

                    {/* UDIN — inline editable */}
                    <td className="table-cell">
                      {inlineEdit?.taskId === task.id && inlineEdit.field === 'udin' ? (
                        <input
                          autoFocus
                          className="border border-blue-400 rounded px-1 py-0.5 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={inlineEdit.value}
                          placeholder="Enter UDIN..."
                          onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                          onBlur={handleInlineSave}
                          onKeyDown={handleInlineKeyDown}
                        />
                      ) : (
                        <span
                          className={`cursor-pointer rounded px-1 transition-colors ${canUpdateTask(task) ? 'hover:bg-gray-100' : ''}`}
                          title={canUpdateTask(task) ? 'Click to edit UDIN' : (task.udin || 'No UDIN')}
                          onClick={() => canUpdateTask(task) && startInlineEdit(task.id, 'udin', task.udin || '')}
                        >
                          {task.udin
                            ? <span className="text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Yes</span>
                            : <span className={`text-xs ${canUpdateTask(task) ? 'text-blue-400 hover:text-blue-600' : 'text-gray-300'}`}>
                                {canUpdateTask(task) ? '+ Add' : '—'}
                              </span>}
                        </span>
                      )}
                    </td>

                    <td className="table-cell">{task.partner?.staffName || '—'}</td>
                    <td className="table-cell">{task.manager?.staffName || '—'}</td>
                    <td className="table-cell text-gray-500 text-xs">{task.category?.name || '—'}</td>
                    <td className="table-cell text-xs">
                      {task.dueDate ? (
                        <span className={task.isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {format(new Date(task.dueDate), 'dd-MMM-yy')}
                        </span>
                      ) : '—'}
                    </td>

                    {canSeeCostColumn && (
                      <td className="table-cell text-right">
                        {canSeeCostForTask(task) && task.costIncurred != null ? fmt(task.costIncurred) : '—'}
                      </td>
                    )}
                    {canSeeCostColumn && (
                      <td className="table-cell text-right">
                        {canSeeCostForTask(task) && task.opeIncurred != null ? fmt(task.opeIncurred) : '—'}
                      </td>
                    )}
                    {canSeeBillingColumn && (
                      <td className="table-cell text-right">
                        {canSeeBillingForTask(task) && task.billedAmount != null ? fmt(Number(task.billedAmount)) : '—'}
                      </td>
                    )}
                    {canSeeBillingColumn && (
                      <td className="table-cell text-gray-500 text-xs">
                        {canSeeBillingForTask(task) ? (task.billingEntity?.name || '—') : '—'}
                      </td>
                    )}

                    {/* Archive — inline editable + quick confirm */}
                    <td className="table-cell text-center min-w-[100px]">
                      {inlineEdit?.taskId === task.id && inlineEdit.field === 'archiveLink' ? (
                        <input
                          autoFocus
                          className="border border-blue-400 rounded px-1 py-0.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={inlineEdit.value}
                          placeholder="https://..."
                          onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                          onBlur={handleInlineSave}
                          onKeyDown={handleInlineKeyDown}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={`text-xs cursor-pointer rounded px-1 transition-colors ${canUpdateTask(task) ? 'hover:bg-gray-100' : ''} ${task.archiveLink ? (task.archivingConfirmed ? 'text-green-600 font-medium' : 'text-indigo-600 font-medium') : 'text-gray-300'}`}
                            title={task.archiveLink
                              ? `${task.archiveLink}${canUpdateTask(task) ? ' · Click to edit' : ''}`
                              : (canUpdateTask(task) ? 'Click to add archive link' : '—')}
                            onClick={() => canUpdateTask(task) && startInlineEdit(task.id, 'archiveLink', task.archiveLink || '')}
                          >
                            {task.archiveLink
                              ? (task.archivingConfirmed ? '✓ Confirmed' : '🔗 Linked')
                              : (canUpdateTask(task) ? '+ Link' : '—')}
                          </span>
                          {task.archiveLink && !task.archivingConfirmed && canConfirmArchiving(task) && (
                            <button
                              className="text-xs text-green-600 hover:text-green-800 font-medium bg-green-50 hover:bg-green-100 px-1.5 py-0.5 rounded transition-colors"
                              onClick={() => handleQuickConfirmArchive(task)}
                              title="Mark archiving as confirmed"
                            >
                              Confirm ✓
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="table-cell">
                      <StatusDot status={task.status} billing={task.billingStatus} />
                    </td>

                    <td className="table-cell">
                      <div className="flex gap-2 items-center flex-wrap">
                        <button className="text-blue-600 hover:text-blue-800 font-medium text-xs" onClick={() => openEdit(task)}>Edit</button>
                        {canDeleteTask(task) && (
                          <button className="text-red-600 hover:text-red-800 font-medium text-xs" onClick={() => handleDelete(task.id)}>Del</button>
                        )}
                        {canSeeBillingForTask(task) && task.client && (task.billingStatus === 'UNBILLED') && (
                          <button
                            className="text-emerald-600 hover:text-emerald-800 font-medium text-xs whitespace-nowrap"
                            onClick={() => navigate(`/invoices?taskId=${task.id}`)}
                            title="Create invoice for this task"
                          >
                            + Invoice
                          </button>
                        )}
                        {task.status === 'CLOSED' && task.archivingConfirmed && !task.isFrozen && (isAdmin || isPartner) && (
                          <button
                            className="text-blue-500 hover:text-blue-700 font-medium text-xs whitespace-nowrap"
                            onClick={() => handleFreezeTask(task)}
                            title="Freeze this task"
                          >
                            Freeze
                          </button>
                        )}
                        {task.isFrozen && isAdmin && (
                          <button
                            className="text-orange-500 hover:text-orange-700 font-medium text-xs whitespace-nowrap"
                            onClick={() => handleUnfreezeTask(task)}
                            title="Unfreeze this task"
                          >
                            Unfreeze
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={20} className="table-cell text-center text-gray-400 py-8">No tasks found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{editing ? 'Edit Task' : 'Create Task'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editing ? (
                /* ── CREATE FORM ── */
                <div className="grid grid-cols-2 gap-4">
                  {templates.length > 0 && (
                    <div className="col-span-2">
                      <label className="label">Use Template (optional)</label>
                      <select className="input-field" value={selectedTemplateId}
                        onChange={(e) => applyTemplate(e.target.value)}>
                        <option value="">— Start from scratch —</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {selectedTemplateId && (() => {
                        const tpl = templates.find((t) => String(t.id) === selectedTemplateId);
                        return tpl?.checklist?.length ? (
                          <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                            <p className="font-semibold mb-1">Checklist:</p>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {tpl.checklist.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className="label">Task Name <span className="text-red-500">*</span></label>
                    <input className="input-field" value={createForm.taskName}
                      onChange={(e) => setCreateForm({ ...createForm, taskName: e.target.value })} required />
                  </div>

                  <div className="col-span-2 relative">
                    <label className="label">Client</label>
                    <input
                      className="input-field"
                      value={clientSearch}
                      placeholder="Type 2+ chars to search clients..."
                      onChange={(e) => handleClientSearch(e.target.value)}
                      onFocus={() => { if (clientResults.length > 0) setClientDropOpen(true); }}
                      autoComplete="off"
                    />
                    {clientDropOpen && clientResults.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {clientResults.map((c) => (
                          <button key={c.id} type="button"
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                            onClick={() => selectClientForCreate(c)}>
                            <span className="font-mono text-blue-700 text-xs mr-2">{c.clientCode}</span>{c.clientName}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedClient && <p className="text-xs text-green-600 mt-1">Selected: {selectedClient.clientCode} — {selectedClient.clientName}</p>}
                  </div>

                  <div>
                    <label className="label">Partner</label>
                    <select className="input-field" value={createForm.partnerId}
                      onChange={(e) => setCreateForm({ ...createForm, partnerId: e.target.value })}>
                      <option value="">— Select Partner —</option>
                      {partners.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Manager</label>
                    <select className="input-field" value={createForm.managerId}
                      onChange={(e) => setCreateForm({ ...createForm, managerId: e.target.value })}>
                      <option value="">— Select Manager —</option>
                      {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select className="input-field" value={createForm.categoryId}
                      onChange={(e) => setCreateForm({ ...createForm, categoryId: e.target.value })}>
                      <option value="">— Select —</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Due Date</label>
                    <input type="date" className="input-field" value={createForm.dueDate}
                      onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} />
                  </div>
                </div>
              ) : (
                /* ── EDIT FORM ── */
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">Task Name <span className="text-red-500">*</span></label>
                    <input className="input-field" value={editForm.taskName}
                      onChange={(e) => setEditForm({ ...editForm, taskName: e.target.value })} required />
                  </div>

                  <div className="col-span-2 relative">
                    <label className="label">Client</label>
                    <input
                      className="input-field"
                      value={clientSearch}
                      placeholder="Type 2+ chars to search clients..."
                      onChange={(e) => {
                        handleClientSearch(e.target.value);
                        setEditForm((f) => ({ ...f, clientId: '' }));
                        setSelectedClient(null);
                      }}
                      onFocus={() => { if (clientResults.length > 0) setClientDropOpen(true); }}
                      autoComplete="off"
                    />
                    {clientDropOpen && clientResults.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {clientResults.map((c) => (
                          <button key={c.id} type="button"
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                            onClick={() => {
                              setSelectedClient(c);
                              setEditForm((f) => ({ ...f, clientId: String(c.id) }));
                              setClientSearch(`${c.clientCode} — ${c.clientName}`);
                              setClientDropOpen(false);
                            }}>
                            <span className="font-mono text-blue-700 text-xs mr-2">{c.clientCode}</span>{c.clientName}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedClient && <p className="text-xs text-green-600 mt-1">Selected: {selectedClient.clientCode} — {selectedClient.clientName}</p>}
                  </div>

                  <div>
                    <label className="label">Due Date</label>
                    <input type="date" className="input-field" value={editForm.dueDate}
                      onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
                  </div>

                  <div>
                    <label className="label">Status</label>
                    <select className="input-field" value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="OPEN">Open</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Partner</label>
                    <select className="input-field" value={editForm.partnerId}
                      onChange={(e) => setEditForm({ ...editForm, partnerId: e.target.value })}>
                      <option value="">— Select Partner —</option>
                      {partners.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="label">Manager</label>
                    <select className="input-field" value={editForm.managerId}
                      onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}>
                      <option value="">— Select Manager —</option>
                      {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="label">Category</label>
                    <select className="input-field" value={editForm.categoryId}
                      onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}>
                      <option value="">— Select —</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {(isAdmin || isPartner) && (
                    <div>
                      <label className="label">Profit Centre</label>
                      <select className="input-field" value={editForm.profitCentreId}
                        onChange={(e) => setEditForm({ ...editForm, profitCentreId: e.target.value })}>
                        <option value="">— Select —</option>
                        {profitCentres.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="label">UDIN</label>
                    <input className="input-field" value={editForm.udin}
                      onChange={(e) => setEditForm({ ...editForm, udin: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">UDIN Date</label>
                    <input type="date" className="input-field" value={editForm.udinDate}
                      onChange={(e) => setEditForm({ ...editForm, udinDate: e.target.value })} />
                  </div>

                  {/* Billing fields */}
                  {canSeeBillingForTask(editing!) && (
                    <>
                      <div>
                        <label className="label">Billing Status</label>
                        <select className="input-field" value={editForm.billingStatus}
                          onChange={(e) => setEditForm({ ...editForm, billingStatus: e.target.value })}>
                          <option value="UNBILLED">Unbilled</option>
                          <option value="BILLED">Billed</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Billing Entity</label>
                        <select className="input-field" value={editForm.billingEntityId}
                          onChange={(e) => setEditForm({ ...editForm, billingEntityId: e.target.value })}>
                          <option value="">— Select —</option>
                          {billingEntities.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Billed Amount (₹)</label>
                        <input type="number" min="0" step="0.01" className="input-field" placeholder="0.00"
                          value={editForm.billedAmount}
                          onChange={(e) => setEditForm({ ...editForm, billedAmount: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label className="label">Bill Details</label>
                        <textarea className="input-field" rows={2} value={editForm.billDetails}
                          onChange={(e) => setEditForm({ ...editForm, billDetails: e.target.value })} />
                      </div>
                    </>
                  )}

                  <div className="col-span-2">
                    <label className="label">Archive Link</label>
                    <input className="input-field" value={editForm.archiveLink} placeholder="https://..."
                      onChange={(e) => setEditForm({ ...editForm, archiveLink: e.target.value })} />
                  </div>

                  {(isAdmin || user?.staffId === editing?.manager?.id) && (
                    <div className="col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="archivingConfirmed"
                        className="w-4 h-4 text-blue-600 rounded"
                        checked={Boolean(editForm.archivingConfirmed)}
                        onChange={(e) => setEditForm({ ...editForm, archivingConfirmed: e.target.checked })}
                      />
                      <label htmlFor="archivingConfirmed" className="text-sm font-medium text-gray-700">
                        Archiving Confirmed
                      </label>
                    </div>
                  )}

                  {/* Reference & Terms — only for task partner / reporting partner / admin */}
                  {canSeeRefTermsForTask(editing!) && (
                    <>
                      <div className="col-span-2 border-t border-gray-100 pt-3">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">Confidential — Partner Only</p>
                      </div>
                      <div className="col-span-2">
                        <label className="label">Reference</label>
                        <input className="input-field" value={editForm.reference} placeholder="Reference number or note"
                          onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label className="label">Terms</label>
                        <textarea className="input-field" rows={3} value={editForm.terms} placeholder="Engagement terms / conditions"
                          onChange={(e) => setEditForm({ ...editForm, terms: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Task Detail Modal ────────────────────────────────────────────────────── */}
      {detailTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold">{detailTask.taskId} — {detailTask.taskName}</h3>
                <p className="text-sm text-gray-500">{detailTask.client?.clientName}</p>
              </div>
              <button onClick={() => setDetailTask(null)} className="text-gray-400 hover:text-gray-600 text-xl">&#x2715;</button>
            </div>
            {/* Tab Bar */}
            <div className="flex border-b border-gray-200 px-5 overflow-x-auto">
              {([
                { key: 'info',      label: 'Info' },
                { key: 'expenses',  label: 'OPE / Expenses' },
                { key: 'documents', label: 'Documents' },
                { key: 'subtasks',  label: 'Sub-Tasks' },
                { key: 'comments',  label: `💬 Comments${comments.length > 0 ? ` (${comments.length})` : ''}` },
                { key: 'history',   label: '📜 History' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${detailTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => {
                    if (key === 'subtasks') { handleSubTaskTabClick(detailTask); }
                    else if (key === 'comments') { setDetailTab('comments'); loadComments(detailTask.id); }
                    else if (key === 'history')  { setDetailTab('history');  loadHistory(detailTask.id); }
                    else { setDetailTab(key); }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="p-5 space-y-5">
              {/* Frozen banner */}
              {detailTask.isFrozen && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-sm font-medium text-orange-700">
                  <span>This task is frozen</span>
                  {isAdmin && (
                    <button
                      className="ml-auto text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 px-2 py-0.5 rounded transition-colors"
                      onClick={() => handleUnfreezeTask(detailTask)}
                    >
                      Unfreeze
                    </button>
                  )}
                </div>
              )}

              {/* ── INFO TAB ── */}
              {detailTab === 'info' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Partner</p>
                      <p className="font-medium">{detailTask.partner?.staffName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Manager</p>
                      <p className="font-medium">{detailTask.manager?.staffName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Category</p>
                      <p>{detailTask.category?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Status</p>
                      <div className="mt-0.5"><StatusDot status={detailTask.status} billing={detailTask.billingStatus} /></div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Due Date</p>
                      <p className={detailTask.isOverdue ? 'text-red-600 font-medium' : ''}>
                        {detailTask.dueDate ? format(new Date(detailTask.dueDate), 'dd MMM yyyy') : '—'}
                      </p>
                    </div>
                    {detailTask.udin && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">UDIN</p>
                        <p className="font-mono text-xs text-green-700 bg-green-50 px-2 py-1 rounded mt-0.5 inline-block">{detailTask.udin}</p>
                        {detailTask.udinDate && <span className="text-xs text-gray-400 ml-2">{detailTask.udinDate.slice(0, 10)}</span>}
                      </div>
                    )}
                    {detailTask.profitCentre && (
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Profit Centre</p>
                        <p>{detailTask.profitCentre.name}</p>
                      </div>
                    )}
                  </div>

                  {canSeeRefTermsForTask(detailTask) && (detailTask.reference || detailTask.terms) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2 text-sm">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Confidential — Partner Only</p>
                      {detailTask.reference && (
                        <div>
                          <p className="text-xs text-amber-600 font-medium mb-0.5">Reference</p>
                          <p className="text-gray-800">{detailTask.reference}</p>
                        </div>
                      )}
                      {detailTask.terms && (
                        <div>
                          <p className="text-xs text-amber-600 font-medium mb-0.5">Terms</p>
                          <p className="text-gray-800 whitespace-pre-wrap">{detailTask.terms}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {canSeeCostForTask(detailTask) && (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Cost Incurred</p>
                        <p className="font-bold text-blue-700 text-lg">{detailTask.costIncurred != null ? fmt(detailTask.costIncurred) : '—'}</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">OPE Incurred</p>
                        <p className="font-bold text-orange-600 text-lg">{detailTask.opeIncurred != null ? fmt(detailTask.opeIncurred) : '—'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="font-bold text-gray-900 text-lg">
                          {detailTask.costIncurred != null && detailTask.opeIncurred != null
                            ? fmt(detailTask.costIncurred + detailTask.opeIncurred) : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {canSeeBillingForTask(detailTask) && (detailTask.billedAmount != null || detailTask.billingStatus === 'BILLED') && (
                    <div className="bg-green-50 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Billing</p>
                        {detailTask.billingStatus === 'UNBILLED' && detailTask.client && (
                          <button
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-medium transition-colors"
                            onClick={() => navigate(`/invoices?taskId=${detailTask.id}`)}
                          >+ Create Invoice</button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        {detailTask.billedAmount != null && (
                          <div><span className="text-gray-500 text-xs">Billed: </span>
                            <span className="font-bold text-green-700">{fmt(Number(detailTask.billedAmount))}</span></div>
                        )}
                        {detailTask.billingEntity && (
                          <div><span className="text-gray-500 text-xs">Entity: </span>
                            <span className="font-medium">{detailTask.billingEntity.name}</span></div>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${detailTask.billingStatus === 'BILLED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {detailTask.billingStatus}
                        </span>
                      </div>
                      {detailTask.billDetails && <p className="text-gray-600 mt-2 text-xs">{detailTask.billDetails}</p>}
                    </div>
                  )}

                  {detailTask.archiveLink && (
                    <div className="bg-indigo-50 rounded-lg p-3 text-sm">
                      <p className="text-xs text-indigo-500 font-medium mb-1">Archive</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={detailTask.archiveLink} target="_blank" rel="noreferrer"
                          className="text-indigo-700 hover:underline break-all">{detailTask.archiveLink}</a>
                        {detailTask.archivingConfirmed ? (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓ Confirmed</span>
                        ) : (
                          <>
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">Pending Confirmation</span>
                            {canConfirmArchiving(detailTask) && (
                              <button
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-0.5 rounded font-medium"
                                onClick={async () => {
                                  try {
                                    await confirmTaskArchive(detailTask.id);
                                    const res = await api.get(`/tasks/${detailTask.id}`);
                                    setDetailTask(res.data); fetchAll();
                                  } catch (err: any) { alert(err.response?.data?.message || 'Error'); }
                                }}
                              >Confirm Archive</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {detailTask.status === 'CLOSED' && detailTask.archivingConfirmed && !detailTask.isFrozen && (isAdmin || isPartner) && (
                    <div className="flex justify-end">
                      <button
                        className="text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg font-medium"
                        onClick={() => handleFreezeTask(detailTask)}
                      >Freeze Task</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── EXPENSES TAB ── */}
              {detailTab === 'expenses' && (
                <div>
                  {detailTask.status === 'CLOSED' && (
                    <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mb-3">Task is closed — expenses cannot be added.</p>
                  )}
                  {detailTask.status === 'OPEN' && (
                    <form onSubmit={handleAddExpense} className="grid grid-cols-4 gap-2 mb-3">
                      <input className="input-field col-span-2" placeholder="Description" value={expenseForm.description}
                        onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} required />
                      <select className="input-field" value={expenseForm.category}
                        onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                        {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                      </select>
                      <input type="number" className="input-field" placeholder="Amount (₹)" min="0" step="0.01"
                        value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
                      <input type="date" className="input-field" value={expenseForm.date}
                        onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} required />
                      <button type="submit" className="btn-primary text-sm col-span-3">+ Add Expense</button>
                    </form>
                  )}
                  {detailTask.expenses && detailTask.expenses.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead><tr>
                        <th className="table-header">Description</th>
                        <th className="table-header">Category</th>
                        <th className="table-header">Date</th>
                        <th className="table-header text-right">Amount</th>
                        <th className="table-header"></th>
                      </tr></thead>
                      <tbody>
                        {detailTask.expenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-gray-50">
                            <td className="table-cell">{exp.description}</td>
                            <td className="table-cell text-xs text-gray-500">{exp.category?.replace(/_/g, ' ')}</td>
                            <td className="table-cell text-gray-500">{exp.date?.slice(0, 10)}</td>
                            <td className="table-cell text-right font-medium">{fmt(Number(exp.amount))}</td>
                            <td className="table-cell">
                              {detailTask.status === 'OPEN' && (
                                <button className="text-red-500 hover:text-red-700 text-xs"
                                  onClick={() => handleDeleteExpense(exp.id)}>Delete</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-gray-400 text-sm">No expenses yet.</p>}
                </div>
              )}

              {/* ── DOCUMENTS TAB ── */}
              {detailTab === 'documents' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-800">Documents</h4>
                    <div>
                      <input ref={fileRef} type="file" className="hidden" id="doc-upload" onChange={handleUploadDoc}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />
                      <label htmlFor="doc-upload" className={`btn-secondary text-sm cursor-pointer ${uploadingDoc ? 'opacity-50' : ''}`}>
                        {uploadingDoc ? 'Uploading...' : '+ Upload File'}
                      </label>
                    </div>
                  </div>
                  {detailTask.documents && detailTask.documents.length > 0 ? (
                    <div className="space-y-2">
                      {detailTask.documents.map((doc: Document) => (
                        <div key={doc.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                          <span className="text-xl">{doc.mimeType === 'application/pdf' ? '📄' : doc.mimeType.startsWith('image') ? '🖼️' : '📎'}</span>
                          <div className="flex-1 min-w-0">
                            <a href={`/uploads/${doc.fileName}`} target="_blank" rel="noreferrer"
                              className="text-sm font-medium text-blue-600 hover:underline truncate block">{doc.originalName}</a>
                            <p className="text-xs text-gray-400">{fileSizeStr(doc.fileSize)} · {format(new Date(doc.createdAt), 'dd-MMM-yyyy')}</p>
                          </div>
                          <button className="text-red-500 hover:text-red-700 text-xs" onClick={() => handleDeleteDoc(doc.id)}>Delete</button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-gray-400 text-sm">No documents attached.</p>}
                </div>
              )}

              {/* ── SUB-TASKS TAB ── */}
              {detailTab === 'subtasks' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-800">Sub-Tasks</h4>
                    <button className="btn-primary text-sm" onClick={() => { setEditingSubTask(null); setSubTaskForm({ name: '', description: '', assignedToId: '', dueDate: '' }); setShowSubTaskForm(true); }}>
                      + Add Sub-Task
                    </button>
                  </div>

                  {/* Sub-task create/edit form */}
                  {showSubTaskForm && (
                    <form onSubmit={handleSubTaskSubmit} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                      <h5 className="text-sm font-semibold text-gray-700">{editingSubTask ? 'Edit Sub-Task' : 'New Sub-Task'}</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="label">Name <span className="text-red-500">*</span></label>
                          <input className="input-field" value={subTaskForm.name}
                            onChange={(e) => setSubTaskForm({ ...subTaskForm, name: e.target.value })} required />
                        </div>
                        <div className="col-span-2">
                          <label className="label">Description</label>
                          <textarea className="input-field" rows={2} value={subTaskForm.description}
                            onChange={(e) => setSubTaskForm({ ...subTaskForm, description: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Assign To</label>
                          <select className="input-field" value={subTaskForm.assignedToId}
                            onChange={(e) => setSubTaskForm({ ...subTaskForm, assignedToId: e.target.value })}>
                            <option value="">— None —</option>
                            {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Due Date</label>
                          <input type="date" className="input-field" value={subTaskForm.dueDate}
                            onChange={(e) => setSubTaskForm({ ...subTaskForm, dueDate: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button type="button" className="btn-secondary text-sm" onClick={() => { setShowSubTaskForm(false); setEditingSubTask(null); }}>Cancel</button>
                        <button type="submit" className="btn-primary text-sm">{editingSubTask ? 'Update' : 'Create'}</button>
                      </div>
                    </form>
                  )}

                  {subTasksLoading ? (
                    <p className="text-gray-400 text-sm">Loading...</p>
                  ) : subTasks.length === 0 ? (
                    <p className="text-gray-400 text-sm">No sub-tasks yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {subTasks.map((st) => (
                        <div key={st.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-blue-600 font-medium">{st.subTaskNumber}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  st.status === 'CLOSED' ? 'bg-gray-100 text-gray-500' :
                                  st.status === 'SENT_FOR_REVIEW' ? 'bg-amber-100 text-amber-700' :
                                  'bg-green-100 text-green-700'
                                }`}>{st.status.replace(/_/g, ' ')}</span>
                                {st.assignedTo && <span className="text-xs text-gray-500">→ {st.assignedTo.staffName}</span>}
                                {st.dueDate && <span className="text-xs text-gray-400">{st.dueDate.slice(0, 10)}</span>}
                              </div>
                              <p className="text-sm font-medium text-gray-800 mt-1">{st.name}</p>
                              {st.description && <p className="text-xs text-gray-500 mt-0.5">{st.description}</p>}
                            </div>
                            <div className="flex gap-2 items-center shrink-0">
                              {st.status !== 'CLOSED' && (
                                <>
                                  {st.status === 'OPEN' && (
                                    <button
                                      className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                                      onClick={() => handleSubTaskStatusChange(st, 'SENT_FOR_REVIEW')}
                                    >Send for Review</button>
                                  )}
                                  {(isAdmin || user?.staffId === detailTask.partner?.id || (detailTask.partner as any)?.reportingPartnerId === user?.staffId) && (
                                    <button
                                      className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                                      onClick={() => handleSubTaskStatusChange(st, 'CLOSED')}
                                    >Close</button>
                                  )}
                                  <button
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    onClick={() => openEditSubTask(st)}
                                  >Edit</button>
                                </>
                              )}
                              {(isAdmin || user?.staffId === detailTask.partner?.id) && (
                                <button
                                  className="text-xs text-red-500 hover:text-red-700"
                                  onClick={() => handleDeleteSubTask(st.id)}
                                >Del</button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── COMMENTS TAB ── */}
              {detailTab === 'comments' && (
                <div className="space-y-4">
                  {/* Comment form */}
                  {user?.staffId && (
                    <form onSubmit={handleCommentSubmit} className="flex gap-2">
                      <textarea
                        className="input-field flex-1 resize-none text-sm"
                        rows={2}
                        placeholder="Write a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(e as any); } }}
                      />
                      <button
                        type="submit"
                        disabled={!commentText.trim() || commentSubmitting}
                        className="btn-primary text-sm self-end disabled:opacity-50"
                      >
                        {commentSubmitting ? '...' : 'Post'}
                      </button>
                    </form>
                  )}

                  {/* Comments list */}
                  {commentsLoading ? (
                    <p className="text-gray-400 text-sm text-center py-4">Loading comments...</p>
                  ) : comments.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-2xl mb-2">💬</p>
                      <p className="text-sm">No comments yet. Be the first to comment.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                            {c.author.staffName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-800">{c.author.staffName}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">
                                  {format(new Date(c.createdAt), 'dd MMM yyyy, HH:mm')}
                                </span>
                                {(isAdmin || user?.staffId === c.author.id) && (
                                  <button
                                    onClick={() => handleDeleteComment(c.id)}
                                    className="text-xs text-red-400 hover:text-red-600"
                                    title="Delete comment"
                                  >✕</button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── HISTORY TAB ── */}
              {detailTab === 'history' && (
                <div>
                  {historyLoading ? (
                    <p className="text-gray-400 text-sm text-center py-4">Loading history...</p>
                  ) : auditHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-2xl mb-2">📜</p>
                      <p className="text-sm">No history recorded yet.</p>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Timeline */}
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                      <div className="space-y-4 pl-10">
                        {auditHistory.map((entry) => {
                          const actor = entry.user.staff?.staffName ?? entry.user.email;
                          const actionColor =
                            entry.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                            entry.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                            entry.action === 'CLOSE'  ? 'bg-gray-100 text-gray-700' :
                            'bg-blue-100 text-blue-700';
                          return (
                            <div key={entry.id} className="relative">
                              <div className="absolute -left-7 w-3 h-3 rounded-full bg-blue-400 border-2 border-white top-1.5" />
                              <div className="bg-gray-50 rounded-xl px-4 py-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800">{actor}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor}`}>{entry.action}</span>
                                    <span className="text-xs text-gray-500">{entry.entity}</span>
                                  </div>
                                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                                    {format(new Date(entry.createdAt), 'dd MMM yyyy, HH:mm')}
                                  </span>
                                </div>
                                {entry.changes && typeof entry.changes === 'object' && Object.keys(entry.changes).length > 0 && (
                                  <details className="mt-1">
                                    <summary className="text-xs text-blue-500 cursor-pointer hover:underline">View changes</summary>
                                    <pre className="text-xs bg-white border border-gray-100 rounded p-2 mt-1 overflow-x-auto text-gray-600 max-h-40">
                                      {JSON.stringify(entry.changes, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATE MANAGER MODAL ── */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Task Templates</h3>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setShowTemplateModal(false)}>✕</button>
            </div>

            {/* Existing templates list */}
            {!showTemplateForm && (
              <div className="mb-6">
                {templates.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">No templates yet. Create one below.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {templates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{t.name}</p>
                          {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                          {t.checklist?.length > 0 && (
                            <p className="text-xs text-blue-600 mt-0.5">{t.checklist.length} checklist item{t.checklist.length !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                        <div className="flex gap-2 ml-3">
                          <button className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={() => openEditTemplate(t)}>Edit</button>
                          <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={() => handleDeleteTemplate(t.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn-primary text-sm" onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', description: '', categoryId: '', checklist: '' }); setShowTemplateForm(true); }}>
                  + New Template
                </button>
              </div>
            )}

            {/* Create / Edit form */}
            {showTemplateForm && (
              <form onSubmit={handleSaveTemplate} className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700">{editingTemplate ? `Edit: ${editingTemplate.name}` : 'New Template'}</h4>
                <div>
                  <label className="label">Template Name <span className="text-red-500">*</span></label>
                  <input className="input-field" value={templateForm.name} required
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input className="input-field" value={templateForm.description}
                    onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
                </div>
                <div>
                  <label className="label">Default Category</label>
                  <select className="input-field" value={templateForm.categoryId}
                    onChange={(e) => setTemplateForm({ ...templateForm, categoryId: e.target.value })}>
                    <option value="">— None —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Checklist (one item per line)</label>
                  <textarea className="input-field" rows={5} value={templateForm.checklist}
                    placeholder={"Review documents\nPrepare report\nClient sign-off"}
                    onChange={(e) => setTemplateForm({ ...templateForm, checklist: e.target.value })} />
                </div>
                <div className="flex gap-3 justify-end">
                  <button type="button" className="btn-secondary" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }}>Cancel</button>
                  <button type="submit" className="btn-primary">{editingTemplate ? 'Update' : 'Create'} Template</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── BULK OPERATIONS MODAL ── */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Bulk Actions ({selectedTaskIds.length} tasks)</h3>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setShowBulkModal(false)}>✕</button>
            </div>

            {bulkResult ? (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex-1 text-center">
                    <p className="text-2xl font-bold text-green-600">{bulkResult.succeeded}</p>
                    <p className="text-xs text-green-600 font-medium">Succeeded</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex-1 text-center">
                    <p className="text-2xl font-bold text-red-600">{bulkResult.failed}</p>
                    <p className="text-xs text-red-600 font-medium">Failed / Skipped</p>
                  </div>
                </div>
                {bulkResult.results.filter((r: any) => !r.success).length > 0 && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3 space-y-1">
                    {bulkResult.results.filter((r: any) => !r.success).map((r: any, i: number) => (
                      <p key={i}>Task #{r.taskId}: {r.error}</p>
                    ))}
                  </div>
                )}
                <div className="flex gap-3 justify-end pt-2">
                  <button className="btn-secondary" onClick={() => { setShowBulkModal(false); setSelectedTaskIds([]); setBulkResult(null); }}>Done</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">Action</label>
                  <select className="input-field" value={bulkAction}
                    onChange={(e) => setBulkAction(e.target.value as any)}>
                    <option value="CLOSE">Close Tasks (requires archive link)</option>
                    <option value="REASSIGN_MANAGER">Reassign Manager</option>
                    <option value="REASSIGN_PARTNER">Reassign Partner</option>
                  </select>
                </div>
                {bulkAction !== 'CLOSE' && (
                  <div>
                    <label className="label">{bulkAction === 'REASSIGN_MANAGER' ? 'New Manager' : 'New Partner'}</label>
                    <select className="input-field" value={bulkStaffId}
                      onChange={(e) => setBulkStaffId(e.target.value)} required>
                      <option value="">— Select staff —</option>
                      {(bulkAction === 'REASSIGN_PARTNER' ? partners : activeStaff).map((s) => (
                        <option key={s.id} value={s.id}>{s.staffName}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  ⚠ Only tasks where you are the assigned Partner or their Reporting Partner will be updated. Others will be skipped.
                </p>
                <div className="flex gap-3 justify-end pt-2">
                  <button className="btn-secondary" onClick={() => setShowBulkModal(false)}>Cancel</button>
                  <button className="btn-primary" onClick={handleBulkSubmit} disabled={bulkLoading || (bulkAction !== 'CLOSE' && !bulkStaffId)}>
                    {bulkLoading ? 'Processing...' : `Apply to ${selectedTaskIds.length} tasks`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-Tasks listing (page-level tab) ──────────────────────────────────────
const SubTasksList: React.FC = () => {
  const { user, isAdmin, isPartner } = useAuth();

  interface SubTaskRow {
    id: number;
    subTaskNumber: string;
    name: string;
    description?: string;
    status: 'OPEN' | 'SENT_FOR_REVIEW' | 'CLOSED';
    dueDate?: string;
    createdAt: string;
    assignedTo?: { id: number; staffName: string };
    task: { id: number; taskId: string; taskName: string; client?: { clientName: string }; partner?: { id: number } };
  }

  const [subTasks, setSubTasks] = useState<SubTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editingRow, setEditingRow] = useState<SubTaskRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', assignedToId: '', dueDate: '' });
  const [staff, setStaff] = useState<{ id: number; staffName: string; isActive?: boolean }[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    const [stRes, sRes] = await Promise.all([getAllSubTasks(), getStaff()]);
    setSubTasks(stRes.data);
    setStaff(sRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = subTasks.filter((st) => {
    const q = search.toLowerCase();
    const matchSearch =
      st.subTaskNumber.toLowerCase().includes(q) ||
      st.name.toLowerCase().includes(q) ||
      st.task.taskName.toLowerCase().includes(q) ||
      st.task.taskId.toLowerCase().includes(q) ||
      (st.task.client?.clientName || '').toLowerCase().includes(q) ||
      (st.assignedTo?.staffName || '').toLowerCase().includes(q);
    const matchStatus = filterStatus ? st.status === filterStatus : true;
    return matchSearch && matchStatus;
  });

  const statusBadge = (s: string) => {
    if (s === 'OPEN') return 'bg-green-100 text-green-700';
    if (s === 'SENT_FOR_REVIEW') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-500';
  };

  const canClose = (st: SubTaskRow) =>
    isAdmin || user?.staffId === (st.task as any).partnerId ||
    (st.task as any).partner?.reportingPartnerId === user?.staffId;

  const canDelete = (st: SubTaskRow) =>
    isAdmin || user?.staffId === (st.task as any).partnerId;

  const handleStatusChange = async (st: SubTaskRow, newStatus: SubTaskRow['status']) => {
    try {
      if (newStatus === 'CLOSED') {
        await closeSubTaskApi(st.id);
      } else {
        await updateSubTaskApi(st.id, { status: newStatus });
      }
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error updating sub-task');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this sub-task?')) return;
    try {
      await deleteSubTaskApi(id);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error deleting sub-task');
    }
  };

  const openEdit = (st: SubTaskRow) => {
    setEditingRow(st);
    setEditForm({
      name: st.name,
      description: st.description || '',
      assignedToId: st.assignedTo?.id ? String(st.assignedTo.id) : '',
      dueDate: st.dueDate ? st.dueDate.slice(0, 10) : '',
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;
    try {
      await updateSubTaskApi(editingRow.id, {
        name: editForm.name,
        description: editForm.description || null,
        assignedToId: editForm.assignedToId || null,
        dueDate: editForm.dueDate || null,
      });
      setEditingRow(null);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error saving sub-task');
    }
  };

  const activeStaff = staff.filter((s: any) => s.isActive !== false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Sub-Tasks</h2>
        <span className="text-sm text-gray-400">{filtered.length} sub-task{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4">
          <input className="input-field max-w-xs" placeholder="Search by number, name, task, client…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input-field max-w-[180px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="SENT_FOR_REVIEW">Sent for Review</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {loading ? <p className="text-gray-500 text-sm">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Sub-Task #</th>
                  <th className="table-header">Name</th>
                  <th className="table-header">Parent Task</th>
                  <th className="table-header">Client</th>
                  <th className="table-header">Assigned To</th>
                  <th className="table-header">Due Date</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((st) => (
                  <tr key={st.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs font-medium text-blue-700">{st.subTaskNumber}</td>
                    <td className="table-cell font-medium max-w-[180px]">
                      <span className="block truncate" title={st.name}>{st.name}</span>
                      {st.description && (
                        <span className="block text-xs text-gray-400 truncate" title={st.description}>{st.description}</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className="font-mono text-xs text-gray-600">{st.task.taskId}</span>
                      <span className="block text-xs text-gray-500 truncate max-w-[140px]" title={st.task.taskName}>{st.task.taskName}</span>
                    </td>
                    <td className="table-cell text-gray-500 text-xs">{st.task.client?.clientName || '—'}</td>
                    <td className="table-cell text-gray-600 text-xs">{st.assignedTo?.staffName || '—'}</td>
                    <td className="table-cell text-xs">
                      {st.dueDate
                        ? <span className={new Date(st.dueDate) < new Date() && st.status !== 'CLOSED' ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {format(new Date(st.dueDate), 'dd-MMM-yy')}
                          </span>
                        : '—'}
                    </td>
                    <td className="table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(st.status)}`}>
                        {st.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2 items-center flex-wrap">
                        {st.status === 'OPEN' && (
                          <button className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                            onClick={() => handleStatusChange(st, 'SENT_FOR_REVIEW')}>
                            Send for Review
                          </button>
                        )}
                        {st.status !== 'CLOSED' && canClose(st) && (
                          <button className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                            onClick={() => handleStatusChange(st, 'CLOSED')}>
                            Close
                          </button>
                        )}
                        {st.status !== 'CLOSED' && (
                          <button className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            onClick={() => openEdit(st)}>
                            Edit
                          </button>
                        )}
                        {canDelete(st) && (
                          <button className="text-xs text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(st.id)}>
                            Del
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="table-cell text-center text-gray-400 py-8">No sub-tasks found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Sub-Task
                <span className="ml-2 font-mono text-sm text-blue-600">{editingRow.subTaskNumber}</span>
              </h3>
              <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={() => setEditingRow(null)}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="label">Name <span className="text-red-500">*</span></label>
                <input className="input-field" value={editForm.name} required
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input-field" rows={3} value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Assign To</label>
                  <select className="input-field" value={editForm.assignedToId}
                    onChange={(e) => setEditForm({ ...editForm, assignedToId: e.target.value })}>
                    <option value="">— None —</option>
                    {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.staffName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" className="input-field" value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setEditingRow(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page wrapper with tabs ───────────────────────────────────────────────────
const Tasks: React.FC = () => {
  const [pageTab, setPageTab] = useState<'tasks' | 'subtasks'>('tasks');

  return (
    <div>
      {/* Page-level tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setPageTab('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            pageTab === 'tasks' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📋 Tasks
        </button>
        <button
          onClick={() => setPageTab('subtasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            pageTab === 'subtasks' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🔖 Sub-Tasks
        </button>
      </div>

      {pageTab === 'tasks' && <TasksContent />}
      {pageTab === 'subtasks' && <SubTasksList />}
    </div>
  );
};

export default Tasks;
