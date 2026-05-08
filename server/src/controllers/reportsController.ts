import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getStaffUtilization = async (req: Request, res: Response) => {
  const { from, to } = req.query;
  const start = from ? new Date(from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = to ? new Date(to as string) : new Date();

  try {
    const staff = await prisma.staff.findMany({
      include: {
        timesheets: {
          where: { date: { gte: start, lte: end } },
        },
      },
    });

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const workingDays = Math.ceil(days * 5 / 7);
    const totalCapacity = workingDays * 8;

    const data = staff.map((s) => {
      const totalHours = s.timesheets.reduce((sum, ts) => sum + Number(ts.hoursSpent), 0);
      const utilization = totalCapacity > 0 ? Math.round((totalHours / totalCapacity) * 100) : 0;
      return {
        id: s.id,
        staffName: s.staffName,
        isPartner: s.isPartner,
        totalHours,
        totalCapacity,
        utilization,
        perHourCost: Number(s.perHourCost),
      };
    });

    res.json(data);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getWIPAging = async (_req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { billingStatus: 'UNBILLED' },
      include: {
        client: { select: { clientCode: true, clientName: true } },
        timesheets: { include: { staff: { select: { perHourCost: true } } } },
        expenses: true,
      },
    });

    const now = new Date();
    const data = tasks.map((task) => {
      const costIncurred = task.timesheets.reduce(
        (sum, ts) => sum + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
      );
      const opeIncurred = task.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalWIP = costIncurred + opeIncurred;
      const ageDays = Math.floor((now.getTime() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const ageBucket =
        ageDays <= 30 ? '0-30 days' :
        ageDays <= 60 ? '31-60 days' :
        ageDays <= 90 ? '61-90 days' : '90+ days';

      return {
        taskId: task.taskId,
        taskName: task.taskName,
        clientName: task.client?.clientName || '—',
        status: task.status,
        costIncurred,
        opeIncurred,
        totalWIP,
        ageDays,
        ageBucket,
        createdAt: task.createdAt,
      };
    });

    res.json(data.sort((a, b) => b.ageDays - a.ageDays));
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getProfitability = async (_req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      include: {
        partner: { select: { id: true, staffName: true } },
        manager: { select: { id: true, staffName: true } },
        timesheets: { include: { staff: { select: { perHourCost: true } } } },
        expenses: true,
      },
    });

    const partnerMap: Record<string, { name: string; totalCost: number; totalBilled: number; taskCount: number }> = {};
    const managerMap: Record<string, { name: string; totalCost: number; totalBilled: number; taskCount: number }> = {};

    tasks.forEach((task) => {
      const cost = task.timesheets.reduce(
        (sum, ts) => sum + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
      );
      const ope = task.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalCost = cost + ope;

      const billedAmount = task.billingStatus === 'BILLED'
        ? Number((task as any).billedAmount ?? 0)
        : 0;

      if (task.partner) {
        const key = String(task.partner.id);
        if (!partnerMap[key]) partnerMap[key] = { name: task.partner.staffName, totalCost: 0, totalBilled: 0, taskCount: 0 };
        partnerMap[key].totalCost += totalCost;
        partnerMap[key].totalBilled += billedAmount;
        partnerMap[key].taskCount += 1;
      }
      if (task.manager) {
        const key = String(task.manager.id);
        if (!managerMap[key]) managerMap[key] = { name: task.manager.staffName, totalCost: 0, totalBilled: 0, taskCount: 0 };
        managerMap[key].totalCost += totalCost;
        managerMap[key].totalBilled += billedAmount;
        managerMap[key].taskCount += 1;
      }
    });

    const toArr = (map: typeof partnerMap) =>
      Object.values(map).map((r) => ({
        ...r,
        margin: r.totalBilled > 0 ? Math.round(((r.totalBilled - r.totalCost) / r.totalBilled) * 100) : null,
      }));

    res.json({ byPartner: toArr(partnerMap), byManager: toArr(managerMap) });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getClientBillingHistory = async (_req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        tasks: {
          include: {
            timesheets: { include: { staff: { select: { perHourCost: true } } } },
            expenses: true,
          },
        },
      },
      orderBy: { clientName: 'asc' },
    });

    const data = clients.map((client) => {
      const totalTasks = client.tasks.length;
      const billedTasks = client.tasks.filter((t) => t.billingStatus === 'BILLED').length;
      const totalCost = client.tasks.reduce((sum, task) => {
        const cost = task.timesheets.reduce(
          (s, ts) => s + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
        );
        const ope = task.expenses.reduce((s, e) => s + Number(e.amount), 0);
        return sum + cost + ope;
      }, 0);
      const openWIP = client.tasks
        .filter((t) => t.billingStatus === 'UNBILLED')
        .reduce((sum, task) => {
          const cost = task.timesheets.reduce(
            (s, ts) => s + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
          );
          const ope = task.expenses.reduce((s, e) => s + Number(e.amount), 0);
          return sum + cost + ope;
        }, 0);

      return {
        clientCode: client.clientCode,
        clientName: client.clientName,
        totalTasks,
        billedTasks,
        openTasks: totalTasks - billedTasks,
        totalCost,
        openWIP,
      };
    });

    res.json(data);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getDashboardKPIs = async (_req: Request, res: Response) => {
  try {
    const [tasks, timesheets] = await Promise.all([
      prisma.task.findMany({
        include: {
          timesheets: { include: { staff: { select: { perHourCost: true } } } },
          expenses: true,
        },
      }),
      prisma.timesheet.findMany({
        where: {
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        include: { staff: { select: { perHourCost: true } } },
      }),
    ]);

    const now = new Date();
    const openTasks = tasks.filter((t) => t.status === 'OPEN').length;
    const closedTasks = tasks.filter((t) => t.status === 'CLOSED').length;
    const overdueTasks = tasks.filter(
      (t) => t.status === 'OPEN' && t.dueDate && new Date(t.dueDate) < now
    ).length;

    const totalWIP = tasks
      .filter((t) => t.billingStatus === 'UNBILLED')
      .reduce((sum, task) => {
        const cost = task.timesheets.reduce(
          (s, ts) => s + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
        );
        const ope = task.expenses.reduce((s, e) => s + Number(e.amount), 0);
        return sum + cost + ope;
      }, 0);

    const billedCount = tasks.filter((t) => t.billingStatus === 'BILLED').length;
    const billingRealization = tasks.length > 0 ? Math.round((billedCount / tasks.length) * 100) : 0;

    const thisMonthHours = timesheets.reduce((sum, ts) => sum + Number(ts.hoursSpent), 0);

    res.json({ openTasks, closedTasks, overdueTasks, totalWIP, billingRealization, thisMonthHours });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// Helper: compute working days in a month (Mon–Fri only)
// ---------------------------------------------------------------------------
function workingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// GET /reports/wip
// Full WIP report: open unbilled tasks with hours, costs, grouped by client
// ---------------------------------------------------------------------------
export const getWIPReport = async (_req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { status: 'OPEN', billingStatus: 'UNBILLED' },
      include: {
        client:   { select: { id: true, clientCode: true, clientName: true } },
        partner:  { select: { id: true, staffName: true } },
        manager:  { select: { id: true, staffName: true } },
        category: { select: { id: true, name: true } },
        timesheets: {
          include: {
            staff: { select: { id: true, staffName: true, perHourCost: true } },
          },
        },
        expenses: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();

    const rows = tasks.map((task) => {
      const totalHours = task.timesheets.reduce((s, ts) => s + Number(ts.hoursSpent), 0);
      const staffCost  = task.timesheets.reduce(
        (s, ts) => s + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
      );
      const expenses   = task.expenses.reduce((s, e) => s + Number(e.amount), 0);
      const totalCost  = staffCost + expenses;
      const ageDays    = Math.floor((now.getTime() - task.createdAt.getTime()) / 86400000);
      const ageBucket  =
        ageDays <= 30 ? '0–30 days' :
        ageDays <= 60 ? '31–60 days' :
        ageDays <= 90 ? '61–90 days' : '90+ days';

      // Per-staff breakdown for this task
      const staffBreakdown: { staffName: string; hours: number; cost: number }[] = [];
      const staffMap = new Map<number, { staffName: string; hours: number; cost: number }>();
      for (const ts of task.timesheets) {
        const sid = ts.staff.id;
        if (!staffMap.has(sid)) staffMap.set(sid, { staffName: ts.staff.staffName, hours: 0, cost: 0 });
        const entry = staffMap.get(sid)!;
        entry.hours += Number(ts.hoursSpent);
        entry.cost  += Number(ts.hoursSpent) * Number(ts.staff.perHourCost);
      }
      staffMap.forEach((v) => staffBreakdown.push(v));

      return {
        taskId:       task.taskId,
        taskName:     task.taskName,
        client:       task.client ? { id: task.client.id, clientCode: task.client.clientCode, clientName: task.client.clientName } : null,
        partner:      task.partner  ? { id: task.partner.id,  staffName: task.partner.staffName }  : null,
        manager:      task.manager  ? { id: task.manager.id,  staffName: task.manager.staffName }  : null,
        category:     task.category ? task.category.name : null,
        dueDate:      task.dueDate,
        isOverdue:    task.dueDate ? new Date(task.dueDate) < now : false,
        totalHours,
        staffCost,
        expenses,
        totalCost,
        ageDays,
        ageBucket,
        staffBreakdown,
        createdAt:    task.createdAt,
      };
    });

    // Group by client
    const clientMap = new Map<string, {
      clientId: number | null; clientCode: string; clientName: string;
      taskCount: number; totalHours: number; totalCost: number; tasks: typeof rows;
    }>();

    for (const row of rows) {
      const key = row.client ? String(row.client.id) : '__no_client__';
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          clientId:   row.client?.id ?? null,
          clientCode: row.client?.clientCode ?? '—',
          clientName: row.client?.clientName ?? 'No Client',
          taskCount: 0, totalHours: 0, totalCost: 0, tasks: [],
        });
      }
      const g = clientMap.get(key)!;
      g.taskCount++;
      g.totalHours += row.totalHours;
      g.totalCost  += row.totalCost;
      g.tasks.push(row);
    }

    const summary = {
      totalTasks:  rows.length,
      totalHours:  rows.reduce((s, r) => s + r.totalHours, 0),
      totalCost:   rows.reduce((s, r) => s + r.totalCost,  0),
      overdueCount: rows.filter((r) => r.isOverdue).length,
      ageBuckets: ['0–30 days', '31–60 days', '61–90 days', '90+ days'].map((b) => ({
        bucket: b,
        count:  rows.filter((r) => r.ageBucket === b).length,
        cost:   rows.filter((r) => r.ageBucket === b).reduce((s, r) => s + r.totalCost, 0),
      })),
    };

    res.json({
      summary,
      byClient: Array.from(clientMap.values()).sort((a, b) => b.totalCost - a.totalCost),
      rows,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
};

// ---------------------------------------------------------------------------
// GET /reports/monthly-revenue
// Returns last 12 months of billed / collected / WIP data.
// ---------------------------------------------------------------------------
export const getMonthlyRevenue = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const months: { year: number; month: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }

    const result = await Promise.all(
      months.map(async ({ year, month }) => {
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // billed = sum of Invoice.amount where invoiceDate is in that month (status != CANCELLED)
        const billedAgg = await prisma.invoice.aggregate({
          _sum: { amount: true },
          where: {
            invoiceDate: { gte: start, lte: end },
            status: { not: 'CANCELLED' },
          },
        });

        // collected = sum of Invoice.paymentAmount where paymentDate is in that month
        const collectedAgg = await prisma.invoice.aggregate({
          _sum: { paymentAmount: true },
          where: {
            paymentDate: { gte: start, lte: end },
          },
        });

        // wip = sum of task cost for tasks created in that month with billingStatus UNBILLED
        const wipTasks = await prisma.task.findMany({
          where: {
            billingStatus: 'UNBILLED',
            createdAt: { gte: start, lte: end },
          },
          include: {
            timesheets: { include: { staff: { select: { perHourCost: true } } } },
            expenses: true,
          },
        });

        const wip = wipTasks.reduce((sum, task) => {
          const tsCost = task.timesheets.reduce(
            (s, ts) => s + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0
          );
          const expCost = task.expenses.reduce((s, e) => s + Number(e.amount), 0);
          return sum + tsCost + expCost;
        }, 0);

        const monthLabel = start.toLocaleString('en-US', { month: 'short', year: 'numeric' });

        return {
          month: monthLabel,
          billed: Number(billedAgg._sum.amount ?? 0),
          collected: Number(collectedAgg._sum.paymentAmount ?? 0),
          wip,
        };
      })
    );

    res.json(result);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// GET /reports/client-fees
// Optional query params: from, to (date range, default current year Jan 1 – today)
// ---------------------------------------------------------------------------
export const getClientFees = async (req: Request, res: Response) => {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), 0, 1);
  const from = req.query.from ? new Date(req.query.from as string) : defaultFrom;
  const to = req.query.to ? new Date(req.query.to as string) : now;

  try {
    const clients = await prisma.client.findMany({
      select: {
        clientCode: true,
        clientName: true,
        id: true,
        tasks: {
          where: { createdAt: { gte: from, lte: to } },
          select: {
            id: true,
            billingStatus: true,
            timesheets: {
              select: {
                hoursSpent: true,
                staff: { select: { perHourCost: true } },
              },
            },
            expenses: { select: { amount: true } },
          },
        },
        invoices: {
          where: {
            status: { not: 'CANCELLED' },
            invoiceDate: { gte: from, lte: to },
          },
          select: { amount: true },
        },
      },
    });

    const data = clients
      .filter((c) => c.tasks.length > 0)
      .map((c) => {
        const totalTasks = c.tasks.length;
        const billedTasks = c.tasks.filter((t) => t.billingStatus === 'BILLED').length;

        let totalHours = 0;
        let totalCost = 0;
        for (const task of c.tasks) {
          for (const ts of task.timesheets) {
            const h = Number(ts.hoursSpent);
            totalHours += h;
            totalCost += h * Number(ts.staff.perHourCost);
          }
          for (const exp of task.expenses) {
            totalCost += Number(exp.amount);
          }
        }

        const invoiceAmount = c.invoices.reduce((s, inv) => s + Number(inv.amount), 0);
        const totalBilled = invoiceAmount;
        const realisationRate = totalCost > 0 ? Math.round((totalBilled / totalCost) * 100) : null;

        return {
          clientCode: c.clientCode,
          clientName: c.clientName,
          totalTasks,
          billedTasks,
          totalHours,
          totalCost,
          totalBilled,
          invoiceAmount,
          realisationRate,
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost);

    res.json(data);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// GET /reports/staff-kpis
// Optional query params: month (YYYY-MM), year (YYYY)
// ---------------------------------------------------------------------------
export const getStaffKPIs = async (req: Request, res: Response) => {
  const now = new Date();

  const yearParam = req.query.year ? parseInt(req.query.year as string, 10) : now.getFullYear();

  // Validate month param (expected format: YYYY-MM)
  const monthStr = req.query.month as string | undefined;
  const monthParts = monthStr ? monthStr.split('-') : null;
  if (monthParts && (monthParts.length < 2 || isNaN(Number(monthParts[0])) || isNaN(Number(monthParts[1])))) {
    return res.status(400).json({ message: 'month param must be in YYYY-MM format' });
  }
  const monthParam = monthParts ? parseInt(monthParts[1], 10) - 1 : now.getMonth();
  const monthYear  = monthParts ? parseInt(monthParts[0], 10)     : now.getFullYear();

  const monthStart = new Date(monthYear, monthParam, 1);
  const monthEnd = new Date(monthYear, monthParam + 1, 0, 23, 59, 59, 999);
  const yearStart = new Date(yearParam, 0, 1);
  const yearEnd = new Date(yearParam, 11, 31, 23, 59, 59, 999);

  const capacity = workingDaysInMonth(monthYear, monthParam) * 8;

  try {
    const staffList = await prisma.staff.findMany({
      include: {
        user: { select: { role: true } },
        timesheets: {
          // Fetch full year range so hoursThisYear includes all months, not just from monthStart
          where: { date: { gte: yearStart, lte: yearEnd } },
          select: { hoursSpent: true, date: true },
        },
        leaves: {
          where: {
            OR: [
              { status: 'APPROVED', fromDate: { gte: yearStart, lte: yearEnd } },
              { status: 'PENDING' },
            ],
          },
          select: { days: true, status: true, fromDate: true },
        },
        reimbursements: {
          where: { status: { in: ['PENDING', 'REVIEWED'] } },
          select: { id: true },
        },
        partnerTasks: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        },
        managerTasks: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    });

    const data = staffList.map((s) => {
      // Hours this month
      const hoursThisMonth = s.timesheets
        .filter((ts) => ts.date >= monthStart && ts.date <= monthEnd)
        .reduce((sum, ts) => sum + Number(ts.hoursSpent), 0);

      // Hours this year
      const hoursThisYear = s.timesheets
        .filter((ts) => ts.date >= yearStart && ts.date <= yearEnd)
        .reduce((sum, ts) => sum + Number(ts.hoursSpent), 0);

      // All tasks for this staff (partner + manager, deduped)
      const allTasksMap = new Map<number, { id: number; status: string; updatedAt: Date }>();
      for (const t of s.partnerTasks) allTasksMap.set(t.id, t);
      for (const t of s.managerTasks) allTasksMap.set(t.id, t);
      const allTasks = Array.from(allTasksMap.values());

      // Billable tasks assigned = open tasks
      const billableTasksAssigned = allTasks.filter((t) => t.status === 'OPEN').length;

      // Tasks closed this year
      const tasksClosedThisYear = allTasks.filter(
        (t) => t.status === 'CLOSED' && t.updatedAt >= yearStart && t.updatedAt <= yearEnd
      ).length;

      // Billable rate this month
      const billableRateThisMonth = capacity > 0
        ? Math.round((hoursThisMonth / capacity) * 100)
        : null;

      // Leaves taken this year (APPROVED, fromDate in year)
      const leavesTakenThisYear = s.leaves
        .filter(
          (l) => l.status === 'APPROVED' && l.fromDate >= yearStart && l.fromDate <= yearEnd
        )
        .reduce((sum, l) => sum + l.days, 0);

      // Leave pending count
      const leavePending = s.leaves.filter((l) => l.status === 'PENDING').length;

      // Reimbursements pending (PENDING or REVIEWED)
      const reimbursementsPending = s.reimbursements.length;

      return {
        staffId: s.id,
        staffName: s.staffName,
        isPartner: s.isPartner,
        role: s.user?.role ?? null,
        hoursThisMonth,
        hoursThisYear,
        billableTasksAssigned,
        tasksClosedThisYear,
        billableRateThisMonth,
        leavesTakenThisYear,
        leavePending,
        reimbursementsPending,
      };
    });

    res.json(data);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};


// ── Billing Summary Report ────────────────────────────────────────────────────
// GET /api/reports/billing-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=month|quarter
export const getBillingSummary = async (req: Request, res: Response) => {
  const { from, to, groupBy = 'month' } = req.query;
  const start = from ? new Date(from as string) : new Date(new Date().getFullYear(), 0, 1);
  const end = to ? new Date(to as string) : new Date();

  try {
    const tasks = await prisma.task.findMany({
      where: { billingStatus: 'BILLED', updatedAt: { gte: start, lte: end } },
      include: {
        client:        { select: { id: true, clientCode: true, clientName: true } },
        partner:       { select: { id: true, staffName: true } },
        billingEntity: { select: { id: true, name: true } },
        category:      { select: { id: true, name: true } },
        timesheets:    { include: { staff: { select: { perHourCost: true } } } },
        expenses:      true,
        invoice:       { select: { id: true, invoiceNumber: true, status: true, totalAmount: true, paymentDate: true, paymentAmount: true } },
      },
    });

    const fmtPeriod = (d: Date) => {
      if (groupBy === 'quarter') {
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `Q${q} ${d.getFullYear()}`;
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const periodMap = new Map<string, any>();

    for (const task of tasks) {
      const period = fmtPeriod(task.updatedAt);
      if (!periodMap.has(period)) {
        periodMap.set(period, { period, billedAmount: 0, collectedAmount: 0, costIncurred: 0, opeIncurred: 0, taskCount: 0, billedTasks: [] });
      }
      const g = periodMap.get(period);
      const billed    = Number(task.billedAmount ?? 0);
      const collected = task.invoice?.paymentAmount ? Number(task.invoice.paymentAmount) : 0;
      const cost      = task.timesheets.reduce((s: number, ts: any) => s + Number(ts.hoursSpent) * Number(ts.staff.perHourCost), 0);
      const ope       = task.expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
      g.billedAmount    += billed;
      g.collectedAmount += collected;
      g.costIncurred    += cost;
      g.opeIncurred     += ope;
      g.taskCount       += 1;
      g.billedTasks.push({ taskId: task.taskId, taskName: task.taskName, client: task.client, partner: task.partner, billingEntity: task.billingEntity, category: task.category, billedAmount: billed, collected, costIncurred: cost, opeIncurred: ope, profit: billed - cost - ope, invoice: task.invoice });
    }

    const summary = Array.from(periodMap.values())
      .sort((a: any, b: any) => a.period.localeCompare(b.period))
      .map((g: any) => ({ ...g, margin: g.billedAmount > 0 ? Math.round(((g.billedAmount - g.costIncurred - g.opeIncurred) / g.billedAmount) * 100) : 0 }));

    const totals = summary.reduce((acc: any, g: any) => ({
      billedAmount: acc.billedAmount + g.billedAmount,
      collectedAmount: acc.collectedAmount + g.collectedAmount,
      costIncurred: acc.costIncurred + g.costIncurred,
      opeIncurred: acc.opeIncurred + g.opeIncurred,
      taskCount: acc.taskCount + g.taskCount,
    }), { billedAmount: 0, collectedAmount: 0, costIncurred: 0, opeIncurred: 0, taskCount: 0 });

    res.json({ summary, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Due-date alert trigger ────────────────────────────────────────────────────
// POST /api/reports/trigger-due-alerts
export const triggerDueAlerts = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const in3 = new Date(now.getTime() + 3 * 86400000);
    const dueSoon = await prisma.task.findMany({
      where: { status: 'OPEN', dueDate: { gte: now, lte: in3 } },
      include: { manager: { select: { id: true } }, client: { select: { clientName: true } } },
    });
    const overdue = await prisma.task.findMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      include: { manager: { select: { id: true } } },
    });

    let created = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (const task of dueSoon) {
      if (!task.managerId) continue;
      const user = await prisma.user.findFirst({ where: { staffId: task.managerId } });
      if (!user) continue;
      const daysLeft = Math.ceil((new Date(task.dueDate!).getTime() - now.getTime()) / 86400000);
      const msg = `Task ${task.taskId} "${task.taskName}" is due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`;
      const exists = await (prisma as any).notification.findFirst({ where: { userId: user.id, message: msg, createdAt: { gte: today } } });
      if (!exists) {
        await (prisma as any).notification.create({ data: { userId: user.id, title: '⏰ Task Due Soon', message: msg, link: '/tasks' } });
        created++;
      }
    }

    for (const task of overdue) {
      if (!task.managerId) continue;
      const user = await prisma.user.findFirst({ where: { staffId: task.managerId } });
      if (!user) continue;
      const msg = `Task ${task.taskId} "${task.taskName}" is overdue!`;
      const exists = await (prisma as any).notification.findFirst({ where: { userId: user.id, message: msg, createdAt: { gte: today } } });
      if (!exists) {
        await (prisma as any).notification.create({ data: { userId: user.id, title: '🔴 Overdue Task', message: msg, link: '/tasks' } });
        created++;
      }
    }

    res.json({ created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
