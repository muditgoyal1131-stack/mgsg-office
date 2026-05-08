import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { UPLOAD_DIR } from '../config/paths';
import {
  sendReimbursementNotification,
  sendReimbursementReturnedEmail,
  sendReimbursementSubmittedEmail,
} from '../services/emailService';
import { smsReimbursementSubmitted, smsReimbursementDecision } from '../services/smsService';

const prisma = new PrismaClient();

const INCLUDE_FULL = {
  staff: { select: { id: true, staffName: true } },
  task: { select: { id: true, taskId: true, taskName: true, status: true } },
  reviewedBy: { select: { id: true, staffName: true } },
  approvedBy: { select: { id: true, staffName: true } },
  items: {
    include: {
      category: true,
      attachments: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

const isPartnerOrAdmin = async (user: any) => {
  if (user?.role === 'ADMIN') return true;
  if (!user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: user.staffId } });
  return staff?.isPartner ?? false;
};

const isHROrAdmin = (user: any) => user?.role === 'HR' || user?.role === 'ADMIN';

const generateClaimNumber = async (): Promise<string> => {
  const agg = await prisma.reimbursement.aggregate({ _max: { id: true } });
  const seq = (agg._max.id ?? 0) + 1;
  return `CLM-${String(seq).padStart(5, '0')}`;
};

// ── GET ALL ──────────────────────────────────────────────────────────────────

export const getReimbursements = async (req: Request & { user?: any }, res: Response) => {
  try {
    const canSeeAll = isHROrAdmin(req.user) || (await isPartnerOrAdmin(req.user));
    const where = canSeeAll ? {} : { staffId: req.user?.staffId };

    const items = await prisma.reimbursement.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET ONE ──────────────────────────────────────────────────────────────────

export const getReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  try {
    const item = await prisma.reimbursement.findUnique({
      where: { id: Number(id) },
      include: INCLUDE_FULL,
    });
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── CREATE CLAIM ─────────────────────────────────────────────────────────────

export const createReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { taskId, notes, items } = req.body;
  const staffId = req.user?.staffId;

  if (!staffId) return res.status(400).json({ message: 'Staff profile required' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one line item is required' });
  }

  try {
    const task = await prisma.task.findUnique({ where: { id: Number(taskId) } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.status === 'CLOSED') return res.status(400).json({ message: 'Cannot claim against a closed task' });

    const claimNumber = await generateClaimNumber();

    const claim = await prisma.reimbursement.create({
      data: {
        claimNumber,
        staffId,
        taskId: Number(taskId),
        notes: notes || null,
        status: 'PENDING',
        items: {
          create: items.map((item: any) => ({
            description: item.description,
            amount: Number(item.amount),
            date: new Date(item.date),
            categoryId: Number(item.categoryId),
          })),
        },
      },
      include: INCLUDE_FULL,
    });
    res.status(201).json(claim);

    // Notify partners / admins via email + SMS (fire-and-forget)
    const totalAmount = (claim as any).items.reduce((s: number, i: any) => s + Number(i.amount), 0);
    const approvers = await prisma.staff.findMany({
      where: { isActive: true, OR: [{ isPartner: true }, { user: { role: 'ADMIN' } }] },
      select: { email: true, phone: true },
    });
    const approverEmails = approvers.map((s: any) => s.email).filter(Boolean) as string[];
    const approverPhones = approvers.map((s: any) => s.phone);
    const staffName = (claim as any).staff.staffName;
    if (approverEmails.length > 0) {
      sendReimbursementSubmittedEmail(approverEmails, staffName, claim.claimNumber, totalAmount).catch(() => {});
    }
    smsReimbursementSubmitted(approverPhones, staffName, claim.claimNumber, totalAmount).catch(() => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── UPDATE CLAIM (notes / task while PENDING or RETURNED) ────────────────────

export const updateReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { taskId, notes } = req.body;
  try {
    const existing = await prisma.reimbursement.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (!['PENDING', 'RETURNED'].includes(existing.status)) {
      return res.status(400).json({ message: 'Only PENDING or RETURNED claims can be edited' });
    }
    if (existing.staffId !== req.user?.staffId && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const updated = await prisma.reimbursement.update({
      where: { id: Number(id) },
      data: {
        taskId: taskId ? Number(taskId) : undefined,
        notes: notes !== undefined ? notes : undefined,
        // reset to PENDING when resubmitting a RETURNED claim
        status: existing.status === 'RETURNED' ? 'PENDING' : undefined,
        returnReason: existing.status === 'RETURNED' ? null : undefined,
      },
      include: INCLUDE_FULL,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADD ITEM ─────────────────────────────────────────────────────────────────

export const addItem = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { description, amount, date, categoryId } = req.body;
  try {
    const claim = await prisma.reimbursement.findUnique({ where: { id: Number(id) } });
    if (!claim) return res.status(404).json({ message: 'Not found' });
    if (!['PENDING', 'RETURNED'].includes(claim.status)) {
      return res.status(400).json({ message: 'Cannot modify items on this claim' });
    }
    const item = await prisma.reimbursementItem.create({
      data: {
        reimbursementId: Number(id),
        description,
        amount: Number(amount),
        date: new Date(date),
        categoryId: Number(categoryId),
      },
      include: { category: true, attachments: true },
    });
    res.status(201).json(item);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE ITEM ──────────────────────────────────────────────────────────────

export const deleteItem = async (req: Request & { user?: any }, res: Response) => {
  const { itemId } = req.params;
  try {
    const item = await prisma.reimbursementItem.findUnique({
      where: { id: Number(itemId) },
      include: { reimbursement: true, attachments: true },
    });
    if (!item) return res.status(404).json({ message: 'Not found' });
    if (!['PENDING', 'RETURNED'].includes(item.reimbursement.status)) {
      return res.status(400).json({ message: 'Cannot modify items on this claim' });
    }
    // delete attachment files
    for (const att of item.attachments) {
      const filePath = path.join(UPLOAD_DIR,att.fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.reimbursementItem.delete({ where: { id: Number(itemId) } });
    res.json({ message: 'Item deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── UPLOAD ATTACHMENT ────────────────────────────────────────────────────────

export const uploadAttachment = async (req: Request & { user?: any }, res: Response) => {
  const { itemId } = req.params;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  try {
    const item = await prisma.reimbursementItem.findUnique({
      where: { id: Number(itemId) },
      include: { reimbursement: true },
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    if (!['PENDING', 'RETURNED'].includes(item.reimbursement.status)) {
      return res.status(400).json({ message: 'Cannot add attachments to this claim' });
    }
    const att = await prisma.reimbursementAttachment.create({
      data: {
        itemId: Number(itemId),
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user?.staffId ?? null,
      },
    });
    res.status(201).json(att);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE ATTACHMENT ────────────────────────────────────────────────────────

export const deleteAttachment = async (req: Request & { user?: any }, res: Response) => {
  const { attId } = req.params;
  try {
    const att = await prisma.reimbursementAttachment.findUnique({
      where: { id: Number(attId) },
      include: { item: { include: { reimbursement: true } } },
    });
    if (!att) return res.status(404).json({ message: 'Not found' });
    if (!['PENDING', 'RETURNED'].includes(att.item.reimbursement.status)) {
      return res.status(400).json({ message: 'Cannot delete attachments on this claim' });
    }
    const filePath = path.join(UPLOAD_DIR,att.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.reimbursementAttachment.delete({ where: { id: Number(attId) } });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADMIN: MARK REVIEWED ─────────────────────────────────────────────────────

export const reviewReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR or Admin only' });
  try {
    const claim = await prisma.reimbursement.findUnique({ where: { id: Number(id) } });
    if (!claim) return res.status(404).json({ message: 'Not found' });
    if (claim.status !== 'PENDING') {
      return res.status(400).json({ message: `Claim is ${claim.status}, cannot mark as reviewed` });
    }
    const updated = await prisma.reimbursement.update({
      where: { id: Number(id) },
      data: {
        status: 'REVIEWED',
        reviewedById: req.user.staffId,
        reviewedAt: new Date(),
        returnReason: null,
      },
      include: INCLUDE_FULL,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ADMIN: RETURN TO STAFF ───────────────────────────────────────────────────

export const returnReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { returnReason } = req.body;
  if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR or Admin only' });
  try {
    const claim = await prisma.reimbursement.findUnique({ where: { id: Number(id) } });
    if (!claim) return res.status(404).json({ message: 'Not found' });
    if (claim.status !== 'PENDING') {
      return res.status(400).json({ message: `Claim is ${claim.status}, cannot return` });
    }
    const updated = await prisma.reimbursement.update({
      where: { id: Number(id) },
      data: {
        status: 'RETURNED',
        reviewedById: req.user.staffId,
        reviewedAt: new Date(),
        returnReason: returnReason || 'Please review and resubmit',
      },
      include: INCLUDE_FULL,
    });
    res.json(updated);

    // Email + SMS the staff member (fire-and-forget)
    const staffEmail = (updated as any).staff?.email;
    const staffPhone = (updated as any).staff?.phone;
    const staffName  = (updated as any).staff?.staffName;
    const reason     = returnReason || 'Please review and resubmit';
    if (staffEmail) {
      sendReimbursementReturnedEmail(staffEmail, staffName, updated.claimNumber, reason).catch(() => {});
    }
    smsReimbursementDecision(staffPhone, staffName, updated.claimNumber, 'RETURNED', reason).catch(() => {});
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── PARTNER: APPROVE ─────────────────────────────────────────────────────────

export const approveReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const approvedById = req.user?.staffId;

  try {
    const canApprove = await isPartnerOrAdmin(req.user);
    if (!canApprove) return res.status(403).json({ message: 'Partner or Admin only' });

    const claim = await prisma.reimbursement.findUnique({
      where: { id: Number(id) },
      include: { items: true, task: true },
    });
    if (!claim) return res.status(404).json({ message: 'Not found' });
    if (claim.status !== 'REVIEWED') {
      return res.status(400).json({ message: 'Claim must be reviewed by admin before approval' });
    }
    if (claim.task && claim.task.status === 'CLOSED') {
      return res.status(400).json({ message: 'Task is closed' });
    }

    // Wrap expense creation + status update in a single transaction so partial
    // failures cannot leave the claim in a corrupt state.
    const updated = await prisma.$transaction(async (tx) => {
      for (const item of claim.items) {
        if (item.expenseId) continue; // already created
        const expense = await tx.expense.create({
          data: {
            taskId: claim.taskId,
            description: `[Reimb: ${claim.claimNumber}] ${item.description}`,
            amount: item.amount,
            date: item.date,
            category: 'Reimbursement',
          },
        });
        await tx.reimbursementItem.update({
          where: { id: item.id },
          data: { expenseId: expense.id },
        });
      }
      return tx.reimbursement.update({
        where: { id: Number(id) },
        data: { status: 'APPROVED', approvedById, approvedAt: new Date() },
        include: INCLUDE_FULL,
      });
    });
    res.json(updated);

    // Email + SMS the staff member (fire-and-forget)
    const staffEmail = (updated as any).staff?.email;
    const staffPhone = (updated as any).staff?.phone;
    const staffName  = (updated as any).staff?.staffName;
    if (staffEmail) {
      sendReimbursementNotification(staffEmail, staffName, updated.claimNumber, 'APPROVED').catch(() => {});
    }
    smsReimbursementDecision(staffPhone, staffName, updated.claimNumber, 'APPROVED').catch(() => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── PARTNER: REJECT ──────────────────────────────────────────────────────────

export const rejectReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const approvedById = req.user?.staffId;

  try {
    const canApprove = await isPartnerOrAdmin(req.user);
    if (!canApprove) return res.status(403).json({ message: 'Partner or Admin only' });

    const claim = await prisma.reimbursement.findUnique({ where: { id: Number(id) } });
    if (!claim) return res.status(404).json({ message: 'Not found' });
    if (claim.status !== 'REVIEWED') {
      return res.status(400).json({ message: 'Claim must be in REVIEWED state to reject' });
    }

    const updated = await prisma.reimbursement.update({
      where: { id: Number(id) },
      data: { status: 'REJECTED', approvedById, approvedAt: new Date(), rejectionReason: rejectionReason || '' },
      include: INCLUDE_FULL,
    });
    res.json(updated);

    // Email + SMS the staff member (fire-and-forget)
    const staffEmail = (updated as any).staff?.email;
    const staffPhone = (updated as any).staff?.phone;
    const staffName  = (updated as any).staff?.staffName;
    if (staffEmail) {
      sendReimbursementNotification(staffEmail, staffName, updated.claimNumber, 'REJECTED', rejectionReason).catch(() => {});
    }
    smsReimbursementDecision(staffPhone, staffName, updated.claimNumber, 'REJECTED', rejectionReason).catch(() => {});
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE CLAIM ─────────────────────────────────────────────────────────────

export const deleteReimbursement = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  try {
    const claim = await prisma.reimbursement.findUnique({
      where: { id: Number(id) },
      include: { items: { include: { attachments: true } } },
    });
    if (!claim) return res.status(404).json({ message: 'Not found' });
    if (!['PENDING', 'RETURNED'].includes(claim.status)) {
      return res.status(400).json({ message: 'Only PENDING or RETURNED claims can be deleted' });
    }
    if (claim.staffId !== req.user?.staffId && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    // clean up uploaded files
    for (const item of claim.items) {
      for (const att of item.attachments) {
        const filePath = path.join(UPLOAD_DIR,att.fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    await prisma.reimbursement.delete({ where: { id: Number(id) } });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── EXPORT EXCEL ─────────────────────────────────────────────────────────────

export const exportReimbursements = async (req: Request & { user?: any }, res: Response) => {
  try {
    const canSeeAll = isHROrAdmin(req.user) || (await isPartnerOrAdmin(req.user));
    const where = canSeeAll ? {} : { staffId: req.user?.staffId };

    const claims = await prisma.reimbursement.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: { createdAt: 'desc' },
    });

    const fmt = (d: Date | string | null | undefined) => {
      if (!d) return '';
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, '0')}-${dt.toLocaleString('en', { month: 'short' })}-${dt.getFullYear()} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
    };

    const rows: any[] = [];
    for (const claim of claims) {
      const totalAmount = claim.items.reduce((s: number, i: any) => s + Number(i.amount), 0);
      for (const item of claim.items) {
        rows.push({
          'Claim No.': claim.claimNumber,
          'Staff': claim.staff.staffName,
          'Task': claim.task.taskId,
          'Task Name': claim.task.taskName,
          'Claim Notes': claim.notes || '',
          'Item Description': item.description,
          'Category': item.category.name,
          'Item Date': item.date ? new Date(item.date).toLocaleDateString('en-IN') : '',
          'Amount (₹)': Number(item.amount),
          'Claim Total (₹)': totalAmount,
          'Status': claim.status,
          'Reviewed By': claim.reviewedBy?.staffName || '',
          'Reviewed At': fmt(claim.reviewedAt),
          'Return Reason': claim.returnReason || '',
          'Approved/Rejected By': claim.approvedBy?.staffName || '',
          'Claim Date': fmt(claim.createdAt),
          'Approval Date': fmt(claim.approvedAt),
          'Rejection Reason': claim.rejectionReason || '',
          'Attachments': item.attachments.length,
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reimbursements');

    // Column widths
    ws['!cols'] = [
      { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 20 },
      { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 25 }, { wch: 18 },
      { wch: 22 }, { wch: 22 }, { wch: 25 }, { wch: 12 },
    ];

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Reimbursements_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── EXPENSE CATEGORIES (Masters) ──────────────────────────────────────────────

export const getExpenseCategories = async (_req: Request, res: Response) => {
  try {
    const cats = await prisma.reimbursementCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(cats);
  } catch { res.status(500).json({ message: 'Server error' }); }
};

export const getAllExpenseCategories = async (_req: Request, res: Response) => {
  try {
    const cats = await prisma.reimbursementCategory.findMany({ orderBy: { name: 'asc' } });
    res.json(cats);
  } catch { res.status(500).json({ message: 'Server error' }); }
};

export const createExpenseCategory = async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name required' });
  try {
    const cat = await prisma.reimbursementCategory.create({ data: { name: name.trim() } });
    res.status(201).json(cat);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateExpenseCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, isActive } = req.body;
  try {
    const cat = await prisma.reimbursementCategory.update({
      where: { id: Number(id) },
      data: {
        name: name?.trim() ?? undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      },
    });
    res.json(cat);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteExpenseCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const inUse = await prisma.reimbursementItem.count({ where: { categoryId: Number(id) } });
    if (inUse > 0) return res.status(400).json({ message: `Cannot delete — used by ${inUse} item(s)` });
    await prisma.reimbursementCategory.delete({ where: { id: Number(id) } });
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
};
