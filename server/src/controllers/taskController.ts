import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAuditLog } from './auditController';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

const taskInclude = {
  partner: { select: { id: true, staffName: true, reportingPartnerId: true } },
  manager: { select: { id: true, staffName: true } },
  client: { select: { id: true, clientCode: true, clientName: true } },
  profitCentre: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  billingEntity: { select: { id: true, name: true } },
};

async function generateTaskId(): Promise<string> {
  // Find the highest existing T-numbered taskId
  const tasks = await prisma.task.findMany({
    where: { taskId: { startsWith: 'T' } },
    select: { taskId: true },
  });
  let max = 0;
  for (const t of tasks) {
    const num = parseInt(t.taskId.slice(1), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `T${String(max + 1).padStart(4, '0')}`;
}

// Helper: get the staffId of who the current user IS
async function getCallerStaff(user: any) {
  if (!user?.staffId) return null;
  return prisma.staff.findUnique({ where: { id: user.staffId } });
}

// Check if user can see cost/OPE/reference/terms (partner-level only — NOT HR)
async function canSeeCost(user: any, task: any): Promise<boolean> {
  if (user?.role === 'ADMIN') return true;
  if (!user?.staffId) return false;
  if (task.partnerId === user.staffId) return true;
  if (task.partner?.reportingPartnerId === user.staffId) return true;
  return false;
}

// Check if user is a partner or admin
async function isPartnerOrAdmin(req: AuthRequest): Promise<boolean> {
  if (req.user?.role === 'ADMIN') return true;
  if (!req.user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
  return staff?.isPartner ?? false;
}

// Check if user can see billing fields (billedAmount, billingStatus, etc.) — HR included
async function canSeeBillingFields(user: any, task: any): Promise<boolean> {
  if (user?.role === 'ADMIN' || user?.role === 'HR') return true;
  if (!user?.staffId) return false;
  if (task.partnerId === user.staffId) return true;
  if (task.partner?.reportingPartnerId === user.staffId) return true;
  return false;
}

export const getAllTasks = async (req: Request & { user?: any }, res: Response) => {
  try {
    const user = req.user;
    let whereClause: any = {};

    if (user?.role !== 'ADMIN' && user?.role !== 'HR') {
      const staffId = user?.staffId;
      if (!staffId) return res.json([]);

      const staffRecord = await prisma.staff.findUnique({ where: { id: staffId } });

      if (staffRecord?.isPartner) {
        // Partner sees: tasks where they are partner, OR tasks where task partner reports to them
        whereClause = {
          OR: [
            { partnerId: staffId },
            { partner: { reportingPartnerId: staffId } },
          ],
        };
      } else {
        // Regular staff sees: tasks where they are manager, OR tasks where their reportingPartnerId = task partnerId
        const conditions: any[] = [{ managerId: staffId }];
        if (staffRecord?.reportingPartnerId) {
          conditions.push({ partnerId: staffRecord.reportingPartnerId });
        }
        whereClause = { OR: conditions };
      }
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        ...taskInclude,
        timesheets: { include: { staff: { select: { perHourCost: true } } } },
        expenses: true,
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const tasksWithCosts = tasks.map((task) => {
      const costIncurred = task.timesheets.reduce(
        (sum, ts) => sum + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
      );
      const opeIncurred = task.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const isOverdue = task.dueDate && task.status === 'OPEN' && new Date(task.dueDate) < new Date();

      // Cost/OPE/Reference/Terms: admin + task partner + reporting partner (NOT HR)
      const showCost = user?.role === 'ADMIN' ||
        task.partnerId === user?.staffId ||
        (task.partner as any)?.reportingPartnerId === user?.staffId;

      // Billing fields: admin + HR + task partner + reporting partner
      const showBilling = user?.role === 'ADMIN' || user?.role === 'HR' ||
        task.partnerId === user?.staffId ||
        (task.partner as any)?.reportingPartnerId === user?.staffId;

      return {
        ...task,
        costIncurred: showCost ? costIncurred : undefined,
        opeIncurred: showCost ? opeIncurred : undefined,
        isOverdue,
        reference: showCost ? task.reference : undefined,
        terms: showCost ? task.terms : undefined,
        billedAmount: showBilling ? task.billedAmount : undefined,
        billDetails: showBilling ? task.billDetails : undefined,
        billingEntity: showBilling ? task.billingEntity : undefined,
        billingStatus: showBilling ? task.billingStatus : 'UNBILLED',
      };
    });

    res.json(tasksWithCosts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getTask = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  try {
    const task = await prisma.task.findUnique({
      where: { id: Number(id) },
      include: {
        ...taskInclude,
        timesheets: { include: { staff: { select: { id: true, staffName: true, perHourCost: true } } } },
        expenses: true,
        documents: {
          include: { uploadedBy: { select: { staff: { select: { staffName: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const costIncurred = task.timesheets.reduce(
      (sum, ts) => sum + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
    );
    const opeIncurred = task.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const isOverdue = task.dueDate && task.status === 'OPEN' && new Date(task.dueDate) < new Date();

    const showCost = await canSeeCost(req.user, task);
    const showBilling = await canSeeBillingFields(req.user, task);

    res.json({
      ...task,
      costIncurred: showCost ? costIncurred : undefined,
      opeIncurred: showCost ? opeIncurred : undefined,
      isOverdue,
      reference: showCost ? task.reference : undefined,
      terms: showCost ? task.terms : undefined,
      billedAmount: showBilling ? task.billedAmount : undefined,
      billDetails: showBilling ? task.billDetails : undefined,
      billingEntity: showBilling ? task.billingEntity : undefined,
      billingStatus: showBilling ? task.billingStatus : 'UNBILLED',
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createTask = async (req: Request & { user?: any }, res: Response) => {
  const {
    taskName, udin, udinDate, partnerId, managerId, clientId,
    categoryId, dueDate,
  } = req.body;
  try {
    const taskId = await generateTaskId();
    const task = await prisma.task.create({
      data: {
        taskId,
        taskName,
        udin: udin || null,
        udinDate: udinDate ? new Date(udinDate) : null,
        partnerId: partnerId ? Number(partnerId) : null,
        managerId: managerId ? Number(managerId) : null,
        clientId: clientId ? Number(clientId) : null,
        categoryId: categoryId ? Number(categoryId) : null,
        status: 'OPEN',
        billingStatus: 'UNBILLED',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: taskInclude,
    });
    await createAuditLog(req.user.id, 'task', task.id, 'CREATE', { taskId, taskName });
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateTask = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const user = req.user;
  const staffId = user?.staffId;

  try {
    const existing = await prisma.task.findUnique({
      where: { id: Number(id) },
      include: { partner: true },
    });
    if (!existing) return res.status(404).json({ message: 'Task not found' });

    const isAdmin = user?.role === 'ADMIN';
    const isHR = user?.role === 'HR';
    const isTaskPartner = existing.partnerId === staffId;
    const isTaskManager = existing.managerId === staffId;
    const isReportingPartner = (existing.partner as any)?.reportingPartnerId === staffId;
    const callerIsPartner = staffId
      ? (await prisma.staff.findUnique({ where: { id: staffId } }))?.isPartner
      : false;

    // Permission to update at all
    const canUpdate = isAdmin || isTaskPartner || isTaskManager || isReportingPartner || isHR || callerIsPartner;
    if (!canUpdate) return res.status(403).json({ message: 'Not authorized to update this task' });

    const {
      taskName, udin, udinDate, partnerId, managerId, clientId,
      profitCentreId, categoryId, billedAmount, billingEntityId,
      status, billingStatus, billDetails, dueDate, archiveLink, archivingConfirmed,
      reference, terms,
    } = req.body;

    // Feature 5: reset archive confirmation if archiveLink changes
    let resetArchiveConfirm = false;
    if (archiveLink !== undefined && archiveLink !== existing.archiveLink && existing.archivingConfirmed) {
      resetArchiveConfirm = true;
    }

    // Validate closing
    if (status === 'CLOSED' && existing.status !== 'CLOSED') {
      const newArchiveLink = archiveLink ?? existing.archiveLink;
      const newConfirmed = archivingConfirmed ?? existing.archivingConfirmed;
      if (!newArchiveLink) {
        return res.status(400).json({ message: 'Cannot close task: Archive link is required' });
      }
      if (!newConfirmed) {
        return res.status(400).json({ message: 'Cannot close task: Manager must confirm archiving is done' });
      }
    }

    // Build update data with field-level permissions
    const data: any = {};

    // Basic fields — task partner, manager, reporting partner, or admin/HR can update
    if (taskName !== undefined) data.taskName = taskName;
    if (udin !== undefined) data.udin = udin || null;
    if (udinDate !== undefined) data.udinDate = udinDate ? new Date(udinDate) : null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (categoryId !== undefined) data.categoryId = categoryId ? Number(categoryId) : null;
    if (clientId !== undefined) data.clientId = clientId ? Number(clientId) : null;
    if (status !== undefined) data.status = status;

    // Manager assignment: task partner, existing manager, reporting partner, admin
    if (managerId !== undefined) {
      if (isAdmin || isTaskPartner || isTaskManager || isReportingPartner) {
        data.managerId = managerId ? Number(managerId) : null;
      }
    }

    // Partner assignment: admin or reporting partner only
    if (partnerId !== undefined) {
      if (isAdmin || isReportingPartner || callerIsPartner) {
        data.partnerId = partnerId ? Number(partnerId) : null;
      }
    }

    // Profit centre: only partners and admin
    if (profitCentreId !== undefined) {
      if (isAdmin || callerIsPartner) {
        data.profitCentreId = profitCentreId ? Number(profitCentreId) : null;
      }
    }

    // Billing fields: task partner, reporting partner of task partner, HR, admin
    const canBilling = isAdmin || isHR || isTaskPartner || isReportingPartner;
    if (canBilling) {
      if (billedAmount !== undefined) data.billedAmount = billedAmount !== '' && billedAmount != null ? Number(billedAmount) : null;
      if (billingEntityId !== undefined) data.billingEntityId = billingEntityId ? Number(billingEntityId) : null;
      if (billDetails !== undefined) data.billDetails = billDetails;
      if (billingStatus !== undefined) data.billingStatus = billingStatus;
    }

    // Archive link: anyone who can update can set it
    if (archiveLink !== undefined) {
      data.archiveLink = archiveLink || null;
      if (resetArchiveConfirm) {
        data.archivingConfirmed = false;
        data.archiveConfirmedById = null;
        data.archiveConfirmedAt = null;
      }
    }

    // Reference and Terms: task partner, reporting partner, or admin only
    const canRefTerms = isAdmin || isTaskPartner || isReportingPartner;
    if (canRefTerms) {
      if (reference !== undefined) data.reference = reference || null;
      if (terms !== undefined) data.terms = terms || null;
    }

    // Archiving confirmed: only manager or admin
    if (archivingConfirmed !== undefined) {
      if (isAdmin || isTaskManager) {
        data.archivingConfirmed = Boolean(archivingConfirmed);
      }
    }

    const before = await prisma.task.findUnique({ where: { id: Number(id) } });
    const task = await prisma.task.update({
      where: { id: Number(id) },
      data,
      include: taskInclude,
    });
    await createAuditLog(req.user.id, 'task', task.id, 'UPDATE', { before, after: req.body }, task.id);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteTask = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  try {
    // Only partners or admins can delete
    const isAdmin = user.role === 'ADMIN';
    let isPartner = false;
    if (user.staffId) {
      const staff = await prisma.staff.findUnique({ where: { id: user.staffId } });
      isPartner = staff?.isPartner ?? false;
    }
    if (!isAdmin && !isPartner) {
      return res.status(403).json({ message: 'Only Partners or Admins can delete tasks' });
    }

    await prisma.reimbursement.deleteMany({ where: { taskId: Number(id) } });
    await prisma.timesheet.deleteMany({ where: { taskId: Number(id) } });
    await prisma.expense.deleteMany({ where: { taskId: Number(id) } });
    await prisma.document.deleteMany({ where: { taskId: Number(id) } });
    await prisma.auditLog.deleteMany({ where: { taskId: Number(id) } });
    // Invoice has taskId @unique — must be deleted before the task (FK constraint)
    await prisma.invoice.deleteMany({ where: { taskId: Number(id) } });
    // Delete all sub-tasks belonging to this task
    await prisma.subTask.deleteMany({ where: { taskId: Number(id) } });
    await prisma.task.delete({ where: { id: Number(id) } });
    res.json({ message: 'Task deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const addExpense = async (req: Request & { user?: any }, res: Response) => {
  const { taskId } = req.params;
  const { description, amount, date, category, receiptUrl } = req.body;
  try {
    const task = await prisma.task.findUnique({ where: { id: Number(taskId) } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.status === 'CLOSED') return res.status(400).json({ message: 'Cannot add expenses to a closed task' });
    if (task.isFrozen) return res.status(400).json({ message: 'This task is frozen. No further entries are allowed.' });

    const expense = await prisma.expense.create({
      data: {
        taskId: Number(taskId), description, amount,
        date: new Date(date), category: category || 'OTHER', receiptUrl,
      },
    });
    await createAuditLog(req.user.id, 'expense', expense.id, 'CREATE', { description, amount, category }, Number(taskId));
    res.status(201).json(expense);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.expense.delete({ where: { id: Number(id) } });
    res.json({ message: 'Expense deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /tasks/:id/confirm-archive
export const confirmArchive = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!task.archiveLink) return res.status(400).json({ message: 'No archive link set' });
    if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required' });

    // Only partner/admin can confirm
    const isPA = await isPartnerOrAdmin(req);
    if (!isPA) return res.status(403).json({ message: 'Partners only' });

    const updated = await prisma.task.update({
      where: { id },
      data: {
        archivingConfirmed: true,
        archiveConfirmedById: req.user.staffId,
        archiveConfirmedAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Error confirming archive', error: err });
  }
};

// POST /tasks/:id/freeze
export const freezeTask = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.status !== 'CLOSED') return res.status(400).json({ message: 'Only closed tasks can be frozen' });
    if (!task.archivingConfirmed) return res.status(400).json({ message: 'Archive link must be confirmed before freezing' });
    if (task.isFrozen) return res.status(400).json({ message: 'Task is already frozen' });
    if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required' });

    // Can freeze if: ADMIN, or task partner, or task partner's reporting partner
    const isAdmin = req.user.role === 'ADMIN';
    let canFreeze = isAdmin;
    if (!canFreeze && task.partnerId) {
      if (req.user.staffId === task.partnerId) {
        canFreeze = true;
      } else {
        // Check if requester is the reporting partner of the task partner
        const taskPartner = await prisma.staff.findUnique({ where: { id: task.partnerId } });
        if (taskPartner?.reportingPartnerId === req.user.staffId) {
          const requester = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
          if (requester?.isPartner) canFreeze = true;
        }
      }
    }
    if (!canFreeze) return res.status(403).json({ message: 'Only the task partner or their reporting partner can freeze tasks' });

    const updated = await prisma.task.update({
      where: { id },
      data: { isFrozen: true, frozenById: req.user.staffId, frozenAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Error freezing task', error: err });
  }
};

// POST /tasks/:id/unfreeze  (admin only)
export const unfreezeTask = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Admin only' });
    const id = parseInt(req.params.id);
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!task.isFrozen) return res.status(400).json({ message: 'Task is not frozen' });

    const updated = await prisma.task.update({
      where: { id },
      data: { isFrozen: false, frozenById: null, frozenAt: null },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Error unfreezing task', error: err });
  }
};

// Bulk operations: close tasks or reassign manager
// Only allowed if user is task partner or their reporting partner
export const bulkUpdateTasks = async (req: Request & { user?: any }, res: Response) => {
  const { taskIds, action, data } = req.body as {
    taskIds: number[];
    action: 'CLOSE' | 'REASSIGN_MANAGER' | 'REASSIGN_PARTNER';
    data?: any;
  };
  const user = req.user;
  const staffId = user?.staffId;
  const isAdmin = user?.role === 'ADMIN';

  if (!taskIds?.length) return res.status(400).json({ message: 'No tasks selected' });

  try {
    // Fetch all target tasks with partner info
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      include: { partner: { select: { id: true, reportingPartnerId: true } } },
    });

    const results: { id: number; success: boolean; message?: string }[] = [];

    for (const task of tasks) {
      const isTaskPartner = task.partnerId === staffId;
      const isReportingPartner = task.partner?.reportingPartnerId === staffId;
      const canAct = isAdmin || isTaskPartner || isReportingPartner;

      if (!canAct) {
        results.push({ id: task.id, success: false, message: 'Not authorized' });
        continue;
      }

      try {
        if (action === 'CLOSE') {
          if (!task.archiveLink) {
            results.push({ id: task.id, success: false, message: 'Archive link required to close' });
            continue;
          }
          await prisma.task.update({ where: { id: task.id }, data: { status: 'CLOSED' } });
          results.push({ id: task.id, success: true });
        } else if (action === 'REASSIGN_MANAGER') {
          const newManagerId = data?.managerId ? Number(data.managerId) : null;
          await prisma.task.update({ where: { id: task.id }, data: { managerId: newManagerId } });
          results.push({ id: task.id, success: true });
        } else if (action === 'REASSIGN_PARTNER') {
          const newPartnerId = data?.partnerId ? Number(data.partnerId) : null;
          await prisma.task.update({ where: { id: task.id }, data: { partnerId: newPartnerId } });
          results.push({ id: task.id, success: true });
        }
      } catch {
        results.push({ id: task.id, success: false, message: 'Update failed' });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    res.json({ results, succeeded, failed: results.length - succeeded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
