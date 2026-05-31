// Twilio Provider — Implements SmsProvider via Twilio's REST API (raw fetch + Basic Auth),
// mirroring how SRFaxProvider talks to its API directly (no SDK dependency).
//   Send:   POST /Accounts/{sid}/Messages.json   (To, From, Body)
//   Status: GET  /Accounts/{sid}/Messages/{sid}.json
//   Inbox:  GET  /Accounts/{sid}/Messages.json?To={from}  (filter inbound, polled)
//
// PHI note: keep bodies minimal. Inbound is POLLED (no public webhook) — consistent with
// the local-first design and the fax inbox pattern.

import type {
  SmsProvider,
  SendSmsParams,
  SendSmsResult,
  SmsStatusResult,
  SmsDeliveryStatus,
  InboundSms,
  ConnectionTestResult,
} from '../SmsProvider';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

export class TwilioProvider implements SmsProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(credentials: Record<string, string>) {
    this.accountSid = credentials.accountSid || '';
    this.authToken = credentials.authToken || '';
    this.fromNumber = credentials.fromNumber || '';
  }

  getFromNumber(): string {
    return this.fromNumber;
  }

  // Twilio requires E.164 (+15551234567). Client phones are often stored formatted
  // ("(555) 123-4567"), so normalize before sending. Assumes US (+1) when no country code.
  private toE164(p: string): string {
    const trimmed = (p || '').trim();
    const digits = trimmed.replace(/\D/g, '');
    if (trimmed.startsWith('+')) return '+' + digits;
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
    return '+' + digits;
  }

  private authHeader(): string {
    // Basic auth: base64(accountSid:authToken)
    return 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
  }

  private async twilioRequest(
    method: 'GET' | 'POST',
    path: string,
    form?: Record<string, string>,
  ): Promise<any> {
    const url = `${TWILIO_BASE}/Accounts/${this.accountSid}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: this.authHeader(),
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
    };
    if (form) init.body = new URLSearchParams(form).toString();

    const response = await fetch(url, init);
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = (data && (data.message || data.detail)) || `${response.status} ${response.statusText}`;
      throw new Error(`Twilio error: ${msg}`);
    }
    return data;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Fetch the account record — cheapest authenticated call.
      await this.twilioRequest('GET', '.json');
      return {
        success: true,
        message: `Connected to Twilio (${this.fromNumber})`,
        fromNumber: this.fromNumber,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Connection failed' };
    }
  }

  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    try {
      const data = await this.twilioRequest('POST', '/Messages.json', {
        To: this.toE164(params.to),
        From: this.fromNumber,
        Body: params.body,
      });
      return { success: true, messageSid: data.sid };
    } catch (err: any) {
      return { success: false, messageSid: '', error: err?.message || 'Send failed' };
    }
  }

  async checkStatus(messageSid: string): Promise<SmsStatusResult> {
    const data = await this.twilioRequest('GET', `/Messages/${messageSid}.json`);
    return {
      messageSid,
      status: (data.status as SmsDeliveryStatus) || 'unknown',
      to: data.to || '',
      errorMessage: data.error_message || undefined,
    };
  }

  async getInbox(since?: Date): Promise<InboundSms[]> {
    // Inbound messages are those sent TO our number. Fetch the recent page and filter
    // client-side (avoids Twilio's finicky URL-encoded DateSent inequality params).
    const qs = new URLSearchParams({ To: this.fromNumber, PageSize: '50' }).toString();
    const data = await this.twilioRequest('GET', `/Messages.json?${qs}`);
    const messages: any[] = Array.isArray(data.messages) ? data.messages : [];

    return messages
      .filter((m) => String(m.direction || '').startsWith('inbound'))
      .filter((m) => {
        if (!since) return true;
        const sent = new Date(m.date_sent || m.date_created || 0);
        return sent >= since;
      })
      .map((m) => ({
        messageSid: m.sid,
        from: m.from || '',
        body: m.body || '',
        receivedAt: m.date_sent || m.date_created || '',
      }));
  }
}
