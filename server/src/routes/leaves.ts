import { Router } from 'express';
import { authenticate, requireHR } from '../middleware/auth';
import {
  getLeaves,
  getLeaveBalance,
  exportLeaves,
  applyLeave,
  cancelLeave,
  approveLeave,
  rejectLeave,
  getCompLeaveRequests,
  requestCompLeave,
  approveCompLeave,
  rejectCompLeave,
} from '../controllers/leaveController';

const router = Router();
router.use(authenticate);

// Compensatory leave requests (must be before /:id routes)
router.get('/comp',              getCompLeaveRequests);
router.post('/comp',             requestCompLeave);
router.put('/comp/:id/approve',  approveCompLeave);
router.put('/comp/:id/reject',   rejectCompLeave);

// Regular leaves
router.get('/export',            requireHR, exportLeaves);
router.get('/balance/:staffId',  getLeaveBalance);
router.get('/',                  getLeaves);
router.post('/',                 applyLeave);
router.put('/:id/cancel',        cancelLeave);
router.put('/:id/approve',       requireHR, approveLeave);
router.put('/:id/reject',        requireHR, rejectLeave);

export default router;
