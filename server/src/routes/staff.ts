import { Router } from 'express';
import { getAllStaff, createStaff, updateStaff, deleteStaff, toggleStaffActive, getUpcomingEvents, getClientHealthScores } from '../controllers/staffController';
import { authenticate, requireAdmin, requireHR } from '../middleware/auth';

const router = Router();

router.get('/events/upcoming', authenticate, getUpcomingEvents);
router.get('/clients/health', authenticate, getClientHealthScores);
router.get('/', authenticate, getAllStaff);
router.post('/', authenticate, requireHR, createStaff);
router.put('/:id/toggle-active', authenticate, requireHR, toggleStaffActive);
router.put('/:id', authenticate, requireHR, updateStaff);
router.delete('/:id', authenticate, requireAdmin, deleteStaff);

export default router;
