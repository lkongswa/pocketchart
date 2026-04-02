/**
 * Claim.MD Clearinghouse Provider
 *
 * PocketChart generates EDI data locally and sends it directly from the user's
 * machine to Claim.MD's API. No PHI passes through our servers.
 *
 * API Docs: https://www.claim.md/developer
 * Sandbox: https://sandbox.claim.md
 */

import type {
  ClearinghouseProvider,
  ConnectionTestResult,
  PayerInfo,
  EnrollmentStatusResult,
  ClaimSubmissionResult,
  ClaimStatusResult,
  EligibilityResult,
  RemittanceResult,
} from '../ClearinghouseProvider';

const CLAIMMD_SANDBOX_URL = 'https://svc.claim.md/services/claimmdapi/api';
const CLAIMMD_PRODUCTION_URL = 'https://svc.claim.md/services/claimmdapi/api';

// Use sandbox by default; switch to production when ready
const CLAIMMD_BASE_URL = CLAIMMD_SANDBOX_URL;

interface ClaimMDResponse {
  status: number;
  message?: string;
  data?: any;
  errors?: string[];
}

export class ClaimMDProvider implements ClearinghouseProvider {
  private apiKey: string;
  private accountKey: string;

  constructor(credentials: Record<string, string>) {
    this.apiKey = credentials.apiKey;
    this.accountKey = credentials.accountKey || '';
  }

  // ── Private API Helper ──

  private async apiCall(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    body?: Record<string, any>,
  ): Promise<ClaimMDResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const payload: Record<string, any> = {
      ...(body || {}),
      api_key: this.apiKey,
      ...(this.accountKey ? { account_key: this.accountKey } : {}),
    };

    try {
      const response = await fetch(`${CLAIMMD_BASE_URL}/${endpoint}`, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(payload) : undefined,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          status: response.status,
          message: `Clearinghouse API error: ${response.status} ${response.statusText}`,
          errors: [text || response.statusText],
        };
      }

      const data = await response.json();
      return { status: 200, data };
    } catch (err: any) {
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return { status: 0, message: 'Cannot reach clearinghouse. Check your internet connection.' };
      }
      return { status: 0, message: `Network error: ${err.message}` };
    }
  }

  // ── ClearinghouseProvider Implementation ──

  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.apiCall('ping');

    if (result.status === 200) {
      return { success: true, message: 'Successfully connected to Claim.MD' };
    }

    return {
      success: false,
      message: result.message || 'Connection failed. Check your API key.',
    };
  }

  async getPayerList(): Promise<PayerInfo[]> {
    const result = await this.apiCall('payers');

    if (result.status === 200 && result.data?.payers) {
      return result.data.payers;
    }

    return [];
  }

  async checkEnrollmentStatus(payerId: string): Promise<EnrollmentStatusResult> {
    const result = await this.apiCall('enrollment/status', 'POST', { payer_id: payerId });

    if (result.status === 200 && result.data) {
      return {
        status: result.data.enrollment_status || 'unknown',
        message: result.data.message || 'Status retrieved',
      };
    }

    return { status: 'error', message: result.message || 'Failed to check enrollment' };
  }

  async submitClaim(edi837Content: string): Promise<ClaimSubmissionResult> {
    const result = await this.apiCall('claims/submit', 'POST', {
      edi_content: edi837Content,
      format: '837P',
    });

    if (result.status === 200 && result.data) {
      return {
        success: true,
        clearinghouseClaimId: result.data.claim_id || result.data.tracking_id,
        message: 'Claim submitted successfully',
      };
    }

    return {
      success: false,
      message: result.message || 'Claim submission failed',
      errors: result.errors || (result.data?.errors ? [result.data.errors] : []),
    };
  }

  async checkClaimStatus(clearinghouseClaimId: string): Promise<ClaimStatusResult> {
    const result = await this.apiCall('claims/status', 'POST', {
      claim_id: clearinghouseClaimId,
    });

    if (result.status === 200 && result.data) {
      return {
        status: result.data.status || 'unknown',
        message: result.data.message || '',
        rawResponse: result.data,
      };
    }

    return { status: 'error', message: result.message || 'Failed to check claim status' };
  }

  async checkEligibility(edi270Content: string): Promise<EligibilityResult> {
    const result = await this.apiCall('eligibility/check', 'POST', {
      edi_content: edi270Content,
      format: '270',
    });

    if (result.status === 200 && result.data) {
      return {
        success: true,
        rawResponse: result.data.edi_response || JSON.stringify(result.data),
        message: 'Eligibility check completed',
      };
    }

    return {
      success: false,
      message: result.message || 'Eligibility check failed',
      errors: result.errors,
    };
  }

  async getRemittances(startDate: string, endDate: string): Promise<RemittanceResult> {
    const result = await this.apiCall('remittance/list', 'POST', {
      start_date: startDate,
      end_date: endDate,
    });

    if (result.status === 200 && result.data) {
      return {
        success: true,
        remittances: result.data.remittances || [],
        message: 'Remittances retrieved',
      };
    }

    return {
      success: false,
      remittances: [],
      message: result.message || 'Failed to fetch remittances',
    };
  }
}
