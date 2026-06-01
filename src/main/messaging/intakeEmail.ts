// Intake Email — default template, merge, and styled HTML shell for emailing an intake
// packet PDF to a (prospective) client. Mirrors invoiceEmail's template/merge/HTML approach:
// templates are user-customizable plain text (Settings → Intake Email); this module renders
// them. The merged plain body becomes the email's text part and is wrapped in a clean
// inline-styled HTML shell that lists the included forms and explains how to fill them.
//
// PHI note: the send goes through the user's own BAA-covered email provider via the
// MessagingRouter — no PocketChart server is in the path. The intake PDF rides along as an
// attachment. The packet is addressed TO the client themselves (the subject of any PHI it
// contains), which is permitted; sensitive clinical fields are not pre-filled by default.

export interface IntakeEmailTemplate {
  subject: string;
  body: string;
}

// Built-in defaults, used until the practitioner customizes them in Settings.
// Available merge fields: {client} {first_name} {practice} {date}
export const DEFAULT_INTAKE_EMAIL_TEMPLATE: IntakeEmailTemplate = {
  subject: 'New patient forms from {practice}',
  body:
    'Hi {first_name},\n\n' +
    'Welcome! Your new patient forms are attached. You can fill them out right on your ' +
    'computer — just open the PDF, type into the fields, and save. Prefer paper? Print them ' +
    'and fill by hand instead.\n\n' +
    'Please complete them before your first visit. Let us know if you have any questions.\n\n' +
    'Thank you,\n{practice}',
};

// Drives the merge-field chips in the Settings editor. Keep in sync with the fields
// assembled in main.ts (intakeForms:prepareEmail).
export const INTAKE_EMAIL_MERGE_FIELDS = [
  '{first_name}', '{client}', '{practice}', '{date}',
] as const;

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Substitute {field} tokens. `collapse` squeezes runs of spaces (so an empty merge field
// doesn't leave a double space) and trims — used for the subject line.
export function mergeIntakeTemplate(tpl: string, fields: Record<string, string>, collapse: boolean): string {
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
// top; a card listing the included forms follows, plus a short "how to fill" tip. Mirrors the
// invoice email shell so practice emails feel consistent.
export function buildIntakeEmailHtml(opts: {
  practiceName: string;
  bodyText: string;
  formNames: string[];
  fillable: boolean;
}): string {
  const practiceName = escapeHtml(opts.practiceName);
  const bodyHtml = bodyToHtml(opts.bodyText);
  const formRows = (opts.formNames || [])
    .map((n) => `<tr><td style="font-size:14px;color:#111827;padding:4px 0;">• ${escapeHtml(n)}</td></tr>`)
    .join('');
  const formsCard = formRows
    ? `<div style="border:1px solid #e5e9ee;border-radius:10px;padding:16px 18px;background:#f9fafb;margin-top:20px;">
            <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">Forms included</div>
            <table style="width:100%;border-collapse:collapse;">${formRows}</table>
          </div>`
    : '';
  const tip = opts.fillable
    ? 'Open the attached PDF in any reader (Preview, Acrobat, or your browser), type into the fields, and save. Or print it and fill it in by hand.'
    : 'Print the attached PDF and fill it in by hand, or fill it digitally if your PDF reader supports it.';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e9ee;border-radius:12px;overflow:hidden;">
      <div style="background:#0f766e;padding:18px 24px;">
        <div style="color:#ffffff;font-size:16px;font-weight:600;">${practiceName}</div>
        <div style="color:#c8efe9;font-size:13px;margin-top:2px;">New Patient Forms</div>
      </div>
      <div style="padding:24px;">
        <div style="font-size:15px;color:#374151;line-height:1.55;">${bodyHtml}</div>
        ${formsCard}
        <div style="font-size:13px;color:#9ca3af;margin-top:16px;">${escapeHtml(tip)}</div>
      </div>
    </div>
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${practiceName}</div>
  </div>
</body></html>`;
}
