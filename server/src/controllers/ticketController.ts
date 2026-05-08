import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { UPLOAD_DIR } from '../config/paths';

const prisma = new PrismaClient();

const ticketInclude = {
  raisedBy: { select: { id: true, staffName: true } },
  assignedTo: { select: { id: true, staffName: true } },
  approvedBy: { select: { id: true, staffName: true } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  comments: { orderBy: { createdAt: 'asc' as const } },
};

const generateTicketNumber = async (): Promise<string> => {
  // Use max id (not count) to avoid duplicates when rows are deleted or concurrent inserts race
  const agg = await prisma.ticket.aggregate({ _max: { id: true } });
  const n = (agg._max.id ?? 0) + 1;
  return `TKT-${String(n).padStart(5, '0')}`;
};

const isITOrAdmin = (user: any) => user?.role === 'ADMIN' || user?.role === 'IT';

export const getTickets = async (req: Request & { user?: any }, res: Response) => {
  try {
    const user = req.user;
    const isITAdminHR = user?.role === 'ADMIN' || user?.role === 'IT' || user?.role === 'HR';

    let whereClause: any = {};

    if (!isITAdminHR && user?.staffId) {
      const staffId = user.staffId;
      // Get the reporting partner of this staff member
      const staffRecord = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { reportingPartnerId: true, isPartner: true },
      });

      // Partners also see tickets raised by their reportees
      if (staffRecord?.isPartner) {
        // Get all reportees of this partner
        const reportees = await prisma.staff.findMany({
          where: { reportingPartnerId: staffId },
          select: { id: true },
        });
        const reporteeIds = reportees.map(r => r.id);
        whereClause = {
          OR: [
            { raisedById: staffId },
            { assignedToId: staffId },
            { raisedById: { in: reporteeIds } },
          ],
        };
      } else {
        // Regular staff: see own tickets
        whereClause = {
          OR: [
            { raisedById: staffId },
            { assignedToId: staffId },
          ],
        };
      }
    }

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: ticketInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(tickets);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTicket = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(id) },
      include: ticketInclude,
    });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createTicket = async (req: Request & { user?: any }, res: Response) => {
  const { title, description, type, priority } = req.body;
  const raisedById = req.user?.staffId;
  if (!raisedById) return res.status(400).json({ message: 'Staff profile required' });

  try {
    const ticketNumber = await generateTicketNumber();
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title,
        description,
        raisedById,
        type: type || 'SOFTWARE',
        priority: priority || 'MEDIUM',
        status: 'OPEN',
      },
      include: ticketInclude,
    });
    res.status(201).json(ticket);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const assignTicket = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { assignedToId } = req.body;
  if (!isITOrAdmin(req.user)) return res.status(403).json({ message: 'IT / Admin access required' });

  try {
    const ticket = await prisma.ticket.update({
      where: { id: Number(id) },
      data: {
        assignedToId: assignedToId ? Number(assignedToId) : null,
        status: 'IN_PROGRESS',
      },
      include: ticketInclude,
    });
    res.json(ticket);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateTicket = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { title, description, type, priority } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const isRaiser = ticket.raisedById === req.user?.staffId;
    if (!isRaiser && !isITOrAdmin(req.user)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (ticket.status === 'CLOSED') return res.status(400).json({ message: 'Cannot edit closed tickets' });

    const updated = await prisma.ticket.update({
      where: { id: Number(id) },
      data: { title, description, type, priority },
      include: ticketInclude,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const requestCostApproval = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { estimatedCost, costDescription } = req.body;
  if (!isITOrAdmin(req.user)) return res.status(403).json({ message: 'IT / Admin access required' });

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      return res.status(400).json({ message: 'Cannot request approval on closed/resolved ticket' });
    }

    const updated = await prisma.ticket.update({
      where: { id: Number(id) },
      data: {
        estimatedCost: Number(estimatedCost),
        costDescription,
        costStatus: 'PENDING',
        status: 'PENDING_APPROVAL',
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
      },
      include: ticketInclude,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveCost = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const approvedById = req.user?.staffId;
  if (!approvedById) return res.status(400).json({ message: 'Staff profile required' });

  try {
    const staff = await prisma.staff.findUnique({ where: { id: approvedById } });
    if (!staff?.isPartner && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only partners / admins can approve' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.costStatus !== 'PENDING') return res.status(400).json({ message: 'No pending approval' });

    const updated = await prisma.ticket.update({
      where: { id: Number(id) },
      data: {
        costStatus: 'APPROVED',
        approvedById,
        approvedAt: new Date(),
        status: 'IN_PROGRESS',
      },
      include: ticketInclude,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const rejectCost = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const approvedById = req.user?.staffId;
  if (!approvedById) return res.status(400).json({ message: 'Staff profile required' });

  try {
    const staff = await prisma.staff.findUnique({ where: { id: approvedById } });
    if (!staff?.isPartner && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only partners / admins can reject' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.costStatus !== 'PENDING') return res.status(400).json({ message: 'No pending approval' });

    const updated = await prisma.ticket.update({
      where: { id: Number(id) },
      data: {
        costStatus: 'REJECTED',
        approvedById,
        approvedAt: new Date(),
        rejectionReason: rejectionReason || '',
        status: 'IN_PROGRESS',
      },
      include: ticketInclude,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const resolveTicket = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { resolutionNotes } = req.body;
  if (!isITOrAdmin(req.user)) return res.status(403).json({ message: 'IT / Admin access required' });

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.status === 'PENDING_APPROVAL') {
      return res.status(400).json({ message: 'Cost approval is pending — cannot resolve' });
    }

    const updated = await prisma.ticket.update({
      where: { id: Number(id) },
      data: {
        status: 'RESOLVED',
        resolutionNotes,
        resolvedAt: new Date(),
      },
      include: ticketInclude,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const closeTicket = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  if (!isITOrAdmin(req.user)) return res.status(403).json({ message: 'IT / Admin access required' });

  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.status === 'PENDING_APPROVAL') {
      return res.status(400).json({ message: 'Cost approval is pending — cannot close' });
    }

    const updated = await prisma.ticket.update({
      where: { id: Number(id) },
      data: { status: 'CLOSED', closedAt: new Date() },
      include: ticketInclude,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const reopenTicket = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  if (!isITOrAdmin(req.user)) return res.status(403).json({ message: 'IT / Admin access required' });

  try {
    const updated = await prisma.ticket.update({
      where: { id: Number(id) },
      data: { status: 'IN_PROGRESS', resolvedAt: null, closedAt: null },
      include: ticketInclude,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const addComment = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { comment } = req.body;
  if (!comment?.trim()) return res.status(400).json({ message: 'Comment cannot be empty' });

  try {
    const staff = req.user?.staffId
      ? await prisma.staff.findUnique({ where: { id: req.user.staffId } })
      : null;

    const c = await prisma.ticketComment.create({
      data: {
        ticketId: Number(id),
        authorId: req.user.id,
        authorName: staff?.staffName || req.user.email,
        comment: comment.trim(),
      },
    });
    res.status(201).json(c);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const uploadAttachment = async (req: Request & { user?: any; file?: any }, res: Response) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    const att = await prisma.ticketAttachment.create({
      data: {
        ticketId: Number(id),
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user.id,
      },
    });
    res.status(201).json(att);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteAttachment = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const att = await prisma.ticketAttachment.findUnique({ where: { id: Number(id) } });
    if (!att) return res.status(404).json({ message: 'Attachment not found' });
    const filePath = path.join(UPLOAD_DIR,att.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.ticketAttachment.delete({ where: { id: Number(id) } });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteTicket = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Admin access required' });

  try {
    const attachments = await prisma.ticketAttachment.findMany({ where: { ticketId: Number(id) } });
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR,att.fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.ticketAttachment.deleteMany({ where: { ticketId: Number(id) } });
    await prisma.ticketComment.deleteMany({ where: { ticketId: Number(id) } });
    await prisma.ticket.delete({ where: { id: Number(id) } });
    res.json({ message: 'Ticket deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
