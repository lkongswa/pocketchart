// Reminder Engine — finds appointments due for a reminder and sends them via the client's
// configured channel (SMS / email / both), then stamps reminder_status (dedup).
//
// Templates + merge fields are user-customizable (Settings → Message Templates); this module
// renders them. Email uses a clean inline-styled HTML shell + a "Join Video Visit" button when
// the appointment (or the practice default) has a meeting link. Runs in the main process,
// invoked by the renderer poll loop (App.tsx) — same local-first model as fax polling.
// "Due" = the appointment starts within the lead window (default 24h) and hasn't started yet.

import type Database from 'better-sqlite3';
import type { MessagingRouter } from './MessagingRouter';

export interface ReminderTemplates {
  smsTemplate: string;
  emailSubject: string;
  emailBody: string;
  defaultMeetingLink: string;
}

// Built-in defaults, used until the practitioner customizes them in Settings.
// Available merge fields: {first} {last} {date} {time} {practice} {meeting_link}
export const DEFAULT_REMINDER_TEMPLATES: ReminderTemplates = {
  smsTemplate: 'Hi {first}, reminder of your appointment with {practice} on {date} at {time}. {meeting_link} Reply C to confirm or X to cancel.',
  emailSubject: 'Appointment reminder — {date}',
  emailBody: 'Hi {first},\n\nThis is a friendly reminder of your upcoming appointment with {practice}. If you need to reschedule, please contact us.',
  defaultMeetingLink: '',
};

export interface ReminderSendResult {
  appointmentId: number;
  clientId: number;
  channel: 'sms' | 'email';
  success: boolean;
  messageSid?: string;
  error?: string;
}

export interface ReminderRunSummary {
  sent: number;
  failed: number;
  skipped: number;
  results: ReminderSendResult[];
}

interface DueRow {
  id: number;
  client_id: number;
  scheduled_date: string;
  scheduled_time: string;
  meeting_link: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  reminder_channel: 'sms' | 'email' | 'both';
}

function formatApptDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatApptTime(time24: string): string {
  const [hStr, mStr] = (time24 || '00:00').split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Substitute {field} tokens. `collapse` squeezes runs of spaces (for SMS, where an empty
// {meeting_link} would otherwise leave a double space) and trims.
function applyMerge(tpl: string, fields: Record<string, string>, collapse: boolean): string {
  let out = (tpl || '').replace(/\{(\w+)\}/g, (_m, key) => fields[key] ?? '');
  if (collapse) out = out.replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n').trim();
  return out;
}

// Escape, linkify bare URLs, and convert newlines to <br> for the email body.
function bodyToHtml(text: string): string {
  const esc = escapeHtml(text);
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0f766e;text-decoration:underline;">$1</a>');
  return linked.replace(/\n/g, '<br>');
}

// Clean, email-client-safe HTML shell (all inline styles). The merged message body renders at
// top; date/time card + an optional "Join Video Visit" button follow.
function buildReminderEmailHtml(opts: {
  practiceName: string;
  bodyText: string;
  dayDate: string;
  time: string;
  meetingLink: string;
}): string {
  const practiceName = escapeHtml(opts.practiceName);
  const bodyHtml = bodyToHtml(opts.bodyText);
  const dayDate = escapeHtml(opts.dayDate);
  const time = escapeHtml(opts.time);
  const joinBtn = opts.meetingLink
    ? `<div style="text-align:center;margin:20px 0 4px;"><a href="${escapeHtml(opts.meetingLink)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 22px;border-radius:8px;">Join Video Visit</a></div>`
    : '';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e9ee;border-radius:12px;overflow:hidden;">
      <div style="background:#0f766e;padding:18px 24px;">
        <div style="color:#ffffff;font-size:16px;font-weight:600;">${practiceName}</div>
        <div style="color:#c8efe9;font-size:13px;margin-top:2px;">Appointment Reminder</div>
      </div>
      <div style="padding:24px;">
        <div style="font-size:15px;color:#374151;line-height:1.55;">${bodyHtml}</div>
        <div style="border:1px solid #e5e9ee;border-radius:10px;padding:16px 18px;background:#f9fafb;margin-top:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Date</td><td style="font-size:15px;color:#111827;font-weight:600;text-align:right;">${dayDate}</td></tr>
            <tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Time</td><td style="font-size:15px;color:#111827;font-weight:600;text-align:right;">${time}</td></tr>
          </table>
        </div>
        ${joinBtn}
      </div>
    </div>
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${practiceName}</div>
  </div>
</body></html>`;
}

export interface SendDueRemindersOptions {
  db: Database.Database;
  messagingRouter: MessagingRouter;
  practiceName: string;
  leadHours: number;
  templates: ReminderTemplates;
}

export async function sendDueReminders(opts: SendDueRemindersOptions): Promise<ReminderRunSummary> {
  const { db, messagingRouter, practiceName, leadHours, templates } = opts;
  const summary: ReminderRunSummary = { sent: 0, failed: 0, skipped: 0, results: [] };

  const smsConfigured = messagingRouter.isSmsConfigured();
  const emailConfigured = messagingRouter.isEmailConfigured();
  if (!smsConfigured && !emailConfigured) return summary;

  const bufferDays = Math.ceil(leadHours / 24) + 1;
  const rows = db.prepare(`
    SELECT a.id, a.client_id, a.scheduled_date, a.scheduled_time, a.meeting_link,
           c.first_name, c.last_name, c.phone, c.email, c.reminder_channel
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    WHERE a.status = 'scheduled'
      AND a.reminder_status = 'none'
      AND a.deleted_at IS NULL
      AND a.client_id IS NOT NULL
      AND c.send_appointment_reminders = 1
      AND c.deleted_at IS NULL
      AND a.scheduled_date >= date('now','localtime')
      AND a.scheduled_date <= date('now','localtime', ?)
  `).all(`+${bufferDays} days`) as DueRow[];

  const now = Date.now();
  const leadMs = leadHours * 3600 * 1000;

  for (const row of rows) {
    try {
      const apptDT = new Date(`${row.scheduled_date}T${(row.scheduled_time || '00:00')}:00`).getTime();
      if (Number.isNaN(apptDT)) continue;
      if (apptDT < now || apptDT > now + leadMs) continue;

      const channel = row.reminder_channel || 'sms';
      const wantSms = channel === 'sms' || channel === 'both';
      const wantEmail = channel === 'email' || channel === 'both';

      const meetingLink = (row.meeting_link || '').trim() || templates.defaultMeetingLink || '';
      const fields: Record<string, string> = {
        first: (row.first_name || '').trim() || 'there',
        last: (row.last_name || '').trim(),
        date: formatApptDate(row.scheduled_date),
        time: formatApptTime(row.scheduled_time),
        practice: practiceName,
        meeting_link: meetingLink,
      };

      let anyAttempt = false;
      let anySuccess = false;
      let sid: string | undefined;

      if (wantSms && smsConfigured && row.phone?.trim()) {
        anyAttempt = true;
        const body = applyMerge(templates.smsTemplate, fields, true);
        const r = await messagingRouter.getSmsProvider().sendSms({ to: row.phone.trim(), body });
        summary.results.push({ appointmentId: row.id, clientId: row.client_id, channel: 'sms', success: r.success, messageSid: r.messageSid, error: r.error });
        if (r.success) { anySuccess = true; sid = r.messageSid; }
      }

      if (wantEmail && emailConfigured && row.email?.trim()) {
        anyAttempt = true;
        const subject = applyMerge(templates.emailSubject, fields, true);
        const mergedBody = applyMerge(templates.emailBody, fields, false);
        const bodyHtml = buildReminderEmailHtml({ practiceName, bodyText: mergedBody, dayDate: fields.date, time: fields.time, meetingLink });
        const textParts = [mergedBody, '', `${fields.date} at ${fields.time}`];
        if (meetingLink) textParts.push('', `Join: ${meetingLink}`);
        const r = await messagingRouter.getEmailProvider().sendEmail({ to: row.email.trim(), subject, bodyText: textParts.join('\n'), bodyHtml });
        summary.results.push({ appointmentId: row.id, clientId: row.client_id, channel: 'email', success: r.success, error: r.error });
        if (r.success) anySuccess = true;
      }

      if (!anyAttempt) {
        // Due, but no channel attemptable (provider not set up / no contact). Leave 'none' to retry.
        summary.skipped++;
        continue;
      }

      const status = anySuccess ? 'sent' : 'failed';
      db.prepare(
        `UPDATE appointments SET reminder_status = ?, reminder_sent_at = ?, reminder_message_sid = ? WHERE id = ?`
      ).run(status, new Date().toISOString(), sid || null, row.id);

      if (anySuccess) summary.sent++; else summary.failed++;
    } catch (err) {
      console.error(`[reminderEngine] Error processing appointment ${row.id}:`, err);
    }
  }

  return summary;
}
