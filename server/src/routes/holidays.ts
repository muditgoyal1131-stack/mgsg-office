import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getHolidays, getHolidayDates, createHoliday, updateHoliday, deleteHoliday } from '../controllers/holidayController';

const router = Router();
router.use(authenticate);

router.get('/',        getHolidays);
router.get('/dates',   getHolidayDates);
router.post('/',       createHoliday);
router.put('/:id',     updateHoliday);
router.delete('/:id',  deleteHoliday);

export default router;
