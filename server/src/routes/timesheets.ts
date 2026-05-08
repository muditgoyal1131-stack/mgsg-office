import { Router } from 'express';
import {
  getWeeklyTimesheet, upsertTimesheetEntry, deleteTimesheetEntry, getAllStaffTimesheets,
} from '../controllers/timesheetController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getWeeklyTimesheet);
router.get('/all', authenticate, requireAdmin, getAllStaffTimesheets);
router.post('/', authenticate, upsertTimesheetEntry);
router.delete('/:id', authenticate, deleteTimesheetEntry);

export default router;
