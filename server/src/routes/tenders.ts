import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  getTenders, getTenderStats, getTender,
  createTender, updateTender, deleteTender,
  uploadTenderDocument, deleteTenderDocument,
  uploadSubmissionFile, deleteSubmissionFile,
  addComment, deleteComment,
} from '../controllers/tenderController';

const router = Router();
router.use(authenticate);

router.get('/stats',                              getTenderStats);
router.get('/',                                   getTenders);
router.get('/:id',                                getTender);
router.post('/',                                  createTender);
router.put('/:id',                                updateTender);
router.delete('/:id',                             deleteTender);

router.post('/:id/documents',                     upload.single('file'), uploadTenderDocument);
router.delete('/:id/documents/:docId',            deleteTenderDocument);

router.post('/:id/submission-files',              upload.single('file'), uploadSubmissionFile);
router.delete('/:id/submission-files/:fileId',    deleteSubmissionFile);

router.post('/:id/comments',                      addComment);
router.delete('/:id/comments/:commentId',         deleteComment);

export default router;
