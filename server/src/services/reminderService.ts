/**
 * reminderService.ts
 *
 * Daily cron job that runs at 8:00 AM every morning.
 * Finds tasks that are overdue or due within the next 3 days,
 * groups them by manager and partner, and sends a digest email to each.
 *
 * Also sends a reminder to staff for tasks assigned to them (via manager role).
 */

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendTaskDueDigestEmail } from './emailService';
import { smsTaskDueAlert } from './smsService';

const prisma = new PrismaClient();

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysDiff = (dueDate: Date): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const daysLabel = (diff: number): { label: string; isOverdue: boolean } => {
  if (diff < 0)  return { label: `Overdue by ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''}`, isOverdue: true };
  if (diff === 0) return { label: 'Due today',   isOverdue: false };
  return { label: `Due in ${diff} day${diff !== 1 ? 's' : ''}`, isOverdue: false };
};

export const runDueReminders = async (): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);
    in3Days.setHours(23, 59, 59, 999);

    // Find all OPEN tasks that are overdue or due within 3 days
    const tasks = await prisma.task.findMany({
      where: {
        status: 'OPEN',
        dueDate: { lte: in3Days },
      },
      include: {
        manager: { select: { id: true, staffName: true, email: true, phone: true } },
        partner: { select: { id: true, staffName: true, email: true, phone: true } },
        client:  { select: { clientName: true } },
      },
    });

    if (tasks.length === 0) {
      console.log('[reminderService] No due/overdue tasks found — skipping emails.');
      return;
    }

    // Group tasks by recipient email (manager + partner separately)
    type RecipientMap = Map<string, {
      name: string;
      phone?: string | null;
      tasks: ReturnType<typeof buildTaskEntry>[];
    }>;

    const buildTaskEntry = (t: typeof tasks[number]) => {
      const diff  = t.dueDate ? daysDiff(t.dueDate) : 0;
      const label = daysLabel(diff);
      return {
        taskId:     t.taskId,
        taskName:   t.taskName,
        clientName: t.client?.clientName ?? '—',
        dueDate:    fmtDate(t.dueDate),
        daysLabel:  label.label,
        isOverdue:  label.isOverdue,
      };
    };

    const recipientMap: RecipientMap = new Map();

    const addToMap = (
      email: string | null | undefined,
      name: string | null | undefined,
      phone: string | null | undefined,
      entry: ReturnType<typeof buildTaskEntry>,
    ) => {
      if (!email || !name) return;
      if (!recipientMap.has(email)) {
        recipientMap.set(email, { name, phone, tasks: [] });
      }
      // Avoid duplicate task entries for the same recipient (manager = partner)
      const existing = recipientMap.get(email)!;
      if (!existing.tasks.find((e) => e.taskId === entry.taskId)) {
        existing.tasks.push(entry);
      }
    };

    for (const task of tasks) {
      const entry = buildTaskEntry(task);
      addToMap(task.manager?.email, task.manager?.staffName, (task.manager as any)?.phone, entry);
      addToMap(task.partner?.email, task.partner?.staffName, (task.partner as any)?.phone, entry);
    }

    // Send one digest per recipient (email + SMS)
    let sent = 0;
    for (const [email, { name, phone, tasks: taskList }] of recipientMap) {
      await sendTaskDueDigestEmail(email, name, taskList);
      const overdueCount  = taskList.filter((t) => t.isOverdue).length;
      const dueSoonCount  = taskList.filter((t) => !t.isOverdue).length;
      await smsTaskDueAlert(phone, name, overdueCount, dueSoonCount);
      sent++;
    }

    console.log(`[reminderService] Sent due-date digest to ${sent} recipient(s) for ${tasks.length} task(s).`);
  } catch (err) {
    console.error('[reminderService] Error running due reminders:', err);
  }
};

/**
 * Register the cron job.
 * Runs every day at 08:00 AM server time.
 * Call this once at server startup.
 */
export const startReminderCron = (): void => {
  // '0 8 * * *' → At 08:00 every day
  cron.schedule('0 8 * * *', () => {
    console.log('[reminderService] Running daily due-date reminder job...');
    runDueReminders();
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('[reminderService] Daily due-date reminder cron registered (08:00 IST).');
};
