"""API routes for Subscription Tracking and Expiry Calendar."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from clauselens.api.deps import get_container
from clauselens.container import Container
from clauselens.domain.calendar_engine import (
    CalendarEvent,
    SubscriptionRecord,
    generate_calendar_events,
)
from clauselens.domain.policy import FieldStatus, PolicyField

router = APIRouter(tags=["subscriptions"])


class UpdateSubscriptionRequest(BaseModel):
    vendor_name: str | None = None
    plan_name: str | None = None
    status: str | None = None
    billing_frequency: str | None = None
    recurring_amount: float | None = None
    currency: str | None = None
    start_date: datetime | None = None
    next_renewal_date: datetime | None = None
    trial_start_date: datetime | None = None
    trial_expiry_date: datetime | None = None
    cancellation_notice_hours: int | None = None
    subscription_expiry_date: datetime | None = None
    reminders: list[dict[str, Any]] | None = None
    notes: str | None = None


@router.post("/api/subscriptions", response_model=SubscriptionRecord, status_code=201)
def create_subscription(
    sub: SubscriptionRecord,
    c: Container = Depends(get_container),
) -> SubscriptionRecord:
    """Save a new subscription to track."""
    return c.repository.create_subscription(sub)


@router.get("/api/subscriptions", response_model=list[SubscriptionRecord])
def list_subscriptions(
    status: str | None = Query(default=None),
    c: Container = Depends(get_container),
) -> list[SubscriptionRecord]:
    """List tracked subscriptions, optionally filtered by status."""
    return c.repository.list_subscriptions(status=status)


@router.get("/api/subscriptions/{subscription_id}", response_model=SubscriptionRecord)
def get_subscription(
    subscription_id: UUID,
    c: Container = Depends(get_container),
) -> SubscriptionRecord:
    sub = c.repository.get_subscription(subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


@router.patch("/api/subscriptions/{subscription_id}", response_model=SubscriptionRecord)
def update_subscription(
    subscription_id: UUID,
    body: UpdateSubscriptionRequest,
    c: Container = Depends(get_container),
) -> SubscriptionRecord:
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    sub = c.repository.update_subscription(subscription_id, updates)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


@router.delete("/api/subscriptions/{subscription_id}")
def delete_subscription(
    subscription_id: UUID,
    c: Container = Depends(get_container),
) -> dict[str, bool]:
    ok = c.repository.delete_subscription(subscription_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"success": True}


@router.get("/api/calendar/events", response_model=list[CalendarEvent])
def get_calendar_events(
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    c: Container = Depends(get_container),
) -> list[CalendarEvent]:
    """Retrieve recurring renewal, cancellation deadline, and trial expiry events."""
    now = datetime.now(timezone.utc)
    start = from_date or (now - timedelta(days=30))
    end = to_date or (now + timedelta(days=90))
    
    subs = c.repository.list_subscriptions()
    return generate_calendar_events(subs, from_date=start, to_date=end)


@router.get("/api/subscriptions/draft/{investigation_id}/{vendor_id}", response_model=SubscriptionRecord)
def draft_subscription_from_investigation(
    investigation_id: UUID,
    vendor_id: UUID,
    c: Container = Depends(get_container),
) -> SubscriptionRecord:
    """Pre-fill a subscription record using verified vendor policy snapshot findings."""
    inv = c.repository.get_investigation(investigation_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    vendor_run = next((v for v in inv.vendors if v.vendor.id == vendor_id), None)
    if not vendor_run:
        raise HTTPException(status_code=404, detail="Vendor not found in investigation")

    latest_map = c.repository.latest_snapshot_ids([vendor_id])
    sid = latest_map.get(vendor_id)
    
    trial_days = 0
    notice_hours = 24
    recurring_amount = 499.0
    
    if sid:
        policy = c.repository.load_policy(sid)
        if policy:
            f_trial = policy.findings.get(PolicyField.TRIAL_DURATION)
            if f_trial and f_trial.status == FieldStatus.FOUND and f_trial.value and f_trial.value.duration:
                trial_days = int(f_trial.value.duration.days)

            f_canc = policy.findings.get(PolicyField.CANCELLATION_DEADLINE)
            if f_canc and f_canc.status == FieldStatus.FOUND and f_canc.value and f_canc.value.duration:
                notice_hours = max(1, int(f_canc.value.duration.days * 24))

    now = datetime.now(timezone.utc)
    trial_start = now if trial_days > 0 else None
    trial_expiry = (now + timedelta(days=trial_days)) if trial_days > 0 else None
    first_renewal = trial_expiry if trial_expiry else (now + timedelta(days=30))

    return SubscriptionRecord(
        vendor_name=vendor_run.vendor.name,
        vendor_id=vendor_id,
        plan_name="Standard Plan",
        status="trialing" if trial_days > 0 else "active",
        billing_frequency="monthly",
        recurring_amount=recurring_amount,
        currency="INR",
        start_date=now,
        next_renewal_date=first_renewal,
        trial_start_date=trial_start,
        trial_expiry_date=trial_expiry,
        cancellation_notice_hours=notice_hours,
        calculated_cancellation_deadline=first_renewal - timedelta(hours=notice_hours),
        notes=f"Saved from ClauseLens investigation {investigation_id}",
    )
