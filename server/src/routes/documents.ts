import { Router } from 'express';
import { getTaskDocuments, uploadDocument, deleteDocument } from '../controllers/documentController';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.get('/task/:taskId', authenticate, getTaskDocuments);
router.post('/task/:taskId', authenticate, upload.single('file'), uploadDocument);
router.delete('/:id', authenticate, deleteDocument);

export default router;
