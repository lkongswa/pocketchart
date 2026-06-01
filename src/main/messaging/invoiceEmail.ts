// Invoice Email — default template, merge, and styled HTML shell for emailing an invoice
// PDF to a contracted entity's billing contact (or a client). Mirrors reminderEngine's
// template/merge/HTML approach: templates are user-customizable plain text (Settings →
// Invoice Email); this module renders them. The merged plain body becomes the email's
// text part and is wrapped in a clean inline-styled HTML shell with an invoice summary card.
//
// PHI/billing note: the send goes through the user's own BAA-covered email provider via the
// MessagingRouter — no PocketChart server is in the path. The invoice PDF rides along as an
// attachment. An agency invoice lists the patients being billed, which is expected billing
// communication to the contracted payer.

export interface InvoiceEmailTemplate {
  subject: string;
  body: string;
}

// Built-in defaults, used until the practitioner customizes them in Settings.
// Available merge fields: {entity} {contact} {invoice_number} {invoice_date} {due_date} {total} {practice}
export const DEFAULT_INVOICE_EMAIL_TEMPLATE: InvoiceEmailTemplate = {
  subject: 'Invoice {invoice_number} from {practice}',
  body:
    'Hi {contact},\n\n' +
    'Please find attached invoice {invoice_number} for {total}, due {due_date}.\n\n' +
    'Thank you,\n{practice}',
};

// Drives the merge-field chips in the Settings editor. Keep in sync with the fields
// assembled in main.ts (invoices:prepareEmail).
export const INVOICE_EMAIL_MERGE_FIELDS = [
  '{entity}', '{contact}', '{invoice_number}', '{invoice_date}', '{due_date}', '{total}', '{practice}',
] as const;

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Substitute {field} tokens. `collapse` squeezes runs of spaces (so an empty merge field
// doesn't leave a double space) and trims — used for the subject line.
export function mergeInvoiceTemplate(tpl: string, fields: Record<string, string>, collapse: boolean): string {
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
// top; an invoice summary card (number / date / due / amount due) follows. Mirrors the
// reminder email shell so practice emails feel consistent.
export function buildInvoiceEmailHtml(opts: {
  practiceName: string;
  bodyText: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
}): string {
  const practiceName = escapeHtml(opts.practiceName);
  const bodyHtml = bodyToHtml(opts.bodyText);
  const invoiceNumber = escapeHtml(opts.invoiceNumber);
  const invoiceDate = escapeHtml(opts.invoiceDate);
  const dueDate = escapeHtml(opts.dueDate);
  const total = escapeHtml(opts.total);
  const dueRow = dueDate
    ? `<tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Due</td><td style="font-size:15px;color:#111827;font-weight:600;text-align:right;">${dueDate}</td></tr>`
    : '';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e9ee;border-radius:12px;overflow:hidden;">
      <div style="background:#0f766e;padding:18px 24px;">
        <div style="color:#ffffff;font-size:16px;font-weight:600;">${practiceName}</div>
        <div style="color:#c8efe9;font-size:13px;margin-top:2px;">Invoice ${invoiceNumber}</div>
      </div>
      <div style="padding:24px;">
        <div style="font-size:15px;color:#374151;line-height:1.55;">${bodyHtml}</div>
        <div style="border:1px solid #e5e9ee;border-radius:10px;padding:16px 18px;background:#f9fafb;margin-top:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Invoice</td><td style="font-size:15px;color:#111827;font-weight:600;text-align:right;">${invoiceNumber}</td></tr>
            <tr><td style="font-size:13px;color:#6b7280;padding:3px 0;">Date</td><td style="font-size:15px;color:#111827;font-weight:600;text-align:right;">${invoiceDate}</td></tr>
            ${dueRow}
            <tr><td style="font-size:13px;color:#6b7280;padding:8px 0 0;border-top:1px solid #e5e9ee;">Amount Due</td><td style="font-size:18px;color:#0f766e;font-weight:700;text-align:right;padding-top:8px;border-top:1px solid #e5e9ee;">${total}</td></tr>
          </table>
        </div>
        <div style="font-size:13px;color:#9ca3af;margin-top:16px;">The full invoice is attached as a PDF.</div>
      </div>
    </div>
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${practiceName}</div>
  </div>
</body></html>`;
}
