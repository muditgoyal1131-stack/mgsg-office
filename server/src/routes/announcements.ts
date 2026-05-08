import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../controllers/announcementController';

const router = Router();
router.use(authenticate);

router.get('/',       getAnnouncements);
router.post('/',      createAnnouncement);
router.put('/:id',    updateAnnouncement);
router.delete('/:id', deleteAnnouncement);

export default router;
