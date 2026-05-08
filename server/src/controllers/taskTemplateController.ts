import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.taskTemplate.findMany({
      where: { isActive: true },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, staffName: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(templates);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createTemplate = async (req: Request & { user?: any }, res: Response) => {
  const { name, description, categoryId, checklist } = req.body;
  const staffId = req.user?.staffId;
  if (!staffId) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const template = await prisma.taskTemplate.create({
      data: {
        name,
        description: description || null,
        categoryId: categoryId ? Number(categoryId) : null,
        checklist: checklist || null,
        createdById: staffId,
      },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, staffName: true } },
      },
    });
    res.status(201).json(template);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, categoryId, checklist, isActive } = req.body;
  try {
    const template = await prisma.taskTemplate.update({
      where: { id: Number(id) },
      data: {
        name,
        description: description ?? undefined,
        categoryId: categoryId ? Number(categoryId) : null,
        checklist: checklist ?? undefined,
        isActive: isActive ?? undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, staffName: true } },
      },
    });
    res.json(template);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.taskTemplate.update({ where: { id: Number(id) }, data: { isActive: false } });
    res.json({ message: 'Template archived' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
