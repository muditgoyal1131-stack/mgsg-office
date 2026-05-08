import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import authRoutes from './routes/auth';
import staffRoutes from './routes/staff';
import clientRoutes from './routes/clients';
import taskRoutes from './routes/tasks';
import timesheetRoutes from './routes/timesheets';
import documentRoutes from './routes/documents';
import reportRoutes from './routes/reports';
import searchRoutes from './routes/search';
import auditRoutes from './routes/audit';
import masterRoutes from './routes/masters';
import reimbursementRoutes from './routes/reimbursements';
import ticketRoutes from './routes/tickets';
import leaveRoutes from './routes/leaves';
import attendanceRoutes from './routes/attendance';
import notificationRoutes from './routes/notifications';
import invoiceRoutes from './routes/invoices';
import timesheetLockRoutes from './routes/timesheetLocks';
import taskTemplateRoutes from './routes/taskTemplates';
import ocrRoutes from './routes/ocr';
import leadRoutes from './routes/leads';
import tenderRoutes from './routes/tenders';
import holidayRoutes from './routes/holidays';
import announcementRoutes from './routes/announcements';
import staffDocumentRoutes from './routes/staffDocuments';
import itAssetsRouter from './routes/itAssets';
import subTasksRouter from './routes/subTasks';
import { startReminderCron } from './services/reminderService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Allow both local dev and production frontend origins
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,        // e.g. https://mgsg-client.up.railway.app
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

// Health check — used by Railway to confirm the service is alive
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use(express.json());
// On Railway, UPLOAD_DIR points to the mounted Volume (e.g. /data/uploads)
// Locally it falls back to the uploads/ folder next to the server
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/uploads/client-vault', express.static(path.join(UPLOAD_DIR, 'client-vault')));

app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/masters', masterRoutes);
app.use('/api/reimbursements', reimbursementRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/timesheet-locks', timesheetLockRoutes);
app.use('/api/task-templates', taskTemplateRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/tenders', tenderRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/staff-documents', staffDocumentRoutes);
app.use('/api/it-assets', itAssetsRouter);
app.use('/api/subtasks', subTasksRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startReminderCron();
});
