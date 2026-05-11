import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Profit Centres ──────────────────────────────────────────────────────────

export const getProfitCentres = async (_req: Request, res: Response) => {
  try {
    const items = await prisma.profitCentre.findMany({
      orderBy: { name: 'asc' },
      include: {
        staffAccess: {
          include: { staff: { select: { id: true, staffName: true, email: true, isPartner: true } } },
        },
        _count: { select: { invoices: true } },
      },
    });
    res.json(items);
  } catch { res.status(500).json({ message: 'Server error' }); }
};

// ── Profit Centre Partner Access ────────────────────────────────────────────

export const assignPartnerToProfitCentre = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { staffId } = req.body;
  if (!staffId) return res.status(400).json({ message: 'staffId is required' });
  try {
    const access = await prisma.staffProfitCentre.create({
      data: { staffId: Number(staffId), profitCentreId: Number(id) },
    });
    res.status(201).json(access);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already assigned' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const removePartnerFromProfitCentre = async (req: Request, res: Response) => {
  const { id, staffId } = req.params;
  try {
    await prisma.staffProfitCentre.deleteMany({
      where: { profitCentreId: Number(id), staffId: Number(staffId) },
    });
    res.json({ message: 'Removed' });
  } catch { res.status(500).json({ message: 'Server error' }); }
};

export const createProfitCentre = async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const item = await prisma.profitCentre.create({ data: { name: name.trim() } });
    res.status(201).json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateProfitCentre = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const item = await prisma.profitCentre.update({ where: { id: Number(id) }, data: { name: name.trim() } });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteProfitCentre = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const inUse = await prisma.task.count({ where: { profitCentreId: Number(id) } });
    if (inUse > 0) return res.status(400).json({ message: `Cannot delete — used by ${inUse} task(s)` });
    await prisma.profitCentre.delete({ where: { id: Number(id) } });
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
};

// ── Categories ───────────────────────────────────────────────────────────────

export const getCategories = async (_req: Request, res: Response) => {
  try {
    const items = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json(items);
  } catch { res.status(500).json({ message: 'Server error' }); }
};

export const createCategory = async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const item = await prisma.category.create({ data: { name: name.trim() } });
    res.status(201).json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const item = await prisma.category.update({ where: { id: Number(id) }, data: { name: name.trim() } });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const inUse = await prisma.task.count({ where: { categoryId: Number(id) } });
    if (inUse > 0) return res.status(400).json({ message: `Cannot delete — used by ${inUse} task(s)` });
    await prisma.category.delete({ where: { id: Number(id) } });
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
};

// ── Billing Entities ─────────────────────────────────────────────────────────

export const getBillingEntities = async (_req: Request, res: Response) => {
  try {
    const items = await prisma.billingEntity.findMany({ orderBy: { name: 'asc' } });
    res.json(items);
  } catch { res.status(500).json({ message: 'Server error' }); }
};

export const createBillingEntity = async (req: Request, res: Response) => {
  const { name, gstin, pan, address, city, state, stateCode, email, phone, bankName, bankAccount, bankIfsc, bankBranch } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const item = await prisma.billingEntity.create({
      data: {
        name: name.trim(),
        gstin: gstin || null,
        pan: pan || null,
        address: address || null,
        city: city || null,
        state: state || null,
        stateCode: stateCode || null,
        email: email || null,
        phone: phone || null,
        bankName: bankName || null,
        bankAccount: bankAccount || null,
        bankIfsc: bankIfsc || null,
        bankBranch: bankBranch || null,
      },
    });
    res.status(201).json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateBillingEntity = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, gstin, pan, address, city, state, stateCode, email, phone, bankName, bankAccount, bankIfsc, bankBranch } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const item = await prisma.billingEntity.update({
      where: { id: Number(id) },
      data: {
        name: name.trim(),
        gstin: gstin || null,
        pan: pan || null,
        address: address || null,
        city: city || null,
        state: state || null,
        stateCode: stateCode || null,
        email: email || null,
        phone: phone || null,
        bankName: bankName || null,
        bankAccount: bankAccount || null,
        bankIfsc: bankIfsc || null,
        bankBranch: bankBranch || null,
      },
    });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'Already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteBillingEntity = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const inUse = await prisma.task.count({ where: { billingEntityId: Number(id) } });
    if (inUse > 0) return res.status(400).json({ message: `Cannot delete — used by ${inUse} task(s)` });
    await prisma.billingEntity.delete({ where: { id: Number(id) } });
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
};
