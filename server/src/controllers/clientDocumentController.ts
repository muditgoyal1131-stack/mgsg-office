import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { VAULT_DIR } from '../config/paths';

const prisma = new PrismaClient();

// Multer storage for client vault docs
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
    cb(null, VAULT_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `cvault-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const vaultUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

// GET /api/clients/:clientId/vault
export const getClientDocuments = async (req: AuthRequest, res: Response) => {
  const { clientId } = req.params;
  try {
    const docs = await prisma.clientDocument.findMany({
      where: { clientId: Number(clientId) },
      include: {
        uploadedBy: { select: { id: true, staffName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/clients/:clientId/vault  (multipart/form-data)
export const uploadClientDocument = async (req: AuthRequest, res: Response) => {
  const { clientId } = req.params;
  const { title, category, notes } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ message: 'File is required' });
  if (!title?.trim()) return res.status(400).json({ message: 'Document title is required' });
  if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required' });

  try {
    const doc = await prisma.clientDocument.create({
      data: {
        clientId: Number(clientId),
        title: title.trim(),
        category: category || 'OTHER',
        fileName: file.filename,
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        notes: notes?.trim() || null,
        uploadedById: req.user.staffId,
      },
      include: {
        uploadedBy: { select: { id: true, staffName: true } },
      },
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/clients/vault/:docId
export const deleteClientDocument = async (req: AuthRequest, res: Response) => {
  const { docId } = req.params;
  try {
    const doc = await prisma.clientDocument.findUnique({ where: { id: Number(docId) } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // Only admin, partner, or uploader can delete
    const isAdmin = req.user?.role === 'ADMIN';
    const isUploader = req.user?.staffId === doc.uploadedById;
    const isPartner = req.user?.staffId
      ? (await prisma.staff.findUnique({ where: { id: req.user.staffId } }))?.isPartner
      : false;

    if (!isAdmin && !isUploader && !isPartner) {
      return res.status(403).json({ message: 'Not authorized to delete this document' });
    }

    // Delete file from disk
    const filePath = path.join(VAULT_DIR, doc.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.clientDocument.delete({ where: { id: Number(docId) } });
    res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
