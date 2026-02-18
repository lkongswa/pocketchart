// Phaxio (Sinch) Provider — Implements FaxProvider interface for Phaxio REST API
// API base: https://api.phaxio.com/v2.1
// Auth: HTTP Basic Auth (apiKey as username, apiSecret as password)
// Response format: JSON with { success, message, data } structure

import type { FaxProvider, SendFaxParams, SendFaxResult, FaxStatusResult, InboundFax, ConnectionTestResult } from '../FaxProvider';

const PHAXIO_BASE_URL = 'https://api.phaxio.com/v2.1';

export class PhaxioProvider implements FaxProvider {
  private apiKey: string;
  private apiSecret: string;
  private faxNumber: string;

  constructor(credentials: Record<string, string>) {
    this.apiKey = credentials.apiKey;
    this.apiSecret = credentials.apiSecret;
    this.faxNumber = credentials.faxNumber || '';
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
  }

  private async apiGet(path: string): Promise<any> {
    const response = await fetch(`${PHAXIO_BASE_URL}${path}`, {
      method: 'GET',
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Phaxio HTTP error: ${response.status} ${response.statusText} — ${errorText}`);
    }

    return response.json();
  }

  private async apiDelete(path: string): Promise<any> {
    const response = await fetch(`${PHAXIO_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Phaxio HTTP error: ${response.status} ${response.statusText} — ${errorText}`);
    }

    return response.json();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const result = await this.apiGet('/account/status');
      if (result.success) {
        return {
          success: true,
          message: 'Connected to Phaxio successfully',
          faxNumber: this.faxNumber,
          balance: result.data?.balance?.toString(),
        };
      }
      return { success: false, message: result.message || 'Auth failed' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async sendFax(params: SendFaxParams): Promise<SendFaxResult> {
    try {
      // Phaxio uses multipart form data for file uploads
      const formData = new FormData();
      formData.append('to', params.toFaxNumber);

      if (params.senderName) {
        formData.append('header_text', params.senderName);
      }

      // Convert base64 files to Blobs for multipart upload
      for (const file of params.files) {
        const buffer = Buffer.from(file.contentBase64, 'base64');
        const blob = new Blob([buffer], { type: 'application/pdf' });
        formData.append('file', blob, file.fileName);
      }

      const response = await fetch(`${PHAXIO_BASE_URL}/faxes`, {
        method: 'POST',
        headers: { Authorization: this.getAuthHeader() },
        body: formData,
      });

      const result = await response.json() as any;

      if (result.success) {
        return { success: true, faxId: result.data.id.toString() };
      }
      return { success: false, faxId: '', error: result.message };
    } catch (err: any) {
      return { success: false, faxId: '', error: err.message };
    }
  }

  async checkStatus(faxId: string): Promise<FaxStatusResult> {
    const result = await this.apiGet(`/faxes/${faxId}`);

    const statusMap: Record<string, FaxStatusResult['status']> = {
      queued: 'queued',
      inProgress: 'sending',
      success: 'sent',
      failure: 'failed',
      partiallySent: 'partial',
    };

    const data = result.data || {};

    return {
      faxId,
      status: statusMap[data.status] || 'queued',
      dateSent: data.completed_at,
      pages: data.num_pages,
      toFaxNumber: data.to_number || '',
    };
  }

  async getInbox(since?: Date): Promise<InboundFax[]> {
    let path = '/faxes?direction=received';
    if (since) {
      path += `&created_after=${since.toISOString()}`;
    }

    const result = await this.apiGet(path);

    if (!result.success || !result.data) return [];

    return result.data.map((fax: any) => ({
      faxId: fax.id.toString(),
      fromFaxNumber: fax.from_number || '',
      receivedAt: fax.created_at,
      pages: fax.num_pages || 0,
    }));
  }

  async downloadFax(faxId: string, _direction: 'in' | 'out'): Promise<string> {
    // Phaxio uses the same endpoint for both directions
    const response = await fetch(`${PHAXIO_BASE_URL}/faxes/${faxId}/file`, {
      method: 'GET',
      headers: { Authorization: this.getAuthHeader() },
    });

    if (!response.ok) {
      throw new Error(`Phaxio download error: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  }

  async deleteFax(faxId: string, _direction: 'in' | 'out'): Promise<void> {
    await this.apiDelete(`/faxes/${faxId}`);
  }
}
