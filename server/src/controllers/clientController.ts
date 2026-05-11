import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function isPartnerOrHROrAdmin(user: any): Promise<boolean> {
  if (user?.role === 'ADMIN' || user?.role === 'HR') return true;
  if (!user?.staffId) return false;
  const staff = await prisma.staff.findUnique({ where: { id: user.staffId } });
  return staff?.isPartner ?? false;
}

async function generateClientCode(): Promise<string> {
  const clients = await prisma.client.findMany({
    where: { clientCode: { startsWith: 'C' } },
    select: { clientCode: true },
  });
  let max = 0;
  for (const c of clients) {
    const num = parseInt(c.clientCode.slice(1), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `C${String(max + 1).padStart(4, '0')}`;
}

export const getAllClients = async (req: Request & { user?: any }, res: Response) => {
  try {
    const allowed = await isPartnerOrHROrAdmin(req.user);
    if (!allowed) return res.status(403).json({ message: 'Partners, HR and Admin only' });

    const { search } = req.query as { search?: string };

    // If no search term, return empty array (search-only mode for large datasets)
    if (!search || search.trim().length < 2) {
      return res.json([]);
    }

    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { clientName: { contains: search, mode: 'insensitive' } },
          { clientCode: { contains: search, mode: 'insensitive' } },
          { legalName: { contains: search, mode: 'insensitive' } },
        ],
      },
      orderBy: { clientName: 'asc' },
      take: 50,
      include: { gstins: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
    });
    res.json(clients);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createClient = async (req: Request & { user?: any }, res: Response) => {
  const { clientName, legalName, pan, phone, gstin, address } = req.body;
  try {
    const allowed = await isPartnerOrHROrAdmin(req.user);
    if (!allowed) return res.status(403).json({ message: 'Partners, HR and Admin only' });

    const clientCode = await generateClientCode();
    const client = await prisma.client.create({
      data: {
        clientCode, clientName,
        legalName: legalName || null,
        pan: pan ? pan.toUpperCase() : null,
        phone: phone || null,
        gstin: gstin || null,
        address: address || null,
      },
    });
    res.status(201).json(client);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateClient = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  const { clientName, legalName, pan, phone, gstin, address } = req.body;
  try {
    const allowed = await isPartnerOrHROrAdmin(req.user);
    if (!allowed) return res.status(403).json({ message: 'Partners, HR and Admin only' });

    const client = await prisma.client.update({
      where: { id: Number(id) },
      data: {
        clientName,
        legalName: legalName || null,
        pan: pan ? pan.toUpperCase() : null,
        phone: phone || null,
        gstin: gstin || null,
        address: address || null,
      },
    });
    res.json(client);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteClient = async (req: Request & { user?: any }, res: Response) => {
  const { id } = req.params;
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required to delete clients' });
    }
    await prisma.client.delete({ where: { id: Number(id) } });
    res.json({ message: 'Client deleted' });
  } catch {
    res.status(500).json({ message: 'Cannot delete client with associated tasks' });
  }
};
