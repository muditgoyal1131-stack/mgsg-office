/**
 * notificationService.ts
 *
 * Shared helpers for creating in-app notifications.  Import these in any
 * controller that needs to raise a notification rather than calling Prisma
 * directly, so the creation logic stays in one place.
 *
 * NOTE: prisma.notification will resolve once the Notification model is added
 * to schema.prisma and `prisma generate` has been run.
 */

import { PrismaClient, Role } from '@prisma/client';

// Cast to the generated Prisma client type so callers can pass their own
// instance (shared connection pool).
type AnyPrisma = PrismaClient;

/**
 * Creates a single in-app notification for one user.
 *
 * @param prisma  - Prisma client instance.
 * @param userId  - The User.id who will receive the notification.
 * @param title   - Short heading shown in the notification panel.
 * @param message - Body text of the notification.
 * @param link    - Optional relative URL the notification should link to.
 */
export const createNotification = async (
  prisma: AnyPrisma,
  userId: number,
  title: string,
  message: string,
  link?: string,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).notification.create({
    data: { userId, title, message, link },
  });
};

/**
 * Creates an in-app notification for every User whose `role` field matches
 * the given role string (e.g. 'HR', 'ADMIN', 'STAFF', 'IT').
 *
 * Notifications are created in a single transaction for atomicity.
 */
export const notifyRole = async (
  prisma: AnyPrisma,
  role: string,
  title: string,
  message: string,
  link?: string,
) => {
  // Validate that the passed role is a known enum value at runtime.
  const validRoles = Object.values(Role) as string[];
  if (!validRoles.includes(role)) {
    console.warn(`[notificationService] notifyRole called with unknown role: "${role}"`);
    return [];
  }

  const users = await prisma.user.findMany({
    where: { role: role as Role },
    select: { id: true },
  });

  if (users.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any;
  return prisma.$transaction(
    users.map((u) =>
      p.notification.create({
        data: { userId: u.id, title, message, link },
      }),
    ),
  );
};

/**
 * Creates an in-app notification for every Staff member whose `isPartner`
 * flag is true.
 *
 * The Staff → User relationship in this schema is stored on User (User.staffId
 * is the FK), so we find all Users whose linked Staff record has isPartner=true.
 *
 * Notifications are created in a single transaction for atomicity.
 */
export const notifyPartners = async (
  prisma: AnyPrisma,
  title: string,
  message: string,
  link?: string,
) => {
  // Find all User records whose associated Staff profile is a partner.
  const users = await prisma.user.findMany({
    where: {
      staff: {
        isPartner: true,
      },
    },
    select: { id: true },
  });

  if (users.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any;
  return prisma.$transaction(
    users.map((u) =>
      p.notification.create({
        data: { userId: u.id, title, message, link },
      }),
    ),
  );
};
