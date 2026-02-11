import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectionColor } from '../hooks/useSectionColor';
import {
  ClipboardList,
  ArrowLeft,
  CheckCircle,
  PenLine,
  Clock,
  Filter,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface EvalWithClient {
  id: number;
  client_id: number;
  eval_date: string;
  discipline: string;
  content: string;
  signed_at: string | null;
  eval_type: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  client_discipline: string;
}

type TabFilter = 'incomplete' | 'recerts' | 'all';

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getContentPreview(contentJson: string): string {
  try {
    const parsed = JSON.parse(contentJson || '{}');
    // Try to find any non-empty field for a preview
    const preview = parsed.clinical_impression || parsed.medical_history ||
      parsed.current_complaints || parsed.treatment_plan || parsed.referral_source || '';
    if (!preview) return 'No content yet';
    return preview.length > 80 ? preview.substring(0, 80) + '...' : preview;
  } catch {
    return 'No content yet';
  }
}

export default function EvalsQueuePage() {
  const navigate = useNavigate();
  const sectionColor = useSectionColor();
  const [incompleteEvals, setIncompleteEvals] = useState<EvalWithClient[]>([]);
  const [allEvals, setAllEvals] = useState<EvalWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<TabFilter>('incomplete');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [incomplete, all] = await Promise.all([
        window.api.evaluations.listIncomplete(),
        window.api.evaluations.listAll(),
      ]);
      setIncompleteEvals(incomplete);
      setAllEvals(all);
    } catch (err) {
      console.error('Failed to load evals:', err);
    } finally {
      setLoading(false);
    }
  };

  const matchesSearch = (e: EvalWithClient) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      (e.eval_date || '').includes(q) ||
      (e.eval_type || '').toLowerCase().includes(q)
    );
  };

  // Derived lists
  const recerts = allEvals.filter(e => e.eval_type === 'reassessment');
  const incompleteOverdue = incompleteEvals.filter(e => daysSince(e.eval_date) > 7);

  const getDisplayItems = (): EvalWithClient[] => {
    switch (tab) {
      case 'incomplete':
        return incompleteEvals.filter(matchesSearch);
      case 'recerts':
        return recerts.filter(matchesSearch);
      case 'all':
        return allEvals.filter(matchesSearch);
    }
  };

  const displayItems = getDisplayItems();

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-[var(--color-text-secondary)]">Loading evaluations...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            className="btn-ghost p-2"
            onClick={() => navigate('/')}
            title="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <ClipboardList className="w-6 h-6" style={{ color: sectionColor.color }} />
              Evals &amp; Recertifications
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-1">
              Evaluations and reassessments that need your attention
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-all hover:border-teal-300"
          onClick={() => setTab('incomplete')}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-50">
              <PenLine size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{incompleteEvals.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Incomplete Evals</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">Unsigned drafts</p>
            </div>
          </div>
        </div>
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-all hover:border-teal-300"
          onClick={() => setTab('incomplete')}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-50">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{incompleteOverdue.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Overdue</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">More than 7 days old</p>
            </div>
          </div>
        </div>
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-all hover:border-teal-300"
          onClick={() => setTab('recerts')}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50">
              <RefreshCw size={20} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{recerts.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Recertifications</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">Reassessment evals</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'incomplete' as TabFilter, label: 'Incomplete', count: incompleteEvals.length },
            { key: 'recerts' as TabFilter, label: 'Recertifications', count: recerts.length },
            { key: 'all' as TabFilter, label: 'All Evals', count: allEvals.length },
          ]).map((t) => (
            <button
              key={t.key}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-white text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            className="input pl-8 w-64"
            placeholder="Search by client or date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Evals List */}
      <div className="card overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          <span>Client</span>
          <span>Eval Date</span>
          <span>Discipline</span>
          <span>Type</span>
          <span>Status</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--color-border)]">
          {displayItems.length === 0 ? (
            <div className="px-5 py-12 text-center text-[var(--color-text-secondary)] text-sm">
              {tab === 'incomplete'
                ? 'No incomplete evaluations. All caught up! 🎉'
                : tab === 'recerts'
                ? 'No recertification evals found.'
                : 'No evaluations found matching your criteria.'}
            </div>
          ) : (
            displayItems.map((evalItem) => {
              const daysOld = daysSince(evalItem.eval_date);
              const isSigned = Boolean(evalItem.signed_at);
              const isOverdue = !isSigned && daysOld > 7;
              return (
                <div
                  key={evalItem.id}
                  className={`grid grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center ${isOverdue ? 'bg-red-50/30' : ''}`}
                  onClick={() =>
                    navigate(`/clients/${evalItem.client_id}/eval/${evalItem.id}`)
                  }
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {evalItem.first_name} {evalItem.last_name}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
                      {getContentPreview(evalItem.content)}
                    </p>
                  </div>
                  <div className="text-sm text-[var(--color-text)]">
                    {formatDate(evalItem.eval_date)}
                    {isOverdue && (
                      <p className="text-[10px] text-red-500 font-medium">{daysOld}d old</p>
                    )}
                  </div>
                  <div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      evalItem.client_discipline === 'PT' ? 'bg-blue-100 text-blue-700' :
                      evalItem.client_discipline === 'OT' ? 'bg-purple-100 text-purple-700' :
                      evalItem.client_discipline === 'ST' ? 'bg-teal-100 text-teal-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {evalItem.client_discipline || evalItem.discipline || '--'}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)] capitalize">
                    {evalItem.eval_type === 'reassessment' ? (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        Recert
                      </span>
                    ) : evalItem.eval_type === 'discharge' ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">
                        Discharge
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                        Initial
                      </span>
                    )}
                  </div>
                  <div>
                    {isSigned ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                        <CheckCircle size={12} />
                        Signed
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <PenLine size={12} />
                        {isOverdue ? 'Late' : 'Draft'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
