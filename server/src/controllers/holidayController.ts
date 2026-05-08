import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isHROrAdmin = (user: any) => user?.role === 'HR' || user?.role === 'ADMIN';

// GET /holidays?year=2025
export const getHolidays = async (req: Request & { user?: any }, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end   = new Date(Date.UTC(year, 11, 31));
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching holidays', error: err });
  }
};

// GET /holidays/dates?year=2025 — lightweight: just ISO date strings, used by attendance
export const getHolidayDates = async (req: Request & { user?: any }, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end   = new Date(Date.UTC(year, 11, 31));
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, name: true, type: true },
      orderBy: { date: 'asc' },
    });
    res.json(holidays.map(h => ({ date: h.date.toISOString().slice(0, 10), name: h.name, type: h.type })));
  } catch (err) {
    res.status(500).json({ message: 'Error fetching holiday dates', error: err });
  }
};

// POST /holidays
export const createHoliday = async (req: Request & { user?: any }, res: Response) => {
  if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR/Admin only' });
  const { date, name, type } = req.body;
  if (!date || !name?.trim()) return res.status(400).json({ message: 'date and name are required' });
  try {
    const d = new Date(date); d.setUTCHours(0, 0, 0, 0);
    const holiday = await prisma.holiday.create({
      data: { date: d, name: name.trim(), type: type || 'NATIONAL' },
    });
    res.status(201).json(holiday);
  } catch (err: any) {
    if (err?.code === 'P2002') return res.status(400).json({ message: 'A holiday already exists on this date' });
    res.status(500).json({ message: 'Error creating holiday', error: err });
  }
};

// PUT /holidays/:id
export const updateHoliday = async (req: Request & { user?: any }, res: Response) => {
  if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR/Admin only' });
  const { name, type, date } = req.body;
  try {
    const data: any = {};
    if (name) data.name = name.trim();
    if (type) data.type = type;
    if (date) { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); data.date = d; }
    const holiday = await prisma.holiday.update({ where: { id: parseInt(req.params.id) }, data });
    res.json(holiday);
  } catch (err: any) {
    if (err?.code === 'P2002') return res.status(400).json({ message: 'A holiday already exists on this date' });
    res.status(500).json({ message: 'Error updating holiday', error: err });
  }
};

// DELETE /holidays/:id
export const deleteHoliday = async (req: Request & { user?: any }, res: Response) => {
  if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR/Admin only' });
  try {
    await prisma.holiday.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting holiday', error: err });
  }
};
