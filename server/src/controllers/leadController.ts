import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

async function isPartnerOrAdmin(req: AuthRequest): Promise<boolean> {
  if (req.user?.role === 'ADMIN') return true;
  if (!req.user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
  return !!staff?.isPartner;
}

const leadInclude = {
  assignedTo: { select: { id: true, staffName: true } },
  referredBy:  { select: { id: true, clientName: true } },
  convertedClient: { select: { id: true, clientName: true, clientCode: true } },
  createdBy:   { select: { id: true, staffName: true } },
  notes: { orderBy: { createdAt: 'desc' as const } },
};

// ─── GET /leads ───────────────────────────────────────────────────────────────

export const getLeads = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const { stage, priority, assignedToId } = req.query as any;
    const where: any = {};
    if (stage)        where.stage        = stage;
    if (priority)     where.priority     = priority;
    if (assignedToId) where.assignedToId = parseInt(assignedToId);

    const leads = await prisma.lead.findMany({
      where,
      include: leadInclude,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching leads', error: err });
  }
};

// ─── GET /leads/:id ───────────────────────────────────────────────────────────

export const getLead = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(req.params.id) },
      include: leadInclude,
    });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching lead', error: err });
  }
};

// ─── POST /leads ──────────────────────────────────────────────────────────────

export const createLead = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const {
      leadName, contactPerson, phone, email, source, referredById,
      estimatedFee, servicesInterested, stage, priority, assignedToId,
      expectedCloseDate, nextFollowUpDate,
    } = req.body;

    if (!leadName || !contactPerson)
      return res.status(400).json({ message: 'leadName and contactPerson are required' });

    const lead = await prisma.lead.create({
      data: {
        leadName, contactPerson,
        phone:              phone        || null,
        email:              email        || null,
        source:             source       || 'REFERRAL',
        referredById:       referredById ? parseInt(referredById) : null,
        estimatedFee:       estimatedFee ? parseFloat(estimatedFee) : null,
        servicesInterested: servicesInterested || null,
        stage:              stage        || 'NEW',
        priority:           priority     || 'MEDIUM',
        assignedToId:       assignedToId ? parseInt(assignedToId)  : null,
        expectedCloseDate:  expectedCloseDate  ? new Date(expectedCloseDate)  : null,
        nextFollowUpDate:   nextFollowUpDate   ? new Date(nextFollowUpDate)   : null,
        createdById:        req.user!.staffId!,
      },
      include: leadInclude,
    });
    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ message: 'Error creating lead', error: err });
  }
};

// ─── PUT /leads/:id ───────────────────────────────────────────────────────────

export const updateLead = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const id = parseInt(req.params.id);
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Lead not found' });

    const {
      leadName, contactPerson, phone, email, source, referredById,
      estimatedFee, servicesInterested, stage, priority, assignedToId,
      expectedCloseDate, nextFollowUpDate, lostReason, wonFee,
    } = req.body;

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        leadName:           leadName           ?? existing.leadName,
        contactPerson:      contactPerson      ?? existing.contactPerson,
        phone:              phone              !== undefined ? (phone || null)              : existing.phone,
        email:              email              !== undefined ? (email || null)              : existing.email,
        source:             source             ?? existing.source,
        referredById:       referredById       !== undefined ? (referredById ? parseInt(referredById) : null) : existing.referredById,
        estimatedFee:       estimatedFee       !== undefined ? (estimatedFee ? parseFloat(estimatedFee) : null) : existing.estimatedFee,
        servicesInterested: servicesInterested !== undefined ? (servicesInterested || null) : existing.servicesInterested,
        stage:              stage              ?? existing.stage,
        priority:           priority           ?? existing.priority,
        assignedToId:       assignedToId       !== undefined ? (assignedToId ? parseInt(assignedToId) : null) : existing.assignedToId,
        expectedCloseDate:  expectedCloseDate  !== undefined ? (expectedCloseDate  ? new Date(expectedCloseDate)  : null) : existing.expectedCloseDate,
        nextFollowUpDate:   nextFollowUpDate   !== undefined ? (nextFollowUpDate   ? new Date(nextFollowUpDate)   : null) : existing.nextFollowUpDate,
        lostReason:         lostReason         !== undefined ? (lostReason || null) : existing.lostReason,
        wonFee:             wonFee             !== undefined ? (wonFee ? parseFloat(wonFee) : null) : existing.wonFee,
      },
      include: leadInclude,
    });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: 'Error updating lead', error: err });
  }
};

// ─── DELETE /leads/:id ────────────────────────────────────────────────────────

export const deleteLead = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const id = parseInt(req.params.id);
    await prisma.leadNote.deleteMany({ where: { leadId: id } });
    await prisma.lead.delete({ where: { id } });
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting lead', error: err });
  }
};

// ─── POST /leads/:id/notes ────────────────────────────────────────────────────

export const addNote = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const leadId = parseInt(req.params.id);
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ message: 'Note is required' });
    if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required to add notes' });

    // get author name
    let authorName = req.user?.email || 'Unknown';
    if (req.user?.staffId) {
      const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
      if (staff) authorName = staff.staffName;
    }

    const leadNote = await prisma.leadNote.create({
      data: { leadId, note: note.trim(), authorId: req.user!.staffId!, authorName },
    });
    res.status(201).json(leadNote);
  } catch (err) {
    res.status(500).json({ message: 'Error adding note', error: err });
  }
};

// ─── DELETE /leads/notes/:noteId ─────────────────────────────────────────────

export const deleteNote = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    await prisma.leadNote.delete({ where: { id: parseInt(req.params.noteId) } });
    res.json({ message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting note', error: err });
  }
};

// ─── POST /leads/:id/convert ──────────────────────────────────────────────────

export const convertToClient = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const id = parseInt(req.params.id);
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (lead.convertedClientId) return res.status(400).json({ message: 'Lead already converted' });

    const { clientCode, clientName, legalName, gstin, address } = req.body;
    if (!clientCode || !clientName)
      return res.status(400).json({ message: 'clientCode and clientName are required' });

    // Both operations must succeed or fail together — use callback-style transaction
    const client = await prisma.$transaction(async (tx) => {
      const newClient = await tx.client.create({
        data: { clientCode, clientName, legalName, gstin, address },
      });
      await tx.lead.update({
        where: { id },
        data: { convertedClientId: newClient.id, stage: 'WON' },
      });
      return newClient;
    });

    res.status(201).json(client);
  } catch (err: any) {
    if (err?.code === 'P2002') return res.status(400).json({ message: 'Client code already exists' });
    res.status(500).json({ message: 'Error converting lead', error: err });
  }
};

// ─── GET /leads/stats ─────────────────────────────────────────────────────────

export const getLeadStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isPartnerOrAdmin(req)))
      return res.status(403).json({ message: 'Partners only' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [all, wonThisMonth, followUpToday, stageGroups] = await Promise.all([
      prisma.lead.findMany({ select: { stage: true, estimatedFee: true, wonFee: true } }),
      prisma.lead.count({
        where: {
          stage: 'WON',
          updatedAt: { gte: new Date(today.getFullYear(), today.getMonth(), 1) },
        },
      }),
      prisma.lead.count({
        where: {
          nextFollowUpDate: { gte: today, lt: new Date(today.getTime() + 86400000) },
          stage: { notIn: ['WON', 'LOST'] },
        },
      }),
      prisma.lead.groupBy({ by: ['stage'], _count: true }),
    ]);

    const activeLeads = all.filter((l) => !['WON', 'LOST'].includes(l.stage));
    const pipelineValue = activeLeads.reduce(
      (sum, l) => sum + (l.estimatedFee ? Number(l.estimatedFee) : 0), 0
    );
    const totalWonValue = all
      .filter((l) => l.stage === 'WON')
      .reduce((sum, l) => sum + (l.wonFee ? Number(l.wonFee) : l.estimatedFee ? Number(l.estimatedFee) : 0), 0);

    const stageCounts: Record<string, number> = {};
    stageGroups.forEach((g) => { stageCounts[g.stage] = g._count; });

    res.json({
      totalLeads: all.length,
      activeLeads: activeLeads.length,
      pipelineValue,
      wonThisMonth,
      totalWonValue,
      followUpToday,
      stageCounts,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching stats', error: err });
  }
};
