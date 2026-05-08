import { Router } from 'express';
import { authenticate, requireAdmin, requireHR } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  getReimbursements,
  getReimbursement,
  createReimbursement,
  updateReimbursement,
  deleteReimbursement,
  addItem,
  deleteItem,
  uploadAttachment,
  deleteAttachment,
  reviewReimbursement,
  returnReimbursement,
  approveReimbursement,
  rejectReimbursement,
  exportReimbursements,
  getExpenseCategories,
  getAllExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
} from '../controllers/reimbursementController';

const router = Router();
router.use(authenticate);

// ── Specific named paths FIRST (before /:id) ─────────────────────────────────
router.get('/export', exportReimbursements);

// Expense categories
router.get('/categories/active', getExpenseCategories);
router.get('/categories/all', requireAdmin, getAllExpenseCategories);
router.post('/categories', requireAdmin, createExpenseCategory);
router.put('/categories/:id', requireAdmin, updateExpenseCategory);
router.delete('/categories/:id', requireAdmin, deleteExpenseCategory);

// Item & attachment sub-resources (no /:id prefix collision)
router.delete('/items/:itemId', deleteItem);
router.post('/items/:itemId/attachments', upload.single('file'), uploadAttachment);
router.delete('/attachments/:attId', deleteAttachment);

// ── Parameterised claim routes ────────────────────────────────────────────────
router.get('/', getReimbursements);
router.get('/:id', getReimbursement);
router.post('/', createReimbursement);
router.put('/:id', updateReimbursement);
router.delete('/:id', deleteReimbursement);

// Items (nested under a claim)
router.post('/:id/items', addItem);

// Workflow
router.put('/:id/review', requireHR, reviewReimbursement);
router.put('/:id/return', requireHR, returnReimbursement);
router.put('/:id/approve', approveReimbursement);
router.put('/:id/reject', rejectReimbursement);

export default router;
