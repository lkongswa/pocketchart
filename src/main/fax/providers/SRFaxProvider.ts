// SRFax Provider — Implements FaxProvider interface for SRFax API
// API endpoint: https://secure.srfax.com/SRF_SecWebSvc.php
// All operations use HTTPS POST with JSON body. Every call includes access_id + access_pwd.

import type { FaxProvider, SendFaxParams, SendFaxResult, FaxStatusResult, InboundFax, ConnectionTestResult } from '../FaxProvider';

const SRFAX_ENDPOINT = 'https://secure.srfax.com/SRF_SecWebSvc.php';

export class SRFaxProvider implements FaxProvider {
  private accessId: string;
  private accessPwd: string;
  private faxNumber: string;

  constructor(credentials: Record<string, string>) {
    this.accessId = credentials.accountNumber;
    this.accessPwd = credentials.password;
    this.faxNumber = credentials.faxNumber || '';
  }

  private async srfaxPost(action: string, params: Record<string, any> = {}): Promise<any> {
    const body = {
      action,
      access_id: this.accessId,
      access_pwd: this.accessPwd,
      ...params,
    };

    const response = await fetch(SRFAX_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`SRFax HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { Status: string; Result: any };

    if (data.Status === 'Failed') {
      throw new Error(`SRFax error: ${data.Result || 'Unknown error'}`);
    }

    return data;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const data = await this.srfaxPost('Get_Fax_Usage');
      return {
        success: true,
        message: 'Connected to SRFax successfully',
        faxNumber: this.faxNumber,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async sendFax(params: SendFaxParams): Promise<SendFaxResult> {
    try {
      let faxNumber = params.toFaxNumber.replace(/\D/g, '');
      // SRFax requires 11+ digits (country code + number). Prepend '1' for US numbers.
      if (faxNumber.length === 10) faxNumber = '1' + faxNumber;

      const requestParams: Record<string, any> = {
        sCallerID: this.faxNumber.replace(/\D/g, '').slice(-10),
        sFaxType: 'SINGLE',
        sToFaxNumber: faxNumber,
      };

      // Add files — SRFax uses sFileName_1, sFileContent_1, etc.
      params.files.forEach((file, i) => {
        requestParams[`sFileName_${i + 1}`] = file.fileName;
        requestParams[`sFileContent_${i + 1}`] = file.contentBase64;
      });

      if (params.senderName) {
        requestParams.sSenderEmail = params.senderName;
      }

      const data = await this.srfaxPost('Queue_Fax', requestParams);

      return { success: true, faxId: String(data.Result) };
    } catch (err: any) {
      return { success: false, faxId: '', error: err.message };
    }
  }

  async checkStatus(faxId: string): Promise<FaxStatusResult> {
    const data = await this.srfaxPost('Get_FaxStatus', {
      sFaxDetailsID: faxId,
    });

    const result = data.Result;

    // SRFax returns SentStatus: 'Queued' | 'Sent' | 'Sending' | 'Failed' | 'Delivered'
    const statusMap: Record<string, FaxStatusResult['status']> = {
      Queued: 'queued',
      Sending: 'sending',
      Sent: 'sent',
      Delivered: 'sent',
      Failed: 'failed',
    };

    return {
      faxId,
      status: statusMap[result.SentStatus] || 'queued',
      pages: parseInt(result.Pages, 10) || 0,
      dateSent: result.DateSent || result.EpochTime || '',
      toFaxNumber: result.ToFaxNumber || '',
      errorMessage: result.ErrorCode || '',
    };
  }

  async getInbox(since?: Date): Promise<InboundFax[]> {
    const requestParams: Record<string, any> = {
      sPeriod: 'ALL',
    };

    const data = await this.srfaxPost('Get_Fax_Inbox', requestParams);

    // Result is an array of inbox entries, or "No Faxes Found" string
    if (!Array.isArray(data.Result)) return [];

    const faxes: InboundFax[] = [];

    for (const entry of data.Result) {
      const receivedDate = new Date(entry.Date || entry.EpochTime || 0);

      if (since && receivedDate < since) continue;

      faxes.push({
        faxId: entry.FileName || '',
        fromFaxNumber: entry.CallerID || '',
        receivedAt: entry.Date || receivedDate.toISOString(),
        pages: parseInt(entry.Pages, 10) || 0,
      });
    }

    return faxes;
  }

  async downloadFax(faxId: string, direction: 'in' | 'out'): Promise<string> {
    const data = await this.srfaxPost('Retrieve_Fax', {
      sFaxFileName: faxId,
      sDirection: direction === 'in' ? 'IN' : 'OUT',
    });

    // Result is the base64-encoded PDF content
    return typeof data.Result === 'string' ? data.Result : '';
  }

  async deleteFax(faxId: string, direction: 'in' | 'out'): Promise<void> {
    await this.srfaxPost('Delete_Fax', {
      sFaxDetailsID: faxId,
      sDirection: direction === 'in' ? 'IN' : 'OUT',
    });
  }
}
