/**
 * Availity Clearinghouse Provider — STUB
 *
 * Placeholder for future Availity integration. All methods return
 * "not yet implemented" responses. The credential schema is defined
 * in ClearinghouseProvider.ts so the Settings UI can show the fields.
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

const NOT_IMPLEMENTED = 'Availity integration is coming soon. Please use Claim.MD for now.';

export class AvailityProvider implements ClearinghouseProvider {
  constructor(_credentials: Record<string, string>) {}

  async testConnection(): Promise<ConnectionTestResult> {
    return { success: false, message: NOT_IMPLEMENTED };
  }

  async getPayerList(): Promise<PayerInfo[]> {
    return [];
  }

  async checkEnrollmentStatus(_payerId: string): Promise<EnrollmentStatusResult> {
    return { status: 'error', message: NOT_IMPLEMENTED };
  }

  async submitClaim(_edi837Content: string): Promise<ClaimSubmissionResult> {
    return { success: false, message: NOT_IMPLEMENTED };
  }

  async checkClaimStatus(_clearinghouseClaimId: string): Promise<ClaimStatusResult> {
    return { status: 'error', message: NOT_IMPLEMENTED };
  }

  async checkEligibility(_edi270Content: string): Promise<EligibilityResult> {
    return { success: false, message: NOT_IMPLEMENTED };
  }

  async getRemittances(_startDate: string, _endDate: string): Promise<RemittanceResult> {
    return { success: false, remittances: [], message: NOT_IMPLEMENTED };
  }
}
