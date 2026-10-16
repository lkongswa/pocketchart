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

  /** Faxage's sendfax reply is "JOBID: 12345". Older fax_log rows stored that whole line as the
   *  provider id, so always reduce whatever we were given to the bare numeric job id. */
  private static parseJobId(raw: string): string {
    const m = String(raw || '').match(/(\d+)\s*$/);
    return m ? m[1] : String(raw || '').trim();
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

      // Success line is "JOBID: <numeric-job-id>" — store just the number.
      const jobId = FaxageProvider.parseJobId(firstLine);
      if (!/^\d+$/.test(jobId)) {
        return { success: false, faxId: '', error: `Unexpected Faxage response: ${firstLine}` };
      }
      return { success: true, faxId: jobId };
    } catch (err: any) {
      return { success: false, faxId: '', error: err.message };
    }
  }

  async checkStatus(faxId: string): Promise<FaxStatusResult> {
    const jobId = FaxageProvider.parseJobId(faxId);
    const result = await this.apiCall('status', { jobid: jobId, pagecount: '1' });
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);

    const first = lines[0] || '';
    if (!first || first.startsWith('ERR')) {
      // ERR06 = job id not found (e.g. aged out of Faxage's history) — leave our status alone.
      if (!first || first.startsWith('ERR06')) {
        return { faxId, status: 'queued', toFaxNumber: '', errorMessage: first || 'No status record' };
      }
      throw new Error(`Faxage status error: ${first}`);
    }

    // Each status record is TAB-delimited (pipe tolerated just in case):
    //   jobid, commid, destname, destnum, shortstatus, longstatus, sendtime, completetime, xmittime[, pagecount, ...]
    // shortstatus is one of 'pending' | 'success' | 'failure'.
    const records = lines.map(l => l.split(/\t|\|/).map(f => f.trim()));
    const rec = records.find(f => f[0] === jobId) ?? records[0];
    const shortStatus = (rec[4] || '').toLowerCase();
    const statusMap: Record<string, FaxStatusResult['status']> = {
      pending: 'sending',
      success: 'sent',
      failure: 'failed',
    };
    const pages = parseInt(rec[9] || '', 10);

    return {
      faxId,
      status: statusMap[shortStatus] || 'queued',
      toFaxNumber: rec[3] || '',
      dateSent: rec[7] || rec[6] || undefined,
      pages: Number.isFinite(pages) ? pages : undefined,
      errorMessage: shortStatus === 'failure' ? (rec[5] || 'Fax failed') : undefined,
    };
  }

  async getInbox(since?: Date): Promise<InboundFax[]> {
    // pagecount=1 appends the page count as the LAST field of each record.
    const result = await this.apiCall('listfax', { pagecount: '1' });
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);

    // ERR11 = "No incoming faxes available" — an empty inbox, not an error.
    if (lines.length === 0 || lines[0].startsWith('ERR11')) return [];
    if (lines[0].startsWith('ERR')) throw new Error(`Faxage listfax error: ${lines[0]}`);

    // Listfax records are TAB-delimited (pipe tolerated just in case):
    //   recvid, recvdate (YYYY-MM-DD HH:MM:SS), CID "(XXX)XXX-XXXX" or "Unavailable", DNIS[, pagecount]
    const faxes: InboundFax[] = [];
    for (const line of lines) {
      const parts = line.split(/\t|\|/).map(p => p.trim());
      if (parts.length < 4 || !/^\d+$/.test(parts[0])) continue;

      const [faxId, dateStr, callerId] = parts;
      const receivedDate = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(receivedDate.getTime())) continue;
      if (since && receivedDate < since) continue;

      const pages = parseInt(parts[parts.length - 1], 10);
      faxes.push({
        faxId,
        fromFaxNumber: /unavailable/i.test(callerId) ? '' : callerId,
        receivedAt: receivedDate.toISOString(),
        pages: parts.length >= 5 && Number.isFinite(pages) ? pages : 0,
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
