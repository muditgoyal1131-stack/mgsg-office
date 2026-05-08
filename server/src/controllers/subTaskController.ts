import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createAuditLog } from './auditController';
import { createNotification } from '../services/notificationService';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

// Check if user can access sub-tasks of a task (partner/manager/reporting partner/admin)
async function canAccessTask(
  userId: number | undefined,
  staffId: number | undefined,
  role: string | undefined,
  task: any,
): Promise<boolean> {
  if (role === 'ADMIN') return true;
  if (!staffId) return false;

  if (task.partnerId === staffId) return true;
  if (task.managerId === staffId) return true;
  if (task.partner?.reportingPartnerId === staffId) return true;

  const staffRecord = await prisma.staff.findUnique({ where: { id: staffId } });
  if (staffRecord?.isPartner) {
    if (task.partner?.reportingPartnerId === staffId) return true;
    if (task.managerId) {
      const mgr = await prisma.staff.findUnique({ where: { id: task.managerId } });
      if (mgr?.reportingPartnerId === staffId) return true;
    }
  } else {
    if (staffRecord?.reportingPartnerId && staffRecord.reportingPartnerId === task.partnerId) return true;
  }

  return false;
}

// Resolve the User.id for a given Staff.id (for notifications)
async function getUserIdForStaff(staffId: number): Promise<number | null> {
  const user = await prisma.user.findFirst({ where: { staffId } });
  return user?.id ?? null;
}

// ─── GET /api/subtasks ───────────────────────────────────────────────────────
// All sub-tasks visible to the current user
export const getAllSubTasks = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    let taskWhere: any = {};

    if (user?.role !== 'ADMIN' && user?.role !== 'HR') {
      const staffId = user?.staffId;
      if (!staffId) return res.json([]);

      const staffRecord = await prisma.staff.findUnique({ where: { id: staffId } });

      if (staffRecord?.isPartner) {
        taskWhere = {
          OR: [
            { partnerId: staffId },
            { partner: { reportingPartnerId: staffId } },
          ],
        };
      } else {
        const conditions: any[] = [{ managerId: staffId }];
        if (staffRecord?.reportingPartnerId) {
          conditions.push({ partnerId: staffRecord.reportingPartnerId });
        }
        taskWhere = { OR: conditions };
      }
    }

    const subtasks = await prisma.subTask.findMany({
      where: { task: taskWhere },
      include: {
        task: {
          select: {
            id: true,
            taskId: true,
            taskName: true,
            // Fix #2: include partnerId + partner so frontend canClose/canDelete work for non-admins
            partnerId: true,
            partner: { select: { id: true, reportingPartnerId: true } },
            client: { select: { clientName: true } },
          },
        },
        assignedTo: { select: { id: true, staffName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(subtasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── GET /api/tasks/:taskId/subtasks ─────────────────────────────────────────
export const getSubTasks = async (req: AuthRequest, res: Response) => {
  const { taskId } = req.params;
  try {
    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: { partner: { select: { id: true, reportingPartnerId: true } } },
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const access = await canAccessTask(req.user?.id, req.user?.staffId, req.user?.role, task);
    if (!access) return res.status(403).json({ message: 'Not authorized' });

    const subtasks = await prisma.subTask.findMany({
      where: { taskId: Number(taskId) },
      include: { assignedTo: { select: { id: true, staffName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(subtasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── GET /api/subtasks/:id ───────────────────────────────────────────────────
export const getSubTask = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const subtask = await prisma.subTask.findUnique({
      where: { id: Number(id) },
      include: {
        task: { include: { partner: { select: { id: true, reportingPartnerId: true } } } },
        assignedTo: { select: { id: true, staffName: true } },
      },
    });
    if (!subtask) return res.status(404).json({ message: 'Sub-task not found' });

    const access = await canAccessTask(req.user?.id, req.user?.staffId, req.user?.role, subtask.task);
    if (!access) return res.status(403).json({ message: 'Not authorized' });

    res.json(subtask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── POST /api/tasks/:taskId/subtasks ─────────────────────────────────────────
export const createSubTask = async (req: AuthRequest, res: Response) => {
  const { taskId } = req.params;
  const { name, description, assignedToId, dueDate } = req.body;

  if (!name) return res.status(400).json({ message: 'Sub-task name is required' });

  try {
    const task = await prisma.task.findUnique({
      where: { id: Number(taskId) },
      include: { partner: { select: { id: true, reportingPartnerId: true } } },
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    // Fix #3a: block adding sub-tasks to a closed task
    if (task.status === 'CLOSED') {
      return res.status(400).json({ message: 'Cannot add sub-tasks to a closed task' });
    }
    // Fix #3b: block adding sub-tasks to a frozen task
    if (task.isFrozen) {
      return res.status(400).json({ message: 'This task is frozen. No further entries are allowed.' });
    }

    const access = await canAccessTask(req.user?.id, req.user?.staffId, req.user?.role, task);
    if (!access) return res.status(403).json({ message: 'Not authorized' });

    // Fix #6: generate sub-task number atomically inside the create transaction
    const subtask = await prisma.$transaction(async (tx) => {
      const existing = await tx.subTask.findMany({
        where: { taskId: Number(taskId) },
        select: { subTaskNumber: true },
      });

      let max = 0;
      for (const st of existing) {
        const match = st.subTaskNumber.match(/-S(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > max) max = n;
        }
      }
      const subTaskNumber = `${task.taskId}-S${max + 1}`;

      return tx.subTask.create({
        data: {
          subTaskNumber,
          taskId: Number(taskId),
          name,
          description: description || null,
          assignedToId: assignedToId ? Number(assignedToId) : null,
          dueDate: dueDate ? new Date(dueDate) : null,
          status: 'OPEN',
        },
        include: { assignedTo: { select: { id: true, staffName: true } } },
      });
    });

    // Fix #5: audit log
    if (req.user?.id) {
      await createAuditLog(
        req.user.id,
        'subtask',
        subtask.id,
        'CREATE',
        { subTaskNumber: subtask.subTaskNumber, name },
        Number(taskId),
      );
    }

    // Fix #4: notify the assigned staff member (if any and different from creator)
    if (assignedToId && Number(assignedToId) !== req.user?.staffId) {
      const recipientUserId = await getUserIdForStaff(Number(assignedToId));
      if (recipientUserId) {
        await createNotification(
          prisma,
          recipientUserId,
          'New Sub-Task Assigned',
          `You have been assigned sub-task ${subtask.subTaskNumber}: "${name}" on task ${task.taskId}.`,
          `/tasks`,
        ).catch(() => {}); // non-blocking
      }
    }

    res.status(201).json(subtask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── PUT /api/subtasks/:id ────────────────────────────────────────────────────
export const updateSubTask = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, description, assignedToId, dueDate, status } = req.body;

  try {
    const existing = await prisma.subTask.findUnique({
      where: { id: Number(id) },
      include: { task: { include: { partner: { select: { id: true, reportingPartnerId: true } } } } },
    });
    if (!existing) return res.status(404).json({ message: 'Sub-task not found' });

    const access = await canAccessTask(req.user?.id, req.user?.staffId, req.user?.role, existing.task);
    if (!access) return res.status(403).json({ message: 'Not authorized' });

    // Block editing closed sub-tasks (admin can re-open)
    if (existing.status === 'CLOSED' && req.user?.role !== 'ADMIN') {
      return res.status(400).json({ message: 'Closed sub-tasks cannot be edited' });
    }

    // Fix #3: block changes on frozen/closed parent task (admin exempt)
    if (req.user?.role !== 'ADMIN') {
      if (existing.task.isFrozen) {
        return res.status(400).json({ message: 'This task is frozen. No further changes are allowed.' });
      }
      if (existing.task.status === 'CLOSED') {
        return res.status(400).json({ message: 'Cannot modify sub-tasks on a closed task' });
      }
    }

    const prevAssignedToId = existing.assignedToId;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description || null;
    if (assignedToId !== undefined) data.assignedToId = assignedToId ? Number(assignedToId) : null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (status !== undefined) data.status = status;

    const updated = await prisma.subTask.update({
      where: { id: Number(id) },
      data,
      include: { assignedTo: { select: { id: true, staffName: true } } },
    });

    // Fix #5: audit log
    if (req.user?.id) {
      await createAuditLog(
        req.user.id,
        'subtask',
        updated.id,
        'UPDATE',
        { before: existing, after: req.body },
        existing.taskId,
      );
    }

    // Fix #4: notify newly assigned staff (if assignment changed)
    if (
      assignedToId !== undefined &&
      Number(assignedToId) !== prevAssignedToId &&
      assignedToId &&
      Number(assignedToId) !== req.user?.staffId
    ) {
      const recipientUserId = await getUserIdForStaff(Number(assignedToId));
      if (recipientUserId) {
        await createNotification(
          prisma,
          recipientUserId,
          'Sub-Task Assigned to You',
          `You have been assigned sub-task ${updated.subTaskNumber}: "${updated.name}".`,
          `/tasks`,
        ).catch(() => {});
      }
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── PUT /api/subtasks/:id/close ─────────────────────────────────────────────
export const closeSubTask = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await prisma.subTask.findUnique({
      where: { id: Number(id) },
      include: { task: { include: { partner: { select: { id: true, reportingPartnerId: true } } } } },
    });
    if (!existing) return res.status(404).json({ message: 'Sub-task not found' });
    if (existing.status === 'CLOSED') return res.status(400).json({ message: 'Sub-task is already closed' });

    // Fix #3: block close on frozen parent task (admin exempt)
    if (req.user?.role !== 'ADMIN' && existing.task.isFrozen) {
      return res.status(400).json({ message: 'This task is frozen. No further changes are allowed.' });
    }

    // Only task partner, reporting partner of task partner, or admin can close
    const isAdmin = req.user?.role === 'ADMIN';
    const staffId = req.user?.staffId;
    let canClose = isAdmin;

    if (!canClose && staffId) {
      const task = existing.task;
      if (task.partnerId === staffId) canClose = true;
      if (task.partner?.reportingPartnerId === staffId) canClose = true;
    }

    if (!canClose) return res.status(403).json({ message: 'Only the task partner or admin can close sub-tasks' });

    const updated = await prisma.subTask.update({
      where: { id: Number(id) },
      data: { status: 'CLOSED' },
      include: { assignedTo: { select: { id: true, staffName: true } } },
    });

    // Fix #5: audit log
    if (req.user?.id) {
      await createAuditLog(
        req.user.id,
        'subtask',
        updated.id,
        'CLOSE',
        { subTaskNumber: updated.subTaskNumber },
        existing.taskId,
      );
    }

    // Fix #4: notify assigned staff that sub-task was closed
    if (existing.assignedToId && existing.assignedToId !== req.user?.staffId) {
      const recipientUserId = await getUserIdForStaff(existing.assignedToId);
      if (recipientUserId) {
        await createNotification(
          prisma,
          recipientUserId,
          'Sub-Task Closed',
          `Sub-task ${updated.subTaskNumber}: "${updated.name}" has been marked as closed.`,
          `/tasks`,
        ).catch(() => {});
      }
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── DELETE /api/subtasks/:id ─────────────────────────────────────────────────
export const deleteSubTask = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const existing = await prisma.subTask.findUnique({
      where: { id: Number(id) },
      include: { task: { select: { partnerId: true, isFrozen: true, status: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Sub-task not found' });

    // Fix #3: block delete on frozen/closed parent task (admin exempt)
    if (req.user?.role !== 'ADMIN') {
      if (existing.task.isFrozen) {
        return res.status(400).json({ message: 'This task is frozen. No further changes are allowed.' });
      }
      if (existing.task.status === 'CLOSED') {
        return res.status(400).json({ message: 'Cannot delete sub-tasks from a closed task' });
      }
    }

    // Only admin or task partner can delete
    const isAdmin = req.user?.role === 'ADMIN';
    let canDelete = isAdmin;

    if (!canDelete && req.user?.staffId) {
      if (existing.task.partnerId === req.user.staffId) canDelete = true;
    }

    if (!canDelete) return res.status(403).json({ message: 'Only the task partner or admin can delete sub-tasks' });

    await prisma.subTask.delete({ where: { id: Number(id) } });

    // Fix #5: audit log
    if (req.user?.id) {
      await createAuditLog(
        req.user.id,
        'subtask',
        Number(id),
        'DELETE',
        { subTaskNumber: existing.subTaskNumber, name: existing.name },
        existing.taskId,
      );
    }

    res.json({ message: 'Sub-task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
