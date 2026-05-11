import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { createAuditLog } from './auditController';

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

const INVOICE_INCLUDE = {
  task: { select: { id: true, taskId: true, taskName: true } },
  client: { select: { id: true, clientCode: true, clientName: true } },
  billingEntity: true,
  clientGstin: true,
  lineItems: { orderBy: { slNo: 'asc' as const } },
  profitCentre: { select: { id: true, name: true } },
};

/** Returns true if the user is a Partner (isPartner=true on Staff) or ADMIN */
const isPartnerOrAdmin = async (user: any): Promise<boolean> => {
  if (user?.role === 'ADMIN') return true;
  if (!user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: user.staffId } });
  return staff?.isPartner ?? false;
};

/** Auto-generate next invoice number using InvoiceSettings */
const generateInvoiceNumber = async (): Promise<string> => {
  // Upsert settings with defaults if not yet created
  const settings = await prisma.invoiceSettings.upsert({
    where: { id: 1 },
    create: { prefix: '', suffix: '', startNumber: 1, updatedAt: new Date() },
    update: {},
  });
  const num = settings.startNumber;
  // Increment for next invoice
  await prisma.invoiceSettings.update({ where: { id: 1 }, data: { startNumber: num + 1 } });
  return `${settings.prefix}${num}${settings.suffix}`;
};

/** Calculate ageing bucket (days past due) */
const ageingBucket = (dueDate: Date | null, invoiceDate: Date): string => {
  const reference = dueDate ?? new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const refDay = new Date(reference);
  refDay.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - refDay.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Current';
  if (days <= 30) return '0-30 days';
  if (days <= 60) return '31-60 days';
  if (days <= 90) return '61-90 days';
  return '90+ days';
};

const formatDate = (d: Date | string | null | undefined): string => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN');
};

const formatDateTime = (d: Date | string | null | undefined): string => {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2, '0')}-${dt.toLocaleString('en', { month: 'short' })}-${dt.getFullYear()} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
};

/** Compute tax amounts given taxableAmount and taxType */
const computeTax = (amount: number, taxType: string) => {
  if (taxType === 'CGST_SGST') {
    const cgst = parseFloat((amount * 0.09).toFixed(2));
    const sgst = parseFloat((amount * 0.09).toFixed(2));
    return { cgstRate: 9, sgstRate: 9, igstRate: null, cgstAmount: cgst, sgstAmount: sgst, igstAmount: null, totalAmount: amount + cgst + sgst };
  }
  if (taxType === 'IGST') {
    const igst = parseFloat((amount * 0.18).toFixed(2));
    return { cgstRate: null, sgstRate: null, igstRate: 18, cgstAmount: null, sgstAmount: null, igstAmount: igst, totalAmount: amount + igst };
  }
  return { cgstRate: null, sgstRate: null, igstRate: null, cgstAmount: null, sgstAmount: null, igstAmount: null, totalAmount: amount };
};

// ── GET ALL INVOICES ──────────────────────────────────────────────────────────

export const getInvoices = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { status, clientId, profitCentreId } = req.query;
    const userRole = req.user?.role;
    const isAdminOrHR = userRole === 'ADMIN' || userRole === 'HR';

    const staffProfile = req.user?.staffId
      ? await prisma.staff.findUnique({ where: { id: req.user.staffId }, select: { isPartner: true } })
      : null;
    const isPartner = staffProfile?.isPartner ?? false;

    const where: any = {};
    if (status) where.status = status as string;
    if (clientId) where.clientId = Number(clientId);
    if (profitCentreId) where.profitCentreId = Number(profitCentreId);

    if (isAdminOrHR) {
      // Admin/HR see everything — no extra filter
    } else if (isPartner) {
      // Partners see only invoices in their assigned profit centres
      const pcAccess = await prisma.staffProfitCentre.findMany({
        where: { staffId: req.user.staffId },
        select: { profitCentreId: true },
      });
      if (pcAccess.length === 0) return res.json([]);
      const pcIds = pcAccess.map((p) => p.profitCentreId);
      // Merge with any existing profitCentreId filter from query param
      where.profitCentreId = profitCentreId
        ? { in: pcIds.includes(Number(profitCentreId)) ? [Number(profitCentreId)] : [] }
        : { in: pcIds };
    } else {
      // Regular staff: only invoices for tasks they have timesheets on
      const staffId = req.user?.staffId;
      if (!staffId) return res.status(403).json({ message: 'No staff profile associated' });
      const staffTimesheets = await prisma.timesheet.findMany({
        where: { staffId }, select: { taskId: true }, distinct: ['taskId'],
      });
      where.taskId = { in: staffTimesheets.map((ts) => ts.taskId) };
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    res.json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET SINGLE INVOICE ────────────────────────────────────────────────────────

export const getInvoice = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(id) },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── CREATE INVOICE ────────────────────────────────────────────────────────────

export const createInvoice = async (req: Request & { user?: any }, res: Response) => {
  const { taskId, amount, invoiceDate, dueDate, notes, billingEntityId,
          taxType, clientGstinId, hsnSacCode, template, lineItems } = req.body;

  if (!taskId || !invoiceDate) {
    return res.status(400).json({ message: 'taskId and invoiceDate are required' });
  }

  try {
    // Validate task exists
    const task = await prisma.task.findUnique({ where: { id: Number(taskId) } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!task.clientId) return res.status(400).json({ message: 'Task has no associated client' });

    // Resolve profit centre: use task's PC, or fall back to "Default"
    let resolvedProfitCentreId: number | null = task.profitCentreId ?? null;
    if (!resolvedProfitCentreId) {
      const defaultPc = await prisma.profitCentre.findFirst({ where: { name: 'Default' } });
      resolvedProfitCentreId = defaultPc?.id ?? null;
    }

    // Prevent double-invoicing
    const existing = await prisma.invoice.findUnique({ where: { taskId: Number(taskId) } });
    if (existing) {
      return res.status(409).json({ message: 'An invoice already exists for this task' });
    }

    const invoiceNumber = await generateInvoiceNumber();

    // Compute amount from line items if provided
    let taxableAmount = Number(amount);
    const parsedLineItems: Array<{ slNo: number; description: string; hsnSac?: string; quantity: number; rate: number; unit?: string; amount: number }> = [];

    if (Array.isArray(lineItems) && lineItems.length > 0) {
      lineItems.forEach((li: any, idx: number) => {
        const qty = Number(li.quantity ?? 1);
        const rate = Number(li.rate);
        const lineAmt = parseFloat((qty * rate).toFixed(2));
        parsedLineItems.push({ slNo: idx + 1, description: li.description, hsnSac: li.hsnSac, quantity: qty, rate, unit: li.unit, amount: lineAmt });
      });
      taxableAmount = parsedLineItems.reduce((s, l) => s + l.amount, 0);
    }

    const tax = computeTax(taxableAmount, taxType || 'NONE');

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          taskId: Number(taskId),
          clientId: task.clientId!,
          billingEntityId: billingEntityId ? Number(billingEntityId) : null,
          clientGstinId: clientGstinId ? Number(clientGstinId) : null,
          amount: taxableAmount,
          taxType: (taxType || 'NONE') as any,
          cgstRate: tax.cgstRate,
          sgstRate: tax.sgstRate,
          igstRate: tax.igstRate,
          cgstAmount: tax.cgstAmount,
          sgstAmount: tax.sgstAmount,
          igstAmount: tax.igstAmount,
          totalAmount: tax.totalAmount,
          hsnSacCode: hsnSacCode ?? null,
          template: template ? Number(template) : 1,
          invoiceDate: new Date(invoiceDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          notes: notes ?? null,
          profitCentreId: resolvedProfitCentreId,
          status: 'DRAFT',
        },
      });
      if (parsedLineItems.length > 0) {
        await tx.invoiceLineItem.createMany({ data: parsedLineItems.map(li => ({ ...li, invoiceId: inv.id })) });
      }
      return tx.invoice.findUnique({ where: { id: inv.id }, include: INVOICE_INCLUDE });
    });

    // Mark task as BILLED only when invoice is SENT (not on DRAFT creation)

    await createAuditLog(req.user.id, 'invoice', invoice!.id, 'CREATE', {
      invoiceNumber,
      taskId,
      amount: taxableAmount,
    });

    res.status(201).json(invoice);
  } catch (err: any) {
    console.error(err);
    if (err.code === 'P2002') return res.status(409).json({ message: 'Invoice number conflict, please retry' });
    res.status(500).json({ message: 'Server error' });
  }
};

// ── UPDATE INVOICE ────────────────────────────────────────────────────────────

export const updateInvoice = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { amount, invoiceDate, dueDate, notes, status,
          taxType, clientGstinId, billingEntityId, hsnSacCode, template, lineItems } = req.body;

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    // Only DRAFT invoices are fully editable
    if (invoice.status !== 'DRAFT') {
      return res.status(400).json({ message: 'Only DRAFT invoices can be edited' });
    }

    // Status changes are admin-only
    if (status !== undefined && status !== invoice.status) {
      if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Only admins can change invoice status' });
      }
    }

    // Compute amount/tax from line items if provided
    let taxableAmount = amount !== undefined ? Number(amount) : Number(invoice.amount);
    const parsedLineItems: Array<{ slNo: number; description: string; hsnSac?: string; quantity: number; rate: number; unit?: string; amount: number }> = [];

    if (Array.isArray(lineItems) && lineItems.length > 0) {
      lineItems.forEach((li: any, idx: number) => {
        const qty = Number(li.quantity ?? 1);
        const rate = Number(li.rate);
        const lineAmt = parseFloat((qty * rate).toFixed(2));
        parsedLineItems.push({ slNo: idx + 1, description: li.description, hsnSac: li.hsnSac, quantity: qty, rate, unit: li.unit, amount: lineAmt });
      });
      taxableAmount = parsedLineItems.reduce((s, l) => s + l.amount, 0);
    }

    const resolvedTaxType = taxType ?? (invoice.taxType as string);
    const tax = computeTax(taxableAmount, resolvedTaxType || 'NONE');

    const before = { ...invoice };
    const updated = await prisma.$transaction(async (tx) => {
      if (parsedLineItems.length > 0) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: Number(id) } });
        await tx.invoiceLineItem.createMany({ data: parsedLineItems.map(li => ({ ...li, invoiceId: Number(id) })) });
      }

      return tx.invoice.update({
        where: { id: Number(id) },
        data: {
          amount: taxableAmount,
          taxType: (resolvedTaxType || 'NONE') as any,
          cgstRate: tax.cgstRate,
          sgstRate: tax.sgstRate,
          igstRate: tax.igstRate,
          cgstAmount: tax.cgstAmount,
          sgstAmount: tax.sgstAmount,
          igstAmount: tax.igstAmount,
          totalAmount: tax.totalAmount,
          clientGstinId: clientGstinId !== undefined ? (clientGstinId ? Number(clientGstinId) : null) : undefined,
          billingEntityId: billingEntityId !== undefined ? (billingEntityId ? Number(billingEntityId) : null) : undefined,
          hsnSacCode: hsnSacCode !== undefined ? hsnSacCode : undefined,
          template: template !== undefined ? Number(template) : undefined,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
          dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
          notes: notes !== undefined ? notes : undefined,
          status: status ?? undefined,
        },
        include: INVOICE_INCLUDE,
      });
    });

    // Mark the associated task as BILLED when invoice transitions to SENT
    // (invoice.status is always DRAFT here, so just check the new status)
    if (status === 'SENT' && invoice.taskId) {
      await prisma.task.update({
        where: { id: invoice.taskId },
        data: { billingStatus: 'BILLED' },
      });
    }

    await createAuditLog(req.user.id, 'invoice', invoice.id, 'UPDATE', { before, after: req.body });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── RECORD PAYMENT ────────────────────────────────────────────────────────────

export const recordPayment = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { paymentAmount, paymentDate, paymentNotes } = req.body;

  if (!paymentAmount || !paymentDate) {
    return res.status(400).json({ message: 'paymentAmount and paymentDate are required' });
  }

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Cannot record payment on a cancelled invoice' });
    }

    const prior = Number(invoice.paymentAmount ?? 0);
    const paid = prior + Number(paymentAmount);
    const total = Number(invoice.totalAmount ?? invoice.amount);
    const newStatus = paid >= total ? 'PAID' : 'PARTIALLY_PAID';

    const updated = await prisma.invoice.update({
      where: { id: Number(id) },
      data: {
        paymentAmount: paid,
        paymentDate: new Date(paymentDate),
        paymentNotes: paymentNotes ?? null,
        status: newStatus,
      },
      include: INVOICE_INCLUDE,
    });

    await createAuditLog(req.user.id, 'invoice', invoice.id, 'PAYMENT', {
      paymentAmount: paid,
      paymentDate,
      status: newStatus,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── CANCEL INVOICE ────────────────────────────────────────────────────────────

export const cancelInvoice = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Invoice is already cancelled' });
    }

    const updated = await prisma.invoice.update({
      where: { id: Number(id) },
      data: { status: 'CANCELLED' },
      include: INVOICE_INCLUDE,
    });

    // Revert task billingStatus to UNBILLED
    await prisma.task.update({
      where: { id: invoice.taskId },
      data: { billingStatus: 'UNBILLED' },
    });

    await createAuditLog(req.user.id, 'invoice', invoice.id, 'CANCEL', { previousStatus: invoice.status });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE INVOICE ────────────────────────────────────────────────────────────

export const deleteInvoice = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    if (invoice.status !== 'DRAFT') {
      return res.status(400).json({ message: 'Only DRAFT invoices can be deleted' });
    }

    await prisma.invoice.delete({ where: { id: Number(id) } });

    // Revert task billingStatus to UNBILLED
    await prisma.task.update({
      where: { id: invoice.taskId },
      data: { billingStatus: 'UNBILLED' },
    });

    await createAuditLog(req.user.id, 'invoice', invoice.id, 'DELETE', {
      invoiceNumber: invoice.invoiceNumber,
    });

    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── EXPORT INVOICES (XLSX) ────────────────────────────────────────────────────

export const exportInvoices = async (req: Request & { user?: any }, res: Response) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = invoices.map((inv) => {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      const invoiceDate = new Date(inv.invoiceDate);
      const effectiveDue = dueDate ?? new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      effectiveDue.setHours(0, 0, 0, 0);
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - effectiveDue.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        'Invoice #': inv.invoiceNumber,
        'Client': inv.client.clientName,
        'Task': `${inv.task.taskId} – ${inv.task.taskName}`,
        'Amount (₹)': Number(inv.amount),
        'Invoice Date': formatDate(inv.invoiceDate),
        'Due Date': formatDate(inv.dueDate),
        'Status': inv.status,
        'Payment Amount (₹)': inv.paymentAmount != null ? Number(inv.paymentAmount) : '',
        'Payment Date': formatDate(inv.paymentDate),
        'Days Overdue': inv.status === 'PAID' || inv.status === 'CANCELLED' ? 0 : daysOverdue,
        'Created At': formatDateTime(inv.createdAt),
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

    ws['!cols'] = [
      { wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
      { wch: 14 }, { wch: 13 }, { wch: 22 },
    ];

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Invoices_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── INVOICE SETTINGS ─────────────────────────────────────────────────────────

export const getInvoiceSettings = async (_req: Request & { user?: any }, res: Response) => {
  try {
    const settings = await prisma.invoiceSettings.upsert({
      where: { id: 1 },
      create: { prefix: '', suffix: '', startNumber: 1, updatedAt: new Date() },
      update: {},
    });
    res.json(settings);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

export const updateInvoiceSettings = async (req: Request & { user?: any }, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Admin only' });
    const { prefix, suffix, startNumber } = req.body;
    const settings = await prisma.invoiceSettings.upsert({
      where: { id: 1 },
      create: { prefix: prefix ?? '', suffix: suffix ?? '', startNumber: startNumber ?? 1, updatedAt: new Date() },
      update: { prefix: prefix ?? undefined, suffix: suffix ?? undefined, startNumber: startNumber !== undefined ? Number(startNumber) : undefined },
    });
    res.json(settings);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── RECEIVABLES ───────────────────────────────────────────────────────────────

export const getReceivables = async (req: Request & { user?: any }, res: Response) => {
  try {
    // Fetch all open (non-PAID, non-CANCELLED) invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { notIn: ['PAID', 'CANCELLED'] },
      },
      include: INVOICE_INCLUDE,
      orderBy: { invoiceDate: 'asc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Auto-mark OVERDUE and attach ageing bucket
    const overdueIds: number[] = [];
    const result = invoices.map((inv) => {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      const invoiceDate = new Date(inv.invoiceDate);
      const effectiveDue = dueDate ?? new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      effectiveDue.setHours(0, 0, 0, 0);

      const isPastDue = effectiveDue.getTime() < today.getTime();
      let currentStatus = inv.status;

      if (isPastDue && inv.status === 'SENT') {
        currentStatus = 'OVERDUE';
        overdueIds.push(inv.id);
      }

      const bucket = ageingBucket(inv.dueDate, invoiceDate);
      const daysOverdue = isPastDue
        ? Math.floor((today.getTime() - effectiveDue.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        ...inv,
        status: currentStatus,
        ageingBucket: bucket,
        daysOverdue,
        effectiveDueDate: effectiveDue,
      };
    });

    // Persist OVERDUE status changes in the background (non-blocking)
    if (overdueIds.length > 0) {
      prisma.invoice
        .updateMany({
          where: { id: { in: overdueIds } },
          data: { status: 'OVERDUE' },
        })
        .catch((err) => console.error('Failed to auto-mark invoices as OVERDUE:', err));
    }

    // Summary totals by bucket
    const summary = {
      'Current': 0,
      '0-30 days': 0,
      '31-60 days': 0,
      '61-90 days': 0,
      '90+ days': 0,
      total: 0,
    };

    for (const inv of result) {
      const amt = Number(inv.amount) - Number(inv.paymentAmount ?? 0);
      const key = inv.ageingBucket as keyof typeof summary;
      if (key in summary) (summary as any)[key] += amt;
      summary.total += amt;
    }

    res.json({ invoices: result, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
