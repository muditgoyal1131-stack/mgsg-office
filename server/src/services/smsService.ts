/**
 * smsService.ts
 *
 * Twilio-powered SMS and WhatsApp notifications.
 *
 * Configuration (all via environment variables):
 *   TWILIO_ACCOUNT_SID   - Twilio Account SID (starts with AC...)
 *   TWILIO_AUTH_TOKEN    - Twilio Auth Token
 *   TWILIO_SMS_FROM      - Your Twilio SMS phone number, e.g. +919876543210
 *   TWILIO_WHATSAPP_FROM - Your Twilio WhatsApp sender, e.g. whatsapp:+14155238886
 *                          (use the sandbox number during development)
 *   ENABLE_WHATSAPP      - Set to "true" to send WhatsApp instead of (or in addition to) SMS
 *
 * All functions are safe to call without await — errors are caught internally.
 * If Twilio credentials are absent, messages are printed to the console only.
 */

import twilio from 'twilio';

// ── Twilio client (lazy singleton) ────────────────────────────────────────────

let _client: ReturnType<typeof twilio> | null = null;

const getClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  if (!_client) _client = twilio(sid, token);
  return _client;
};

// ── Core send helper ──────────────────────────────────────────────────────────

/**
 * Normalise a phone number to E.164 format (+91XXXXXXXXXX for Indian numbers).
 * Accepts: 9876543210 | 09876543210 | +919876543210
 */
const normalisePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.startsWith('+')) return phone;
  return `+${digits}`;
};

const sendSMS = async (to: string, body: string): Promise<void> => {
  const from = process.env.TWILIO_SMS_FROM;
  const client = getClient();

  try {
    if (!client || !from) {
      console.log('━━━ [SMS — Twilio not configured] ━━━');
      console.log(`  To  : ${to}`);
      console.log(`  Body: ${body}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return;
    }
    const toE164 = normalisePhone(to);
    await client.messages.create({ from, to: toE164, body });
  } catch (err) {
    console.error(`[smsService] Failed to send SMS to ${to}:`, err);
  }
};

const sendWhatsApp = async (to: string, body: string): Promise<void> => {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const client = getClient();

  try {
    if (!client || !from) {
      console.log('━━━ [WhatsApp — Twilio not configured] ━━━');
      console.log(`  To  : ${to}`);
      console.log(`  Body: ${body}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return;
    }
    const toE164 = normalisePhone(to);
    await client.messages.create({
      from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      to:   `whatsapp:${toE164}`,
      body,
    });
  } catch (err) {
    console.error(`[smsService] Failed to send WhatsApp to ${to}:`, err);
  }
};

/**
 * Send via both SMS and WhatsApp if ENABLE_WHATSAPP=true, otherwise SMS only.
 * If no channel is configured, falls back to console log.
 */
const notify = async (phone: string | null | undefined, message: string): Promise<void> => {
  if (!phone) return;
  const useWhatsApp = process.env.ENABLE_WHATSAPP === 'true';
  if (useWhatsApp) {
    await sendWhatsApp(phone, message);
  } else {
    await sendSMS(phone, message);
  }
};

// ── Domain-specific notification helpers ─────────────────────────────────────

export const smsLeaveApplied = async (
  adminPhones: (string | null | undefined)[],
  staffName: string,
  fromDate: string,
  toDate: string,
  days: number,
): Promise<void> => {
  const msg = `[MGSG] New leave request from ${staffName} (${fromDate} – ${toDate}, ${days} day${days !== 1 ? 's' : ''}). Please review on the portal.`;
  await Promise.all(adminPhones.map((p) => notify(p, msg)));
};

export const smsLeaveDecision = async (
  staffPhone: string | null | undefined,
  staffName: string,
  status: 'APPROVED' | 'REJECTED',
  fromDate: string,
  toDate: string,
  reason?: string,
): Promise<void> => {
  const emoji = status === 'APPROVED' ? '✅' : '❌';
  let msg = `${emoji} [MGSG] Hi ${staffName}, your leave (${fromDate} – ${toDate}) has been ${status.toLowerCase()}.`;
  if (status === 'REJECTED' && reason) msg += ` Reason: ${reason}`;
  await notify(staffPhone, msg);
};

export const smsReimbursementSubmitted = async (
  adminPhones: (string | null | undefined)[],
  staffName: string,
  claimNumber: string,
  amount: number,
): Promise<void> => {
  const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  const msg = `[MGSG] New reimbursement claim ${claimNumber} from ${staffName} for ${fmt}. Review on the portal.`;
  await Promise.all(adminPhones.map((p) => notify(p, msg)));
};

export const smsReimbursementDecision = async (
  staffPhone: string | null | undefined,
  staffName: string,
  claimNumber: string,
  status: 'APPROVED' | 'REJECTED' | 'RETURNED',
  reason?: string,
): Promise<void> => {
  const emoji = status === 'APPROVED' ? '✅' : status === 'REJECTED' ? '❌' : '🔄';
  let msg = `${emoji} [MGSG] Hi ${staffName}, your claim ${claimNumber} has been ${status.toLowerCase()}.`;
  if (reason) msg += ` Note: ${reason}`;
  await notify(staffPhone, msg);
};

export const smsTaskDueAlert = async (
  phone: string | null | undefined,
  recipientName: string,
  overdueCount: number,
  dueSoonCount: number,
): Promise<void> => {
  if (!overdueCount && !dueSoonCount) return;
  const parts: string[] = [];
  if (overdueCount) parts.push(`${overdueCount} overdue`);
  if (dueSoonCount) parts.push(`${dueSoonCount} due soon`);
  const msg = `⏰ [MGSG] Hi ${recipientName}, you have ${parts.join(' and ')} task${(overdueCount + dueSoonCount) !== 1 ? 's' : ''} that need attention. Log in to the portal.`;
  await notify(phone, msg);
};
