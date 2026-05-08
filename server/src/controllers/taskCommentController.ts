import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// GET /api/tasks/:taskId/comments
export const getTaskComments = async (req: AuthRequest, res: Response) => {
  const { taskId } = req.params;
  try {
    const comments = await prisma.taskComment.findMany({
      where: { taskId: Number(taskId) },
      include: {
        author: { select: { id: true, staffName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/tasks/:taskId/comments
export const createTaskComment = async (req: AuthRequest, res: Response) => {
  const { taskId } = req.params;
  const { content } = req.body;

  if (!content?.trim()) return res.status(400).json({ message: 'Comment content is required' });
  if (!req.user?.staffId) return res.status(400).json({ message: 'Staff profile required to comment' });

  try {
    const comment = await prisma.taskComment.create({
      data: {
        taskId: Number(taskId),
        authorId: req.user.staffId,
        content: content.trim(),
      },
      include: {
        author: { select: { id: true, staffName: true } },
      },
    });
    res.status(201).json(comment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/tasks/comments/:commentId
export const deleteTaskComment = async (req: AuthRequest, res: Response) => {
  const { commentId } = req.params;
  try {
    const existing = await prisma.taskComment.findUnique({ where: { id: Number(commentId) } });
    if (!existing) return res.status(404).json({ message: 'Comment not found' });

    // Only the author or admin can delete
    const isAdmin = req.user?.role === 'ADMIN';
    const isAuthor = req.user?.staffId === existing.authorId;
    if (!isAdmin && !isAuthor) return res.status(403).json({ message: 'Not authorized to delete this comment' });

    await prisma.taskComment.delete({ where: { id: Number(commentId) } });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
