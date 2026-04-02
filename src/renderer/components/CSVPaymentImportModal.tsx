import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Users,
  DollarSign,
  ArrowRight,
  Check,
  Search,
} from 'lucide-react';
import type { Client, Invoice } from '../../shared/types';

// ── Types ──

type WizardStep = 'file' | 'mapping' | 'clients' | 'review' | 'importing' | 'complete';

interface CSVParseResult {
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
  fileSizeBytes: number;
  delimiter: string;
}

interface CSVClientMatch {
  csvName: string;
  paymentCount: number;
  totalAmount: number;
  suggestedClientId: number | null;
  suggestedClientName: string | null;
  matchConfidence: 'exact' | 'high' | 'partial' | 'none';
  allCandidates: Array<{ clientId: number; clientName: string; confidence: string }>;
}

interface CSVPaymentRow {
  rowIndex: number;
  paymentDate: string;
  amount: number;
  csvName: string;
  clientId: number | null;
  clientName: string;
  paymentMethod: string;
  referenceNumber: string;
  notes: string;
  isDuplicate: boolean;
  skipReason: string | null;
}

interface CSVImportResult {
  imported: number;
  skipped: number;
  duplicatesSkipped: number;
  totalAmount: number;
  errors: string[];
  importTag: string;
}

interface ColumnMapping {
  dateColumn: string;
  amountColumn: string;
  clientNameColumn: string;
  clientFirstNameColumn: string;
  clientLastNameColumn: string;
  methodColumn: string;
  referenceColumn: string;
  notesColumn: string;
}

// ── Props ──

interface CSVPaymentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  clients: Client[];
  invoices?: Invoice[];
  fixedClientId?: number;
  fixedClientName?: string;
}

// ── Helpers ──

const STEP_ORDER: WizardStep[] = ['file', 'mapping', 'clients', 'review', 'importing', 'complete'];
const STEP_LABELS: Record<WizardStep, string> = {
  file: 'Select File',
  mapping: 'Map Columns',
  clients: 'Match Clients',
  review: 'Review',
  importing: 'Importing',
  complete: 'Done',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ──

export default function CSVPaymentImportModal({
  isOpen,
  onClose,
  onComplete,
  clients,
  fixedClientId,
  fixedClientName,
}: CSVPaymentImportModalProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('file');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: File
  const [filePath, setFilePath] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);

  // Step 2: Mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    dateColumn: '', amountColumn: '', clientNameColumn: '',
    clientFirstNameColumn: '', clientLastNameColumn: '',
    methodColumn: '', referenceColumn: '', notesColumn: '',
  });
  const [autoDetected, setAutoDetected] = useState<Record<string, string | undefined>>({});

  // Step 3: Client matching
  const [clientMatches, setClientMatches] = useState<CSVClientMatch[]>([]);
  const [clientOverrides, setClientOverrides] = useState<Record<string, number | null>>({});
  const [clientSearch, setClientSearch] = useState('');

  // Step 4: Review
  const [preparedRows, setPreparedRows] = useState<CSVPaymentRow[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Step 5: Complete
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);

  // Reset all state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('file');
      setLoading(false);
      setError(null);
      setFilePath(null);
      setParseResult(null);
      setMapping({ dateColumn: '', amountColumn: '', clientNameColumn: '', clientFirstNameColumn: '', clientLastNameColumn: '', methodColumn: '', referenceColumn: '', notesColumn: '' });
      setAutoDetected({});
      setClientMatches([]);
      setClientOverrides({});
      setClientSearch('');
      setPreparedRows([]);
      setSkipDuplicates(true);
      setImportResult(null);
    }
  }, [isOpen]);

  // ── Step Handlers ──

  const handlePickFile = useCallback(async () => {
    setError(null);
    try {
      const path = await window.api.csvImport.pickFile();
      if (!path) return;
      setLoading(true);
      const result = await window.api.csvImport.parseFile(path);
      setFilePath(path);
      setParseResult(result);

      // Auto-detect columns
      const detected = await window.api.csvImport.autoDetectColumns(result.headers);
      setAutoDetected(detected);
      setMapping(prev => ({
        ...prev,
        dateColumn: detected.date || '',
        amountColumn: detected.amount || '',
        clientNameColumn: detected.clientName || '',
        clientFirstNameColumn: detected.clientFirstName || '',
        clientLastNameColumn: detected.clientLastName || '',
        methodColumn: detected.method || '',
        referenceColumn: detected.reference || '',
        notesColumn: detected.notes || '',
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMatchClients = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    try {
      const matches = await window.api.csvImport.matchClients({
        filePath,
        mapping: {
          dateColumn: mapping.dateColumn,
          amountColumn: mapping.amountColumn,
          clientNameColumn: mapping.clientNameColumn || undefined,
          clientFirstNameColumn: mapping.clientFirstNameColumn || undefined,
          clientLastNameColumn: mapping.clientLastNameColumn || undefined,
          methodColumn: mapping.methodColumn || undefined,
          referenceColumn: mapping.referenceColumn || undefined,
          notesColumn: mapping.notesColumn || undefined,
        },
      });
      setClientMatches(matches);
      // Pre-fill overrides with suggested matches
      const overrides: Record<string, number | null> = {};
      for (const m of matches) {
        if (m.suggestedClientId && (m.matchConfidence === 'exact' || m.matchConfidence === 'high')) {
          overrides[m.csvName] = m.suggestedClientId;
        }
      }
      setClientOverrides(overrides);
    } catch (err: any) {
      setError(err.message || 'Failed to match clients');
    } finally {
      setLoading(false);
    }
  }, [filePath, mapping]);

  const handlePrepareRows = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await window.api.csvImport.prepareRows({
        filePath,
        mapping: {
          dateColumn: mapping.dateColumn,
          amountColumn: mapping.amountColumn,
          clientNameColumn: mapping.clientNameColumn || undefined,
          clientFirstNameColumn: mapping.clientFirstNameColumn || undefined,
          clientLastNameColumn: mapping.clientLastNameColumn || undefined,
          methodColumn: mapping.methodColumn || undefined,
          referenceColumn: mapping.referenceColumn || undefined,
          notesColumn: mapping.notesColumn || undefined,
        },
        clientMatches: clientOverrides as Record<string, number>,
        fixedClientId,
      });
      setPreparedRows(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to prepare import');
    } finally {
      setLoading(false);
    }
  }, [filePath, mapping, clientOverrides, fixedClientId]);

  const handleExecuteImport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.csvImport.execute({
        rows: preparedRows,
        skipDuplicates,
      });
      setImportResult(result);
      setStep('complete');
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  }, [preparedRows, skipDuplicates]);

  // ── Navigation ──

  const getVisibleSteps = (): WizardStep[] => {
    if (fixedClientId) return ['file', 'mapping', 'review', 'importing', 'complete'];
    return STEP_ORDER;
  };

  const canAdvance = (): boolean => {
    switch (step) {
      case 'file': return !!parseResult;
      case 'mapping': {
        const hasDate = !!mapping.dateColumn;
        const hasAmount = !!mapping.amountColumn;
        const hasClient = fixedClientId ? true : !!(mapping.clientNameColumn || (mapping.clientFirstNameColumn && mapping.clientLastNameColumn));
        return hasDate && hasAmount && hasClient;
      }
      case 'clients': return true;
      case 'review': {
        const importable = preparedRows.filter(r => !r.skipReason && r.clientId && !(r.isDuplicate && skipDuplicates));
        return importable.length > 0;
      }
      case 'complete': return true;
      default: return false;
    }
  };

  const handleNext = async () => {
    const visible = getVisibleSteps();
    const currentIdx = visible.indexOf(step);

    if (step === 'file') {
      setStep('mapping');
    } else if (step === 'mapping') {
      if (fixedClientId) {
        // Skip client matching, go straight to review
        await handlePrepareRows();
        setStep('review');
      } else {
        await handleMatchClients();
        setStep('clients');
      }
    } else if (step === 'clients') {
      await handlePrepareRows();
      setStep('review');
    } else if (step === 'review') {
      setStep('importing');
      await handleExecuteImport();
    } else if (step === 'complete') {
      onComplete();
      onClose();
    }
  };

  const handleBack = () => {
    const visible = getVisibleSteps();
    const currentIdx = visible.indexOf(step);
    if (currentIdx > 0) {
      setStep(visible[currentIdx - 1]);
    }
  };

  if (!isOpen) return null;

  // ── Computed values for review ──
  const importableRows = preparedRows.filter(r => !r.skipReason && r.clientId && !(r.isDuplicate && skipDuplicates));
  const skippedRows = preparedRows.filter(r => r.skipReason || !r.clientId);
  const duplicateRows = preparedRows.filter(r => r.isDuplicate && !r.skipReason);
  const importTotal = importableRows.reduce((sum, r) => sum + r.amount, 0);

  // ── Step Indicator ──
  const visibleSteps = getVisibleSteps().filter(s => s !== 'importing' && s !== 'complete');
  const currentStepIdx = visibleSteps.indexOf(step as any);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={step !== 'importing' ? onClose : undefined} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Import CSV Payments</h2>
            {/* Step dots */}
            {step !== 'importing' && step !== 'complete' && (
              <div className="flex items-center gap-1.5 ml-3">
                {visibleSteps.map((s, i) => (
                  <div
                    key={s}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i <= currentStepIdx ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          {step !== 'importing' && (
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)] cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {step === 'file' && (
            <FileSelectionStep
              parseResult={parseResult}
              filePath={filePath}
              loading={loading}
              onPickFile={handlePickFile}
              fixedClientName={fixedClientName}
            />
          )}
          {step === 'mapping' && parseResult && (
            <ColumnMappingStep
              headers={parseResult.headers}
              previewRows={parseResult.previewRows}
              mapping={mapping}
              autoDetected={autoDetected}
              fixedClientId={fixedClientId}
              onMappingChange={(field, value) => setMapping(prev => ({ ...prev, [field]: value }))}
            />
          )}
          {step === 'clients' && (
            <ClientMatchingStep
              matches={clientMatches}
              overrides={clientOverrides}
              clients={clients}
              search={clientSearch}
              onSearchChange={setClientSearch}
              onOverride={(csvName, clientId) => setClientOverrides(prev => ({ ...prev, [csvName]: clientId }))}
            />
          )}
          {step === 'review' && (
            <ReviewStep
              rows={preparedRows}
              importableCount={importableRows.length}
              skippedCount={skippedRows.length}
              duplicateCount={duplicateRows.length}
              importTotal={importTotal}
              skipDuplicates={skipDuplicates}
              onSkipDuplicatesChange={setSkipDuplicates}
            />
          )}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary)] mb-4" />
              <p className="text-lg font-medium text-[var(--color-text)]">Importing payments...</p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                {importableRows.length} payments totaling {formatCurrency(importTotal)}
              </p>
            </div>
          )}
          {step === 'complete' && importResult && (
            <CompleteStep result={importResult} />
          )}
        </div>

        {/* Footer */}
        {step !== 'importing' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-gray-50">
            <button
              onClick={handleBack}
              disabled={step === 'file' || step === 'complete'}
              className="btn-ghost gap-2 text-sm disabled:opacity-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleNext}
              disabled={!canAdvance() || loading}
              className="btn-primary gap-2 text-sm cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {step === 'review' ? (
                <>{`Import ${importableRows.length} Payment${importableRows.length !== 1 ? 's' : ''}`}</>
              ) : step === 'complete' ? (
                'Done'
              ) : (
                <>Next <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-Components ──

function FileSelectionStep({
  parseResult,
  filePath,
  loading,
  onPickFile,
  fixedClientName,
}: {
  parseResult: CSVParseResult | null;
  filePath: string | null;
  loading: boolean;
  onPickFile: () => void;
  fixedClientName?: string;
}) {
  return (
    <div className="space-y-6">
      {fixedClientName && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <Users className="w-4 h-4 flex-shrink-0" />
          All imported payments will be assigned to <span className="font-semibold">{fixedClientName}</span>
        </div>
      )}

      {!parseResult ? (
        <button
          onClick={onPickFile}
          disabled={loading}
          className="w-full border-2 border-dashed border-[var(--color-border)] rounded-xl p-12 text-center hover:border-[var(--color-primary)] hover:bg-gray-50 transition-colors cursor-pointer group"
        >
          {loading ? (
            <Loader2 className="w-12 h-12 animate-spin text-[var(--color-text-secondary)] mx-auto mb-3" />
          ) : (
            <Upload className="w-12 h-12 text-gray-300 group-hover:text-[var(--color-primary)] mx-auto mb-3 transition-colors" />
          )}
          <p className="text-base font-medium text-[var(--color-text)] mb-1">
            {loading ? 'Reading file...' : 'Select CSV File'}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Choose a .csv or .tsv file from your payment processor (IvyPay, Square, etc.)
          </p>
        </button>
      ) : (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <FileText className="w-8 h-8 text-emerald-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[var(--color-text)] truncate">
                {filePath?.split(/[/\\]/).pop()}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {parseResult.totalRows} rows &middot; {formatFileSize(parseResult.fileSizeBytes)} &middot; {parseResult.headers.length} columns
              </p>
            </div>
            <button
              onClick={onPickFile}
              className="btn-ghost text-xs cursor-pointer"
            >
              Change
            </button>
          </div>

          {/* Preview table */}
          <div>
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Preview (first 5 rows)</h4>
            <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {parseResult.headers.map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parseResult.previewRows.map((row, i) => (
                    <tr key={i} className="border-t border-[var(--color-border)]">
                      {parseResult!.headers.map(h => (
                        <td key={h} className="px-3 py-2 text-[var(--color-text)] whitespace-nowrap max-w-[200px] truncate">
                          {row[h] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnMappingStep({
  headers,
  previewRows,
  mapping,
  autoDetected,
  fixedClientId,
  onMappingChange,
}: {
  headers: string[];
  previewRows: Record<string, string>[];
  mapping: ColumnMapping;
  autoDetected: Record<string, string | undefined>;
  fixedClientId?: number;
  onMappingChange: (field: keyof ColumnMapping, value: string) => void;
}) {
  const renderFieldRow = (
    field: keyof ColumnMapping,
    label: string,
    required: boolean,
    description: string
  ) => {
    const currentValue = mapping[field];
    const wasAutoDetected = autoDetected[field === 'dateColumn' ? 'date' :
      field === 'amountColumn' ? 'amount' :
      field === 'clientNameColumn' ? 'clientName' :
      field === 'clientFirstNameColumn' ? 'clientFirstName' :
      field === 'clientLastNameColumn' ? 'clientLastName' :
      field === 'methodColumn' ? 'method' :
      field === 'referenceColumn' ? 'reference' : 'notes'] === currentValue && !!currentValue;

    // Get sample values
    const samples = currentValue
      ? previewRows.slice(0, 3).map(r => r[currentValue] || '').filter(Boolean)
      : [];

    return (
      <div key={field} className="flex items-start gap-4 py-3 border-b border-[var(--color-border)] last:border-0">
        <div className="w-40 flex-shrink-0">
          <p className="text-sm font-medium text-[var(--color-text)]">
            {label} {required && <span className="text-red-500">*</span>}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{description}</p>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <select
              className="select text-sm flex-1"
              value={currentValue}
              onChange={(e) => onMappingChange(field, e.target.value)}
            >
              <option value="">— Select column —</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {wasAutoDetected && (
              <span className="text-emerald-500 flex-shrink-0" title="Auto-detected">
                <Check className="w-4 h-4" />
              </span>
            )}
          </div>
          {samples.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-[var(--color-text-secondary)]">Sample:</span>
              {samples.map((s, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-[var(--color-text)]">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Determine if using separate first/last name columns
  const useSeparateNames = !mapping.clientNameColumn && (mapping.clientFirstNameColumn || mapping.clientLastNameColumn);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-1">Map Your Columns</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Tell us which CSV columns correspond to each payment field. We've auto-detected what we can.
        </p>
      </div>

      <div className="space-y-0">
        <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Required</h4>
        {renderFieldRow('dateColumn', 'Payment Date', true, 'When the payment was made')}
        {renderFieldRow('amountColumn', 'Amount', true, 'Payment amount in dollars')}
        {!fixedClientId && (
          <>
            {renderFieldRow('clientNameColumn', 'Client Name', !useSeparateNames, 'Full name (e.g., "John Smith")')}
            {!mapping.clientNameColumn && (
              <>
                <div className="text-xs text-center text-[var(--color-text-secondary)] py-1">— or use separate columns —</div>
                {renderFieldRow('clientFirstNameColumn', 'First Name', useSeparateNames as boolean, 'Client first name column')}
                {renderFieldRow('clientLastNameColumn', 'Last Name', useSeparateNames as boolean, 'Client last name column')}
              </>
            )}
          </>
        )}
      </div>

      <div className="space-y-0">
        <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2 mt-4">Optional</h4>
        {renderFieldRow('methodColumn', 'Payment Method', false, 'Card, cash, check, etc.')}
        {renderFieldRow('referenceColumn', 'Reference #', false, 'Transaction ID or check number')}
        {renderFieldRow('notesColumn', 'Notes', false, 'Any additional info')}
      </div>
    </div>
  );
}

function ClientMatchingStep({
  matches,
  overrides,
  clients,
  search,
  onSearchChange,
  onOverride,
}: {
  matches: CSVClientMatch[];
  overrides: Record<string, number | null>;
  clients: Client[];
  search: string;
  onSearchChange: (v: string) => void;
  onOverride: (csvName: string, clientId: number | null) => void;
}) {
  const matchedCount = matches.filter(m => overrides[m.csvName] != null).length;
  const totalCount = matches.length;

  const filteredMatches = search.trim()
    ? matches.filter(m => m.csvName.toLowerCase().includes(search.toLowerCase()))
    : matches;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-1">Match Clients</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          We found {totalCount} unique name{totalCount !== 1 ? 's' : ''} in your CSV. Confirm matches below.
          <span className="ml-2 font-medium text-emerald-600">{matchedCount} of {totalCount} matched</span>
        </p>
      </div>

      {totalCount > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            placeholder="Filter names..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input text-sm pl-9 w-full"
          />
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)]">CSV Name</th>
              <th className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] text-center w-12">#</th>
              <th className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] text-right w-24">Total</th>
              <th className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)]">Match To</th>
            </tr>
          </thead>
          <tbody>
            {filteredMatches.map((m) => {
              const overrideId = overrides[m.csvName];
              const isMatched = overrideId != null;
              const confidence = m.matchConfidence;

              return (
                <tr key={m.csvName} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {confidence === 'exact' || isMatched ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : confidence === 'high' || confidence === 'partial' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span className="text-[var(--color-text)] font-medium">{m.csvName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-[var(--color-text-secondary)]">
                    {m.paymentCount}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text)] font-medium">
                    {formatCurrency(m.totalAmount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="select text-sm w-full"
                      value={overrideId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        onOverride(m.csvName, val ? parseInt(val, 10) : null);
                      }}
                    >
                      <option value="">— Skip (don't import) —</option>
                      {/* Show suggested match first if it exists */}
                      {m.suggestedClientId && m.suggestedClientName && (
                        <option value={m.suggestedClientId}>
                          {m.suggestedClientName} ({m.matchConfidence})
                        </option>
                      )}
                      <optgroup label="All Clients">
                        {clients
                          .filter(c => c.id !== m.suggestedClientId)
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                          ))}
                      </optgroup>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewStep({
  rows,
  importableCount,
  skippedCount,
  duplicateCount,
  importTotal,
  skipDuplicates,
  onSkipDuplicatesChange,
}: {
  rows: CSVPaymentRow[];
  importableCount: number;
  skippedCount: number;
  duplicateCount: number;
  importTotal: number;
  skipDuplicates: boolean;
  onSkipDuplicatesChange: (v: boolean) => void;
}) {
  // Date range
  const dates = rows.filter(r => r.paymentDate).map(r => r.paymentDate).sort();
  const dateRange = dates.length > 0 ? `${formatDateShort(dates[0])} \u2014 ${formatDateShort(dates[dates.length - 1])}` : '';

  // Refunds
  const refunds = rows.filter(r => !r.skipReason && r.clientId && r.amount < 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-1">Review Import</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Confirm the summary below, then click Import to proceed.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-emerald-700">{importableCount}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Payments to import</p>
        </div>
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(importTotal)}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Total amount</p>
        </div>
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{skippedCount}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Will be skipped</p>
        </div>
      </div>

      {dateRange && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Date range: {dateRange}
        </p>
      )}

      {/* Duplicate warning */}
      {duplicateCount > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-amber-700 mb-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">
              {duplicateCount} potential duplicate{duplicateCount !== 1 ? 's' : ''} detected
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm text-amber-700 cursor-pointer">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => onSkipDuplicatesChange(e.target.checked)}
              className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            Skip duplicates (payments with same client, date, and amount)
          </label>
        </div>
      )}

      {/* Refund notice */}
      {refunds.length > 0 && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Includes {refunds.length} refund{refunds.length !== 1 ? 's' : ''} totaling{' '}
          {formatCurrency(refunds.reduce((s, r) => s + r.amount, 0))}
        </p>
      )}

      {/* Row preview */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">Payment Preview</h4>
        <div className="max-h-48 overflow-y-auto border border-[var(--color-border)] rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Date</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Client</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Amount</th>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Method</th>
                <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row) => {
                const willImport = !row.skipReason && row.clientId && !(row.isDuplicate && skipDuplicates);
                return (
                  <tr key={row.rowIndex} className={`border-t border-[var(--color-border)] ${!willImport ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{row.paymentDate || '—'}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text)] truncate max-w-[150px]">{row.clientName || row.csvName || '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${row.amount < 0 ? 'text-red-600' : 'text-[var(--color-text)]'}`}>
                      {row.amount !== 0 ? formatCurrency(row.amount) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-secondary)] capitalize">{row.paymentMethod}</td>
                    <td className="px-3 py-1.5 text-center">
                      {willImport ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                      ) : row.isDuplicate ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Duplicate</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">{row.skipReason || 'Skipped'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 50 && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Showing first 50 of {rows.length} rows
          </p>
        )}
      </div>

      {/* Import tag notice */}
      <p className="text-xs text-[var(--color-text-secondary)]">
        All imported payments will be tagged with <code className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">[CSV Import {new Date().toISOString().slice(0, 10)}]</code> in their notes.
      </p>
    </div>
  );
}

function CompleteStep({ result }: { result: CSVImportResult }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <h3 className="text-xl font-bold text-[var(--color-text)] mb-1">Import Complete</h3>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6">
        Your payments have been imported successfully.
      </p>
      <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-600">{result.imported}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Imported</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{formatCurrency(result.totalAmount)}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-400">{result.skipped}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Skipped</p>
        </div>
      </div>
      {result.duplicatesSkipped > 0 && (
        <p className="text-xs text-amber-600 mt-4">
          {result.duplicatesSkipped} duplicate{result.duplicatesSkipped !== 1 ? 's' : ''} skipped
        </p>
      )}
      {result.errors.length > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 max-w-sm w-full">
          <p className="font-medium mb-1">{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:</p>
          {result.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
          {result.errors.length > 5 && <p>...and {result.errors.length - 5} more</p>}
        </div>
      )}
    </div>
  );
}

// ── Utility ──

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
