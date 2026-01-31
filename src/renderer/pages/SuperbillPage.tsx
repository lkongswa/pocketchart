import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Download,
  Calendar,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import type { Client, Note } from '../../shared/types';

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const SuperbillPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clientId = Number(id);

  const [client, setClient] = useState<Client | null>(null);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected notes
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(new Set());

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedPdf, setGeneratedPdf] = useState<{ base64Pdf: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, notesData] = await Promise.all([
        window.api.clients.get(clientId),
        window.api.notes.listByClient(clientId),
      ]);
      setClient(clientData);
      setAllNotes(notesData);

      // Set default date range to cover all notes
      if (notesData.length > 0) {
        const dates = notesData.map((n) => n.date_of_service).filter(Boolean).sort();
        if (dates.length > 0) {
          setStartDate(dates[0]);
          setEndDate(dates[dates.length - 1]);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load client data');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter notes by date range
  const filteredNotes = allNotes.filter((note) => {
    if (!note.date_of_service) return false;
    if (startDate && note.date_of_service < startDate) return false;
    if (endDate && note.date_of_service > endDate) return false;
    return true;
  });

  // Toggle note selection
  const toggleNote = (noteId: number) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  // Select all / deselect all
  const toggleAll = () => {
    if (selectedNoteIds.size === filteredNotes.length) {
      setSelectedNoteIds(new Set());
    } else {
      setSelectedNoteIds(new Set(filteredNotes.map((n) => n.id)));
    }
  };

  // Generate superbill for selected notes
  const handleGenerateSelected = async () => {
    if (selectedNoteIds.size === 0) {
      setError('Please select at least one note');
      return;
    }
    setGenerating(true);
    setError(null);
    setGeneratedPdf(null);
    setSaveSuccess(false);
    try {
      const result = await window.api.superbill.generate({
        clientId,
        noteIds: Array.from(selectedNoteIds),
      });
      setGeneratedPdf(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate superbill');
    } finally {
      setGenerating(false);
    }
  };

  // Generate bulk superbill for date range
  const handleGenerateBulk = async () => {
    if (!startDate || !endDate) {
      setError('Please select a start and end date');
      return;
    }
    setGenerating(true);
    setError(null);
    setGeneratedPdf(null);
    setSaveSuccess(false);
    try {
      const result = await window.api.superbill.generateBulk({
        clientId,
        startDate,
        endDate,
      });
      setGeneratedPdf(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate superbill');
    } finally {
      setGenerating(false);
    }
  };

  // Save PDF
  const handleSave = async () => {
    if (!generatedPdf) return;
    setSaveSuccess(false);
    try {
      const saved = await window.api.superbill.save({
        base64Pdf: generatedPdf.base64Pdf,
        filename: generatedPdf.filename,
      });
      if (saved) {
        setSaveSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save PDF');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">
          Loading client data...
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center">
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Client not found</h3>
          <button className="btn-secondary gap-2 mt-4" onClick={() => navigate('/clients')}>
            <ArrowLeft size={16} />
            Back to Clients
          </button>
        </div>
      </div>
    );
  }

  const allSelected = filteredNotes.length > 0 && selectedNoteIds.size === filteredNotes.length;

  return (
    <div className="p-6">
      {/* Back Button */}
      <button
        className="btn-ghost gap-2 mb-4 -ml-2"
        onClick={() => navigate(`/clients/${clientId}`)}
      >
        <ArrowLeft size={16} />
        Back to Client
      </button>

      {/* Page Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">
              Generate Superbill
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {client.first_name} {client.last_name}
              {client.dob && ` | DOB: ${formatDate(client.dob)}`}
              {client.insurance_payer && ` | ${client.insurance_payer}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FileText size={24} className="text-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="card p-5 mb-6">
        <h3 className="section-title">Date Range</h3>
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-[200px]">
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Start Date
            </label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex-1 max-w-[200px]">
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              End Date
            </label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button
            className="btn-accent gap-2"
            onClick={handleGenerateBulk}
            disabled={generating || !startDate || !endDate}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
            Generate All in Range
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] mt-2">
          {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''} found in selected range
        </p>
      </div>

      {/* Notes Selection */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title mb-0">Select Notes</h3>
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost btn-sm gap-1.5"
              onClick={toggleAll}
            >
              {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button
              className="btn-primary gap-2"
              onClick={handleGenerateSelected}
              disabled={generating || selectedNoteIds.size === 0}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              Generate Selected ({selectedNoteIds.size})
            </button>
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-text-secondary)] text-sm">
            No notes found in the selected date range.
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredNotes.map((note) => {
              const isSelected = selectedNoteIds.has(note.id);
              return (
                <div
                  key={note.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-blue-50'
                      : 'border-[var(--color-border)] hover:bg-gray-50'
                  }`}
                  onClick={() => toggleNote(note.id)}
                >
                  <div className="shrink-0">
                    {isSelected ? (
                      <CheckSquare size={18} className="text-[var(--color-primary)]" />
                    ) : (
                      <Square size={18} className="text-[var(--color-text-secondary)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--color-text)]">
                        {formatDate(note.date_of_service)}
                      </span>
                      {note.cpt_code && (
                        <span className="badge bg-gray-100 text-gray-600">
                          CPT: {note.cpt_code}
                        </span>
                      )}
                      <span className="badge bg-gray-100 text-gray-600">
                        {note.units || 1} unit{(note.units || 1) !== 1 ? 's' : ''}
                      </span>
                      {note.signed_at ? (
                        <span className="badge bg-emerald-100 text-emerald-700">Signed</span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-700">Unsigned</span>
                      )}
                    </div>
                    {note.time_in && note.time_out && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                        {note.time_in} - {note.time_out}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="card p-4 mb-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={16} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Generated PDF Result */}
      {generatedPdf && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-emerald-600" />
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                  Superbill Generated Successfully
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {generatedPdf.filename}
                </p>
              </div>
            </div>
            <button
              className="btn-primary gap-2"
              onClick={handleSave}
            >
              <Download size={16} />
              Download PDF
            </button>
          </div>
          {saveSuccess && (
            <div className="mt-3 flex items-center gap-2 text-emerald-600">
              <CheckCircle size={14} />
              <span className="text-sm">PDF saved successfully!</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SuperbillPage;
