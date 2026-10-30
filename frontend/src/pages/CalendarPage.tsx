import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Grid,
} from "lucide-react";
import { api } from "../api/client";
import type { CalendarEvent, CalendarEventType } from "../api/types";
import { Reveal } from "../components/motion";

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "upcoming">("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Month bounds
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Load calendar events
  useEffect(() => {
    setLoading(true);
    // Fetch a 90-day window centered on current view
    const from = new Date(year, month - 1, 1).toISOString();
    const to = new Date(year, month + 2, 0).toISOString();

    api.calendarEvents(from, to)
      .then((res) => {
        setEvents(res);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, month]);

  // Navigate months
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Filter events
  const filteredEvents = useMemo(() => {
    if (filterType === "all") return events;
    return events.filter((e) => e.event_type === filterType);
  }, [events, filterType]);

  // Calendar matrix calculations
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Group events by day key "YYYY-MM-DD"
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((ev) => {
      const dayKey = ev.event_date.split("T")[0];
      if (dayKey) {
        if (!map[dayKey]) map[dayKey] = [];
        map[dayKey].push(ev);
      }
    });
    return map;
  }, [filteredEvents]);

  // Helper for event badge styling
  const getBadgeStyle = (type: CalendarEventType) => {
    switch (type) {
      case "trial_expiry":
        return "bg-bubblegum text-white border-bubblegum";
      case "cancellation_deadline":
        return "bg-tangerine text-ink border-ink";
      case "renewal":
        return "bg-sun text-ink border-ink";
      case "subscription_expiry":
        return "bg-neutral-200 text-neutral-800 border-neutral-400";
      default:
        return "bg-lagoon text-ink border-ink";
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Subscription Expiry & Renewal Calendar
            </span>
            <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">
              Renewal <span className="text-gradient">Calendar</span>
            </h1>
            <p className="mt-2 text-slate max-w-2xl text-base">
              Track upcoming renewal dates, free trial deadlines, and cancellation notice windows in one visual schedule.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to="/subscriptions" className="btn-sun px-4 py-2 text-sm font-bold shadow-soft">
              Manage Subscriptions
            </Link>
          </div>
        </header>
      </Reveal>

      {/* Control Bar: Month Switcher & Filters */}
      <Reveal delay={80}>
        <div className="card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-2xl border-2 border-ink bg-paper p-1 shadow-soft">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-xl hover:bg-neutral-200 text-ink"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="font-display text-base font-black px-3 min-w-[150px] text-center flex items-center justify-center gap-1.5">
                {monthNames[month]} {year}
                {loading && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-ink border-t-bubblegum" />}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-xl hover:bg-neutral-200 text-ink"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={goToToday}
              className="btn-white px-3 py-1.5 text-xs font-bold"
            >
              Today
            </button>
          </div>

          {/* Filter & View Mode */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border-2 border-ink bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode("month")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition ${
                  viewMode === "month" ? "bg-ink text-white shadow-lift" : "text-ink hover:bg-neutral-100"
                }`}
              >
                <Grid className="h-3.5 w-3.5" /> Month
              </button>
              <button
                type="button"
                onClick={() => setViewMode("upcoming")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition ${
                  viewMode === "upcoming" ? "bg-ink text-white shadow-lift" : "text-ink hover:bg-neutral-100"
                }`}
              >
                <List className="h-3.5 w-3.5" /> Upcoming List
              </button>
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-2xl border-2 border-ink bg-white px-3 py-1.5 text-xs font-bold shadow-soft"
            >
              <option value="all">All Events</option>
              <option value="renewal">Renewals</option>
              <option value="trial_expiry">Trial Expiries</option>
              <option value="cancellation_deadline">Cancellation Deadlines</option>
              <option value="subscription_expiry">Expirations</option>
            </select>
          </div>
        </div>
      </Reveal>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-ink/70">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-sun border border-ink" /> Renewal Charge
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-bubblegum border border-ink" /> Free Trial Expiry (Urgent)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-tangerine border border-ink" /> Cancellation Deadline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-neutral-300 border border-ink" /> Subscription Expiry
        </span>
      </div>

      {/* Main View: Month Grid or Upcoming List */}
      {viewMode === "month" ? (
        <Reveal delay={120}>
          <div className="overflow-hidden rounded-3xl border-3 border-ink bg-white shadow-lift">
            {/* Days of Week Header */}
            <div className="grid grid-cols-7 border-b-2 border-ink bg-neutral-100 font-display text-xs font-bold text-ink">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="p-3 text-center border-r border-ink/10 last:border-r-0">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-ink/10">
              {/* Previous month padding cells */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => {
                const dayNum = daysInPrevMonth - firstDayOfMonth + i + 1;
                return (
                  <div key={`prev-${i}`} className="min-h-[110px] p-2 bg-neutral-50/50 text-neutral-400">
                    <span className="font-mono text-xs">{dayNum}</span>
                  </div>
                );
              })}

              {/* Days of current month */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const dayEvents = eventsByDay[dStr] || [];
                const isToday =
                  new Date().toDateString() === new Date(year, month, dayNum).toDateString();

                return (
                  <div
                    key={`curr-${i}`}
                    className={`min-h-[110px] p-2 transition hover:bg-sun/5 flex flex-col justify-between ${
                      isToday ? "bg-sun/15 font-bold" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${
                          isToday ? "bg-ink text-white font-bold" : "text-ink"
                        }`}
                      >
                        {dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-bold text-ink/50">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Events pill container */}
                    <div className="mt-1 space-y-1 overflow-y-auto max-h-[80px]">
                      {dayEvents.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setSelectedEvent(ev)}
                          className={`w-full text-left truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold border transition shadow-soft ${getBadgeStyle(
                            ev.event_type,
                          )}`}
                          title={`${ev.title} - ${ev.description}`}
                        >
                          {ev.vendor_name}: {ev.event_type === "renewal" && ev.amount ? `₹${ev.amount.toFixed(0)}` : ev.event_type.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Next month padding cells to complete 7-column row */}
              {(() => {
                const totalCells = firstDayOfMonth + daysInMonth;
                const rem = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
                return Array.from({ length: rem }).map((_, i) => (
                  <div key={`next-${i}`} className="min-h-[110px] p-2 bg-neutral-50/50 text-neutral-400">
                    <span className="font-mono text-xs">{i + 1}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </Reveal>
      ) : (
        /* Upcoming Events Timeline List */
        <Reveal delay={120}>
          <div className="card p-6 space-y-4">
            <h2 className="font-display text-xl font-black text-ink flex items-center gap-2">
              <Clock className="h-5 w-5" /> Upcoming Scheduled Events
            </h2>

            {filteredEvents.length === 0 ? (
              <p className="text-sm italic text-slate py-8 text-center">
                No events scheduled in this window. Add subscriptions to track renewals!
              </p>
            ) : (
              <div className="divide-y-2 divide-ink/10 overflow-hidden rounded-2xl border-2 border-ink bg-white">
                {filteredEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-neutral-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-center font-mono rounded-xl border border-ink bg-paper p-2 min-w-[55px]">
                        <div className="text-[10px] font-bold uppercase text-ink/60">
                          {new Date(ev.event_date).toLocaleDateString(undefined, { month: "short" })}
                        </div>
                        <div className="text-base font-black text-ink">
                          {new Date(ev.event_date).getDate()}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-black text-ink">{ev.title}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${getBadgeStyle(
                              ev.event_type,
                            )}`}
                          >
                            {ev.event_type.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-xs text-ink/70 mt-0.5">{ev.description}</p>
                      </div>
                    </div>

                    {ev.amount !== null && ev.amount !== undefined && (
                      <div className="font-mono text-base font-black text-ink">
                        ₹{ev.amount.toFixed(0)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* Event Details Drawer / Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => setSelectedEvent(null)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border-3 border-ink bg-paper p-6 shadow-hard space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${getBadgeStyle(
                    selectedEvent.event_type,
                  )}`}
                >
                  {selectedEvent.event_type.replace("_", " ")}
                </span>
                <h3 className="font-display text-2xl font-black text-ink mt-2">
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="rounded-lg border border-ink p-1 hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl border-2 border-ink bg-white p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink/60">Scheduled Date:</span>
                <span className="font-mono font-bold text-ink">
                  {new Date(selectedEvent.event_date).toLocaleString(undefined, {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink/60">Vendor & Plan:</span>
                <span className="font-bold text-ink">
                  {selectedEvent.vendor_name} ({selectedEvent.plan_name})
                </span>
              </div>
              {selectedEvent.amount !== null && selectedEvent.amount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-ink/60">Expected Charge:</span>
                  <span className="font-mono font-bold text-ink">
                    ₹{selectedEvent.amount.toFixed(0)} ({selectedEvent.currency})
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-ink/80 leading-relaxed">
              {selectedEvent.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Link
                to="/subscriptions"
                className="btn-white px-3 py-1.5 text-xs font-bold"
              >
                Manage Subscriptions
              </Link>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="btn-sun px-4 py-1.5 text-xs font-bold"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
