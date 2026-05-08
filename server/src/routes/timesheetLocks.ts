import { Router } from 'express';
import { getLocks, lockWeek, unlockWeek } from '../controllers/timesheetLockController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, requireAdmin, getLocks);
router.post('/', authenticate, requireAdmin, lockWeek);
router.delete('/:weekStart', authenticate, requireAdmin, unlockWeek);

export default router;
