import React, { useState, useEffect, useCallback } from 'react';
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
import { useNavigate } from 'react-router-dom';
import type { Appointment, Invoice, InvoiceItem } from '../../shared/types';
import type { PaymentIndicator } from '../components/calendar/AppointmentBlock';
import AppointmentModal from '../components/AppointmentModal';
import CalendarToolbar from '../components/calendar/CalendarToolbar';
import DayView from '../components/calendar/DayView';
import WeekView from '../components/calendar/WeekView';
import MonthView from '../components/calendar/MonthView';

type CalendarView = 'day' | 'week' | 'month';

export default function CalendarPage() {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusMap, setPaymentStatusMap] = useState<Record<number, PaymentIndicator>>({});

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
      navigate(`/clients/${appt.client_id}/note/new`);
    }
  };

  // Add appointment (from button)
  const handleAddAppointment = () => {
    setEditingAppointment(null);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setModalOpen(true);
  };

  // Slot click on time grid
  const handleSlotClick = (date: string, time: string) => {
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

      <div className="flex-1 overflow-hidden mt-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[var(--color-text-secondary)]">Loading appointments...</div>
          </div>
        ) : currentView === 'day' ? (
          <DayView
            date={currentDate}
            appointments={filteredAppointments}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentDrop={handleAppointmentDrop}
            paymentStatusMap={paymentStatusMap}
          />
        ) : currentView === 'week' ? (
          <WeekView
            weekStart={weekStart}
            appointments={filteredAppointments}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
            onAppointmentDrop={handleAppointmentDrop}
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

      <AppointmentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={handleSaveAppointment}
        appointment={editingAppointment}
        defaultDate={selectedDate}
        defaultTime={selectedTime}
      />
    </div>
  );
}
