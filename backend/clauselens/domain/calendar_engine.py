"""Deterministic Subscription Renewal and Expiry Calendar engine.

Calculates renewal dates, trial expirations, cancellation deadlines, and reminder events.
Handles leap years, month-end billing, frequency cycles, and notice-period offsets deterministically.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, time, timedelta, timezone
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class CalendarEventType(StrEnum):
    RENEWAL = "renewal"
    TRIAL_EXPIRY = "trial_expiry"
    CANCELLATION_DEADLINE = "cancellation_deadline"
    SUBSCRIPTION_EXPIRY = "subscription_expiry"
    POLICY_CHANGE = "policy_change"


class SubscriptionStatus(StrEnum):
    ACTIVE = "active"
    TRIALING = "trialing"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class BillingFrequency(StrEnum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"
    WEEKLY = "weekly"


class ReminderPreference(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    days_before: int = Field(ge=0, le=90)
    target_event: CalendarEventType = CalendarEventType.RENEWAL
    channel: str = "in_app"  # "in_app" | "email"
    enabled: bool = True


class CalendarEvent(BaseModel):
    id: str
    subscription_id: UUID
    vendor_name: str
    plan_name: str
    event_type: CalendarEventType
    event_date: datetime
    title: str
    description: str
    amount: float | None = None
    currency: str = "INR"
    is_urgent: bool = False
    policy_citation: str | None = None


class SubscriptionRecord(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    vendor_name: str
    vendor_id: UUID | None = None
    plan_name: str = "Standard"
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    billing_frequency: BillingFrequency = BillingFrequency.MONTHLY
    recurring_amount: float = Field(ge=0)
    currency: str = "INR"
    
    # Dates
    start_date: datetime
    next_renewal_date: datetime | None = None
    trial_start_date: datetime | None = None
    trial_expiry_date: datetime | None = None
    
    # Notice period for cancellation (e.g. 48 hours before renewal)
    cancellation_notice_hours: int = Field(default=24, ge=0)
    calculated_cancellation_deadline: datetime | None = None
    subscription_expiry_date: datetime | None = None
    
    # Reminders & Notes
    reminders: list[ReminderPreference] = Field(default_factory=list)
    notes: str | None = None
    policy_snapshot_id: UUID | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def add_months(sourcedate: date, months: int) -> date:
    """Add months to a date, preserving month-end behavior and handling leap years."""
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def calculate_next_renewal(
    start_dt: datetime,
    frequency: BillingFrequency,
    relative_to: datetime | None = None,
) -> datetime:
    """Calculate next renewal datetime strictly after `relative_to`."""
    ref = relative_to or datetime.now(start_dt.tzinfo or timezone.utc)
    current = start_dt
    
    if current > ref:
        return current

    # Advance until strictly in the future
    while current <= ref:
        if frequency == BillingFrequency.WEEKLY:
            current = current + timedelta(days=7)
        elif frequency == BillingFrequency.MONTHLY:
            d = add_months(current.date(), 1)
            current = current.replace(year=d.year, month=d.month, day=d.day)
        elif frequency == BillingFrequency.QUARTERLY:
            d = add_months(current.date(), 3)
            current = current.replace(year=d.year, month=d.month, day=d.day)
        elif frequency == BillingFrequency.ANNUAL:
            d = add_months(current.date(), 12)
            current = current.replace(year=d.year, month=d.month, day=d.day)
            
    return current


def calculate_cancellation_deadline(renewal_dt: datetime, notice_hours: int) -> datetime:
    """Calculate exact cancellation deadline given a renewal datetime and required notice hours."""
    return renewal_dt - timedelta(hours=notice_hours)


def generate_calendar_events(
    subscriptions: list[SubscriptionRecord],
    from_date: datetime,
    to_date: datetime,
) -> list[CalendarEvent]:
    """Generate all calendar events (renewals, trial expiries, cancellation deadlines) in a date range."""
    events: list[CalendarEvent] = []

    for sub in subscriptions:
        if sub.status in (SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED):
            continue

        tz = sub.start_date.tzinfo or timezone.utc

        # 1. Trial Expiry Event
        if sub.trial_expiry_date and from_date <= sub.trial_expiry_date <= to_date:
            events.append(CalendarEvent(
                id=f"{sub.id}-trial-expiry",
                subscription_id=sub.id,
                vendor_name=sub.vendor_name,
                plan_name=sub.plan_name,
                event_type=CalendarEventType.TRIAL_EXPIRY,
                event_date=sub.trial_expiry_date,
                title=f"{sub.vendor_name} Free Trial Ends",
                description=f"Free trial expires. Converts to paid {sub.currency} {sub.recurring_amount:.2f}/{sub.billing_frequency.value}.",
                amount=sub.recurring_amount,
                currency=sub.currency,
                is_urgent=True,
            ))

        # 2. Subscription Expiry Event
        if sub.subscription_expiry_date and from_date <= sub.subscription_expiry_date <= to_date:
            events.append(CalendarEvent(
                id=f"{sub.id}-sub-expiry",
                subscription_id=sub.id,
                vendor_name=sub.vendor_name,
                plan_name=sub.plan_name,
                event_type=CalendarEventType.SUBSCRIPTION_EXPIRY,
                event_date=sub.subscription_expiry_date,
                title=f"{sub.vendor_name} Subscription Ends",
                description="Service access terminates unless renewed.",
                is_urgent=False,
            ))

        # 3. Recurring Renewal & Cancellation Deadline Events
        # Walk forward through renewal occurrences within [from_date - notice_window, to_date]
        step_dt = sub.start_date
        # If trial existed, renewals begin after trial expiry
        if sub.trial_expiry_date and sub.trial_expiry_date > sub.start_date:
            step_dt = sub.trial_expiry_date

        cycle_count = 0
        max_cycles = 100  # safety clamp
        
        while step_dt <= to_date and cycle_count < max_cycles:
            cycle_count += 1
            if cycle_count > 1 or not sub.trial_expiry_date:
                # Renewal occurrence
                if from_date <= step_dt <= to_date:
                    symbol = "₹" if sub.currency == "INR" else f"{sub.currency} "
                    events.append(CalendarEvent(
                        id=f"{sub.id}-renewal-{step_dt.strftime('%Y%m%d')}",
                        subscription_id=sub.id,
                        vendor_name=sub.vendor_name,
                        plan_name=sub.plan_name,
                        event_type=CalendarEventType.RENEWAL,
                        event_date=step_dt,
                        title=f"{sub.vendor_name} Renewal ({symbol}{sub.recurring_amount:.0f})",
                        description=f"Automatic renewal charge of {symbol}{sub.recurring_amount:.2f} for {sub.plan_name}.",
                        amount=sub.recurring_amount,
                        currency=sub.currency,
                        is_urgent=False,
                    ))

                # Corresponding Cancellation Deadline
                if sub.cancellation_notice_hours > 0:
                    deadline_dt = calculate_cancellation_deadline(step_dt, sub.cancellation_notice_hours)
                    if from_date <= deadline_dt <= to_date:
                        events.append(CalendarEvent(
                            id=f"{sub.id}-deadline-{step_dt.strftime('%Y%m%d')}",
                            subscription_id=sub.id,
                            vendor_name=sub.vendor_name,
                            plan_name=sub.plan_name,
                            event_type=CalendarEventType.CANCELLATION_DEADLINE,
                            event_date=deadline_dt,
                            title=f"Cancel {sub.vendor_name} by this date",
                            description=f"Requires {sub.cancellation_notice_hours}h notice before {step_dt.strftime('%b %d')} renewal to avoid charges.",
                            amount=sub.recurring_amount,
                            currency=sub.currency,
                            is_urgent=True,
                        ))

            # Advance to next cycle
            if sub.billing_frequency == BillingFrequency.WEEKLY:
                step_dt = step_dt + timedelta(days=7)
            elif sub.billing_frequency == BillingFrequency.MONTHLY:
                d = add_months(step_dt.date(), 1)
                step_dt = step_dt.replace(year=d.year, month=d.month, day=d.day)
            elif sub.billing_frequency == BillingFrequency.QUARTERLY:
                d = add_months(step_dt.date(), 3)
                step_dt = step_dt.replace(year=d.year, month=d.month, day=d.day)
            elif sub.billing_frequency == BillingFrequency.ANNUAL:
                d = add_months(step_dt.date(), 12)
                step_dt = step_dt.replace(year=d.year, month=d.month, day=d.day)

    # Sort chronologically
    events.sort(key=lambda e: e.event_date)
    return events
