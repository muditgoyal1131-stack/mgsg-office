import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
} from '../controllers/notificationController';

const router = Router();

// All notification routes require a valid JWT
router.use(authenticate);

// IMPORTANT: /read-all must be registered before /:id/read to avoid Express
// matching "read-all" as an :id parameter.
router.get('/', getNotifications);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);
router.delete('/:id', deleteNotification);

export default router;
