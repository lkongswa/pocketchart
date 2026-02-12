import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  Users,
  FileText,
  ClipboardList,
  Target,
  Calendar,
  Receipt,
  Building2,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import type { BackupSummary } from '@shared/types';

interface RestoreConfirmationModalProps {
  backupSummary: BackupSummary;
  onConfirm: () => void;
  onCancel: () => void;
  executing: boolean;
}

export default function RestoreConfirmationModal({
  backupSummary,
  onConfirm,
  onCancel,
  executing,
}: RestoreConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [currentSummary, setCurrentSummary] = useState<any>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const summary = await window.api.restore.getCurrentSummary();
        setCurrentSummary(summary);
      } catch {}
      setLoadingCurrent(false);
    };
    load();
  }, []);

  const canConfirm = confirmText === 'RESTORE' && !executing;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 bg-red-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Confirm Full Restore</h2>
              <p className="text-sm text-red-600">This will permanently replace your current database</p>
            </div>
          </div>
          {!executing && (
            <button onClick={onCancel} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
          )}
        </div>

        {/* Comparison */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Current DB */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Current Database</h3>
              {loadingCurrent ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                  Loading...
                </div>
              ) : currentSummary ? (
                <div className="space-y-2">
                  <CompactStat icon={<Users size={14} />} label="Clients" value={currentSummary.clientCount} />
                  <CompactStat icon={<FileText size={14} />} label="Notes" value={currentSummary.noteCount} />
                  <CompactStat icon={<ClipboardList size={14} />} label="Evals" value={currentSummary.evalCount} />
                  <CompactStat icon={<Target size={14} />} label="Goals" value={currentSummary.goalCount} />
                  <CompactStat icon={<Calendar size={14} />} label="Appts" value={currentSummary.appointmentCount} />
                  <CompactStat icon={<Receipt size={14} />} label="Invoices" value={currentSummary.invoiceCount} />
                  {currentSummary.entityCount > 0 && (
                    <CompactStat icon={<Building2 size={14} />} label="Entities" value={currentSummary.entityCount} />
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No data</p>
              )}
            </div>

            {/* Backup */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">Backup (Replacing With)</h3>
              <div className="space-y-2">
                <CompactStat icon={<Users size={14} />} label="Clients" value={backupSummary.clientCount} highlight />
                <CompactStat icon={<FileText size={14} />} label="Notes" value={backupSummary.noteCount} highlight />
                <CompactStat icon={<ClipboardList size={14} />} label="Evals" value={backupSummary.evalCount} highlight />
                <CompactStat icon={<Target size={14} />} label="Goals" value={backupSummary.goalCount} highlight />
                <CompactStat icon={<Calendar size={14} />} label="Appts" value={backupSummary.appointmentCount} highlight />
                <CompactStat icon={<Receipt size={14} />} label="Invoices" value={backupSummary.invoiceCount} highlight />
                {backupSummary.entityCount > 0 && (
                  <CompactStat icon={<Building2 size={14} />} label="Entities" value={backupSummary.entityCount} highlight />
                )}
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-5">
            <p className="text-sm text-red-800 font-semibold mb-1">This action cannot be undone</p>
            <p className="text-sm text-red-700">
              All current data will be replaced by the backup contents. A pre-restore backup will be saved automatically,
              but you should export your current database first if you want to be safe.
            </p>
          </div>

          {/* Confirm input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type <span className="font-bold text-red-600">RESTORE</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:ring-2 focus:ring-red-500/30 focus:border-red-500 outline-none"
              placeholder="RESTORE"
              disabled={executing}
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
            disabled={executing}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${
              canConfirm ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            {executing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                Replace Database
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompactStat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}
