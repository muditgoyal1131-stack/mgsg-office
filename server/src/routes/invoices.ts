import { Router } from 'express';
import {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  recordPayment,
  cancelInvoice,
  deleteInvoice,
  exportInvoices,
  getReceivables,
  getInvoiceSettings,
  updateInvoiceSettings,
} from '../controllers/invoiceController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Collection routes ─────────────────────────────────────────────────────────
router.get('/', getInvoices);
router.get('/receivables', getReceivables);
router.get('/export', exportInvoices);
router.post('/', createInvoice);

router.get('/settings', getInvoiceSettings);
router.put('/settings', updateInvoiceSettings);

// ── Single-resource routes ────────────────────────────────────────────────────
router.get('/:id', getInvoice);
router.put('/:id', updateInvoice);
router.put('/:id/payment', recordPayment);
router.put('/:id/cancel', requireAdmin, cancelInvoice);
router.delete('/:id', requireAdmin, deleteInvoice);

export default router;
