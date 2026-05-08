/**
 * notificationController.ts
 *
 * Handles CRUD operations on the Notification model for the logged-in user.
 *
 * NOTE: The `(prisma as any).notification` casts are intentional — the
 * Notification model will be added to schema.prisma before deploying this
 * feature, at which point `prisma generate` will expose prisma.notification
 * properly and these casts can be removed.
 */

import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
// Typed shorthand — removes once Notification is in the generated client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ── GET ALL ───────────────────────────────────────────────────────────────────

/**
 * GET /api/notifications
 * Returns all notifications for the logged-in user, newest first.
 * Sets X-Unread-Count response header and includes unreadCount in body.
 */
export const getNotifications = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      db.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    res.setHeader('X-Unread-Count', String(unreadCount));
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('getNotifications error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── MARK SINGLE READ ──────────────────────────────────────────────────────────

/**
 * PUT /api/notifications/:id/read
 * Marks a single notification as read. Only the owner may do this.
 */
export const markRead = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const id = Number(req.params.id);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid notification id' });

  try {
    const notification = await db.notification.findUnique({ where: { id } });

    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    if (notification.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

    const updated = await db.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json(updated);
  } catch (err) {
    console.error('markRead error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── MARK ALL READ ─────────────────────────────────────────────────────────────

/**
 * PUT /api/notifications/read-all
 * Marks all of the logged-in user's unread notifications as read.
 */
export const markAllRead = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const result = await db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: 'All notifications marked as read', count: result.count });
  } catch (err) {
    console.error('markAllRead error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/notifications/:id
 * Deletes a single notification. Only the owner may delete their own.
 */
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const id = Number(req.params.id);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid notification id' });

  try {
    const notification = await db.notification.findUnique({ where: { id } });

    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    if (notification.userId !== userId) return res.status(403).json({ message: 'Forbidden' });

    await db.notification.delete({ where: { id } });

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('deleteNotification error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
