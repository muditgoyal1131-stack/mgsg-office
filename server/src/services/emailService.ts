/**
 * emailService.ts
 *
 * Thin wrapper around nodemailer that provides typed helpers for the most
 * common transactional emails in the office management system.
 *
 * Configuration (all via environment variables):
 *   SMTP_HOST  - e.g. smtp.sendgrid.net  (if absent, emails are logged only)
 *   SMTP_PORT  - defaults to 587
 *   SMTP_USER  - SMTP auth username
 *   SMTP_PASS  - SMTP auth password
 *   SMTP_FROM  - From address, e.g. "Office <noreply@example.com>"
 *
 * All exported functions are safe to call without await — errors are caught
 * internally and logged so that email failure never crashes the caller.
 */

import nodemailer, { Transporter } from 'nodemailer';

// ── Transporter (lazy singleton) ──────────────────────────────────────────────

let _transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (!process.env.SMTP_HOST) return null;

  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, STARTTLS otherwise
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return _transporter;
};

// ── Core send helper ──────────────────────────────────────────────────────────

/**
 * Sends a plain HTML email.
 * When SMTP_HOST is not configured the email is printed to the console instead
 * so development machines work without an SMTP server.
 *
 * This function never throws — all errors are caught and logged.
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
): Promise<void> => {
  const from = process.env.SMTP_FROM || 'Office Management <noreply@example.com>';

  try {
    const transporter = getTransporter();

    if (!transporter) {
      // SMTP not configured — fall back to console output (handy in development)
      console.log('━━━ [EMAIL — no SMTP configured] ━━━');
      console.log(`  To     : ${to}`);
      console.log(`  From   : ${from}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Body   :\n${html}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return;
    }

    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    // Email failures must never propagate — log and continue.
    console.error(`[emailService] Failed to send email to ${to} (${subject}):`, err);
  }
};

// ── Branded HTML layout helper ────────────────────────────────────────────────

const layout = (title: string, bodyHtml: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6f9; font-family: Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff;
               border-radius: 8px; overflow: hidden;
               box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .header { background: #1e3a5f; color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .body { padding: 28px 32px; color: #333333; font-size: 15px; line-height: 1.6; }
    .body table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .body table td { padding: 8px 12px; border: 1px solid #e0e0e0; }
    .body table tr:nth-child(even) td { background: #f9fafb; }
    .label { font-weight: bold; width: 40%; color: #555555; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px;
             font-size: 13px; font-weight: bold; }
    .badge-approved  { background: #d1fae5; color: #065f46; }
    .badge-rejected  { background: #fee2e2; color: #991b1b; }
    .badge-pending   { background: #fef9c3; color: #854d0e; }
    .badge-default   { background: #e0e7ff; color: #3730a3; }
    .footer { padding: 16px 32px; background: #f4f6f9;
              font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header"><h1>Office Management System</h1></div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">
      This is an automated message. Please do not reply to this email.
    </div>
  </div>
</body>
</html>
`.trim();

const statusBadge = (status: string): string => {
  const s = status.toUpperCase();
  let cls = 'badge-default';
  if (s === 'APPROVED') cls = 'badge-approved';
  else if (s === 'REJECTED') cls = 'badge-rejected';
  else if (s === 'PENDING') cls = 'badge-pending';
  return `<span class="badge ${cls}">${status}</span>`;
};

// ── Domain-specific email helpers ─────────────────────────────────────────────

/**
 * Notify a staff member that their leave request has been approved or rejected.
 */
export const sendLeaveNotification = async (
  staffEmail: string,
  staffName: string,
  status: 'APPROVED' | 'REJECTED',
  leaveType: string,
  fromDate: string,
  toDate: string,
  reason?: string,
): Promise<void> => {
  const subject = `Leave Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'} – ${leaveType}`;

  const html = layout(
    subject,
    `
    <p>Dear <strong>${staffName}</strong>,</p>
    <p>Your leave request has been <strong>${status.toLowerCase()}</strong>.</p>
    <table>
      <tr><td class="label">Leave Type</td><td>${leaveType}</td></tr>
      <tr><td class="label">From</td><td>${fromDate}</td></tr>
      <tr><td class="label">To</td><td>${toDate}</td></tr>
      <tr><td class="label">Status</td><td>${statusBadge(status)}</td></tr>
      ${reason ? `<tr><td class="label">Remarks</td><td>${reason}</td></tr>` : ''}
    </table>
    <p style="margin-top:20px;">If you have any questions, please contact HR.</p>
    `,
  );

  await sendEmail(staffEmail, subject, html);
};

/**
 * Notify a staff member about the outcome of a reimbursement claim.
 */
export const sendReimbursementNotification = async (
  staffEmail: string,
  staffName: string,
  claimNumber: string,
  status: string,
  notes?: string,
): Promise<void> => {
  const subject = `Reimbursement Claim ${claimNumber} – ${status}`;

  const html = layout(
    subject,
    `
    <p>Dear <strong>${staffName}</strong>,</p>
    <p>Your reimbursement claim has been updated.</p>
    <table>
      <tr><td class="label">Claim Number</td><td>${claimNumber}</td></tr>
      <tr><td class="label">Status</td><td>${statusBadge(status)}</td></tr>
      ${notes ? `<tr><td class="label">Notes</td><td>${notes}</td></tr>` : ''}
    </table>
    <p style="margin-top:20px;">Log in to the portal to view full details.</p>
    `,
  );

  await sendEmail(staffEmail, subject, html);
};

/**
 * Notify HR / admin that a new leave request has been submitted.
 */
export const sendLeaveAppliedEmail = async (
  toEmails: string[],
  staffName: string,
  fromDate: string,
  toDate: string,
  days: number,
  reason?: string,
): Promise<void> => {
  const subject = `New Leave Request from ${staffName}`;
  const html = layout(
    subject,
    `
    <p>A new leave request has been submitted and requires your review.</p>
    <table>
      <tr><td class="label">Staff</td><td>${staffName}</td></tr>
      <tr><td class="label">From</td><td>${fromDate}</td></tr>
      <tr><td class="label">To</td><td>${toDate}</td></tr>
      <tr><td class="label">Days</td><td>${days}</td></tr>
      ${reason ? `<tr><td class="label">Reason</td><td>${reason}</td></tr>` : ''}
      <tr><td class="label">Status</td><td>${statusBadge('PENDING')}</td></tr>
    </table>
    <p style="margin-top:20px;">Please log in to the portal to approve or reject this request.</p>
    `,
  );
  await Promise.all(toEmails.map((to) => sendEmail(to, subject, html)));
};

/**
 * Notify a staff member that their reimbursement claim was returned for correction.
 */
export const sendReimbursementReturnedEmail = async (
  staffEmail: string,
  staffName: string,
  claimNumber: string,
  returnReason: string,
): Promise<void> => {
  const subject = `Reimbursement Claim ${claimNumber} – Returned for Correction`;
  const html = layout(
    subject,
    `
    <p>Dear <strong>${staffName}</strong>,</p>
    <p>Your reimbursement claim has been <strong>returned</strong> for correction.</p>
    <table>
      <tr><td class="label">Claim Number</td><td>${claimNumber}</td></tr>
      <tr><td class="label">Status</td><td>${statusBadge('RETURNED')}</td></tr>
      <tr><td class="label">Reason</td><td>${returnReason}</td></tr>
    </table>
    <p style="margin-top:20px;">Please log in, correct the claim, and resubmit.</p>
    `,
  );
  await sendEmail(staffEmail, subject, html);
};

/**
 * Notify partners / admins that a new reimbursement claim has been submitted.
 */
export const sendReimbursementSubmittedEmail = async (
  toEmails: string[],
  staffName: string,
  claimNumber: string,
  totalAmount: number,
): Promise<void> => {
  const subject = `New Reimbursement Claim ${claimNumber} from ${staffName}`;
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2,
  }).format(totalAmount);
  const html = layout(
    subject,
    `
    <p>A new reimbursement claim has been submitted and is awaiting review.</p>
    <table>
      <tr><td class="label">Staff</td><td>${staffName}</td></tr>
      <tr><td class="label">Claim Number</td><td>${claimNumber}</td></tr>
      <tr><td class="label">Total Amount</td><td>${formattedAmount}</td></tr>
      <tr><td class="label">Status</td><td>${statusBadge('PENDING')}</td></tr>
    </table>
    <p style="margin-top:20px;">Please log in to the portal to review this claim.</p>
    `,
  );
  await Promise.all(toEmails.map((to) => sendEmail(to, subject, html)));
};

/**
 * Send a daily task due-date digest to a manager / partner.
 */
export const sendTaskDueDigestEmail = async (
  toEmail: string,
  recipientName: string,
  tasks: {
    taskId: string;
    taskName: string;
    clientName: string;
    dueDate: string;
    daysLabel: string;  // e.g. "Overdue by 3 days" | "Due today" | "Due in 2 days"
    isOverdue: boolean;
  }[],
): Promise<void> => {
  if (tasks.length === 0) return;

  const subject = `Task Due-Date Reminder – ${tasks.length} task${tasks.length > 1 ? 's' : ''} need${tasks.length === 1 ? 's' : ''} attention`;

  const rows = tasks.map((t) => `
    <tr>
      <td>${t.taskId}</td>
      <td>${t.taskName}</td>
      <td>${t.clientName}</td>
      <td>${t.dueDate}</td>
      <td style="color:${t.isOverdue ? '#dc2626' : '#d97706'};font-weight:bold;">${t.daysLabel}</td>
    </tr>
  `).join('');

  const html = layout(
    subject,
    `
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>The following tasks assigned to you require attention:</p>
    <table>
      <tr>
        <td class="label">Task ID</td>
        <td class="label">Task Name</td>
        <td class="label">Client</td>
        <td class="label">Due Date</td>
        <td class="label">Status</td>
      </tr>
      ${rows}
    </table>
    <p style="margin-top:20px;">Please log in to the portal to take action on these tasks.</p>
    `,
  );
  await sendEmail(toEmail, subject, html);
};

/**
 * Notify an admin / accounts user about an invoice event (raised, paid, overdue, etc.).
 */
export const sendInvoiceNotification = async (
  adminEmail: string,
  invoiceNumber: string,
  clientName: string,
  amount: number,
  status: string,
): Promise<void> => {
  const subject = `Invoice ${invoiceNumber} – ${status}`;

  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);

  const html = layout(
    subject,
    `
    <p>Hi,</p>
    <p>An invoice has been updated in the system.</p>
    <table>
      <tr><td class="label">Invoice Number</td><td>${invoiceNumber}</td></tr>
      <tr><td class="label">Client</td><td>${clientName}</td></tr>
      <tr><td class="label">Amount</td><td>${formattedAmount}</td></tr>
      <tr><td class="label">Status</td><td>${statusBadge(status)}</td></tr>
    </table>
    <p style="margin-top:20px;">Log in to the portal to view or take action on this invoice.</p>
    `,
  );

  await sendEmail(adminEmail, subject, html);
};
