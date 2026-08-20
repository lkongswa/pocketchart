// Shared loaders for the Dashboard To-Do dropdowns: the individual work items
// (unsigned notes, incomplete evals, appointments missing a note) with routes
// that can be opened in-window or in pop-out windows (window.api.appWindows.open).
// Mirrors the logic in NotesOverviewPage / EvalsQueuePage.

import type { Appointment, Client, UnifiedNote } from '@shared/types';

export interface WorkItem {
  key: string;
  label: string;
  sub?: string;
  route: string;
  late?: boolean;
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function loadUnsignedNoteItems(): Promise<WorkItem[]> {
  const unified: UnifiedNote[] = await window.api.notes.listAll();
  return unified
    .filter((n) => !n.signed_at)
    .map((n) => {
      const late = daysSince(n.date_of_service) > 2;
      if (n.source_type === 'contractor') {
        return {
          key: `note-${n.id}`,
          label: (n.contractor_patient_name || n.patient_name || 'Unknown patient').trim(),
          sub: [n.entity_name, fmtDate(n.date_of_service)].filter(Boolean).join(' · '),
          route: `/contractor-note/${n.id}`,
          late,
        };
      }
      return {
        key: `note-${n.id}`,
        label: `${n.client_first_name || ''} ${n.client_last_name || ''}`.trim() || 'Unknown client',
        sub: fmtDate(n.date_of_service),
        route: `/clients/${n.client_id}/note/${n.id}`,
        late,
      };
    });
}

export async function loadIncompleteEvalItems(): Promise<WorkItem[]> {
  const evals: any[] = await window.api.evaluations.listIncomplete();
  return evals.map((e) => ({
    key: `eval-${e.id}`,
    label: `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unknown client',
    sub: fmtDate(e.eval_date),
    route: `/clients/${e.client_id}/eval/${e.id}`,
    late: daysSince(e.eval_date) > 2,
  }));
}

/** Completed/past appointments (last 30 days) with no note started yet. */
export async function loadMissingNoteItems(): Promise<WorkItem[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const today = new Date();
  const appts: Appointment[] = await window.api.appointments.list({
    startDate: thirtyDaysAgo.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
  });
  const clients: Client[] = await window.api.clients.list().catch(() => []);
  const clientMap = new Map<number, Client>();
  clients.forEach((c) => clientMap.set(c.id, c));

  const out: WorkItem[] = [];
  for (const appt of appts) {
    if (appt.status === 'cancelled') continue;
    if (appt.note_id) continue;
    if (new Date(appt.scheduled_date + 'T00:00:00') > today) continue;
    const late = daysSince(appt.scheduled_date) > 2;
    if (appt.entity_id) {
      // Entities whose docs live outside PocketChart don't owe notes here.
      if ((appt as any).entity_requires_notes === 0) continue;
      out.push({
        key: `appt-${appt.id}`,
        label: ((appt as any).patient_name || (appt as any).contractor_patient_name || 'Unknown patient').trim(),
        sub: [(appt as any).entity_name, fmtDate(appt.scheduled_date)].filter(Boolean).join(' · '),
        route: `/contractor-note/new?appointmentId=${appt.id}`,
        late,
      });
    } else {
      const client = clientMap.get(appt.client_id);
      if (!client) continue;
      out.push({
        key: `appt-${appt.id}`,
        label: `${client.first_name} ${client.last_name}`,
        sub: fmtDate(appt.scheduled_date),
        // NoteFormPage reads ?appointmentId= as a query fallback, so this works
        // in pop-out windows too (no router state available there).
        route: `/clients/${client.id}/note/new?appointmentId=${appt.id}`,
        late,
      });
    }
  }
  return out;
}
