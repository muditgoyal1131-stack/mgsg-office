import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isHROrAdmin = (user: any) => user?.role === 'HR' || user?.role === 'ADMIN';

// Check if user is reporting partner of a staff member
const isReportingPartnerOf = async (user: any, staffId: number): Promise<boolean> => {
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  return staff?.reportingPartnerId === user?.staffId;
};

// ── AUTO-FILL ABSENT for past unrecorded days ─────────────────────────────────
// Skips weekends AND holidays.
const autoFillAbsent = async (staffId: number, start: Date, end: Date) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const effectiveEnd = end < yesterday ? end : yesterday;
  if (start > effectiveEnd) return;

  // Fetch holidays in range
  const holidayRecords = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: effectiveEnd } },
    select: { date: true },
  });
  const holidaySet = new Set(holidayRecords.map((h) => h.date.toISOString().slice(0, 10)));

  const existing = await prisma.attendance.findMany({
    where: { staffId, date: { gte: start, lte: effectiveEnd } },
    select: { date: true },
  });
  const existingSet = new Set(existing.map((r) => r.date.toISOString().slice(0, 10)));

  const toCreate: { staffId: number; date: Date; status: 'ABSENT' }[] = [];
  const cursor = new Date(start);
  while (cursor <= effectiveEnd) {
    const key = cursor.toISOString().slice(0, 10);
    const dow = cursor.getUTCDay(); // 0=Sun,6=Sat
    if (!existingSet.has(key) && !holidaySet.has(key) && dow !== 0 && dow !== 6) {
      toCreate.push({ staffId, date: new Date(cursor), status: 'ABSENT' });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (toCreate.length > 0) {
    await prisma.attendance.createMany({ data: toCreate, skipDuplicates: true });
  }
};

// ── GET ATTENDANCE ────────────────────────────────────────────────────────────

export const getAttendance = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { staffId: staffIdParam, month } = req.query as Record<string, string | undefined>;

    let targetStaffId: number;
    if (isHROrAdmin(req.user)) {
      if (staffIdParam) targetStaffId = parseInt(staffIdParam, 10);
      else if (req.user?.staffId) targetStaffId = req.user.staffId;
      else return res.json([]);
    } else {
      if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required' });
      targetStaffId = req.user.staffId;
    }

    const { start, end } = resolveMonthRange(month);

    // Auto-fill absent for past unrecorded days
    await autoFillAbsent(targetStaffId, start, end);

    const records = await prisma.attendance.findMany({
      where: { staffId: targetStaffId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
      select: { id: true, staffId: true, date: true, status: true, notes: true },
    });

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET ALL ATTENDANCE ────────────────────────────────────────────────────────

export const getAllAttendance = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { month } = req.query as Record<string, string | undefined>;
    const { start, end } = resolveMonthRange(month);

    const records = await prisma.attendance.findMany({
      where: { date: { gte: start, lte: end } },
      include: { staff: { select: { id: true, staffName: true } } },
      orderBy: [{ staffId: 'asc' }, { date: 'asc' }],
    });

    const staffMap = new Map<number, {
      staffId: number; staffName: string;
      records: { date: Date; status: string; notes: string | null }[];
      summary: { present: number; absent: number; halfDay: number; wfh: number; onLeave: number };
    }>();

    for (const r of records) {
      const sid = r.staffId;
      if (!staffMap.has(sid)) {
        staffMap.set(sid, {
          staffId: sid,
          staffName: (r as any).staff.staffName,
          records: [],
          summary: { present: 0, absent: 0, halfDay: 0, wfh: 0, onLeave: 0 },
        });
      }
      const entry = staffMap.get(sid)!;
      entry.records.push({ date: r.date, status: r.status, notes: r.notes });
      switch (r.status) {
        case 'PRESENT':  entry.summary.present++;  break;
        case 'ABSENT':   entry.summary.absent++;   break;
        case 'HALF_DAY': entry.summary.halfDay++;  break;
        case 'WFH':      entry.summary.wfh++;      break;
        case 'ON_LEAVE': entry.summary.onLeave++;  break;
      }
    }

    res.json(Array.from(staffMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── MARK ATTENDANCE ───────────────────────────────────────────────────────────
// Staff can only mark TODAY. HR/Admin can mark any date.

export const markAttendance = async (req: Request & { user?: any }, res: Response) => {
  const { date, status, notes, staffId: bodyStaffId } = req.body;

  if (!date || !status) return res.status(400).json({ message: 'date and status are required' });

  const validStatuses = ['PRESENT', 'ABSENT', 'HALF_DAY', 'WFH', 'ON_LEAVE'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) return res.status(400).json({ message: 'Invalid date format' });
  parsedDate.setUTCHours(0, 0, 0, 0);

  // Restrict past-date marking for non-HR/Admin
  if (!isHROrAdmin(req.user)) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (parsedDate < today) {
      return res.status(403).json({
        message: 'You cannot mark attendance for past dates. Please raise an Attendance Correction Request.',
      });
    }
  }

  let targetStaffId: number;
  if (isHROrAdmin(req.user)) {
    targetStaffId = bodyStaffId ? parseInt(bodyStaffId, 10) : req.user?.staffId;
    if (!targetStaffId) return res.status(400).json({ message: 'staffId is required' });
  } else {
    if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required' });
    targetStaffId = req.user.staffId;
  }

  try {
    const staff = await prisma.staff.findUnique({ where: { id: targetStaffId } });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    const record = await prisma.attendance.upsert({
      where: { staffId_date: { staffId: targetStaffId, date: parsedDate } },
      create: { staffId: targetStaffId, date: parsedDate, status, notes: notes || null },
      update: { status, notes: notes !== undefined ? notes : undefined },
    });
    res.status(200).json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ATTENDANCE SUMMARY ────────────────────────────────────────────────────────

export const getAttendanceSummary = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { month } = req.query as Record<string, string | undefined>;
    const { start, end } = resolveMonthRange(month);

    const records = await prisma.attendance.findMany({
      where: { date: { gte: start, lte: end } },
      include: { staff: { select: { id: true, staffName: true } } },
    });

    const summaryMap = new Map<number, {
      staffId: number; staffName: string;
      present: number; absent: number; halfDay: number; wfh: number; onLeave: number;
    }>();

    for (const r of records) {
      const sid = r.staffId;
      if (!summaryMap.has(sid)) {
        summaryMap.set(sid, { staffId: sid, staffName: (r as any).staff.staffName, present: 0, absent: 0, halfDay: 0, wfh: 0, onLeave: 0 });
      }
      const s = summaryMap.get(sid)!;
      switch (r.status) {
        case 'PRESENT':  s.present++;  break;
        case 'ABSENT':   s.absent++;   break;
        case 'HALF_DAY': s.halfDay++;  break;
        case 'WFH':      s.wfh++;      break;
        case 'ON_LEAVE': s.onLeave++;  break;
      }
    }

    res.json(Array.from(summaryMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── ATTENDANCE CORRECTION REQUESTS ────────────────────────────────────────────

const CORRECTION_INCLUDE = {
  staff: { select: { id: true, staffName: true, reportingPartnerId: true } },
  reviewedBy: { select: { id: true, staffName: true } },
};

export const getCorrectionRequests = async (req: Request & { user?: any }, res: Response) => {
  try {
    let where: any = {};

    if (isHROrAdmin(req.user)) {
      // See all
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
        where.staffId = req.user.staffId;
      }
    } else {
      where.staffId = req.user?.staffId;
    }

    const requests = await prisma.attendanceCorrectionRequest.findMany({
      where,
      include: CORRECTION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const requestCorrection = async (req: Request & { user?: any }, res: Response) => {
  const staffId = req.user?.staffId;
  if (!staffId) return res.status(400).json({ message: 'Staff profile required' });

  const { date, requestedStatus, reason } = req.body;
  if (!date || !requestedStatus || !reason?.trim()) {
    return res.status(400).json({ message: 'date, requestedStatus, and reason are required' });
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) return res.status(400).json({ message: 'Invalid date' });
  parsedDate.setUTCHours(0, 0, 0, 0);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (parsedDate >= today) {
    return res.status(400).json({ message: 'Correction requests are only for past dates' });
  }

  const validStatuses = ['PRESENT', 'ABSENT', 'HALF_DAY', 'WFH', 'ON_LEAVE'];
  if (!validStatuses.includes(requestedStatus)) {
    return res.status(400).json({ message: 'Invalid requestedStatus' });
  }

  try {
    // Check for existing pending request for same date
    const existing = await prisma.attendanceCorrectionRequest.findFirst({
      where: { staffId, date: parsedDate, status: 'PENDING' },
    });
    if (existing) {
      return res.status(409).json({ message: 'A pending correction request already exists for this date' });
    }

    const request = await prisma.attendanceCorrectionRequest.create({
      data: { staffId, date: parsedDate, requestedStatus, reason: reason.trim(), status: 'PENDING' },
      include: CORRECTION_INCLUDE,
    });
    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveCorrection = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const reviewerId = req.user?.staffId;

  try {
    const corrReq = await prisma.attendanceCorrectionRequest.findUnique({ where: { id: Number(id) } });
    if (!corrReq) return res.status(404).json({ message: 'Request not found' });
    if (corrReq.status !== 'PENDING') {
      return res.status(400).json({ message: `Request is already ${corrReq.status}` });
    }

    // Only HR/Admin or the reporting partner can approve
    const canApprove = isHROrAdmin(req.user) || await isReportingPartnerOf(req.user, corrReq.staffId);
    if (!canApprove) return res.status(403).json({ message: 'Only HR/Admin or reporting partner can approve corrections' });

    // Update the actual attendance record
    const date = new Date(corrReq.date);
    date.setUTCHours(0, 0, 0, 0);
    await prisma.attendance.upsert({
      where: { staffId_date: { staffId: corrReq.staffId, date } },
      create: { staffId: corrReq.staffId, date, status: corrReq.requestedStatus, notes: `Corrected by ${req.user?.staffName || 'reviewer'}` },
      update: { status: corrReq.requestedStatus, notes: `Corrected by ${req.user?.staffName || 'reviewer'}` },
    });

    const updated = await prisma.attendanceCorrectionRequest.update({
      where: { id: Number(id) },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date() },
      include: CORRECTION_INCLUDE,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const rejectCorrection = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  const reviewerId = req.user?.staffId;

  try {
    const corrReq = await prisma.attendanceCorrectionRequest.findUnique({ where: { id: Number(id) } });
    if (!corrReq) return res.status(404).json({ message: 'Request not found' });
    if (corrReq.status !== 'PENDING') {
      return res.status(400).json({ message: `Request is already ${corrReq.status}` });
    }

    const canReject = isHROrAdmin(req.user) || await isReportingPartnerOf(req.user, corrReq.staffId);
    if (!canReject) return res.status(403).json({ message: 'Only HR/Admin or reporting partner can reject corrections' });

    const updated = await prisma.attendanceCorrectionRequest.update({
      where: { id: Number(id) },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: rejectionReason || null },
      include: CORRECTION_INCLUDE,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function resolveMonthRange(month: string | undefined): { start: Date; end: Date } {
  const now = new Date();
  let year: number;
  let mon: number;

  if (month) {
    const parts = month.split('-');
    year = parseInt(parts[0], 10);
    mon = parseInt(parts[1], 10) - 1;
  } else {
    year = now.getFullYear();
    mon = now.getMonth();
  }

  const start = new Date(Date.UTC(year, mon, 1));
  const end = new Date(Date.UTC(year, mon + 1, 0));
  return { start, end };
}
