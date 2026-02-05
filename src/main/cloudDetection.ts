/**
 * Cloud Storage Detection Utility
 *
 * Detects when a user selects a cloud-synced folder (Google Drive, Dropbox, OneDrive, iCloud)
 * as their data storage location for HIPAA BAA compliance guidance.
 */

export interface CloudDetectionResult {
  isCloudSynced: boolean;
  provider: CloudProvider | null;
  providerDisplayName: string | null;
  baaUrl: string | null;
  baaAvailable: boolean;
}

export type CloudProvider = 'google_drive' | 'dropbox' | 'onedrive' | 'icloud';

interface CloudProviderConfig {
  provider: CloudProvider;
  displayName: string;
  /** Lowercase path fragments to match against the selected path */
  pathPatterns: string[];
  /** URL to the provider's BAA / HIPAA compliance documentation */
  baaUrl: string;
  /** Whether the provider offers a BAA at all (iCloud does not) */
  baaAvailable: boolean;
}

const CLOUD_PROVIDERS: CloudProviderConfig[] = [
  {
    provider: 'google_drive',
    displayName: 'Google Drive',
    pathPatterns: [
      'google drive',
      'google/drivefs',       // Google Drive File Stream (Workspace)
      'my drive',
      'googledrivefs',
    ],
    baaUrl: 'https://workspace.google.com/terms/user_features.html',
    baaAvailable: true, // Requires Google Workspace (paid) — Admin Console > Account > Legal and compliance
  },
  {
    provider: 'dropbox',
    displayName: 'Dropbox',
    pathPatterns: [
      'dropbox',
    ],
    baaUrl: 'https://www.dropbox.com/business/trust/compliance/hipaa-compliance',
    baaAvailable: true, // Requires Dropbox Business
  },
  {
    provider: 'onedrive',
    displayName: 'Microsoft OneDrive',
    pathPatterns: [
      'onedrive',
    ],
    baaUrl: 'https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech',
    baaAvailable: true, // Requires Microsoft 365 Business
  },
  {
    provider: 'icloud',
    displayName: 'Apple iCloud',
    pathPatterns: [
      'mobile documents',           // macOS iCloud path: ~/Library/Mobile Documents/
      'icloud',
      'iclouddrive',
    ],
    baaUrl: '', // Apple does not sign BAAs
    baaAvailable: false,
  },
];

/**
 * Checks whether a given file path falls inside a known cloud sync folder.
 * Matching is case-insensitive against known path fragments.
 */
export function detectCloudStorage(selectedPath: string): CloudDetectionResult {
  // Normalize: lowercase and convert backslashes to forward slashes
  const normalizedPath = selectedPath.toLowerCase().replace(/\\/g, '/');

  for (const config of CLOUD_PROVIDERS) {
    for (const pattern of config.pathPatterns) {
      if (normalizedPath.includes(pattern.toLowerCase())) {
        return {
          isCloudSynced: true,
          provider: config.provider,
          providerDisplayName: config.displayName,
          baaUrl: config.baaUrl || null,
          baaAvailable: config.baaAvailable,
        };
      }
    }
  }

  return {
    isCloudSynced: false,
    provider: null,
    providerDisplayName: null,
    baaUrl: null,
    baaAvailable: false,
  };
}
