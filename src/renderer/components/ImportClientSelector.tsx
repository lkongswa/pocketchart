import React, { useState, useMemo } from 'react';
import {
  X,
  FolderOpen,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Users,
  FileText,
  ClipboardList,
  Target,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowRight,
} from 'lucide-react';
import type { BackupClientInfo, ImportResult } from '@shared/types';

interface ImportClientSelectorProps {
  onClose: () => void;
  onImportComplete: (result: ImportResult) => void;
}

type ImportStep = 'pick-file' | 'enter-passphrase' | 'select-clients' | 'importing' | 'results';

export default function ImportClientSelector({ onClose, onImportComplete }: ImportClientSelectorProps) {
  const [step, setStep] = useState<ImportStep>('pick-file');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [clients, setClients] = useState<BackupClientInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handlePickFile = async () => {
    const selected = await window.api.restore.pickFile();
    if (selected) {
      setFilePath(selected);
      setFileName(selected.split(/[/\\]/).pop() || selected);
      setError('');
      setStep('enter-passphrase');
    }
  };

  const handleValidate = async () => {
    if (!passphrase.trim()) {
      setError('Please enter the backup passphrase.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.api.restore.getBackupClients(filePath, passphrase);
      if (result.error) {
        setError(result.error);
      } else if (result.clients) {
        setClients(result.clients);
        setSelectedIds(new Set());
        setStep('select-clients');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to read backup');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClient = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClients.map(c => c.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setStep('importing');
    setError('');
    try {
      const result = await window.api.restore.importClients(filePath, passphrase, Array.from(selectedIds));
      setImportResult(result);
      setStep('results');
      if (result.success) {
        onImportComplete(result);
      }
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStep('select-clients');
    }
  };

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter(
      c =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        c.discipline.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  // Selected counts summary
  const selectedSummary = useMemo(() => {
    const selected = clients.filter(c => selectedIds.has(c.id));
    return {
      clients: selected.length,
      notes: selected.reduce((sum, c) => sum + c.noteCount, 0),
      evals: selected.reduce((sum, c) => sum + c.evalCount, 0),
      goals: selected.reduce((sum, c) => sum + c.goalCount, 0),
    };
  }, [clients, selectedIds]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import Clients from Backup</h2>
            <p className="text-sm text-gray-500">
              {step === 'pick-file' && 'Select a backup file to import specific clients from.'}
              {step === 'enter-passphrase' && `Enter the passphrase for ${fileName}`}
              {step === 'select-clients' && `${clients.length} clients found — select which to import`}
              {step === 'importing' && 'Importing selected clients...'}
              {step === 'results' && 'Import complete'}
            </p>
          </div>
          {step !== 'importing' && (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X size={20} className="text-gray-500" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1: Pick File */}
          {step === 'pick-file' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <FolderOpen size={48} className="text-blue-500" />
              <p className="text-gray-600">Select a .pcbackup or .db file</p>
              <button className="btn-primary gap-2" onClick={handlePickFile}>
                <FolderOpen size={16} />
                Choose File
              </button>
            </div>
          )}

          {/* Step 2: Passphrase */}
          {step === 'enter-passphrase' && (
            <div className="max-w-sm mx-auto space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                  <AlertTriangle size={16} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passphrase</label>
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={e => setPassphrase(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleValidate()}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 pr-12"
                    placeholder="Enter backup passphrase"
                    autoFocus
                    disabled={loading}
                  />
                  <button
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassphrase ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => setStep('pick-file')}
                >
                  Back
                </button>
                <button
                  className="flex-1 btn-primary justify-center gap-2 py-2.5"
                  onClick={handleValidate}
                  disabled={loading || !passphrase.trim()}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  Load Clients
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Select Clients */}
          {step === 'select-clients' && (
            <div className="space-y-3">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                  <AlertTriangle size={16} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Search + Select All */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm"
                    placeholder="Search clients..."
                  />
                </div>
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                >
                  {selectedIds.size === filteredClients.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Client List */}
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {filteredClients.map(client => (
                  <label
                    key={client.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedIds.has(client.id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(client.id)}
                      onChange={() => handleToggleClient(client.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {client.last_name}, {client.first_name}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          client.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {client.status}
                        </span>
                        {client.discipline && (
                          <span className="text-xs text-gray-500">{client.discipline}</span>
                        )}
                        {client.existsInCurrent && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5">
                            <AlertTriangle size={10} />
                            exists
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><FileText size={10} />{client.noteCount} notes</span>
                        <span className="flex items-center gap-1"><ClipboardList size={10} />{client.evalCount} evals</span>
                        <span className="flex items-center gap-1"><Target size={10} />{client.goalCount} goals</span>
                        <span className="flex items-center gap-1"><Calendar size={10} />{client.appointmentCount} appts</span>
                      </div>
                      {(client.earliestService || client.latestService) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {client.earliestService} — {client.latestService}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
                {filteredClients.length === 0 && (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    {searchQuery ? 'No clients match your search.' : 'No clients found in backup.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 size={48} className="text-blue-500 animate-spin" />
              <p className="text-gray-600">
                Importing {selectedIds.size} client{selectedIds.size !== 1 ? 's' : ''} with all related data...
              </p>
              <p className="text-xs text-gray-400">This may take a moment for clients with lots of records.</p>
            </div>
          )}

          {/* Step 5: Results */}
          {step === 'results' && importResult && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-4 rounded-lg ${
                importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                {importResult.success ? (
                  <CheckCircle2 size={24} className="text-green-600 shrink-0" />
                ) : (
                  <AlertTriangle size={24} className="text-red-600 shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${importResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </p>
                </div>
              </div>

              {/* Counts */}
              <div className="grid grid-cols-3 gap-3">
                <ResultStat label="Clients" value={importResult.clients} />
                <ResultStat label="Notes" value={importResult.notes} />
                <ResultStat label="Evaluations" value={importResult.evaluations} />
                <ResultStat label="Goals" value={importResult.goals} />
                <ResultStat label="Appointments" value={importResult.appointments} />
                <ResultStat label="Invoices" value={importResult.invoices} />
                {importResult.entities > 0 && <ResultStat label="Entities" value={importResult.entities} />}
                {importResult.documents > 0 && <ResultStat label="Documents" value={importResult.documents} />}
                {importResult.payments > 0 && <ResultStat label="Payments" value={importResult.payments} />}
              </div>

              {/* Warnings */}
              {importResult.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Warnings</p>
                  <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                    {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'select-clients' || step === 'results') && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
            {step === 'select-clients' ? (
              <>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">{selectedIds.size}</span> selected
                  {selectedIds.size > 0 && (
                    <span className="text-gray-400 ml-2">
                      ({selectedSummary.notes} notes, {selectedSummary.evals} evals, {selectedSummary.goals} goals)
                    </span>
                  )}
                </p>
                <div className="flex gap-3">
                  <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={selectedIds.size === 0}
                    className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white ${
                      selectedIds.size > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'
                    }`}
                  >
                    Import {selectedIds.size} Client{selectedIds.size !== 1 ? 's' : ''}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-end w-full">
                <button onClick={onClose} className="btn-primary gap-2">
                  <CheckCircle2 size={16} />
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
