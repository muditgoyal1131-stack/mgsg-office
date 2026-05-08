import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { UPLOAD_DIR } from '../config/paths';

const prisma = new PrismaClient();

export const getTaskDocuments = async (req: Request, res: Response) => {
  const { taskId } = req.params;
  try {
    const docs = await prisma.document.findMany({
      where: { taskId: Number(taskId) },
      include: { uploadedBy: { select: { staff: { select: { staffName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const uploadDocument = async (req: Request & { user?: any; file?: any }, res: Response) => {
  const { taskId } = req.params;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  try {
    const doc = await prisma.document.create({
      data: {
        taskId: Number(taskId),
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        userId: req.user.id,
      },
    });
    res.status(201).json(doc);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const doc = await prisma.document.findUnique({ where: { id: Number(id) } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const filePath = path.join(UPLOAD_DIR,doc.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.document.delete({ where: { id: Number(id) } });
    res.json({ message: 'Document deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
