// Faxage Provider — Implements FaxProvider interface for Faxage API
// API endpoint: https://www.faxage.com/httpsfax.php
// All operations use HTTPS POST with form-encoded body.
// Auth: company + username + password with every request.
// Response format: newline-delimited text (NOT JSON). First line is status/result.

import type { FaxProvider, SendFaxParams, SendFaxResult, FaxStatusResult, InboundFax, ConnectionTestResult } from '../FaxProvider';

const FAXAGE_ENDPOINT = 'https://www.faxage.com/httpsfax.php';

export class FaxageProvider implements FaxProvider {
  private company: string;
  private username: string;
  private password: string;
  private faxNumber: string;

  constructor(credentials: Record<string, string>) {
    this.company = credentials.company;
    this.username = credentials.username;
    this.password = credentials.password;
    this.faxNumber = credentials.faxNumber || '';
  }

  private getBaseParams(): Record<string, string> {
    return {
      company: this.company,
      username: this.username,
      password: this.password,
    };
  }

  private async apiCall(operation: string, extraParams: Record<string, string> = {}): Promise<string> {
    const params = new URLSearchParams({
      ...this.getBaseParams(),
      operation,
      ...extraParams,
    });

    const response = await fetch(FAXAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Faxage HTTP error: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  private async apiBinaryCall(operation: string, extraParams: Record<string, string> = {}): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      ...this.getBaseParams(),
      operation,
      ...extraParams,
    });

    const response = await fetch(FAXAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Faxage HTTP error: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Use listfax with a minimal request to verify credentials
      const result = await this.apiCall('listfax');
      const firstLine = result.split('\n')[0].trim();

      if (firstLine.startsWith('ERR')) {
        return { success: false, message: `Faxage auth failed: ${firstLine}` };
      }

      return {
        success: true,
        message: 'Connected to Faxage successfully',
        faxNumber: this.faxNumber,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async sendFax(params: SendFaxParams): Promise<SendFaxResult> {
    try {
      const extraParams: Record<string, string> = {
        faxno: params.toFaxNumber,
      };

      // Add files with indexed params
      params.files.forEach((file, i) => {
        extraParams[`faxfilenames[${i}]`] = file.fileName;
        extraParams[`faxfiledata[${i}]`] = file.contentBase64;
      });

      if (params.senderName) {
        extraParams.recipname = params.senderName;
      }

      const result = await this.apiCall('sendfax', extraParams);
      const firstLine = result.split('\n')[0].trim();

      if (firstLine.startsWith('ERR')) {
        return { success: false, faxId: '', error: firstLine };
      }

      // First line on success is the jobid
      return { success: true, faxId: firstLine };
    } catch (err: any) {
      return { success: false, faxId: '', error: err.message };
    }
  }

  async checkStatus(faxId: string): Promise<FaxStatusResult> {
    const result = await this.apiCall('status', { jobid: faxId });
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);

    // Map Faxage status strings to our normalized statuses
    const statusMap: Record<string, FaxStatusResult['status']> = {
      success: 'sent',
      failure: 'failed',
      sending: 'sending',
      queued: 'queued',
    };

    const rawStatus = lines[0]?.toLowerCase() || 'unknown';

    return {
      faxId,
      status: statusMap[rawStatus] || 'queued',
      toFaxNumber: '', // Faxage status doesn't return this; we track it locally
    };
  }

  async getInbox(since?: Date): Promise<InboundFax[]> {
    const result = await this.apiCall('listfax');
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length === 0 || lines[0].startsWith('ERR')) {
      return [];
    }

    // Faxage listfax returns pipe-delimited lines:
    // faxid|date|callerid|pages|...
    const faxes: InboundFax[] = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 4) continue;

      const [faxId, dateStr, callerId, pagesStr] = parts;
      const receivedDate = new Date(dateStr);

      if (since && receivedDate < since) continue;

      faxes.push({
        faxId,
        fromFaxNumber: callerId,
        receivedAt: receivedDate.toISOString(),
        pages: parseInt(pagesStr, 10) || 0,
      });
    }

    return faxes;
  }

  async downloadFax(faxId: string, direction: 'in' | 'out'): Promise<string> {
    // Faxage returns raw binary PDF — use arrayBuffer and convert to base64
    if (direction === 'in') {
      const arrayBuffer = await this.apiBinaryCall('getfax', { faxid: faxId });
      return Buffer.from(arrayBuffer).toString('base64');
    } else {
      // For outbound, Faxage uses 'dlstatus' to get sent fax image
      const arrayBuffer = await this.apiBinaryCall('dlstatus', { jobid: faxId });
      return Buffer.from(arrayBuffer).toString('base64');
    }
  }

  async deleteFax(faxId: string, direction: 'in' | 'out'): Promise<void> {
    if (direction === 'in') {
      await this.apiCall('delfax', { faxid: faxId });
    } else {
      await this.apiCall('clear', { jobid: faxId });
    }
  }
}
