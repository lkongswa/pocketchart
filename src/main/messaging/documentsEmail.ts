// Documents Email — default template + styled HTML shell for emailing a bundle of client
// documents (Good Faith Estimate, intake packet, superbill, statements, uploaded files) to a
// client in a single message. Mirrors invoiceEmail / intakeEmail. The compose dialog merges
// the template per client; this module renders the HTML shell that wraps the (possibly edited)
// body and lists the attached file names.
//
// PHI note: the send goes through the user's own BAA-covered email provider via the
// MessagingRouter — no PocketChart server is in the path. The bundle is addressed to the
// client themselves (the subject of any PHI it contains), which is permitted.

export interface DocumentsEmailTemplate {
  subject: string;
  body: string;
}

// Available merge fields: {first_name} {client} {practice}
export const DEFAULT_DOCUMENTS_EMAIL_TEMPLATE: DocumentsEmailTemplate = {
  subject: 'Documents from {practice}',
  body:
    'Hi {first_name},\n\n' +
    'Please find the attached document(s). Let me know if you have any questions.\n\n' +
    'Thank you,\n{practice}',
};

export const DOCUMENTS_EMAIL_MERGE_FIELDS = ['{first_name}', '{client}', '{practice}'] as const;

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Substitute {field} tokens. `collapse` squeezes runs of spaces (so an empty merge field
// doesn't leave a double space) and trims — used for the subject line.
export function mergeDocumentsTemplate(tpl: string, fields: Record<string, string>, collapse: boolean): string {
  let out = (tpl || '').replace(/\{(\w+)\}/g, (_m, key) => fields[key] ?? '');
  if (collapse) out = out.replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n').trim();
  return out;
}

function bodyToHtml(text: string): string {
  const esc = escapeHtml(text);
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0f766e;text-decoration:underline;">$1</a>');
  return linked.replace(/\n/g, '<br>');
}

// Clean, email-client-safe HTML shell (all inline styles). The merged message body renders at
// top; an "Attached" card lists the file names. Mirrors the invoice / intake email shells.
export function buildDocumentsEmailHtml(opts: {
  practiceName: string;
  bodyText: string;
  fileNames: string[];
}): string {
  const practiceName = escapeHtml(opts.practiceName);
  const bodyHtml = bodyToHtml(opts.bodyText);
  const rows = (opts.fileNames || [])
    .map((n) => `<tr><td style="font-size:14px;color:#111827;padding:4px 0;">📎 ${escapeHtml(n)}</td></tr>`)
    .join('');
  const card = rows
    ? `<div style="border:1px solid #e5e9ee;border-radius:10px;padding:16px 18px;background:#f9fafb;margin-top:20px;">
            <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">Attached</div>
            <table style="width:100%;border-collapse:collapse;">${rows}</table>
          </div>`
    : '';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e9ee;border-radius:12px;overflow:hidden;">
      <div style="background:#0f766e;padding:18px 24px;">
        <div style="color:#ffffff;font-size:16px;font-weight:600;">${practiceName}</div>
        <div style="color:#c8efe9;font-size:13px;margin-top:2px;">Documents</div>
      </div>
      <div style="padding:24px;">
        <div style="font-size:15px;color:#374151;line-height:1.55;">${bodyHtml}</div>
        ${card}
      </div>
    </div>
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${practiceName}</div>
  </div>
</body></html>`;
}
