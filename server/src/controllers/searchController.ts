import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const globalSearch = async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || (q as string).trim().length < 2) return res.json({ tasks: [], clients: [], staff: [], subtasks: [], tickets: [] });

  const query = (q as string).trim();

  try {
    const [tasks, clients, staff, subtasks, tickets] = await Promise.all([
      prisma.task.findMany({
        where: {
          OR: [
            { taskId: { contains: query, mode: 'insensitive' } },
            { taskName: { contains: query, mode: 'insensitive' } },
            { udin: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, taskId: true, taskName: true, status: true, client: { select: { clientName: true } } },
        take: 8,
      }),
      prisma.client.findMany({
        where: {
          OR: [
            { clientCode: { contains: query, mode: 'insensitive' } },
            { clientName: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, clientCode: true, clientName: true },
        take: 5,
      }),
      prisma.staff.findMany({
        where: { staffName: { contains: query, mode: 'insensitive' } },
        select: { id: true, staffName: true, isPartner: true, email: true },
        take: 5,
      }),
      prisma.subTask.findMany({
        where: {
          OR: [
            { subTaskNumber: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          subTaskNumber: true,
          name: true,
          status: true,
          task: { select: { taskId: true, taskName: true, client: { select: { clientName: true } } } },
        },
        take: 5,
      }),
      prisma.ticket.findMany({
        where: {
          OR: [
            { ticketNumber: { contains: query, mode: 'insensitive' } },
            { title: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          priority: true,
          raisedBy: { select: { staffName: true } },
        },
        take: 5,
      }),
    ]);

    res.json({ tasks, clients, staff, subtasks, tickets });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
