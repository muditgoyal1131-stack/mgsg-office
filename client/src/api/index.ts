import axios from 'axios';

// In production (Railway), REACT_APP_API_URL is set to the backend service URL
// e.g. https://mgsg-api.up.railway.app
// In development, CRA proxy (package.json "proxy") forwards /api → localhost:5000
const BASE_URL = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL}/api`
  : '/api';

export const api = axios.create({ baseURL: BASE_URL });

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 — token expired or invalid → clear session and go to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Use replace so the user can't press Back into a protected page
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

// Staff
export const getStaff = () => api.get('/staff');
export const createStaff = (data: any) => api.post('/staff', data);
export const updateStaff = (id: number, data: any) => api.put(`/staff/${id}`, data);
export const deleteStaff = (id: number) => api.delete(`/staff/${id}`);
export const toggleStaffActive = (id: number) => api.put(`/staff/${id}/toggle-active`);

// Clients
export const getClients = (search?: string) => api.get('/clients', { params: search ? { search } : {} });
export const createClient = (data: any) => api.post('/clients', data);
export const updateClient = (id: number, data: any) => api.put(`/clients/${id}`, data);
export const deleteClient = (id: number) => api.delete(`/clients/${id}`);

// Tasks
export const getTasks = () => api.get('/tasks');
export const getTask = (id: number) => api.get(`/tasks/${id}`);
export const createTask = (data: any) => api.post('/tasks', data);
export const updateTask = (id: number, data: any) => api.put(`/tasks/${id}`, data);
export const deleteTask = (id: number) => api.delete(`/tasks/${id}`);
export const addExpense = (taskId: number, data: any) => api.post(`/tasks/${taskId}/expenses`, data);
export const deleteExpense = (id: number) => api.delete(`/tasks/expenses/${id}`);

// Timesheets
export const getWeeklyTimesheet = (staffId?: number, weekStart?: string) =>
  api.get('/timesheets', { params: { staffId, weekStart } });
export const getAllTimesheets = (weekStart: string) =>
  api.get('/timesheets/all', { params: { weekStart } });
export const upsertTimesheetEntry = (data: any) => api.post('/timesheets', data);
export const deleteTimesheetEntry = (id: number) => api.delete(`/timesheets/${id}`);

// Auth
export const updatePassword = (data: any) => api.put('/auth/password', data);
export const getProfile = () => api.get('/auth/profile');

// Masters
export const getProfitCentres = () => api.get('/masters/profit-centres');
export const createProfitCentre = (data: any) => api.post('/masters/profit-centres', data);
export const updateProfitCentre = (id: number, data: any) => api.put(`/masters/profit-centres/${id}`, data);
export const deleteProfitCentre = (id: number) => api.delete(`/masters/profit-centres/${id}`);

export const getCategories = () => api.get('/masters/categories');
export const createCategory = (data: any) => api.post('/masters/categories', data);
export const updateCategory = (id: number, data: any) => api.put(`/masters/categories/${id}`, data);
export const deleteCategory = (id: number) => api.delete(`/masters/categories/${id}`);

export const getBillingEntities = () => api.get('/masters/billing-entities');
export const createBillingEntity = (data: any) => api.post('/masters/billing-entities', data);
export const updateBillingEntity = (id: number, data: any) => api.put(`/masters/billing-entities/${id}`, data);
export const deleteBillingEntity = (id: number) => api.delete(`/masters/billing-entities/${id}`);

// Tickets
export const getTickets = () => api.get('/tickets');
export const getTicket = (id: number) => api.get(`/tickets/${id}`);
export const createTicket = (data: any) => api.post('/tickets', data);
export const updateTicket = (id: number, data: any) => api.put(`/tickets/${id}`, data);
export const deleteTicket = (id: number) => api.delete(`/tickets/${id}`);
export const assignTicket = (id: number, data: any) => api.put(`/tickets/${id}/assign`, data);
export const requestCostApproval = (id: number, data: any) => api.put(`/tickets/${id}/request-approval`, data);
export const approveTicketCost = (id: number) => api.put(`/tickets/${id}/approve-cost`);
export const rejectTicketCost = (id: number, data: any) => api.put(`/tickets/${id}/reject-cost`, data);
export const resolveTicket = (id: number, data: any) => api.put(`/tickets/${id}/resolve`, data);
export const closeTicket = (id: number) => api.put(`/tickets/${id}/close`);
export const reopenTicket = (id: number) => api.put(`/tickets/${id}/reopen`);
export const addTicketComment = (id: number, data: any) => api.post(`/tickets/${id}/comments`, data);
export const deleteTicketAttachment = (id: number) => api.delete(`/tickets/attachments/${id}`);

// Reimbursements
export const getReimbursements = () => api.get('/reimbursements');
export const getReimbursement = (id: number) => api.get(`/reimbursements/${id}`);
export const createReimbursement = (data: any) => api.post('/reimbursements', data);
export const updateReimbursement = (id: number, data: any) => api.put(`/reimbursements/${id}`, data);
export const deleteReimbursement = (id: number) => api.delete(`/reimbursements/${id}`);
export const addReimbursementItem = (id: number, data: any) => api.post(`/reimbursements/${id}/items`, data);
export const deleteReimbursementItem = (itemId: number) => api.delete(`/reimbursements/items/${itemId}`);
export const uploadReimbursementAttachment = (itemId: number, formData: FormData) =>
  api.post(`/reimbursements/items/${itemId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteReimbursementAttachment = (attId: number) => api.delete(`/reimbursements/attachments/${attId}`);
export const reviewReimbursement = (id: number) => api.put(`/reimbursements/${id}/review`);
export const returnReimbursement = (id: number, data: any) => api.put(`/reimbursements/${id}/return`, data);
export const approveReimbursement = (id: number) => api.put(`/reimbursements/${id}/approve`);
export const rejectReimbursement = (id: number, data: any) => api.put(`/reimbursements/${id}/reject`, data);
export const exportReimbursements = () => api.get('/reimbursements/export', { responseType: 'blob' });
export const getExpenseCategories = () => api.get('/reimbursements/categories/active');
export const getAllExpenseCategories = () => api.get('/reimbursements/categories/all');
export const createExpenseCategory = (data: any) => api.post('/reimbursements/categories', data);
export const updateExpenseCategory = (id: number, data: any) => api.put(`/reimbursements/categories/${id}`, data);
export const deleteExpenseCategory = (id: number) => api.delete(`/reimbursements/categories/${id}`);

// Invoices
export const getInvoices = (params?: any) => api.get('/invoices', { params });
export const getInvoice = (id: number) => api.get(`/invoices/${id}`);
export const getReceivables = () => api.get('/invoices/receivables');
export const exportInvoices = () => api.get('/invoices/export', { responseType: 'blob' });
export const createInvoice = (data: any) => api.post('/invoices', data);
export const updateInvoice = (id: number, data: any) => api.put(`/invoices/${id}`, data);
export const recordPayment = (id: number, data: any) => api.put(`/invoices/${id}/payment`, data);
export const cancelInvoice = (id: number) => api.put(`/invoices/${id}/cancel`);
export const deleteInvoice = (id: number) => api.delete(`/invoices/${id}`);

// Leaves
export const getLeaves = (params?: any) => api.get('/leaves', { params });
export const getLeaveBalance = (staffId: number) => api.get(`/leaves/balance/${staffId}`);
export const exportLeaves = () => api.get('/leaves/export', { responseType: 'blob' });
export const applyLeave = (data: any) => api.post('/leaves', data);
export const cancelLeave = (id: number) => api.put(`/leaves/${id}/cancel`);
export const approveLeave = (id: number) => api.put(`/leaves/${id}/approve`);
export const rejectLeave = (id: number, data: any) => api.put(`/leaves/${id}/reject`, data);

// Compensatory Leave
export const getCompLeaveRequests = (params?: any) => api.get('/leaves/comp', { params });
export const requestCompLeave = (data: any) => api.post('/leaves/comp', data);
export const approveCompLeave = (id: number) => api.put(`/leaves/comp/${id}/approve`);
export const rejectCompLeave = (id: number, data?: any) => api.put(`/leaves/comp/${id}/reject`, data);

// Attendance
export const getAttendance = (params?: any) => api.get('/attendance', { params });
export const getAllAttendance = (params?: any) => api.get('/attendance/all', { params });
export const getAttendanceSummary = (params?: any) => api.get('/attendance/summary', { params });
export const markAttendance = (data: any) => api.post('/attendance', data);

// Attendance Correction Requests
export const getCorrectionRequests = () => api.get('/attendance/corrections');
export const requestAttendanceCorrection = (data: any) => api.post('/attendance/corrections', data);
export const approveAttendanceCorrection = (id: number) => api.put(`/attendance/corrections/${id}/approve`);
export const rejectAttendanceCorrection = (id: number, data?: any) => api.put(`/attendance/corrections/${id}/reject`, data);

// Notifications
export const getNotifications = () => api.get('/notifications');
export const markNotificationRead = (id: number) => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.put('/notifications/read-all');
export const deleteNotification = (id: number) => api.delete(`/notifications/${id}`);

// Reports (extended)
export const getMonthlyRevenue = () => api.get('/reports/monthly-revenue');
export const getClientFees = (params?: any) => api.get('/reports/client-fees', { params });
export const getStaffKPIs = (params?: any) => api.get('/reports/staff-kpis', { params });

// Timesheet Locks
export const getTimesheetLocks = () => api.get('/timesheet-locks');
export const lockWeek = (weekStart: string) => api.post('/timesheet-locks', { weekStart });
export const unlockWeek = (weekStart: string) => api.delete(`/timesheet-locks/${weekStart}`);

// Task Templates
export const getTaskTemplates = () => api.get('/task-templates');
export const createTaskTemplate = (data: any) => api.post('/task-templates', data);
export const updateTaskTemplate = (id: number, data: any) => api.put(`/task-templates/${id}`, data);
export const deleteTaskTemplate = (id: number) => api.delete(`/task-templates/${id}`);

// Bulk Task Operations
export const bulkUpdateTasks = (data: { taskIds: number[]; action: string; staffId?: number }) =>
  api.post('/tasks/bulk-update', data);

// Staff Events (birthdays + anniversaries)
export const getUpcomingEvents = () => api.get('/staff/events/upcoming');

// Client Health Scores
export const getClientHealthScores = () => api.get('/staff/clients/health');

// OCR
export const extractReceiptOCR = (formData: FormData) =>
  api.post('/ocr/extract', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

// Holidays
export const getHolidays = (year?: number) => api.get('/holidays', { params: year ? { year } : {} });
export const getHolidayDates = (year?: number) => api.get('/holidays/dates', { params: year ? { year } : {} });
export const createHoliday = (data: any) => api.post('/holidays', data);
export const updateHoliday = (id: number, data: any) => api.put(`/holidays/${id}`, data);
export const deleteHoliday = (id: number) => api.delete(`/holidays/${id}`);

// Announcements
export const getAnnouncements = () => api.get('/announcements');
export const createAnnouncement = (data: any) => api.post('/announcements', data);
export const updateAnnouncement = (id: number, data: any) => api.put(`/announcements/${id}`, data);
export const deleteAnnouncement = (id: number) => api.delete(`/announcements/${id}`);

// Staff Documents
export const getStaffDocuments = (params?: any) => api.get('/staff-documents', { params });
export const getExpiryAlerts = () => api.get('/staff-documents/expiry-alerts');
export const uploadStaffDocument = (formData: FormData) =>
  api.post('/staff-documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updateStaffDocumentMeta = (id: number, data: any) => api.put(`/staff-documents/${id}`, data);
export const deleteStaffDocument = (id: number) => api.delete(`/staff-documents/${id}`);

// WIP Report
export const getWIPReport = () => api.get('/reports/wip');

// Tenders
export const getTenders = () => api.get('/tenders');
export const getTenderStats = () => api.get('/tenders/stats');
export const getTender = (id: number) => api.get(`/tenders/${id}`);
export const createTender = (data: any) => api.post('/tenders', data);
export const updateTender = (id: number, data: any) => api.put(`/tenders/${id}`, data);
export const deleteTender = (id: number) => api.delete(`/tenders/${id}`);
export const uploadTenderDocument = (id: number, formData: FormData) =>
  api.post(`/tenders/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteTenderDocument = (id: number, docId: number) =>
  api.delete(`/tenders/${id}/documents/${docId}`);
export const uploadTenderSubmissionFile = (id: number, formData: FormData) =>
  api.post(`/tenders/${id}/submission-files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteTenderSubmissionFile = (id: number, fileId: number) =>
  api.delete(`/tenders/${id}/submission-files/${fileId}`);
export const addTenderComment = (id: number, data: any) => api.post(`/tenders/${id}/comments`, data);
export const deleteTenderComment = (id: number, commentId: number) =>
  api.delete(`/tenders/${id}/comments/${commentId}`);

// Task Archive / Freeze
export const confirmTaskArchive = (id: number) => api.post(`/tasks/${id}/confirm-archive`);
export const freezeTask = (id: number) => api.post(`/tasks/${id}/freeze`);
export const unfreezeTask = (id: number) => api.post(`/tasks/${id}/unfreeze`);

// Leads
export const getLeads = (params?: any) => api.get('/leads', { params });
export const getLead = (id: number) => api.get(`/leads/${id}`);
export const getLeadStats = () => api.get('/leads/stats');
export const createLead = (data: any) => api.post('/leads', data);
export const updateLead = (id: number, data: any) => api.put(`/leads/${id}`, data);
export const deleteLead = (id: number) => api.delete(`/leads/${id}`);
export const addLeadNote = (id: number, data: any) => api.post(`/leads/${id}/notes`, data);
export const deleteLeadNote = (noteId: number) => api.delete(`/leads/notes/${noteId}`);
export const convertLeadToClient = (id: number, data: any) => api.post(`/leads/${id}/convert`, data);

// Client GSTINs
export const getClientGstins = (clientId: number) => api.get(`/clients/${clientId}/gstins`);
export const createClientGstin = (clientId: number, data: any) => api.post(`/clients/${clientId}/gstins`, data);
export const updateClientGstin = (clientId: number, id: number, data: any) => api.put(`/clients/${clientId}/gstins/${id}`, data);
export const deleteClientGstin = (clientId: number, id: number) => api.delete(`/clients/${clientId}/gstins/${id}`);

// IT Assets
export const getITAssets = () => api.get('/it-assets');
export const createITAsset = (data: any) => api.post('/it-assets', data);
export const updateITAsset = (id: number, data: any) => api.put(`/it-assets/${id}`, data);
export const deleteITAsset = (id: number) => api.delete(`/it-assets/${id}`);
export const assignITAsset = (id: number, assignedToId: number) => api.post(`/it-assets/${id}/assign`, { assignedToId });
export const returnITAsset = (id: number) => api.post(`/it-assets/${id}/return`);

export const getInvoiceSettings = () => api.get('/invoices/settings');
export const updateInvoiceSettings = (data: any) => api.put('/invoices/settings', data);

// Sub-Tasks
export const getAllSubTasks = () => api.get('/subtasks');
export const getSubTasks = (taskId: number) => api.get(`/tasks/${taskId}/subtasks`);
export const createSubTask = (taskId: number, data: any) => api.post(`/tasks/${taskId}/subtasks`, data);
export const updateSubTask = (id: number, data: any) => api.put(`/subtasks/${id}`, data);
export const closeSubTask = (id: number) => api.put(`/subtasks/${id}/close`);
export const deleteSubTask = (id: number) => api.delete(`/subtasks/${id}`);

// Task Comments
export const getTaskComments = (taskId: number) => api.get(`/tasks/${taskId}/comments`);
export const createTaskComment = (taskId: number, data: any) => api.post(`/tasks/${taskId}/comments`, data);
export const deleteTaskComment = (commentId: number) => api.delete(`/tasks/comments/${commentId}`);

// Client Document Vault
export const getClientDocuments = (clientId: number) => api.get(`/clients/${clientId}/vault`);
export const uploadClientDocument = (clientId: number, formData: FormData) =>
  api.post(`/clients/${clientId}/vault`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteClientDocument = (docId: number) => api.delete(`/clients/vault/${docId}`);

// Reports — billing summary + due alerts
export const getBillingSummary = (params?: any) => api.get('/reports/billing-summary', { params });
export const triggerDueAlerts = () => api.post('/reports/trigger-due-alerts');
