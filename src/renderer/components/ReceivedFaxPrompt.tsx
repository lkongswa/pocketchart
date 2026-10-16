import React, { useState } from 'react';
import { X, Inbox, Eye, AlertTriangle, Loader2, FolderInput } from 'lucide-react';
import type { InboundFaxSuggestion, InboundFaxCandidate } from '../../shared/types';

interface Props {
  suggestion: InboundFaxSuggestion;
  /** How many more are waiting behind this one (for the "1 of 3" hint). */
  remaining: number;
  onFiled: (info: { clientName: string; label: string }) => void;
  onNotThis: () => void;
  onLater: () => void;
}

function fmtDateTime(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw.includes('T') ? raw : raw.length === 10 ? raw + 'T12:00:00' : raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function cleanIpcError(err: any, fallback: string): string {
  return String(err?.message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || fallback;
}

/**
 * "A fax just came back from Dr. X's office — is this the signed plan of care for Jane?"
 * Shown app-wide when an inbound fax's caller ID matches a physician we faxed a document
 * to that is still awaiting its signed copy. One click files it to the chart, links it to
 * the outbound send (so the eval shows "Received"), and marks the MD signature received.
 */
export default function ReceivedFaxPrompt({ suggestion, remaining, onFiled, onNotThis, onLater }: Props) {
  const [selectedId, setSelectedId] = useState<number>(suggestion.candidates[0]?.outboundFaxId ?? 0);
  const [busy, setBusy] = useState<'preview' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Caller ID is spoofable: filing a signed plan of care requires the user to have looked at the pages first. */
  const [previewed, setPreviewed] = useState(false);

  const chosen: InboundFaxCandidate | undefined = suggestion.candidates.find(c => c.outboundFaxId === selectedId) || suggestion.candidates[0];
  const from = suggestion.physicianName || suggestion.fromFaxNumber || 'an unknown number';

  const preview = async () => {
    if (!suggestion.providerFaxId) { setError('This fax has no provider id to download.'); return; }
    try {
      setBusy('preview');
      setError(null);
      const result = await window.api.fax.retrieveFax(suggestion.providerFaxId);
      await window.api.cms1500.openPreview({ base64Pdf: result.base64Pdf, filename: result.filename || `fax_${suggestion.providerFaxId}.pdf` });
      setPreviewed(true);
    } catch (err: any) {
      setError(cleanIpcError(err, 'Could not download the fax for preview.'));
    } finally {
      setBusy(null);
    }
  };

  const file = async () => {
    if (!chosen || !previewed) return;
    try {
      setBusy('file');
      setError(null);
      await window.api.fax.saveToChart({
        faxLogId: suggestion.faxLogId,
        clientId: chosen.clientId,
        category: chosen.suggestedCategory,
        linkToOutboundFaxId: chosen.outboundFaxId,
      });
      onFiled({ clientName: chosen.clientName, label: chosen.label });
    } catch (err: any) {
      setError(cleanIpcError(err, 'Could not file the fax to the chart.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onLater} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-start justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700">
              <Inbox size={18} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Fax received</h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                From {from} · {suggestion.pages || '?'} page{suggestion.pages === 1 ? '' : 's'} · {fmtDateTime(suggestion.receivedAt)}
                {remaining > 0 ? ` · ${remaining} more waiting` : ''}
              </p>
            </div>
          </div>
          <button onClick={onLater} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm text-[var(--color-text)]">
            The caller ID matches a number you faxed a document to that is still waiting on a physician signature.
            {suggestion.candidates.length > 1 ? ' Which one might this be the signed copy of?' : ' It may be the signed copy.'}
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Caller ID is not verified. Preview the fax and confirm it is the signed document before filing it to the chart.
          </p>

          <div className="space-y-2">
            {suggestion.candidates.map(c => (
              <label
                key={c.outboundFaxId}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  c.outboundFaxId === chosen?.outboundFaxId ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-[var(--color-border)] hover:bg-gray-50'
                }`}
              >
                {suggestion.candidates.length > 1 && (
                  <input type="radio" className="mt-1" checked={c.outboundFaxId === chosen?.outboundFaxId} onChange={() => setSelectedId(c.outboundFaxId)} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)]">{c.clientName}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {c.label} · faxed {fmtDate(c.sentAt)}{c.physicianName ? ` to ${c.physicianName}` : ''}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <p className="text-xs text-[var(--color-text-secondary)]">
            Filing saves the PDF to {chosen?.clientName || 'the client'}'s chart as <span className="font-medium">{chosen?.suggestedCategoryLabel}</span>,
            links it to the original send, and marks the physician signature as received.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t">
          <button type="button" className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:bg-gray-50" onClick={preview} disabled={busy !== null}>
            {busy === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Preview fax
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="text-sm px-3 py-1.5 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)]" onClick={onLater} disabled={busy !== null}>
              Later
            </button>
            <button type="button" className="text-sm px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:bg-gray-50" onClick={onNotThis} disabled={busy !== null} title="Keep it in the Fax Center inbox for manual filing">
              Not this one
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              onClick={file}
              disabled={busy !== null || !chosen || !previewed}
              title={previewed ? 'File this fax to the chart as the signed copy' : 'Preview the fax first'}
            >
              {busy === 'file' ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}
              {previewed ? 'Confirm & file to chart' : 'Preview to enable filing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
