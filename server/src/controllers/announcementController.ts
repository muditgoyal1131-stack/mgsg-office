import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isHROrAdmin   = (u: any) => u?.role === 'HR' || u?.role === 'ADMIN';
const canPost       = async (req: any): Promise<boolean> => {
  if (isHROrAdmin(req.user)) return true;
  if (!req.user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
  return !!staff?.isPartner;
};

const include = { createdBy: { select: { id: true, staffName: true } } };

// GET /announcements
export const getAnnouncements = async (req: Request & { user?: any }, res: Response) => {
  try {
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      include,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching announcements', error: err });
  }
};

// POST /announcements
export const createAnnouncement = async (req: Request & { user?: any }, res: Response) => {
  if (!(await canPost(req))) return res.status(403).json({ message: 'HR, Admin, or Partner only' });
  const { title, content, isPinned, expiresAt } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ message: 'title and content required' });
  try {
    const ann = await prisma.announcement.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        isPinned: !!isPinned,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById: req.user!.staffId!,
      },
      include,
    });
    res.status(201).json(ann);
  } catch (err) {
    res.status(500).json({ message: 'Error creating announcement', error: err });
  }
};

// PUT /announcements/:id
export const updateAnnouncement = async (req: Request & { user?: any }, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    // Creator, HR, or Admin can edit
    const isOwner = existing.createdById === req.user?.staffId;
    if (!isOwner && !isHROrAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });

    const { title, content, isPinned, expiresAt } = req.body;
    // Only HR/Admin can pin
    const pin = isHROrAdmin(req.user) ? (isPinned !== undefined ? !!isPinned : existing.isPinned) : existing.isPinned;

    const ann = await prisma.announcement.update({
      where: { id },
      data: {
        title:     title     !== undefined ? title.trim()   : existing.title,
        content:   content   !== undefined ? content.trim() : existing.content,
        isPinned:  pin,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : existing.expiresAt,
      },
      include,
    });
    res.json(ann);
  } catch (err) {
    res.status(500).json({ message: 'Error updating announcement', error: err });
  }
};

// DELETE /announcements/:id
export const deleteAnnouncement = async (req: Request & { user?: any }, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const isOwner = existing.createdById === req.user?.staffId;
    if (!isOwner && !isHROrAdmin(req.user)) return res.status(403).json({ message: 'Forbidden' });

    await prisma.announcement.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting announcement', error: err });
  }
};
