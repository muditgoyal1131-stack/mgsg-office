import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAuditLogs = async (req: Request, res: Response) => {
  const { entity, entityId, taskId, limit = '50', page = '1' } = req.query;
  const take = Number(limit);
  const skip = (Number(page) - 1) * take;

  try {
    const where: any = {};
    if (entity) where.entity = entity;
    if (entityId) where.entityId = Number(entityId);
    if (taskId) where.taskId = Number(taskId);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { email: true, staff: { select: { staffName: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / take) });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createAuditLog = async (
  userId: number,
  entity: string,
  entityId: number,
  action: string,
  changes?: object,
  taskId?: number
) => {
  try {
    await prisma.auditLog.create({
      data: { userId, entity, entityId, action, changes: changes as any, taskId },
    });
  } catch {
    // non-blocking
  }
};
