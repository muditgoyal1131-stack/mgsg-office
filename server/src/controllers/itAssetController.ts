import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

const isHROrPartnerOrAdmin = async (req: AuthRequest): Promise<boolean> => {
  if (req.user?.role === 'ADMIN' || req.user?.role === 'HR') return true;
  if (!req.user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: req.user.staffId } });
  return !!staff?.isPartner;
};

const generateAssetCode = async (): Promise<string> => {
  const agg = await prisma.iTAsset.aggregate({ _max: { id: true } });
  const n = (agg._max.id ?? 0) + 1;
  return `ASSET-${String(n).padStart(4, '0')}`;
};

export const getITAssets = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isHROrPartnerOrAdmin(req))) return res.status(403).json({ message: 'Access denied' });
    const assets = await prisma.iTAsset.findMany({
      include: { assignedTo: { select: { id: true, staffName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(assets);
  } catch (err) { res.status(500).json({ message: 'Error fetching assets', error: err }); }
};

export const createITAsset = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isHROrPartnerOrAdmin(req))) return res.status(403).json({ message: 'Access denied' });
    const { name, category, brand, model, serialNumber, purchaseDate, purchasePrice, warrantyExpiry, location, notes } = req.body;
    const assetCode = await generateAssetCode();
    const asset = await prisma.iTAsset.create({
      data: {
        assetCode, name, category: category || 'OTHER', brand, model, serialNumber,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        location, notes, status: 'IN_STOCK',
      },
      include: { assignedTo: { select: { id: true, staffName: true } } },
    });
    res.status(201).json(asset);
  } catch (err) { res.status(500).json({ message: 'Error creating asset', error: err }); }
};

export const updateITAsset = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isHROrPartnerOrAdmin(req))) return res.status(403).json({ message: 'Access denied' });
    const id = parseInt(req.params.id);
    const { name, category, brand, model, serialNumber, purchaseDate, purchasePrice, warrantyExpiry, status, assignedToId, assignedAt, returnedAt, location, notes } = req.body;
    const asset = await prisma.iTAsset.update({
      where: { id },
      data: {
        name, category, brand, model, serialNumber,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchasePrice: purchasePrice != null ? parseFloat(purchasePrice) : undefined,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        status, location, notes,
        assignedToId: assignedToId ? parseInt(assignedToId) : null,
        assignedAt: assignedAt ? new Date(assignedAt) : null,
        returnedAt: returnedAt ? new Date(returnedAt) : null,
      },
      include: { assignedTo: { select: { id: true, staffName: true } } },
    });
    res.json(asset);
  } catch (err) { res.status(500).json({ message: 'Error updating asset', error: err }); }
};

export const deleteITAsset = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Admin only' });
    const id = parseInt(req.params.id);
    await prisma.iTAsset.delete({ where: { id } });
    res.json({ message: 'Asset deleted' });
  } catch (err) { res.status(500).json({ message: 'Error deleting asset', error: err }); }
};

// POST /it-assets/:id/assign
export const assignITAsset = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isHROrPartnerOrAdmin(req))) return res.status(403).json({ message: 'Access denied' });
    const id = parseInt(req.params.id);
    const { assignedToId } = req.body;
    if (!assignedToId) return res.status(400).json({ message: 'assignedToId required' });
    const asset = await prisma.iTAsset.update({
      where: { id },
      data: { assignedToId: parseInt(assignedToId), assignedAt: new Date(), returnedAt: null, status: 'ASSIGNED' },
      include: { assignedTo: { select: { id: true, staffName: true } } },
    });
    res.json(asset);
  } catch (err) { res.status(500).json({ message: 'Error assigning asset', error: err }); }
};

// POST /it-assets/:id/return
export const returnITAsset = async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isHROrPartnerOrAdmin(req))) return res.status(403).json({ message: 'Access denied' });
    const id = parseInt(req.params.id);
    const asset = await prisma.iTAsset.update({
      where: { id },
      data: { assignedToId: null, returnedAt: new Date(), status: 'IN_STOCK' },
      include: { assignedTo: { select: { id: true, staffName: true } } },
    });
    res.json(asset);
  } catch (err) { res.status(500).json({ message: 'Error returning asset', error: err }); }
};
