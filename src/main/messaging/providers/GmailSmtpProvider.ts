// Gmail SMTP Provider — Implements EmailProvider via nodemailer over Google Workspace SMTP.
// Endpoint: smtp.gmail.com:465 (implicit TLS). Auth uses the account's App Password
// (requires 2-Step Verification on the Workspace account).
//
// PHI is sent directly from the user's machine through their own BAA-covered Workspace
// account; nothing transits a PocketChart server.

import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type {
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
  ConnectionTestResult,
} from '../EmailProvider';

export class GmailSmtpProvider implements EmailProvider {
  private fromAddress: string;
  private transporter: Transporter;

  constructor(credentials: Record<string, string>) {
    this.fromAddress = credentials.fromAddress || '';
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: this.fromAddress,
        // App passwords are displayed with spaces ("abcd efgh ijkl mnop"); strip them.
        pass: (credentials.appPassword || '').replace(/\s+/g, ''),
      },
    });
  }

  getFromAddress(): string {
    return this.fromAddress;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.transporter.verify();
      return {
        success: true,
        message: `Connected to Gmail as ${this.fromAddress}`,
        fromAddress: this.fromAddress,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Connection failed' };
    }
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        // A display name (e.g. the practice name) makes the recipient see "Aphasia Studio"
        // rather than the Gmail account's own profile name. nodemailer quotes/encodes it.
        from: params.fromName ? { name: params.fromName, address: this.fromAddress } : this.fromAddress,
        to: params.to,
        replyTo: params.replyTo,
        subject: params.subject,
        text: params.bodyText,
        html: params.bodyHtml,
        attachments: (params.attachments || []).map((a) => ({
          filename: a.fileName,
          content: Buffer.from(a.contentBase64, 'base64'),
          contentType: a.contentType || 'application/pdf',
        })),
      });
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      return { success: false, messageId: '', error: err?.message || 'Send failed' };
    }
  }
}
