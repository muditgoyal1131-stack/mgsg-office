import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, requireAdmin, getAuditLogs);

export default router;
