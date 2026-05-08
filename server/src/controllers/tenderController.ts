import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import { UPLOAD_DIR } from '../config/paths';

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

async function isPartnerOrAdmin(req: AuthRequest): Promise<boolean> {
  if (req.user?.role === 'ADMIN') return true;
  if (!req.user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
  return !!staff?.isPartner;
}

// Can the user see this tender? (partner/admin always yes; assignee yes)
async function canView(req: AuthRequest, tenderId: number): Promise<boolean> {
  if (await isPartnerOrAdmin(req)) return true;
  if (!req.user?.staffId) return false;
  const asgn = await prisma.tenderAssignment.findUnique({
    where: { tenderId_staffId: { tenderId, staffId: req.user.staffId } },
  });
  return !!asgn;
}

const tenderInclude = {
  createdBy:       { select: { id: true, staffName: true } },
  assignedStaff:   { include: { staff: { select: { id: true, staffName: true } } } },
  tenderDocuments: { orderBy: { createdAt: 'asc' as const } },
  submissionFiles: { orderBy: { createdAt: 'asc' as const } },
  comments:        { orderBy: { createdAt: 'asc' as const } },
};

const generateTenderNumber = async (): Promise<string> => {
  const agg = await prisma.tender.aggregate({ _max: { id: true } });
  const n = (agg._max.id ?? 0) + 1;
  return `TND-${String(n).padStart(5, '0')}`;
};

// ─── GET /tenders ─────────────────────────────────────────────────────────────

export const getTenders = async (req: AuthRequest, res: Response) => {
  try {
    const isPA = await isPartnerOrAdmin(req);
    let tenders;

    if (isPA) {
      tenders = await prisma.tender.findMany({
        include: tenderInclude,
        orderBy: { updatedAt: 'desc' },
      });
    } else {
      // Staff: only tenders assigned to them
      if (!req.user?.staffId) return res.status(403).json({ message: 'No staff profile' });
      tenders = await prisma.tender.findMany({
        where: { assignedStaff: { some: { staffId: req.user.staffId } } },
        include: tenderInclude,
        orderBy: { updatedAt: 'desc' },
      });
    }
    res.json(tenders);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching tenders', error: err });
  }
};

// ─── GET /tenders/stats ───────────────────────────────────────────────────────

export const getTenderStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today.getTime() + 7 * 86400000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [all, dueThisWeek, wonThisMonth, stageGroups] = await Promise.all([
      prisma.tender.findMany({ select: { status: true, bidValue: true } }),
      prisma.tender.count({
        where: {
          dueDate: { gte: today, lte: weekEnd },
          status: { notIn: ['WON', 'LOST', 'WITHDRAWN'] },
        },
      }),
      prisma.tender.count({
        where: { status: 'WON', updatedAt: { gte: monthStart } },
      }),
      prisma.tender.groupBy({ by: ['status'], _count: true }),
    ]);

    const active = all.filter((t) => !['WON', 'LOST', 'WITHDRAWN'].includes(t.status));
    const won = all.filter((t) => t.status === 'WON');
    const concluded = all.filter((t) => ['WON', 'LOST'].includes(t.status));

    const totalBidValue = active.reduce((s, t) => s + (t.bidValue ? Number(t.bidValue) : 0), 0);
    const wonValue = won.reduce((s, t) => s + (t.bidValue ? Number(t.bidValue) : 0), 0);
    const winRate = concluded.length > 0 ? Math.round((won.length / concluded.length) * 100) : 0;

    const statusCounts: Record<string, number> = {};
    stageGroups.forEach((g) => { statusCounts[g.status] = g._count; });

    res.json({
      total: all.length,
      active: active.length,
      dueThisWeek,
      wonThisMonth,
      totalBidValue,
      wonValue,
      winRate,
      statusCounts,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching stats', error: err });
  }
};

// ─── GET /tenders/:id ─────────────────────────────────────────────────────────

export const getTender = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await canView(req, id))) return res.status(403).json({ message: 'Access denied' });
    const tender = await prisma.tender.findUnique({ where: { id }, include: tenderInclude });
    if (!tender) return res.status(404).json({ message: 'Tender not found' });
    res.json(tender);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching tender', error: err });
  }
};

// ─── POST /tenders ────────────────────────────────────────────────────────────

export const createTender = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const {
      title, clientName, tenderSource, description,
      bidValue, estimatedValue, emdAmount,
      status, preBidDate, submissionDeadline, dueDate, resultDate,
      assignedStaffIds,
    } = req.body;

    if (!title || !clientName) return res.status(400).json({ message: 'title and clientName are required' });
    if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required to create tenders' });

    const tenderNumber = await generateTenderNumber();

    const tender = await prisma.tender.create({
      data: {
        tenderNumber,
        title,
        clientName,
        tenderSource:       tenderSource       || 'GOVERNMENT',
        description:        description        || null,
        bidValue:           bidValue           ? parseFloat(bidValue)        : null,
        estimatedValue:     estimatedValue     ? parseFloat(estimatedValue)  : null,
        emdAmount:          emdAmount          ? parseFloat(emdAmount)       : null,
        status:             status             || 'DRAFT',
        preBidDate:         preBidDate         ? new Date(preBidDate)         : null,
        submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null,
        dueDate:            dueDate            ? new Date(dueDate)            : null,
        resultDate:         resultDate         ? new Date(resultDate)         : null,
        createdById:        req.user!.staffId!,
        assignedStaff: assignedStaffIds?.length
          ? { create: (assignedStaffIds as number[]).map((sid) => ({ staffId: sid })) }
          : undefined,
      },
      include: tenderInclude,
    });
    res.status(201).json(tender);
  } catch (err) {
    res.status(500).json({ message: 'Error creating tender', error: err });
  }
};

// ─── PUT /tenders/:id ─────────────────────────────────────────────────────────

export const updateTender = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const id = parseInt(req.params.id);
    const existing = await prisma.tender.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Tender not found' });

    const {
      title, clientName, tenderSource, description,
      bidValue, estimatedValue, emdAmount, emdRefunded,
      status, preBidDate, submissionDeadline, submittedAt, dueDate, resultDate,
      lostReason, assignedStaffIds,
    } = req.body;

    // Rebuild assignments if provided
    if (assignedStaffIds !== undefined) {
      await prisma.tenderAssignment.deleteMany({ where: { tenderId: id } });
      if (assignedStaffIds.length > 0) {
        await prisma.tenderAssignment.createMany({
          data: (assignedStaffIds as number[]).map((sid) => ({ tenderId: id, staffId: sid })),
          skipDuplicates: true,
        });
      }
    }

    const d = (v: any) => (v !== undefined ? (v ? new Date(v) : null) : undefined);
    const n = (v: any) => (v !== undefined ? (v !== '' && v !== null ? parseFloat(v) : null) : undefined);

    const tender = await prisma.tender.update({
      where: { id },
      data: {
        title:              title              ?? existing.title,
        clientName:         clientName         ?? existing.clientName,
        tenderSource:       tenderSource       ?? existing.tenderSource,
        description:        description        !== undefined ? (description || null) : existing.description,
        bidValue:           n(bidValue)        ?? existing.bidValue,
        estimatedValue:     n(estimatedValue)  ?? existing.estimatedValue,
        emdAmount:          n(emdAmount)       ?? existing.emdAmount,
        emdRefunded:        emdRefunded        !== undefined ? Boolean(emdRefunded) : existing.emdRefunded,
        status:             status             ?? existing.status,
        preBidDate:         d(preBidDate)      ?? existing.preBidDate,
        submissionDeadline: d(submissionDeadline) ?? existing.submissionDeadline,
        submittedAt:        d(submittedAt)     ?? existing.submittedAt,
        dueDate:            d(dueDate)         ?? existing.dueDate,
        resultDate:         d(resultDate)      ?? existing.resultDate,
        lostReason:         lostReason         !== undefined ? (lostReason || null) : existing.lostReason,
      },
      include: tenderInclude,
    });
    res.json(tender);
  } catch (err) {
    res.status(500).json({ message: 'Error updating tender', error: err });
  }
};

// ─── DELETE /tenders/:id ──────────────────────────────────────────────────────

export const deleteTender = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const id = parseInt(req.params.id);

    // Delete physical files
    const [docs, subs] = await Promise.all([
      prisma.tenderDocument.findMany({ where: { tenderId: id } }),
      prisma.tenderSubmissionFile.findMany({ where: { tenderId: id } }),
    ]);
    [...docs, ...subs].forEach((f) => {
      const fp = path.join(UPLOAD_DIR,f.fileName);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

    // Explicitly delete child rows before removing the parent tender
    await prisma.tenderComment.deleteMany({ where: { tenderId: id } });
    await prisma.tenderAssignment.deleteMany({ where: { tenderId: id } });
    await prisma.tenderDocument.deleteMany({ where: { tenderId: id } });
    await prisma.tenderSubmissionFile.deleteMany({ where: { tenderId: id } });
    await prisma.tender.delete({ where: { id } });
    res.json({ message: 'Tender deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting tender', error: err });
  }
};

// ─── POST /tenders/:id/documents  (tender documents) ─────────────────────────

export const uploadTenderDocument = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const doc = await prisma.tenderDocument.create({
      data: {
        tenderId:    id,
        fileName:    req.file.filename,
        originalName: req.file.originalname,
        fileSize:    req.file.size,
        mimeType:    req.file.mimetype,
        uploadedById: req.user!.staffId!,
      },
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Error uploading document', error: err });
  }
};

export const deleteTenderDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });
    const doc = await prisma.tenderDocument.findUnique({ where: { id: parseInt(req.params.docId) } });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    const fp = path.join(UPLOAD_DIR,doc.fileName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await prisma.tenderDocument.delete({ where: { id: doc.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting document', error: err });
  }
};

// ─── POST /tenders/:id/submission-files ──────────────────────────────────────

export const uploadSubmissionFile = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await canView(req, id))) return res.status(403).json({ message: 'Access denied' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required' });

    const f = await prisma.tenderSubmissionFile.create({
      data: {
        tenderId:    id,
        fileName:    req.file.filename,
        originalName: req.file.originalname,
        fileSize:    req.file.size,
        mimeType:    req.file.mimetype,
        uploadedById: req.user!.staffId!,
      },
    });
    res.status(201).json(f);
  } catch (err) {
    res.status(500).json({ message: 'Error uploading submission file', error: err });
  }
};

export const deleteSubmissionFile = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });
    const f = await prisma.tenderSubmissionFile.findUnique({ where: { id: parseInt(req.params.fileId) } });
    if (!f) return res.status(404).json({ message: 'Not found' });
    const fp = path.join(UPLOAD_DIR,f.fileName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await prisma.tenderSubmissionFile.delete({ where: { id: f.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting submission file', error: err });
  }
};

// ─── Comments ─────────────────────────────────────────────────────────────────

export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!(await canView(req, id))) return res.status(403).json({ message: 'Access denied' });
    const { comment } = req.body;
    if (!comment?.trim()) return res.status(400).json({ message: 'Comment required' });
    if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required to add comments' });

    let authorName = req.user?.email || 'Unknown';
    if (req.user?.staffId) {
      const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
      if (staff) authorName = staff.staffName;
    }

    const c = await prisma.tenderComment.create({
      data: { tenderId: id, comment: comment.trim(), authorId: req.user!.staffId!, authorName },
    });
    res.status(201).json(c);
  } catch (err) {
    res.status(500).json({ message: 'Error adding comment', error: err });
  }
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });
    await prisma.tenderComment.delete({ where: { id: parseInt(req.params.commentId) } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting comment', error: err });
  }
};
