import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const normalizeRole = (r: any): Role => {
  if (r === 'ADMIN' || r === 'IT' || r === 'HR' || r === 'STAFF') return r;
  return 'STAFF';
};

export const getAllStaff = async (_req: Request, res: Response) => {
  try {
    const staff = await prisma.staff.findMany({
      include: {
        user: { select: { role: true } },
        reportingPartner: { select: { id: true, staffName: true } },
      },
      orderBy: { staffName: 'asc' },
    });
    const withRole = staff.map((s: any) => ({
      ...s,
      role: s.user?.role || 'STAFF',
    }));
    res.json(withRole);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createStaff = async (req: Request & { user?: any }, res: Response) => {
  const { staffName, isPartner, perHourCost, email, password, role, reportingPartnerId, dateOfBirth, joiningDate } = req.body;
  const isHRUser = req.user?.role === 'HR';
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const staff = await prisma.staff.create({
      data: {
        staffName,
        isPartner: isHRUser ? false : Boolean(isPartner),
        perHourCost: isHRUser ? 0 : (perHourCost || 0),
        email,
        reportingPartnerId: reportingPartnerId ? Number(reportingPartnerId) : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        isActive: true,
      },
    });

    const hashed = await bcrypt.hash(password || 'Welcome@123', 10);
    const assignedRole = isHRUser ? 'STAFF' : normalizeRole(role);
    await prisma.user.create({
      data: { email, password: hashed, role: assignedRole, staffId: staff.id },
    });

    res.status(201).json(staff);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateStaff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { staffName, isPartner, perHourCost, email, role, reportingPartnerId, dateOfBirth, joiningDate } = req.body;
  try {
    const staff = await prisma.staff.update({
      where: { id: Number(id) },
      data: {
        staffName,
        isPartner: Boolean(isPartner),
        perHourCost,
        email,
        reportingPartnerId: reportingPartnerId ? Number(reportingPartnerId) : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
      },
    });
    if (role) {
      await prisma.user.updateMany({
        where: { staffId: Number(id) },
        data: { role: normalizeRole(role), email },
      });
    } else {
      await prisma.user.updateMany({ where: { staffId: Number(id) }, data: { email } });
    }
    res.json(staff);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const toggleStaffActive = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const staff = await prisma.staff.findUnique({ where: { id: Number(id) } });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    const updated = await prisma.staff.update({
      where: { id: Number(id) },
      data: { isActive: !staff.isActive },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteStaff = async (req: Request, res: Response) => {
  const { id } = req.params;
  const sid = Number(id);
  try {
    // Delete all FK-dependent records before removing the staff row
    await prisma.user.deleteMany({ where: { staffId: sid } });
    await prisma.timesheet.deleteMany({ where: { staffId: sid } });
    await prisma.attendance.deleteMany({ where: { staffId: sid } });
    await prisma.attendanceCorrectionRequest.deleteMany({ where: { staffId: sid } });
    await prisma.leave.deleteMany({ where: { staffId: sid } });
    await prisma.compLeaveRequest.deleteMany({ where: { staffId: sid } });
    await prisma.reimbursement.deleteMany({ where: { staffId: sid } });
    await prisma.staffDocument.deleteMany({ where: { staffId: sid } });
    await prisma.staff.delete({ where: { id: sid } });
    res.json({ message: 'Staff deleted' });
  } catch (err) {
    console.error('deleteStaff error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUpcomingEvents = async (_req: Request, res: Response) => {
  try {
    const staff = await prisma.staff.findMany({
      where: { isActive: true },
      select: { id: true, staffName: true, dateOfBirth: true, joiningDate: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming: any[] = [];

    for (const s of staff) {
      if (s.dateOfBirth) {
        const dob = new Date(s.dateOfBirth);
        let thisYearBDay = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (thisYearBDay < today) thisYearBDay = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
        const daysUntil = Math.round((thisYearBDay.getTime() - today.getTime()) / 86400000);
        if (daysUntil <= 30) {
          upcoming.push({ type: 'BIRTHDAY', staffId: s.id, staffName: s.staffName, date: thisYearBDay.toISOString().slice(0, 10), daysUntil });
        }
      }
      if (s.joiningDate) {
        const jd = new Date(s.joiningDate);
        let thisYearAnn = new Date(today.getFullYear(), jd.getMonth(), jd.getDate());
        if (thisYearAnn < today) thisYearAnn = new Date(today.getFullYear() + 1, jd.getMonth(), jd.getDate());
        const daysUntil = Math.round((thisYearAnn.getTime() - today.getTime()) / 86400000);
        if (daysUntil <= 30) {
          const years = thisYearAnn.getFullYear() - jd.getFullYear();
          if (years > 0) {
            upcoming.push({ type: 'ANNIVERSARY', staffId: s.id, staffName: s.staffName, date: thisYearAnn.toISOString().slice(0, 10), daysUntil, years });
          }
        }
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    res.json(upcoming);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getClientHealthScores = async (_req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        tasks: true,
        invoices: true,
      },
    });

    const scores = clients
      .filter((c) => c.tasks.length > 0 || c.invoices.length > 0)
      .map((client) => {
        const tasks = client.tasks;
        const invoices = client.invoices;

        const totalTasks = tasks.length;
        const billedTasks = tasks.filter((t) => t.billingStatus === 'BILLED').length;
        const overdueTasks = tasks.filter(
          (t) => t.dueDate && t.status === 'OPEN' && new Date(t.dueDate) < new Date()
        ).length;
        const billingRealization = totalTasks > 0 ? Math.round((billedTasks / totalTasks) * 100) : 100;

        const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount), 0);
        const totalCollected = invoices.reduce((s, i) => s + Number(i.paymentAmount || 0), 0);
        const overdueInvoices = invoices.filter(
          (i) => i.status === 'OVERDUE' || (i.dueDate && new Date(i.dueDate) < new Date() && i.status !== 'PAID' && i.status !== 'CANCELLED')
        ).length;
        const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 100;

        let score = 100;
        if (billingRealization < 50) score -= 30;
        else if (billingRealization < 70) score -= 15;
        if (overdueInvoices > 0) score -= Math.min(30, overdueInvoices * 10);
        if (overdueTasks > 0) score -= Math.min(20, overdueTasks * 5);
        if (collectionRate < 60) score -= 20;
        else if (collectionRate < 80) score -= 10;
        score = Math.max(0, score);

        const health: 'GOOD' | 'AT_RISK' | 'CRITICAL' = score >= 75 ? 'GOOD' : score >= 50 ? 'AT_RISK' : 'CRITICAL';

        return {
          clientId: client.id, clientCode: client.clientCode, clientName: client.clientName,
          score, health, billingRealization, overdueTasks, overdueInvoices, collectionRate,
          totalTasks, totalInvoiced,
        };
      });

    scores.sort((a, b) => a.score - b.score);
    res.json(scores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
