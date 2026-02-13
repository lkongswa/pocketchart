/**
 * csvPaymentImport.ts — Backend logic for CSV payment import.
 * Handles parsing, client matching, duplicate detection, and batch insert.
 */

import Papa from 'papaparse';
import fs from 'fs';
import {
  parseAmount,
  parseDate,
  splitName,
  normalizeName,
  inferPaymentMethod,
  autoDetectColumns as autoDetectColumnsFn,
} from '../shared/csvParsingUtils';
import type { PaymentMethod } from '../shared/types';

// ── Types ──

export interface CSVParseResult {
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
  fileSizeBytes: number;
  delimiter: string;
}

export interface CSVColumnMapping {
  dateColumn: string;
  amountColumn: string;
  clientNameColumn?: string;
  clientFirstNameColumn?: string;
  clientLastNameColumn?: string;
  methodColumn?: string;
  referenceColumn?: string;
  notesColumn?: string;
}

export interface CSVClientMatch {
  csvName: string;
  paymentCount: number;
  totalAmount: number;
  suggestedClientId: number | null;
  suggestedClientName: string | null;
  matchConfidence: 'exact' | 'high' | 'partial' | 'none';
  allCandidates: Array<{ clientId: number; clientName: string; confidence: string }>;
}

export interface CSVPaymentRow {
  rowIndex: number;
  paymentDate: string;
  amount: number;
  csvName: string;
  clientId: number | null;
  clientName: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  notes: string;
  isDuplicate: boolean;
  skipReason: string | null;
}

export interface CSVImportResult {
  imported: number;
  skipped: number;
  duplicatesSkipped: number;
  totalAmount: number;
  errors: string[];
  importTag: string;
}

// ── Parse CSV File ──

export function parseCSVFile(filePath: string): CSVParseResult {
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 10MB.');
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`Could not parse CSV: ${result.errors[0]?.message || 'Unknown error'}`);
  }

  const headers = result.meta.fields || [];
  const previewRows = result.data.slice(0, 5);
  const delimiter = result.meta.delimiter || ',';

  return {
    headers,
    previewRows,
    totalRows: result.data.length,
    fileSizeBytes: stats.size,
    delimiter,
  };
}

// ── Auto-Detect Columns ──

export function autoDetectColumns(headers: string[]) {
  return autoDetectColumnsFn(headers);
}

// ── Client Matching ──

export function matchClients(
  filePath: string,
  mapping: CSVColumnMapping,
  clients: Array<{ id: number; first_name: string; last_name: string }>
): CSVClientMatch[] {
  // Parse entire file to get unique names with counts
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h: string) => h.trim(),
  });

  // Build unique name map with counts + totals
  const nameMap = new Map<string, { count: number; total: number }>();
  for (const row of parsed.data) {
    let rawName = '';
    if (mapping.clientNameColumn) {
      rawName = (row[mapping.clientNameColumn] || '').trim();
    } else if (mapping.clientFirstNameColumn && mapping.clientLastNameColumn) {
      const f = (row[mapping.clientFirstNameColumn] || '').trim();
      const l = (row[mapping.clientLastNameColumn] || '').trim();
      rawName = `${f} ${l}`.trim();
    }
    if (!rawName) continue;

    const amount = parseAmount(row[mapping.amountColumn] || '') || 0;
    const existing = nameMap.get(rawName) || { count: 0, total: 0 };
    existing.count++;
    existing.total += amount;
    nameMap.set(rawName, existing);
  }

  // Match each unique name
  const results: CSVClientMatch[] = [];
  for (const [csvName, { count, total }] of nameMap) {
    const match = findBestMatch(csvName, clients);
    results.push({
      csvName,
      paymentCount: count,
      totalAmount: Math.round(total * 100) / 100,
      suggestedClientId: match.clientId,
      suggestedClientName: match.clientName,
      matchConfidence: match.confidence,
      allCandidates: match.allCandidates,
    });
  }

  // Sort: unmatched first so they're visible, then by name
  results.sort((a, b) => {
    const confOrder = { none: 0, partial: 1, high: 2, exact: 3 };
    const diff = confOrder[a.matchConfidence] - confOrder[b.matchConfidence];
    if (diff !== 0) return diff;
    return a.csvName.localeCompare(b.csvName);
  });

  return results;
}

function findBestMatch(
  csvName: string,
  clients: Array<{ id: number; first_name: string; last_name: string }>
): { clientId: number | null; clientName: string | null; confidence: 'exact' | 'high' | 'partial' | 'none'; allCandidates: Array<{ clientId: number; clientName: string; confidence: string }> } {
  const normalizedCsv = normalizeName(csvName);
  const { first: csvFirst, last: csvLast } = splitName(csvName);
  const normalizedCsvFirst = normalizeName(csvFirst);
  const normalizedCsvLast = normalizeName(csvLast);

  const candidates: Array<{ clientId: number; clientName: string; confidence: 'exact' | 'high' | 'partial' }> = [];

  for (const client of clients) {
    const fullName = normalizeName(`${client.first_name} ${client.last_name}`);
    const cFirst = normalizeName(client.first_name);
    const cLast = normalizeName(client.last_name);

    // Tier 1: Exact match "First Last" === "First Last"
    if (normalizedCsv === fullName) {
      candidates.push({ clientId: client.id, clientName: `${client.first_name} ${client.last_name}`, confidence: 'exact' });
      continue;
    }

    // Tier 2: Reverse match — CSV "Last, First" parsed → matches "First Last"
    if (normalizedCsvFirst && normalizedCsvLast) {
      if (normalizeName(csvFirst) === cFirst && normalizeName(csvLast) === cLast) {
        candidates.push({ clientId: client.id, clientName: `${client.first_name} ${client.last_name}`, confidence: 'exact' });
        continue;
      }
      // Also try swapped (CSV might be "Last First" without comma)
      if (normalizedCsvFirst === cLast && normalizedCsvLast === cFirst) {
        candidates.push({ clientId: client.id, clientName: `${client.first_name} ${client.last_name}`, confidence: 'exact' });
        continue;
      }
    }

    // Tier 3: Partial — last name exact + first initial matches
    if (cLast && normalizedCsvLast === cLast && normalizedCsvFirst && cFirst) {
      if (normalizedCsvFirst[0] === cFirst[0]) {
        candidates.push({ clientId: client.id, clientName: `${client.first_name} ${client.last_name}`, confidence: 'high' });
        continue;
      }
    }

    // Tier 4: Fuzzy — CSV contains both first and last name parts
    if (cFirst && cLast && normalizedCsv.includes(cFirst) && normalizedCsv.includes(cLast)) {
      candidates.push({ clientId: client.id, clientName: `${client.first_name} ${client.last_name}`, confidence: 'partial' });
    }
  }

  // Sort: exact > high > partial
  const confPriority = { exact: 0, high: 1, partial: 2 };
  candidates.sort((a, b) => confPriority[a.confidence] - confPriority[b.confidence]);

  const best = candidates[0] || null;
  return {
    clientId: best?.clientId || null,
    clientName: best?.clientName || null,
    confidence: best?.confidence || 'none',
    allCandidates: candidates.map(c => ({ clientId: c.clientId, clientName: c.clientName, confidence: c.confidence })),
  };
}

// ── Prepare Rows for Import ──

export function prepareImportRows(
  filePath: string,
  mapping: CSVColumnMapping,
  clientMatchMap: Record<string, number>,  // csvName → clientId (only confirmed matches)
  db: any,
  fixedClientId?: number
): CSVPaymentRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h: string) => h.trim(),
  });

  // Prepare duplicate check statement
  const dupStmt = db.prepare(
    `SELECT id FROM payments WHERE client_id = ? AND payment_date = ? AND amount = ? AND deleted_at IS NULL LIMIT 1`
  );

  const rows: CSVPaymentRow[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];

    // Parse date
    const rawDate = row[mapping.dateColumn] || '';
    const paymentDate = parseDate(rawDate);
    if (!paymentDate) {
      rows.push(makeSkipRow(i, row, mapping, 'Unparseable date'));
      continue;
    }

    // Parse amount
    const rawAmount = row[mapping.amountColumn] || '';
    const amount = parseAmount(rawAmount);
    if (amount === null) {
      rows.push(makeSkipRow(i, row, mapping, 'Unparseable amount'));
      continue;
    }
    if (amount === 0) {
      rows.push(makeSkipRow(i, row, mapping, 'Zero amount'));
      continue;
    }

    // Resolve client
    let csvName = '';
    if (mapping.clientNameColumn) {
      csvName = (row[mapping.clientNameColumn] || '').trim();
    } else if (mapping.clientFirstNameColumn && mapping.clientLastNameColumn) {
      const f = (row[mapping.clientFirstNameColumn] || '').trim();
      const l = (row[mapping.clientLastNameColumn] || '').trim();
      csvName = `${f} ${l}`.trim();
    }

    let clientId: number | null = fixedClientId || null;
    let clientName = csvName;

    if (!fixedClientId) {
      if (!csvName) {
        rows.push(makeSkipRow(i, row, mapping, 'No client name'));
        continue;
      }
      clientId = clientMatchMap[csvName] ?? null;
      if (!clientId) {
        rows.push({
          rowIndex: i,
          paymentDate,
          amount,
          csvName,
          clientId: null,
          clientName: csvName,
          paymentMethod: inferPaymentMethod(mapping.methodColumn ? (row[mapping.methodColumn] || '') : ''),
          referenceNumber: mapping.referenceColumn ? (row[mapping.referenceColumn] || '').trim() : '',
          notes: mapping.notesColumn ? (row[mapping.notesColumn] || '').trim() : '',
          isDuplicate: false,
          skipReason: 'No client match',
        });
        continue;
      }
    }

    // Payment method
    const paymentMethod = inferPaymentMethod(mapping.methodColumn ? (row[mapping.methodColumn] || '') : '');

    // Reference number
    const referenceNumber = mapping.referenceColumn ? (row[mapping.referenceColumn] || '').trim() : '';

    // Notes
    const notes = mapping.notesColumn ? (row[mapping.notesColumn] || '').trim() : '';

    // Duplicate check
    let isDuplicate = false;
    if (clientId) {
      const dup = dupStmt.get(clientId, paymentDate, amount);
      isDuplicate = !!dup;
    }

    rows.push({
      rowIndex: i,
      paymentDate,
      amount,
      csvName,
      clientId,
      clientName,
      paymentMethod,
      referenceNumber,
      notes,
      isDuplicate,
      skipReason: null,
    });
  }

  return rows;
}

function makeSkipRow(index: number, row: Record<string, string>, mapping: CSVColumnMapping, reason: string): CSVPaymentRow {
  let csvName = '';
  if (mapping.clientNameColumn) {
    csvName = (row[mapping.clientNameColumn] || '').trim();
  } else if (mapping.clientFirstNameColumn && mapping.clientLastNameColumn) {
    csvName = `${(row[mapping.clientFirstNameColumn] || '')} ${(row[mapping.clientLastNameColumn] || '')}`.trim();
  }

  return {
    rowIndex: index,
    paymentDate: '',
    amount: 0,
    csvName,
    clientId: null,
    clientName: csvName,
    paymentMethod: 'other',
    referenceNumber: '',
    notes: '',
    isDuplicate: false,
    skipReason: reason,
  };
}

// ── Execute Import ──

export function executeImport(
  rows: CSVPaymentRow[],
  db: any,
  skipDuplicates: boolean
): CSVImportResult {
  const importTag = `[CSV Import ${new Date().toISOString().slice(0, 10)}]`;
  const importable = rows.filter(r => {
    if (r.skipReason) return false;
    if (r.isDuplicate && skipDuplicates) return false;
    if (!r.clientId) return false;
    return true;
  });

  const skipped = rows.length - importable.length;
  const duplicatesSkipped = skipDuplicates ? rows.filter(r => r.isDuplicate && !r.skipReason).length : 0;

  if (importable.length === 0) {
    return {
      imported: 0,
      skipped,
      duplicatesSkipped,
      totalAmount: 0,
      errors: [],
      importTag,
    };
  }

  const errors: string[] = [];
  let imported = 0;
  let totalAmount = 0;

  const insertPayment = db.prepare(`
    INSERT INTO payments (client_id, invoice_id, payment_date, amount, payment_method, reference_number, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, new_values, client_id, amount, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const batchInsert = db.transaction(() => {
    for (const row of importable) {
      try {
        const notesWithTag = row.notes ? `${importTag} ${row.notes}` : importTag;
        const result = insertPayment.run(
          row.clientId,
          null, // invoice_id — not matched in this flow
          row.paymentDate,
          row.amount,
          row.paymentMethod,
          row.referenceNumber,
          notesWithTag
        );

        // Audit log for each payment
        insertAudit.run(
          'payment',
          result.lastInsertRowid,
          'csv_import',
          JSON.stringify({ source: 'csv_import', csv_row: row.rowIndex, csv_name: row.csvName }),
          row.clientId,
          row.amount,
          `Payment imported from CSV: $${row.amount.toFixed(2)} via ${row.paymentMethod}`
        );

        imported++;
        totalAmount += row.amount;
      } catch (err: any) {
        errors.push(`Row ${row.rowIndex + 1}: ${err.message}`);
      }
    }
  });

  batchInsert();

  return {
    imported,
    skipped,
    duplicatesSkipped,
    totalAmount: Math.round(totalAmount * 100) / 100,
    errors,
    importTag,
  };
}
