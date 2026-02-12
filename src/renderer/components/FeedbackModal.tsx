import React, { useState, useEffect } from 'react';
import { X, MessageSquare, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface FeedbackModalProps {
  onClose: () => void;
}

type FeedbackCategory = 'Bug' | 'Feature Request' | 'Question' | 'Other';

const CATEGORIES: { label: FeedbackCategory; color: string; activeColor: string }[] = [
  { label: 'Bug', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100', activeColor: 'bg-red-500 text-white border-red-500' },
  { label: 'Feature Request', color: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100', activeColor: 'bg-cyan-500 text-white border-cyan-500' },
  { label: 'Question', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100', activeColor: 'bg-amber-500 text-white border-amber-500' },
  { label: 'Other', color: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100', activeColor: 'bg-gray-500 text-white border-gray-500' },
];

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>('Bug');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-attach metadata
  const [appVersion, setAppVersion] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [practiceName, setPracticeName] = useState('');
  const osInfo = `${navigator.platform}`;

  useEffect(() => {
    window.api.app.getVersion().then(v => setAppVersion(v)).catch(() => {});
    window.api.practice.get().then((p: any) => {
      if (p) {
        setDiscipline(p.discipline || '');
        setPracticeName(p.name || '');
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      await window.api.feedback.submit({
        description: description.trim(),
        category,
        appVersion,
        discipline,
        practiceName,
        os: osInfo,
      });
      setSubmitted(true);
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-8 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">Thanks for the feedback!</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">We'll look into it shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Report an Issue</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-[var(--color-text-secondary)]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* PHI Warning — always visible, not dismissable */}
          <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-0.5">
                Do not include protected health information (PHI)
              </p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                No patient names, dates of birth, or identifying details. Describe issues in general terms
                (e.g., "eval form crashes when adding a 4th goal" not "John Smith's eval crashed").
              </p>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="label mb-1.5">Category</label>
            <div className="flex gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setCategory(cat.label)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    category === cat.label ? cat.activeColor : cat.color
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label mb-1.5">Description</label>
            <textarea
              className="textarea w-full"
              rows={5}
              placeholder="What happened? What did you expect to happen? Include steps to reproduce if possible..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          {/* Auto-attached metadata */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-secondary)]">
            {appVersion && <span>Version: v{appVersion}</span>}
            {discipline && <span>Discipline: {discipline}</span>}
            {practiceName && <span>Practice: {practiceName}</span>}
            <span>OS: {osInfo}</span>
          </div>
          <p className="text-[10px] text-[var(--color-text-secondary)] -mt-2">
            This info helps us troubleshoot — no patient data is included.
          </p>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-border)]">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex items-center gap-2"
              disabled={!description.trim() || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
