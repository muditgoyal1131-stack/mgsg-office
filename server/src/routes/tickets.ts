import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  getTickets, getTicket, createTicket, updateTicket, assignTicket,
  requestCostApproval, approveCost, rejectCost,
  resolveTicket, closeTicket, reopenTicket,
  addComment, uploadAttachment, deleteAttachment, deleteTicket,
} from '../controllers/ticketController';

const router = Router();

router.use(authenticate);

router.get('/', getTickets);
router.post('/', createTicket);

// Specific sub-resource paths MUST be registered before /:id
router.delete('/attachments/:id', deleteAttachment);

// Parameterised routes last
router.get('/:id', getTicket);
router.put('/:id', updateTicket);
router.delete('/:id', deleteTicket);

router.put('/:id/assign', assignTicket);
router.put('/:id/request-approval', requestCostApproval);
router.put('/:id/approve-cost', approveCost);
router.put('/:id/reject-cost', rejectCost);
router.put('/:id/resolve', resolveTicket);
router.put('/:id/close', closeTicket);
router.put('/:id/reopen', reopenTicket);

router.post('/:id/comments', addComment);
router.post('/:id/attachments', upload.single('file'), uploadAttachment);

export default router;
