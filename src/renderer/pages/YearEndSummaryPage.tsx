import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, DollarSign, Car, Briefcase } from 'lucide-react';
import type { YearEndSummary } from '@shared/types';
import ProFeatureGate from '../components/ProFeatureGate';
import { useSectionColor } from '../hooks/useSectionColor';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function YearEndSummaryPage() {
  const sectionColor = useSectionColor();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<YearEndSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const summary = await window.api.reports.yearEndSummary(year);
        setData(summary);
      } catch (err) {
        console.error('Failed to load year-end summary:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year]);

  const handleExport = async (format: 'pdf' | 'csv') => {
    try {
      await window.api.reports.exportYearEnd(year, format);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  const totalEntityRevenue = data?.revenueByEntity.reduce((sum, e) => sum + e.total, 0) ?? 0;
  const totalRevenue = totalEntityRevenue + (data?.revenuePrivatePay ?? 0);

  const content = (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6" style={{ color: sectionColor.color }} />
            Year-End Summary
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Revenue and mileage summary for tax preparation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="select"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="btn-secondary btn-sm gap-1.5" onClick={() => handleExport('csv')}>
            <Download size={14} /> CSV
          </button>
          <button className="btn-primary btn-sm gap-1.5" onClick={() => handleExport('pdf')}>
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading summary...</div>
      ) : !data ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">No data available.</div>
      ) : (
        <div className="space-y-6">
          {/* Revenue Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={18} className="text-green-500" />
                <p className="text-xs text-[var(--color-text-secondary)]">Total Revenue</p>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase size={18} className="text-blue-500" />
                <p className="text-xs text-[var(--color-text-secondary)]">Entity Revenue</p>
              </div>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalEntityRevenue)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={18} className="text-purple-500" />
                <p className="text-xs text-[var(--color-text-secondary)]">Private Pay Revenue</p>
              </div>
              <p className="text-2xl font-bold text-purple-600">{formatCurrency(data.revenuePrivatePay)}</p>
            </div>
          </div>

          {/* Revenue by Entity */}
          {data.revenueByEntity.length > 0 && (
            <div className="card p-5">
              <h3 className="section-title mb-3">Revenue by Entity</h3>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="table-header">Entity</th>
                      <th className="table-header text-right">Revenue</th>
                      <th className="table-header text-right">Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenueByEntity.map((entry) => {
                      const visits = data.visitsByEntity.find((v) => v.entity_id === entry.entity_id);
                      return (
                        <tr key={entry.entity_id} className="border-b border-[var(--color-border)] last:border-b-0">
                          <td className="table-cell font-medium">{entry.entity_name}</td>
                          <td className="table-cell text-right">{formatCurrency(entry.total)}</td>
                          <td className="table-cell text-right text-[var(--color-text-secondary)]">{visits?.count ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mileage Summary */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <Car size={16} className="text-[var(--color-primary)]" />
              Mileage Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-[var(--color-bg)]">
                <p className="text-xs text-[var(--color-text-secondary)]">Total Miles</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{data.totalMileage.toFixed(1)}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-bg)]">
                <p className="text-xs text-[var(--color-text-secondary)]">Reimbursed Miles</p>
                <p className="text-xl font-bold text-green-600">{data.reimbursedMileage.toFixed(1)}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-bg)]">
                <p className="text-xs text-[var(--color-text-secondary)]">Tax Deductible Miles</p>
                <p className="text-xl font-bold text-blue-600">{data.deductibleMileage.toFixed(1)}</p>
              </div>
            </div>
          </div>

          {/* Visits by Entity */}
          {data.visitsByEntity.length > 0 && (
            <div className="card p-5">
              <h3 className="section-title mb-3">Visits by Entity</h3>
              <div className="space-y-2">
                {data.visitsByEntity.map((entry) => (
                  <div key={entry.entity_id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg)]">
                    <span className="text-sm font-medium text-[var(--color-text)]">{entry.entity_name}</span>
                    <span className="text-sm text-[var(--color-text-secondary)]">{entry.count} visits</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <ProFeatureGate feature="tax_summary">
      {content}
    </ProFeatureGate>
  );
}
