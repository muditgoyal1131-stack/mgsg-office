import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { sendLeaveNotification, sendLeaveAppliedEmail } from '../services/emailService';
import { smsLeaveApplied, smsLeaveDecision } from '../services/smsService';

const prisma = new PrismaClient();

const ANNUAL_LEAVE_DAYS = 18;

const isHROrAdmin = (user: any) => user?.role === 'HR' || user?.role === 'ADMIN';

// Check if user is the staff's reporting partner or HR/Admin
const canReviewLeaveOf = async (user: any, staffId: number): Promise<boolean> => {
  if (isHROrAdmin(user)) return true;
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  return staff?.reportingPartnerId === user?.staffId;
};

const LEAVE_INCLUDE = {
  staff: { select: { id: true, staffName: true } },
  reviewedBy: { select: { id: true, staffName: true } },
};

// ── LEAVES ────────────────────────────────────────────────────────────────────

export const getLeaves = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { staffId: staffIdParam, status, year } = req.query as Record<string, string | undefined>;

    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const yearStart = new Date(`${targetYear}-01-01`);
    const yearEnd = new Date(`${targetYear}-12-31`);

    let filterStaffId: number | undefined;
    if (isHROrAdmin(req.user)) {
      filterStaffId = staffIdParam ? parseInt(staffIdParam, 10) : undefined;
    } else {
      filterStaffId = req.user?.staffId;
    }

    const where: any = {
      fromDate: { gte: yearStart },
      toDate: { lte: yearEnd },
    };
    if (filterStaffId !== undefined) where.staffId = filterStaffId;
    if (status) where.status = status;

    const leaves = await prisma.leave.findMany({
      where,
      include: LEAVE_INCLUDE,
      orderBy: { fromDate: 'desc' },
    });
    res.json(leaves);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getLeaveBalance = async (req: Request & { user?: any }, res: Response) => {
  const { staffId } = req.params;
  const targetStaffId = parseInt(staffId, 10);

  if (!isHROrAdmin(req.user) && req.user?.staffId !== targetStaffId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const staff = await prisma.staff.findUnique({ where: { id: targetStaffId } });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(`${currentYear}-01-01`);
    const yearEnd = new Date(`${currentYear}-12-31`);

    // Count APPROVED regular leaves for current year
    const approvedLeavesAgg = await prisma.leave.aggregate({
      where: {
        staffId: targetStaffId,
        status: 'APPROVED',
        fromDate: { gte: yearStart },
        toDate: { lte: yearEnd },
      },
      _sum: { days: true },
    });
    const taken = Number(approvedLeavesAgg._sum.days ?? 0);

    // Count APPROVED comp leaves for current year (adds to balance)
    const approvedCompAgg = await prisma.compLeaveRequest.aggregate({
      where: {
        staffId: targetStaffId,
        status: 'APPROVED',
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      _sum: { days: true },
    });
    const compAdded = Number(approvedCompAgg._sum.days ?? 0);

    const allowed = ANNUAL_LEAVE_DAYS + compAdded;
    const remaining = allowed - taken;

    res.json({
      staffId: targetStaffId,
      year: currentYear,
      allowed,
      taken,
      remaining,
      compAdded,
      annualBase: ANNUAL_LEAVE_DAYS,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const applyLeave = async (req: Request & { user?: any }, res: Response) => {
  const { fromDate, toDate, reason } = req.body;
  const staffId = req.user?.staffId;

  if (!staffId) return res.status(400).json({ message: 'Staff profile required' });
  if (!fromDate || !toDate) {
    return res.status(400).json({ message: 'fromDate and toDate are required' });
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ message: 'Invalid date format' });
  }
  if (from > to) {
    return res.status(400).json({ message: 'fromDate must be on or before toDate' });
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round((to.getTime() - from.getTime()) / msPerDay) + 1;

  try {
    // Check for overlapping APPROVED or PENDING leaves
    const overlapping = await prisma.leave.findFirst({
      where: {
        staffId,
        status: { in: ['APPROVED', 'PENDING'] },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    });
    if (overlapping) {
      return res.status(409).json({ message: 'Overlapping leave request exists', conflictId: overlapping.id });
    }

    const leave = await prisma.leave.create({
      data: { staffId, fromDate: from, toDate: to, days, reason: reason || null, status: 'PENDING' },
      include: { ...LEAVE_INCLUDE, staff: { select: { id: true, staffName: true, email: true } } },
    });
    res.status(201).json(leave);

    // Notify HR / Admin staff about the new leave request (fire-and-forget)
    const hrAdmins = await prisma.staff.findMany({
      where: { isActive: true, user: { role: { in: ['HR', 'ADMIN'] } } },
      select: { email: true, phone: true },
    });
    const hrEmails  = hrAdmins.map((s: any) => s.email).filter(Boolean) as string[];
    const hrPhones  = hrAdmins.map((s: any) => s.phone);
    const fromStr   = from.toLocaleDateString('en-IN');
    const toStr     = to.toLocaleDateString('en-IN');
    const staffName = (leave as any).staff.staffName;
    if (hrEmails.length > 0) {
      sendLeaveAppliedEmail(hrEmails, staffName, fromStr, toStr, days, reason).catch(() => {});
    }
    smsLeaveApplied(hrPhones, staffName, fromStr, toStr, days).catch(() => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const cancelLeave = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  try {
    const leave = await prisma.leave.findUnique({ where: { id: Number(id) } });
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: 'Only PENDING leaves can be cancelled' });
    }
    if (!isHROrAdmin(req.user) && leave.staffId !== req.user?.staffId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const updated = await prisma.leave.update({
      where: { id: Number(id) },
      data: { status: 'CANCELLED' },
      include: LEAVE_INCLUDE,
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveLeave = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const reviewerId = req.user?.staffId;
  try {
    const leave = await prisma.leave.findUnique({ where: { id: Number(id) } });
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: `Leave is ${leave.status}, cannot approve` });
    }
    const updated = await prisma.leave.update({
      where: { id: Number(id) },
      data: { status: 'APPROVED', reviewedById: reviewerId ?? null, reviewedAt: new Date(), rejectionReason: null },
      include: { ...LEAVE_INCLUDE, staff: { select: { id: true, staffName: true, email: true } } },
    });
    res.json(updated);

    // Email + SMS the staff member (fire-and-forget)
    const staffEmail = (updated as any).staff?.email;
    const staffPhone = (updated as any).staff?.phone;
    const staffName  = (updated as any).staff?.staffName;
    const fromStr    = new Date(leave.fromDate).toLocaleDateString('en-IN');
    const toStr      = new Date(leave.toDate).toLocaleDateString('en-IN');
    if (staffEmail) {
      sendLeaveNotification(staffEmail, staffName, 'APPROVED', 'Leave', fromStr, toStr).catch(() => {});
    }
    smsLeaveDecision(staffPhone, staffName, 'APPROVED', fromStr, toStr).catch(() => {});
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const rejectLeave = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const reviewerId = req.user?.staffId;
  try {
    const leave = await prisma.leave.findUnique({ where: { id: Number(id) } });
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: `Leave is ${leave.status}, cannot reject` });
    }
    const updated = await prisma.leave.update({
      where: { id: Number(id) },
      data: { status: 'REJECTED', reviewedById: reviewerId ?? null, reviewedAt: new Date(), rejectionReason: rejectionReason || null },
      include: { ...LEAVE_INCLUDE, staff: { select: { id: true, staffName: true, email: true } } },
    });
    res.json(updated);

    // Email + SMS the staff member (fire-and-forget)
    const staffEmail = (updated as any).staff?.email;
    const staffPhone = (updated as any).staff?.phone;
    const staffName  = (updated as any).staff?.staffName;
    const fromStr    = new Date(leave.fromDate).toLocaleDateString('en-IN');
    const toStr      = new Date(leave.toDate).toLocaleDateString('en-IN');
    if (staffEmail) {
      sendLeaveNotification(staffEmail, staffName, 'REJECTED', 'Leave', fromStr, toStr, rejectionReason).catch(() => {});
    }
    smsLeaveDecision(staffPhone, staffName, 'REJECTED', fromStr, toStr, rejectionReason).catch(() => {});
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── EXPORT ────────────────────────────────────────────────────────────────────

export const exportLeaves = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { staffId: staffIdParam, status, year } = req.query as Record<string, string | undefined>;

    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const yearStart = new Date(`${targetYear}-01-01`);
    const yearEnd = new Date(`${targetYear}-12-31`);

    let filterStaffId: number | undefined;
    if (isHROrAdmin(req.user)) {
      filterStaffId = staffIdParam ? parseInt(staffIdParam, 10) : undefined;
    } else {
      filterStaffId = req.user?.staffId;
    }

    const where: any = { fromDate: { gte: yearStart }, toDate: { lte: yearEnd } };
    if (filterStaffId !== undefined) where.staffId = filterStaffId;
    if (status) where.status = status;

    const leaves = await prisma.leave.findMany({
      where,
      include: LEAVE_INCLUDE,
      orderBy: { fromDate: 'desc' },
    });

    const fmtDate = (d: Date | null | undefined) => {
      if (!d) return '';
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, '0')}-${dt.toLocaleString('en', { month: 'short' })}-${dt.getFullYear()}`;
    };

    const rows = leaves.map((l: any) => ({
      Staff: l.staff.staffName,
      From: fmtDate(l.fromDate),
      To: fmtDate(l.toDate),
      Days: l.days,
      Reason: l.reason || '',
      Status: l.status,
      'Reviewed By': l.reviewedBy?.staffName || '',
      'Applied At': fmtDate(l.createdAt),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leaves');
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 14 }];

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Leaves_${targetYear}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── COMPENSATORY LEAVE REQUESTS ───────────────────────────────────────────────

const COMP_INCLUDE = {
  staff: { select: { id: true, staffName: true, reportingPartnerId: true } },
  reviewedBy: { select: { id: true, staffName: true } },
};

export const getCompLeaveRequests = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { staffId: staffIdParam } = req.query as Record<string, string | undefined>;

    let where: any = {};
    if (isHROrAdmin(req.user)) {
      if (staffIdParam) where.staffId = parseInt(staffIdParam, 10);
    } else if (req.user?.staffId) {
      // Check DB whether this staff is a partner (isPartner is not on the JWT)
      const staffRecord = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
      if (staffRecord?.isPartner) {
        // Reporting partner: see requests from their reportees + own
        const reportees = await prisma.staff.findMany({
          where: { reportingPartnerId: req.user.staffId },
          select: { id: true },
        });
        const ids = reportees.map((s: any) => s.id);
        ids.push(req.user.staffId);
        where.staffId = { in: ids };
      } else {
        // Regular staff: own only
        where.staffId = req.user.staffId;
      }
    } else {
      where.staffId = req.user?.staffId;
    }

    const requests = await prisma.compLeaveRequest.findMany({
      where,
      include: COMP_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const requestCompLeave = async (req: Request & { user?: any }, res: Response) => {
  const staffId = req.user?.staffId;
  if (!staffId) return res.status(400).json({ message: 'Staff profile required' });

  const { days, reason } = req.body;
  if (!days || !reason?.trim()) {
    return res.status(400).json({ message: 'days and reason are required' });
  }
  if (Number(days) <= 0) {
    return res.status(400).json({ message: 'days must be greater than 0' });
  }

  try {
    const request = await prisma.compLeaveRequest.create({
      data: { staffId, days: Number(days), reason: reason.trim(), status: 'PENDING' },
      include: COMP_INCLUDE,
    });
    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveCompLeave = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const reviewerId = req.user?.staffId;

  try {
    const compReq = await prisma.compLeaveRequest.findUnique({ where: { id: Number(id) } });
    if (!compReq) return res.status(404).json({ message: 'Request not found' });
    if (compReq.status !== 'PENDING') {
      return res.status(400).json({ message: `Request is already ${compReq.status}` });
    }

    const canReview = await canReviewLeaveOf(req.user, compReq.staffId);
    if (!canReview) return res.status(403).json({ message: 'Only the reporting partner or HR/Admin can approve' });

    const updated = await prisma.compLeaveRequest.update({
      where: { id: Number(id) },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date() },
      include: COMP_INCLUDE,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const rejectCompLeave = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const reviewerId = req.user?.staffId;

  try {
    const compReq = await prisma.compLeaveRequest.findUnique({ where: { id: Number(id) } });
    if (!compReq) return res.status(404).json({ message: 'Request not found' });
    if (compReq.status !== 'PENDING') {
      return res.status(400).json({ message: `Request is already ${compReq.status}` });
    }

    const canReview = await canReviewLeaveOf(req.user, compReq.staffId);
    if (!canReview) return res.status(403).json({ message: 'Only the reporting partner or HR/Admin can reject' });

    const updated = await prisma.compLeaveRequest.update({
      where: { id: Number(id) },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: rejectionReason || null },
      include: COMP_INCLUDE,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
