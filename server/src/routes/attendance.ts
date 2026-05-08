import { Router } from 'express';
import { authenticate, requireHR } from '../middleware/auth';
import {
  getAttendance,
  getAllAttendance,
  markAttendance,
  getAttendanceSummary,
  getCorrectionRequests,
  requestCorrection,
  approveCorrection,
  rejectCorrection,
} from '../controllers/attendanceController';

const router = Router();
router.use(authenticate);

// Correction requests (before generic routes)
router.get('/corrections',              getCorrectionRequests);
router.post('/corrections',             requestCorrection);
router.put('/corrections/:id/approve',  approveCorrection);
router.put('/corrections/:id/reject',   rejectCorrection);

// Attendance records
router.get('/summary', requireHR, getAttendanceSummary);
router.get('/all',     requireHR, getAllAttendance);
router.get('/',        getAttendance);
router.post('/',       markAttendance);

export default router;
