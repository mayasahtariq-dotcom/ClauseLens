import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit2,
  Download,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { api } from "../api/client";
import type { BillingFrequency, SubscriptionRecord, SubscriptionStatus } from "../api/types";
import { Reveal } from "../components/motion";

export function SubscriptionsPage() {
  const [searchParams] = useSearchParams();
  const fromInv = searchParams.get("from_inv") || searchParams.get("investigation_id");
  const fromVendor = searchParams.get("vendor_id");

  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Modal / Form state for Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [vendorName, setVendorName] = useState("");
  const [planName, setPlanName] = useState("Standard Plan");
  const [status, setStatus] = useState<SubscriptionStatus>("active");
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("monthly");
  const [recurringAmount, setRecurringAmount] = useState<number>(499);
  const currency = "INR";
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [nextRenewalDate, setNextRenewalDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [hasTrial, setHasTrial] = useState(false);
  const [trialExpiryDate, setTrialExpiryDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [noticeHours, setNoticeHours] = useState(24);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Load subscriptions
  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const data = await api.subscriptions(filterStatus === "all" ? undefined : filterStatus);
      setSubscriptions(data);
    } catch {
      // Handle error gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [filterStatus]);

  // Handle draft from investigation query params
  useEffect(() => {
    if (fromInv && fromVendor) {
      api.draftSubscription(fromInv, fromVendor)
        .then((draft) => {
          setVendorName(draft.vendor_name);
          setPlanName(draft.plan_name);
          setStatus(draft.status);
          setBillingFrequency(draft.billing_frequency);
          setRecurringAmount(draft.recurring_amount);
          setNoticeHours(draft.cancellation_notice_hours);
          if (draft.trial_expiry_date) {
            setHasTrial(true);
            setTrialExpiryDate(draft.trial_expiry_date.split("T")[0]);
          }
          if (draft.next_renewal_date) {
            setNextRenewalDate(draft.next_renewal_date.split("T")[0]);
          }
          setNotes(draft.notes || "");
          setIsModalOpen(true);
        })
        .catch(() => {});
    }
  }, [fromInv, fromVendor]);

  // Open Add modal with clean state
  const handleOpenAdd = () => {
    setEditingId(null);
    setVendorName("");
    setPlanName("Standard");
    setStatus("active");
    setBillingFrequency("monthly");
    setRecurringAmount(499);
    setHasTrial(false);
    setNoticeHours(24);
    setNotes("");
    setIsModalOpen(true);
  };

  // Open Edit modal
  const handleOpenEdit = (sub: SubscriptionRecord) => {
    setEditingId(sub.id || null);
    setVendorName(sub.vendor_name);
    setPlanName(sub.plan_name);
    setStatus(sub.status);
    setBillingFrequency(sub.billing_frequency);
    setRecurringAmount(sub.recurring_amount);
    setNoticeHours(sub.cancellation_notice_hours);
    if (sub.start_date) setStartDate(sub.start_date.split("T")[0]);
    if (sub.next_renewal_date) setNextRenewalDate(sub.next_renewal_date.split("T")[0]);
    if (sub.trial_expiry_date) {
      setHasTrial(true);
      setTrialExpiryDate(sub.trial_expiry_date.split("T")[0]);
    } else {
      setHasTrial(false);
    }
    setNotes(sub.notes || "");
    setIsModalOpen(true);
  };

  // Submit Add or Edit
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) return;
    setSaving(true);

    const renewalIso = nextRenewalDate ? new Date(`${nextRenewalDate}T00:00:00Z`).toISOString() : null;
    const trialIso = hasTrial && trialExpiryDate ? new Date(`${trialExpiryDate}T00:00:00Z`).toISOString() : null;
    const startIso = startDate ? new Date(`${startDate}T00:00:00Z`).toISOString() : new Date().toISOString();

    const payload: SubscriptionRecord = {
      vendor_name: vendorName,
      plan_name: planName,
      status: status,
      billing_frequency: billingFrequency,
      recurring_amount: Number(recurringAmount) || 0,
      currency: currency,
      start_date: startIso,
      next_renewal_date: renewalIso,
      trial_start_date: hasTrial ? startIso : null,
      trial_expiry_date: trialIso,
      cancellation_notice_hours: Number(noticeHours) || 24,
      notes: notes,
    };

    try {
      if (editingId) {
        await api.updateSubscription(editingId, payload);
      } else {
        await api.createSubscription(payload);
      }
      setIsModalOpen(false);
      fetchSubscriptions();
    } catch {
      alert("Failed to save subscription.");
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id?: string) => {
    if (!id || !confirm("Are you sure you want to stop tracking this subscription?")) return;
    try {
      await api.deleteSubscription(id);
      fetchSubscriptions();
    } catch {
      alert("Failed to delete subscription.");
    }
  };

  // Mark Cancelled
  const handleMarkCancelled = async (sub: SubscriptionRecord) => {
    if (!sub.id) return;
    try {
      await api.updateSubscription(sub.id, { status: "cancelled" });
      fetchSubscriptions();
    } catch {
      alert("Failed to update status.");
    }
  };

  // Export to iCalendar .ics format
  const exportICS = () => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ClauseLens AI//Subscription Calendar//EN\n";
    subscriptions.forEach((sub) => {
      if (sub.next_renewal_date && sub.status !== "cancelled") {
        const d = new Date(sub.next_renewal_date);
        const dtStr = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const symbol = sub.currency === "INR" ? "₹" : `${sub.currency} `;
        icsContent += `BEGIN:VEVENT\nUID:${sub.id || Math.random()}@clauselens.ai\nSUMMARY:${sub.vendor_name} Renewal (${symbol}${sub.recurring_amount})\nDESCRIPTION:${sub.vendor_name} - ${sub.plan_name}. Cancellation notice requires ${sub.cancellation_notice_hours}h prior.\nDTSTART:${dtStr}\nDTEND:${dtStr}\nEND:VEVENT\n`;
      }
      if (sub.trial_expiry_date && sub.status === "trialing") {
        const d = new Date(sub.trial_expiry_date);
        const dtStr = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const symbol = sub.currency === "INR" ? "₹" : `${sub.currency} `;
        icsContent += `BEGIN:VEVENT\nUID:${sub.id || Math.random()}-trial@clauselens.ai\nSUMMARY:${sub.vendor_name} Free Trial Expiry\nDESCRIPTION:Cancel now to avoid recurring charges of ${symbol}${sub.recurring_amount}.\nDTSTART:${dtStr}\nDTEND:${dtStr}\nEND:VEVENT\n`;
      }
    });
    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "clauselens-subscriptions.ics");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stats
  const activeSubs = subscriptions.filter((s) => s.status === "active" || s.status === "trialing");
  const monthlyBurn = activeSubs.reduce((acc, s) => {
    if (s.billing_frequency === "monthly") return acc + s.recurring_amount;
    if (s.billing_frequency === "quarterly") return acc + s.recurring_amount / 3;
    if (s.billing_frequency === "annual") return acc + s.recurring_amount / 12;
    if (s.billing_frequency === "weekly") return acc + s.recurring_amount * 4.33;
    return acc;
  }, 0);
  const trialingCount = subscriptions.filter((s) => s.status === "trialing").length;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Subscription Tracking & Deadlines
            </span>
            <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">
              Tracked <span className="text-gradient">Subscriptions</span>
            </h1>
            <p className="mt-2 text-slate max-w-2xl text-base">
              Never miss a renewal, price increase, or cancellation deadline. Keep your personal subscriptions synchronized with verified cancellation policies.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportICS}
              className="btn-white px-4 py-2 text-sm"
              title="Download .ics file for Google Calendar, Apple Calendar, or Outlook"
            >
              <Download className="h-4 w-4 mr-1.5" /> Export Calendar (.ics)
            </button>
            <Link to="/calendar" className="btn-white px-4 py-2 text-sm">
              <CalendarIcon className="h-4 w-4 mr-1.5" /> Full Calendar View
            </Link>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="btn-sun px-5 py-2.5 text-sm font-bold shadow-soft"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Subscription
            </button>
          </div>
        </header>
      </Reveal>

      {/* KPI Stats Banner */}
      <Reveal delay={80}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink/60">Estimated Monthly Burn</span>
            <div className="mt-2 font-display text-4xl font-black text-ink">
              ₹{monthlyBurn.toFixed(0)}
              <span className="text-xs text-ink/50 font-normal"> / month</span>
            </div>
            <div className="mt-2 text-xs text-ink/70">Across {activeSubs.length} active recurring plans</div>
          </div>

          <div className="card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink/60">Active Free Trials</span>
            <div className={`mt-2 font-display text-4xl font-black ${trialingCount > 0 ? "text-bubblegum" : "text-ink"}`}>
              {trialingCount}
            </div>
            <div className="mt-2 text-xs text-ink/70">
              {trialingCount > 0 ? "Subject to automatic conversion to paid" : "No active trial risks"}
            </div>
          </div>

          <div className="card p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-ink/60">Notice Protection</span>
            <div className="mt-2 font-display text-4xl font-black text-lagoon">
              100%
            </div>
            <div className="mt-2 text-xs text-ink/70">Cancellation windows actively calculated</div>
          </div>
        </div>
      </Reveal>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink pb-2">
        <div className="flex gap-2">
          {["all", "active", "trialing", "cancelled"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`rounded-xl border-2 border-ink px-4 py-1.5 text-xs font-bold capitalize transition ${
                filterStatus === st ? "bg-ink text-white shadow-lift" : "bg-white text-ink hover:bg-neutral-100"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-ink/60">{subscriptions.length} subscriptions tracked</span>
      </div>

      {/* Subscriptions Grid / List */}
      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ink border-t-bubblegum" />
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="rounded-3xl border-3 border-dashed border-ink/30 p-12 text-center bg-white/40">
          <CalendarIcon className="mx-auto h-12 w-12 text-ink/40 mb-3" />
          <h3 className="font-display text-xl font-black text-ink">No Subscriptions Found</h3>
          <p className="mt-1 text-sm text-slate max-w-md mx-auto">
            Add personal subscriptions manually or save verified vendor policies directly from investigation results.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn-sun mt-5 px-6 py-2.5 text-sm font-bold shadow-soft"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Add Your First Subscription
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((sub) => {
            const isTrial = sub.status === "trialing";
            const isCancelled = sub.status === "cancelled";

            return (
              <div
                key={sub.id}
                className={`card p-5 space-y-4 relative flex flex-col justify-between ${
                  isTrial ? "border-bubblegum" : isCancelled ? "opacity-70 bg-neutral-50" : ""
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-xl font-black text-ink">{sub.vendor_name}</h3>
                      <p className="text-xs text-ink/60">{sub.plan_name}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                        isTrial
                          ? "bg-bubblegum text-white"
                          : isCancelled
                          ? "bg-neutral-200 text-neutral-700"
                          : "bg-lagoon text-ink"
                      }`}
                    >
                      {sub.status}
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-mono text-3xl font-black text-ink">
                      ₹{sub.recurring_amount.toFixed(0)}
                    </span>
                    <span className="text-xs text-ink/60 font-semibold">/{sub.billing_frequency}</span>
                  </div>

                  {/* Dates & Deadlines */}
                  <div className="mt-4 space-y-2 rounded-2xl border border-ink/20 bg-paper p-3 text-xs">
                    {sub.next_renewal_date && !isCancelled && (
                      <div className="flex items-center justify-between">
                        <span className="text-ink/70 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> Next Renewal:
                        </span>
                        <span className="font-mono font-bold text-ink">
                          {new Date(sub.next_renewal_date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    )}

                    {sub.trial_expiry_date && isTrial && (
                      <div className="flex items-center justify-between text-bubblegum">
                        <span className="font-bold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" /> Trial Expiry:
                        </span>
                        <span className="font-mono font-bold">
                          {new Date(sub.trial_expiry_date).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    )}

                    {sub.cancellation_notice_hours > 0 && !isCancelled && (
                      <div className="flex items-center justify-between text-ink/80 pt-1 border-t border-ink/10">
                        <span>Notice Window:</span>
                        <span className="font-bold">{sub.cancellation_notice_hours}h required</span>
                      </div>
                    )}
                  </div>

                  {sub.notes && (
                    <p className="mt-3 text-xs italic text-ink/70 line-clamp-2">"{sub.notes}"</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between border-t border-ink/10 pt-3 text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(sub)}
                      className="p-1.5 rounded-lg border border-ink/30 hover:bg-neutral-100"
                      title="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(sub.id)}
                      className="p-1.5 rounded-lg border border-ink/30 hover:bg-bubblegum/20 hover:text-bubblegum"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={() => handleMarkCancelled(sub)}
                      className="rounded-lg bg-neutral-200 px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-bubblegum hover:text-white transition"
                    >
                      Mark Cancelled
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Subscription Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border-3 border-ink bg-paper p-6 shadow-hard space-y-5 animate-in fade-in zoom-in-95">
            <h2 className="font-display text-xl font-black text-ink">
              {editingId ? "Edit Subscription" : "Add Subscription to Track"}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-ink">Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="e.g. Netflix, Figma, Coursera"
                    className="input-field mt-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink">Plan Name</label>
                  <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="e.g. Pro, Premium"
                    className="input-field mt-1 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-bold text-ink">Amount (₹)</label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={recurringAmount}
                    onChange={(e) => setRecurringAmount(parseFloat(e.target.value) || 0)}
                    className="input-field mt-1 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink">Frequency</label>
                  <select
                    value={billingFrequency}
                    onChange={(e) => setBillingFrequency(e.target.value as BillingFrequency)}
                    className="input-field mt-1 text-sm"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-ink">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
                    className="input-field mt-1 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="trialing">Trialing</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold text-ink">Next Renewal Date</label>
                  <input
                    type="date"
                    value={nextRenewalDate}
                    onChange={(e) => setNextRenewalDate(e.target.value)}
                    className="input-field mt-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink">Notice Period (Hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={noticeHours}
                    onChange={(e) => setNoticeHours(parseInt(e.target.value, 10) || 0)}
                    className="input-field mt-1 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="rounded-2xl border-2 border-ink bg-neutral-50 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-ink">
                  <input
                    type="checkbox"
                    checked={hasTrial}
                    onChange={(e) => setHasTrial(e.target.checked)}
                    className="rounded border-ink accent-bubblegum"
                  />
                  Has Active Free Trial
                </label>
                {hasTrial && (
                  <div>
                    <label className="text-[11px] font-bold text-ink">Trial Expiration Date</label>
                    <input
                      type="date"
                      value={trialExpiryDate}
                      onChange={(e) => setTrialExpiryDate(e.target.value)}
                      className="input-field mt-1 text-xs"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-ink">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Account email, cancellation link or stipulations..."
                  className="input-field mt-1 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-white px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-sun px-5 py-2 text-xs font-bold"
                >
                  {saving ? "Saving..." : "Save Subscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
