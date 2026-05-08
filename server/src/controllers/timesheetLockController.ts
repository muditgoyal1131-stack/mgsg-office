import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getLocks = async (_req: Request, res: Response) => {
  try {
    const locks = await prisma.timesheetLock.findMany({
      include: { lockedBy: { select: { id: true, staffName: true } } },
      orderBy: { weekStart: 'desc' },
    });
    res.json(locks);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const lockWeek = async (req: Request & { user?: any }, res: Response) => {
  const { weekStart } = req.body;
  const staffId = req.user?.staffId;
  if (!staffId) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const lock = await prisma.timesheetLock.upsert({
      where: { weekStart: new Date(weekStart) },
      update: { lockedById: staffId },
      create: { weekStart: new Date(weekStart), lockedById: staffId },
      include: { lockedBy: { select: { id: true, staffName: true } } },
    });
    res.json(lock);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const unlockWeek = async (req: Request, res: Response) => {
  const { weekStart } = req.params;
  try {
    await prisma.timesheetLock.delete({ where: { weekStart: new Date(weekStart) } });
    res.json({ message: 'Week unlocked' });
  } catch {
    res.status(500).json({ message: 'Week not locked or server error' });
  }
};

export const isWeekLocked = async (weekStart: string): Promise<boolean> => {
  const lock = await prisma.timesheetLock.findUnique({ where: { weekStart: new Date(weekStart) } });
  return !!lock;
};
