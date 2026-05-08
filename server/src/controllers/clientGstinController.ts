import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// GET /clients/:clientId/gstins
export const getClientGstins = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const gstins = await prisma.clientGSTIN.findMany({
      where: { clientId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    res.json(gstins);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching GSTINs', error: err });
  }
};

// POST /clients/:clientId/gstins
export const createClientGstin = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { label, gstin, gstType, address, city, state, stateCode, isPrimary } = req.body;

    // Validate GSTIN format if provided and type is REGISTERED
    if (gstType === 'REGISTERED' && gstin && gstin.length !== 15) {
      return res.status(400).json({ message: 'GSTIN must be exactly 15 characters' });
    }

    // If setting as primary, unset others
    if (isPrimary) {
      await prisma.clientGSTIN.updateMany({ where: { clientId }, data: { isPrimary: false } });
    }

    const record = await prisma.clientGSTIN.create({
      data: { clientId, label, gstin, gstType: gstType || 'REGISTERED', address, city, state, stateCode, isPrimary: !!isPrimary },
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: 'Error creating GSTIN', error: err });
  }
};

// PUT /clients/:clientId/gstins/:id
export const updateClientGstin = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const id = parseInt(req.params.id);
    const { label, gstin, gstType, address, city, state, stateCode, isPrimary } = req.body;

    if (gstType === 'REGISTERED' && gstin && gstin.length !== 15) {
      return res.status(400).json({ message: 'GSTIN must be exactly 15 characters' });
    }

    if (isPrimary) {
      await prisma.clientGSTIN.updateMany({ where: { clientId }, data: { isPrimary: false } });
    }

    const record = await prisma.clientGSTIN.update({
      where: { id },
      data: { label, gstin, gstType, address, city, state, stateCode, isPrimary: !!isPrimary },
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: 'Error updating GSTIN', error: err });
  }
};

// DELETE /clients/:clientId/gstins/:id
export const deleteClientGstin = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.clientGSTIN.delete({ where: { id } });
    res.json({ message: 'GSTIN deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting GSTIN', error: err });
  }
};
