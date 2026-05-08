import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import { UPLOAD_DIR } from '../config/paths';

const prisma = new PrismaClient();

const isHROrAdmin = (u: any) => u?.role === 'HR' || u?.role === 'ADMIN';

const include = {
  staff:      { select: { id: true, staffName: true } },
  uploadedBy: { select: { id: true, staffName: true } },
};

// GET /staff-documents?staffId=x&expiringSoon=true
export const getStaffDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { staffId, expiringSoon } = req.query as any;
    let where: any = {};

    if (isHROrAdmin(req.user)) {
      if (staffId) where.staffId = parseInt(staffId);
    } else {
      // Staff can only see their own
      if (!req.user?.staffId) return res.status(403).json({ message: 'Staff profile required' });
      where.staffId = req.user.staffId;
    }

    if (expiringSoon === 'true') {
      const now = new Date();
      const in60 = new Date(now.getTime() + 60 * 86400000);
      where.expiryDate = { lte: in60, gte: now };
    }

    const docs = await prisma.staffDocument.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching documents', error: err });
  }
};

// POST /staff-documents (multipart: file + body fields)
export const uploadStaffDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const { staffId, title, category, expiryDate, notes } = req.body;
    if (!staffId || !title?.trim()) return res.status(400).json({ message: 'staffId and title are required' });

    // HR/Admin can upload for any staff; staff can only upload for themselves
    const targetId = parseInt(staffId);
    if (!isHROrAdmin(req.user) && targetId !== req.user?.staffId)
      return res.status(403).json({ message: 'You can only upload documents for yourself' });

    const doc = await prisma.staffDocument.create({
      data: {
        staffId:     targetId,
        title:       title.trim(),
        category:    category || 'OTHER',
        fileName:    req.file.filename,
        originalName: req.file.originalname,
        fileSize:    req.file.size,
        mimeType:    req.file.mimetype,
        expiryDate:  expiryDate ? new Date(expiryDate) : null,
        notes:       notes?.trim() || null,
        uploadedById: req.user!.staffId ?? req.user!.id,
      },
      include,
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Error uploading document', error: err });
  }
};

// PUT /staff-documents/:id  (metadata only — no file change)
export const updateStaffDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR/Admin only' });
    const id = parseInt(req.params.id);
    const { title, category, expiryDate, notes } = req.body;
    const doc = await prisma.staffDocument.update({
      where: { id },
      data: {
        title:      title    !== undefined ? title.trim()   : undefined,
        category:   category !== undefined ? category       : undefined,
        expiryDate: expiryDate !== undefined ? (expiryDate ? new Date(expiryDate) : null) : undefined,
        notes:      notes    !== undefined ? (notes?.trim() || null) : undefined,
      },
      include,
    });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'Error updating document', error: err });
  }
};

// DELETE /staff-documents/:id
export const deleteStaffDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR/Admin only' });
    const doc = await prisma.staffDocument.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    const fp = path.join(UPLOAD_DIR,doc.fileName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await prisma.staffDocument.delete({ where: { id: doc.id } });
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting document', error: err });
  }
};

// GET /staff-documents/expiry-alerts  — docs expiring in next 30 days (HR/Admin)
export const getExpiryAlerts = async (req: AuthRequest, res: Response) => {
  try {
    if (!isHROrAdmin(req.user)) return res.status(403).json({ message: 'HR/Admin only' });
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const docs = await prisma.staffDocument.findMany({
      where: { expiryDate: { lte: in30, gte: now } },
      include,
      orderBy: { expiryDate: 'asc' },
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching expiry alerts', error: err });
  }
};
