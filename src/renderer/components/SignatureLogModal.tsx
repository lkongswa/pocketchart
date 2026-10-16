import React, { useEffect, useState } from 'react';
import { X, FileDown, Phone, Send, CheckCheck, XCircle, Loader2, AlertTriangle, Plus } from 'lucide-react';
import type { SignatureLog, CommunicationType } from '../../shared/types';

interface Props {
  evalId: number;
  onClose: () => void;
  /** Fired after a follow-up is added (so the list can refresh if it cares). */
  onChanged?: () => void;
}

const TYPE_LABELS: Record<CommunicationType, string> = {
  phone: 'Phone call',
  email: 'Email',
  fax: 'Fax',
  in_person: 'In person',
  other: 'Other',
};

function fmtDateTime(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw.includes('T') ? raw : raw + 'T12:00:00');
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AttemptStatus({ status, receivedBackAt }: { status: string; receivedBackAt: string | null }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap';
  if (receivedBackAt) return <span className={`${base} bg-emerald-100 text-emerald-700`}><CheckCheck size={12} /> Signed copy received</span>;
  if (status === 'failed') return <span className={`${base} bg-red-100 text-red-700`}><XCircle size={12} /> Failed</span>;
  if (status === 'queued' || status === 'sending') return <span className={`${base} bg-amber-100 text-amber-700`}><Loader2 size={12} className="animate-spin" /> Sending</span>;
  return <span className={`${base} bg-sky-100 text-sky-700`}><Send size={12} /> Delivered</span>;
}

/**
 * Physician-signature tracking for one signed evaluation: every outbound fax attempt
 * (with provider status + errors), whether a signed copy came back, and a running log of
 * follow-up contacts ("called Dr. X's office, confirmed receipt…"). Exportable as a PDF
 * so an auditor can see exactly what was done to obtain the signature.
 */
export default function SignatureLogModal({ evalId, onClose, onChanged }: Props) {
  const [log, setLog] = useState<SignatureLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-followup form
  const [showForm, setShowForm] = useState(false);
  const [fType, setFType] = useState<CommunicationType>('phone');
  const [fDate, setFDate] = useState(todayLocal());
  const [fContact, setFContact] = useState('');
  const [fSummary, setFSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportedTo, setExportedTo] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.api.evaluations.signatureLog(evalId);
      setLog(data);
    } catch (err: any) {
      setError(err?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Could not load signature log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [evalId]);

  const addFollowup = async () => {
    if (!log || !fSummary.trim()) return;
    try {
      setSaving(true);
      setError(null);
      await window.api.evaluations.addSignatureFollowup({
        evalId,
        clientId: log.eval.client_id,
        communication_date: new Date(fDate).toISOString(),
        type: fType,
        contact_name: fContact.trim(),
        summary: fSummary.trim(),
      });
      setFSummary('');
      setFContact('');
      setFDate(todayLocal());
      setShowForm(false);
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Could not save follow-up');
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    try {
      setExporting(true);
      setError(null);
      setExportedTo(null);
      const pdf = await window.api.evaluations.signatureLogPdf(evalId);
      const path = await window.api.notes.savePdf(pdf);
      if (path) setExportedTo(path);
    } catch (err: any) {
      setError(err?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Could not export PDF');
    } finally {
      setExporting(false);
    }
  };

  const received = log?.faxAttempts.find(a => a.received_back_at) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Physician Signature Log</h2>
            {log && (
              <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 truncate">
                {log.eval.client_name} · {log.eval.eval_type === 'reassessment' ? 'Recert' : log.eval.eval_type === 'discharge' ? 'Discharge' : 'Initial'} eval {fmtDate(log.eval.eval_date)}
                {log.eval.signed_at ? ` · signed ${fmtDate(log.eval.signed_at)}` : ' · unsigned'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !log ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : log ? (
            <>
              {/* Physician + overall status */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)] font-semibold">Referring physician</p>
                  <p className="mt-1 text-[var(--color-text)]">{log.physician?.name || <span className="text-[var(--color-text-secondary)]">Not on file</span>}</p>
                  {log.physician?.fax && <p className="text-xs text-[var(--color-text-secondary)]">Fax {log.physician.fax}</p>}
                  {log.physician?.npi && <p className="text-xs text-[var(--color-text-secondary)]">NPI {log.physician.npi}</p>}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)] font-semibold">Signature status</p>
                  <p className="mt-1">
                    {received ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><CheckCheck size={14} /> Signed copy received {fmtDate(received.received_back_at)}</span>
                    ) : log.faxAttempts.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium"><Send size={14} /> Sent, awaiting signed copy</span>
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">Not yet sent to physician</span>
                    )}
                  </p>
                  {log.complianceStatus && (
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Chart tracker: {log.complianceStatus.replace(/_/g, ' ')}</p>
                  )}
                </div>
              </div>

              {/* Fax attempts */}
              <section>
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Fax attempts ({log.faxAttempts.length})</h3>
                {log.faxAttempts.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">No faxes have been sent for this evaluation.</p>
                ) : (
                  <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wider text-[var(--color-text-secondary)]">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Sent</th>
                          <th className="text-left px-3 py-2 font-semibold">To</th>
                          <th className="text-left px-3 py-2 font-semibold">Result</th>
                          <th className="text-right px-3 py-2 font-semibold">Pages</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {log.faxAttempts.map(a => (
                          <tr key={a.id} className="align-top">
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(a.sent_at || a.created_at)}</td>
                            <td className="px-3 py-2">
                              <div>{a.physician_name || '—'}</div>
                              <div className="text-xs text-[var(--color-text-secondary)]">{a.fax_number}{a.fax_provider ? ` · via ${a.fax_provider}` : ''}</div>
                            </td>
                            <td className="px-3 py-2">
                              <AttemptStatus status={a.status} receivedBackAt={a.received_back_at} />
                              {a.status === 'failed' && a.error_message && (
                                <div className="text-xs text-red-600 mt-1">{a.error_message}</div>
                              )}
                              {a.received_back_at && (
                                <div className="text-xs text-emerald-700 mt-1">Received {fmtDateTime(a.received_back_at)}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{a.pages || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Follow-up contacts */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">Follow-up contacts ({log.followups.length})</h3>
                  {!showForm && (
                    <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:opacity-80" onClick={() => setShowForm(true)}>
                      <Plus size={14} /> Log a call / contact
                    </button>
                  )}
                </div>

                {showForm && (
                  <div className="rounded-lg border border-[var(--color-border)] bg-gray-50 p-3 space-y-3 mb-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Type</label>
                        <select className="select w-full" value={fType} onChange={e => setFType(e.target.value as CommunicationType)}>
                          {(Object.keys(TYPE_LABELS) as CommunicationType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">When</label>
                        <input type="datetime-local" className="input w-full" value={fDate} onChange={e => setFDate(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Who you spoke with <span className="font-normal text-xs text-[var(--color-text-secondary)]">(optional)</span></label>
                      <input type="text" className="input w-full" placeholder="e.g. Maria at Dr. Chen's front desk" value={fContact} onChange={e => setFContact(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">What happened</label>
                      <textarea
                        className="textarea w-full"
                        rows={3}
                        placeholder="e.g. Called to confirm receipt of the plan of care faxed 9/12. Office confirmed it is in Dr. Chen's queue; expects signature back by Friday."
                        value={fSummary}
                        onChange={e => setFSummary(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-3 py-1.5" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                      <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={addFollowup} disabled={saving || !fSummary.trim()}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                        Save to log
                      </button>
                    </div>
                  </div>
                )}

                {log.followups.length === 0 ? (
                  !showForm && <p className="text-sm text-[var(--color-text-secondary)]">No follow-up contacts logged yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {log.followups.map(f => (
                      <li key={f.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-[var(--color-text)]">{TYPE_LABELS[f.type] || f.type}{f.contact_name ? ` · ${f.contact_name}` : ''}</span>
                          <span className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">{fmtDateTime(f.communication_date)}</span>
                        </div>
                        <p className="mt-1 text-[var(--color-text)] whitespace-pre-wrap">{f.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t">
          <div className="text-xs text-[var(--color-text-secondary)] min-w-0 truncate">
            {exportedTo ? <span className="text-emerald-700">Saved to {exportedTo}</span> : 'Export a dated PDF of this log for audit requests.'}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:bg-gray-50" onClick={onClose}>Close</button>
            <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={exportPdf} disabled={exporting || !log}>
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              Export log (PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
