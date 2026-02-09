import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  addMonths,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { useNavigate, useLocation } from 'react-router-dom';
import { Copy, Clipboard, Edit3, Trash2, X, Ban, AlertTriangle } from 'lucide-react';
import type { Appointment, Invoice, InvoiceItem } from '../../shared/types';
import type { PaymentIndicator } from '../components/calendar/AppointmentBlock';
import AppointmentModal from '../components/AppointmentModal';
import TrialExpiredModal from '../components/TrialExpiredModal';
import { useTrialGuard } from '../hooks/useTrialGuard';
import CalendarToolbar from '../components/calendar/CalendarToolbar';
import DayView from '../components/calendar/DayView';
import WeekView from '../components/calendar/WeekView';
import MonthView from '../components/calendar/MonthView';

type CalendarView = 'day' | 'week' | 'month';

// Clipboard data for copy/paste
interface ClipboardAppointment {
  client_id: number;
  entity_id?: number | null;
  entity_rate?: number | null;
  duration_minutes: number;
  status: string;
  clientName: string;
}

// Context menu state
interface ContextMenu {
  x: number;
  y: number;
  appointment: Appointment;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { guardAction, showExpiredModal, dismissExpiredModal } = useTrialGuard();
  const routeState = (location.state as { date?: string; view?: CalendarView }) || {};
  const [currentView, setCurrentView] = useState<CalendarView>(routeState.view || 'week');
  const [currentDate, setCurrentDate] = useState(() => {
    if (routeState.date) return new Date(routeState.date + 'T00:00:00');
    return new Date();
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusMap, setPaymentStatusMap] = useState<Record<number, PaymentIndicator>>({});

  // Copy/paste state
  const [clipboardAppt, setClipboardAppt] = useState<ClipboardAppointment | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Compute date range based on current view
  const getDateRange = useCallback((): { startDate: string; endDate: string } => {
    switch (currentView) {
      case 'day': {
        const dayStr = format(currentDate, 'yyyy-MM-dd');
        return { startDate: dayStr, endDate: dayStr };
      }
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        return { startDate: format(ws, 'yyyy-MM-dd'), endDate: format(we, 'yyyy-MM-dd') };
      }
      case 'month': {
        const ms = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        const me = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
        return { startDate: format(ms, 'yyyy-MM-dd'), endDate: format(me, 'yyyy-MM-dd') };
      }
    }
  }, [currentView, currentDate]);

  const loadAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const result = await window.api.appointments.list({ startDate, endDate });
      setAppointments(result);

      // Build payment status map for completed appointments
      const statusMap: Record<number, PaymentIndicator> = {};
      const completedWithNotes = result.filter(a => a.note_id && a.status === 'completed');
      if (completedWithNotes.length > 0) {
        try {
          const invoices = await window.api.invoices.list({ startDate, endDate });
          // Build a set of note_ids that have paid invoices vs unpaid
          const notePaymentStatus = new Map<number, 'paid' | 'unpaid'>();
          for (const inv of invoices) {
            try {
              const full = await window.api.invoices.get(inv.id);
              for (const item of full.items) {
                if (item.note_id) {
                  if (inv.status === 'paid') {
                    notePaymentStatus.set(item.note_id, 'paid');
                  } else if (!notePaymentStatus.has(item.note_id)) {
                    notePaymentStatus.set(item.note_id, 'unpaid');
                  }
                }
              }
            } catch {}
          }
          for (const appt of completedWithNotes) {
            if (appt.note_id && notePaymentStatus.has(appt.note_id)) {
              statusMap[appt.id] = notePaymentStatus.get(appt.note_id)!;
            } else if (appt.note_id) {
              // Has a note but no invoice yet — mark as unpaid
              statusMap[appt.id] = 'unpaid';
            }
          }
        } catch {
          // Invoice lookup failed — don't show indicators
        }
      }
      setPaymentStatusMap(statusMap);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Navigation
  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const delta = direction === 'prev' ? -1 : 1;
    switch (currentView) {
      case 'day':
        setCurrentDate((d) => addDays(d, delta));
        break;
      case 'week':
        setCurrentDate((d) => addWeeks(d, delta));
        break;
      case 'month':
        setCurrentDate((d) => addMonths(d, delta));
        break;
    }
  };

  // Date label
  const getDateLabel = (): string => {
    switch (currentView) {
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(ws, 'MMM d')} - ${format(we, 'MMM d, yyyy')}`;
      }
      case 'month':
        return format(currentDate, 'MMMM yyyy');
    }
  };

  // Search filter
  const filteredAppointments = searchQuery.trim()
    ? appointments.filter((appt) => {
        const fullName = `${appt.first_name || ''} ${appt.last_name || ''}`.toLowerCase();
        return fullName.includes(searchQuery.toLowerCase());
      })
    : appointments;

  // Appointment click
  const handleAppointmentClick = (appt: Appointment) => {
    if (appt.status === 'completed' && appt.note_id) {
      navigate(`/clients/${appt.client_id}/note/${appt.note_id}`);
    } else if (appt.status === 'completed' || appt.status === 'scheduled') {
      navigate(`/clients/${appt.client_id}/note/new`, {
        state: {
          appointmentDate: appt.scheduled_date,
          appointmentTime: appt.scheduled_time,
          appointmentDuration: appt.duration_minutes,
        },
      });
    }
  };

  // Add appointment (from button)
  const handleAddAppointment = () => {
    if (!guardAction()) return;
    setEditingAppointment(null);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setModalOpen(true);
  };

  // Slot click on time grid
  const handleSlotClick = (date: string, time: string) => {
    if (!guardAction()) return;
    setEditingAppointment(null);
    setSelectedDate(date);
    setSelectedTime(time);
    setModalOpen(true);
  };

  // Save appointment
  const handleSaveAppointment = async (data: Partial<Appointment>) => {
    if (editingAppointment) {
      await window.api.appointments.update(editingAppointment.id, data);
    } else {
      await window.api.appointments.create(data);
    }
    await loadAppointments();
  };

  // Drag and drop
  const handleAppointmentDrop = async (apptId: number, newDate: string, newTime?: string) => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt) return;

    const updateData: Partial<Appointment> = {
      client_id: appt.client_id,
      scheduled_date: newDate,
      scheduled_time: newTime || appt.scheduled_time,
      duration_minutes: appt.duration_minutes,
      status: appt.status,
    };

    await window.api.appointments.update(apptId, updateData);
    await loadAppointments();
  };

  // Batch save for recurring appointments
  const handleSaveBatch = async (items: Partial<Appointment>[]) => {
    await window.api.appointments.createBatch(items);
    await loadAppointments();
  };

  // Context menu for appointments
  const handleAppointmentContextMenu = useCallback((appt: Appointment, x: number, y: number) => {
    setContextMenu({ x, y, appointment: appt });
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Copy appointment to clipboard
  const handleCopyAppointment = (appt: Appointment) => {
    const clientName = appt.entity_name
      ? appt.entity_name
      : `${appt.first_name || 'Unknown'} ${appt.last_name || ''}`.trim();
    setClipboardAppt({
      client_id: appt.client_id,
      entity_id: appt.entity_id,
      entity_rate: appt.entity_rate,
      duration_minutes: appt.duration_minutes,
      status: 'scheduled',
      clientName,
    });
    setContextMenu(null);
  };

  // Edit appointment from context menu
  const handleEditAppointment = (appt: Appointment) => {
    setEditingAppointment(appt);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setModalOpen(true);
    setContextMenu(null);
  };

  // Delete appointment from context menu
  const handleDeleteAppointment = async (appt: Appointment) => {
    setContextMenu(null);
    if (window.confirm(`Delete appointment for ${appt.first_name || appt.entity_name || 'this client'}?`)) {
      await window.api.appointments.delete(appt.id);
      await loadAppointments();
    }
  };

  // Cancel appointment with optional late cancel fee
  const handleCancelAppointment = async (appt: Appointment) => {
    setContextMenu(null);
    const name = appt.first_name || appt.entity_name || 'this client';
    if (!window.confirm(`Mark appointment for ${name} as cancelled?`)) return;

    await window.api.appointments.update(appt.id, {
      ...appt,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      late_cancel: true,
    });

    // Check for late cancel fee setting
    try {
      const feeStr = await window.api.settings.get('late_cancel_fee');
      const fee = parseFloat(feeStr || '0');
      if (fee > 0) {
        const charge = window.confirm(`Charge late cancellation fee of $${fee.toFixed(2)}?`);
        if (charge) {
          await window.api.invoices.createFeeInvoice({
            client_id: appt.client_id || undefined,
            entity_id: appt.entity_id || undefined,
            description: 'Late Cancellation Fee',
            amount: fee,
            service_date: appt.scheduled_date,
          });
        }
      }
    } catch {}
    await loadAppointments();
  };

  // No-show with optional fee
  const handleNoShow = async (appt: Appointment) => {
    setContextMenu(null);
    const name = appt.first_name || appt.entity_name || 'this client';
    if (!window.confirm(`Mark appointment for ${name} as no-show?`)) return;

    await window.api.appointments.update(appt.id, {
      ...appt,
      status: 'no-show',
    });

    // Check for no-show fee setting
    try {
      const feeStr = await window.api.settings.get('no_show_fee');
      const fee = parseFloat(feeStr || '0');
      if (fee > 0) {
        const charge = window.confirm(`Charge no-show fee of $${fee.toFixed(2)}?`);
        if (charge) {
          await window.api.invoices.createFeeInvoice({
            client_id: appt.client_id || undefined,
            entity_id: appt.entity_id || undefined,
            description: 'No-Show Fee',
            amount: fee,
            service_date: appt.scheduled_date,
          });
        }
      }
    } catch {}
    await loadAppointments();
  };

  // Paste appointment on slot click (override normal slot click when clipboard has data)
  const handleSlotClickWithPaste = (date: string, time: string) => {
    if (clipboardAppt) {
      // Paste the copied appointment at this slot
      const pasteData: Partial<Appointment> = {
        client_id: clipboardAppt.client_id,
        entity_id: clipboardAppt.entity_id,
        entity_rate: clipboardAppt.entity_rate,
        duration_minutes: clipboardAppt.duration_minutes,
        scheduled_date: date,
        scheduled_time: time,
        status: 'scheduled',
      };
      window.api.appointments.create(pasteData).then(() => loadAppointments());
      return;
    }
    // Normal slot click behavior
    handleSlotClick(date, time);
  };

  // Day click in month view
  const handleDayClick = (day: Date) => {
    setCurrentDate(day);
    setCurrentView('day');
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

  return (
    <div className="p-6 h-screen flex flex-col">
      <CalendarToolbar
        currentView={currentView}
        onViewChange={setCurrentView}
        currentDate={currentDate}
        onNavigate={handleNavigate}
        dateLabel={getDateLabel()}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddAppointment={handleAddAppointment}
      />

      {/* Clipboard indicator */}
      {clipboardAppt && (
        <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <Clipboard size={12} />
          <span className="font-medium">Copied:</span> {clipboardAppt.clientName} ({clipboardAppt.duration_minutes}min)
          <span className="text-blue-500">— Click any time slot to paste</span>
          <button
            className="ml-auto p-0.5 rounded hover:bg-blue-100 transition-colors"
            onClick={() => setClipboardAppt(null)}
            title="Clear clipboard"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden mt-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[var(--color-text-secondary)]">Loading appointments...</div>
          </div>
        ) : currentView === 'day' ? (
          <DayView
            date={currentDate}
            appointments={filteredAppointments}
            onSlotClick={handleSlotClickWithPaste}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentDrop={handleAppointmentDrop}
            onAppointmentContextMenu={handleAppointmentContextMenu}
            paymentStatusMap={paymentStatusMap}
          />
        ) : currentView === 'week' ? (
          <WeekView
            weekStart={weekStart}
            appointments={filteredAppointments}
            onSlotClick={handleSlotClickWithPaste}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentDrop={handleAppointmentDrop}
            onAppointmentContextMenu={handleAppointmentContextMenu}
            paymentStatusMap={paymentStatusMap}
          />
        ) : (
          <MonthView
            currentDate={currentDate}
            appointments={filteredAppointments}
            onDayClick={handleDayClick}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentDrop={(apptId, newDate) => handleAppointmentDrop(apptId, newDate)}
            paymentStatusMap={paymentStatusMap}
          />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-[var(--color-border)] py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
            onClick={() => handleCopyAppointment(contextMenu.appointment)}
          >
            <Copy size={14} /> Copy Appointment
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
            onClick={() => handleEditAppointment(contextMenu.appointment)}
          >
            <Edit3 size={14} /> Edit
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          {contextMenu.appointment.status === 'scheduled' && (
            <>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 text-amber-700 flex items-center gap-2 transition-colors"
                onClick={() => handleCancelAppointment(contextMenu.appointment)}
              >
                <Ban size={14} /> Late Cancel
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 text-orange-700 flex items-center gap-2 transition-colors"
                onClick={() => handleNoShow(contextMenu.appointment)}
              >
                <AlertTriangle size={14} /> No-Show
              </button>
            </>
          )}
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
            onClick={() => handleDeleteAppointment(contextMenu.appointment)}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      <AppointmentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={handleSaveAppointment}
        onSaveBatch={handleSaveBatch}
        appointment={editingAppointment}
        defaultDate={selectedDate}
        defaultTime={selectedTime}
      />

      {/* Trial Expired Modal */}
      {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}
    </div>
  );
}
