import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  getStaffDocuments, uploadStaffDocument, updateStaffDocument,
  deleteStaffDocument, getExpiryAlerts,
} from '../controllers/staffDocumentController';

const router = Router();
router.use(authenticate);

router.get('/expiry-alerts',        getExpiryAlerts);
router.get('/',                     getStaffDocuments);
router.post('/', upload.single('file'), uploadStaffDocument);
router.put('/:id',                  updateStaffDocument);
router.delete('/:id',               deleteStaffDocument);

export default router;
