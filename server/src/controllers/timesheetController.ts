import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { startOfWeek, format } from 'date-fns';

const prisma = new PrismaClient();

// Helper: get the Monday-start week string for a given date
function getWeekStartStr(dateStr: string): string {
  const d = new Date(dateStr);
  const mon = startOfWeek(d, { weekStartsOn: 1 });
  return format(mon, 'yyyy-MM-dd');
}

async function checkWeekLocked(dateStr: string): Promise<boolean> {
  const weekStart = new Date(getWeekStartStr(dateStr));
  const lock = await prisma.timesheetLock.findUnique({ where: { weekStart } });
  return !!lock;
}

export const getWeeklyTimesheet = async (req: Request & { user?: any }, res: Response) => {
  const { staffId, weekStart } = req.query;
  const targetStaffId = staffId ? Number(staffId) : req.user?.staffId;

  if (!targetStaffId) return res.status(400).json({ message: 'Staff ID required' });
  if (!weekStart) return res.status(400).json({ message: 'weekStart query param required' });

  const start = new Date(weekStart as string);
  if (isNaN(start.getTime())) return res.status(400).json({ message: 'Invalid weekStart date' });
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  try {
    const [entries, lock] = await Promise.all([
      prisma.timesheet.findMany({
        where: { staffId: targetStaffId, date: { gte: start, lte: end } },
        include: {
          task: { select: { id: true, taskId: true, taskName: true } },
          staff: { select: { id: true, staffName: true } },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.timesheetLock.findUnique({ where: { weekStart: start } }),
    ]);
    res.json({ entries, isLocked: !!lock, lockedBy: lock ? (lock as any).lockedById : null });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const upsertTimesheetEntry = async (req: Request & { user?: any }, res: Response) => {
  const { staffId, taskId, date, hoursSpent } = req.body;
  const targetStaffId = staffId ? Number(staffId) : req.user?.staffId;
  const isAdmin = req.user?.role === 'ADMIN';

  try {
    // Check if week is locked (admins can still edit)
    if (!isAdmin) {
      const locked = await checkWeekLocked(date);
      if (locked) return res.status(403).json({ message: 'This week is locked. Backdating not allowed.' });
    }

    // Feature 1: block if staff is on approved leave or absent
    if (!isAdmin) {
      const entryDate = new Date(date);
      const [leave, attendance] = await Promise.all([
        prisma.leave.findFirst({
          where: {
            staffId: targetStaffId,
            status: 'APPROVED',
            fromDate: { lte: entryDate },
            toDate: { gte: entryDate },
          },
        }),
        prisma.attendance.findUnique({
          where: { staffId_date: { staffId: targetStaffId, date: entryDate } },
        }),
      ]);
      if (leave) return res.status(400).json({ message: 'Cannot book time: you are on approved leave on this date.' });
      if (attendance?.status === 'ABSENT') return res.status(400).json({ message: 'Cannot book time: you are marked absent on this date.' });
    }

    const task = await prisma.task.findUnique({ where: { id: Number(taskId) } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.status === 'CLOSED') return res.status(400).json({ message: 'Cannot book time against a closed task' });
    if (task.isFrozen) return res.status(400).json({ message: 'This task is frozen. No further entries are allowed.' });

    const entry = await prisma.timesheet.upsert({
      where: {
        staffId_taskId_date: {
          staffId: targetStaffId,
          taskId: Number(taskId),
          date: new Date(date),
        },
      },
      update: { hoursSpent },
      create: {
        staffId: targetStaffId,
        taskId: Number(taskId),
        date: new Date(date),
        hoursSpent,
      },
      include: { task: { select: { id: true, taskId: true, taskName: true } } },
    });
    res.json(entry);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteTimesheetEntry = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const isAdmin = req.user?.role === 'ADMIN';
  try {
    const entry = await prisma.timesheet.findUnique({ where: { id: Number(id) } });
    if (!entry) return res.status(404).json({ message: 'Entry not found' });
    if (!isAdmin) {
      const locked = await checkWeekLocked(entry.date.toISOString());
      if (locked) return res.status(403).json({ message: 'This week is locked.' });
    }
    await prisma.timesheet.delete({ where: { id: Number(id) } });
    res.json({ message: 'Entry deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllStaffTimesheets = async (req: Request, res: Response) => {
  const { weekStart } = req.query;
  if (!weekStart) return res.status(400).json({ message: 'weekStart query param required' });
  const start = new Date(weekStart as string);
  if (isNaN(start.getTime())) return res.status(400).json({ message: 'Invalid weekStart date' });
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  try {
    const entries = await prisma.timesheet.findMany({
      where: { date: { gte: start, lte: end } },
      include: {
        task: { select: { id: true, taskId: true, taskName: true } },
        staff: { select: { id: true, staffName: true } },
      },
      orderBy: [{ staffId: 'asc' }, { date: 'asc' }],
    });
    res.json(entries);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
