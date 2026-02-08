import React, { useState } from 'react';
import { ClipboardList, Key, Download, AlertCircle, Loader2 } from 'lucide-react';

export default function UnlicensedLandingPage() {
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleActivate = async () => {
    const key = licenseKey.trim();
    if (!key) {
      setError('Please enter a license key.');
      return;
    }
    setActivating(true);
    setError('');
    try {
      const result = await window.api.license.activate(key);
      if (result.success) {
        setSuccess('License activated! Reloading...');
        // Dispatch tier-changed event so the app re-evaluates
        window.dispatchEvent(new CustomEvent('pocketchart:tier-changed'));
        // Short delay then reload to pick up new tier
        setTimeout(() => window.location.reload(), 800);
      } else {
        setError(result.error || 'Activation failed. Please check your license key.');
      }
    } catch (err: any) {
      setError(err?.message || 'Activation failed.');
    } finally {
      setActivating(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setError('');
    try {
      const result = await window.api.backup.exportAllChartsPdf();
      if (result) {
        setSuccess(`Exported ${result.clientCount} client charts to ${result.path}`);
      }
    } catch (err: any) {
      // Fall back to database backup if PDF export fails
      try {
        const path = await window.api.backup.exportManual();
        if (path) {
          setSuccess(`Database backup saved to ${path}`);
        }
      } catch (backupErr: any) {
        setError(backupErr?.message || 'Export failed.');
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={32} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">PocketChart</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Therapy Notes</p>
        </div>

        {/* Status message */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Your PocketChart license is not active. You can activate a license key or export your data below.
          </p>
        </div>

        {/* Activate License */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Activate License</h2>
          </div>
          <input
            type="text"
            className="input w-full"
            placeholder="Enter your license key"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            disabled={activating}
          />
          <button
            className="btn-primary w-full gap-2"
            onClick={handleActivate}
            disabled={activating}
          >
            {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            {activating ? 'Activating...' : 'Activate License'}
          </button>
        </div>

        {/* Export Data */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-[var(--color-text-secondary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Export Your Data</h2>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Download all your client charts as PDFs. Your data is always yours.
          </p>
          <button
            className="btn-secondary w-full gap-2"
            onClick={handleExportData}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Exporting...' : 'Export All Charts'}
          </button>
        </div>

        {/* Feedback messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}
