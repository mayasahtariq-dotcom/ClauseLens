"""Unit tests for Subscription Renewal and Expiry Calendar engine."""

from datetime import date, datetime, timezone, timedelta
import uuid

from clauselens.domain.calendar_engine import (
    BillingFrequency,
    CalendarEventType,
    SubscriptionRecord,
    SubscriptionStatus,
    add_months,
    calculate_cancellation_deadline,
    calculate_next_renewal,
    generate_calendar_events,
)


def test_add_months_month_end_and_leap_year():
    # Jan 31, 2024 (leap year) -> Feb 29, 2024
    d1 = date(2024, 1, 31)
    res_feb = add_months(d1, 1)
    assert res_feb == date(2024, 2, 29)

    # Jan 31, 2025 (non-leap year) -> Feb 28, 2025
    d2 = date(2025, 1, 31)
    res_feb2 = add_months(d2, 1)
    assert res_feb2 == date(2025, 2, 28)

    # Aug 31 -> Sep 30
    d3 = date(2025, 8, 31)
    assert add_months(d3, 1) == date(2025, 9, 30)


def test_calculate_cancellation_deadline():
    renewal = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)
    deadline_48h = calculate_cancellation_deadline(renewal, 48)
    assert deadline_48h == datetime(2026, 11, 18, 10, 0, tzinfo=timezone.utc)


def test_calculate_next_renewal():
    start = datetime(2026, 1, 15, 0, 0, tzinfo=timezone.utc)
    ref = datetime(2026, 3, 20, 0, 0, tzinfo=timezone.utc)
    next_ren = calculate_next_renewal(start, BillingFrequency.MONTHLY, relative_to=ref)
    assert next_ren == datetime(2026, 4, 15, 0, 0, tzinfo=timezone.utc)


def test_generate_calendar_events_includes_deadlines_and_renewals():
    sub_id = uuid.uuid4()
    sub = SubscriptionRecord(
        id=sub_id,
        vendor_name="Spotify",
        plan_name="Premium",
        status=SubscriptionStatus.ACTIVE,
        billing_frequency=BillingFrequency.MONTHLY,
        recurring_amount=10.99,
        start_date=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        cancellation_notice_hours=48,
    )

    from_dt = datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc)
    to_dt = datetime(2026, 11, 15, 0, 0, tzinfo=timezone.utc)

    events = generate_calendar_events([sub], from_dt, to_dt)
    types = [e.event_type for e in events]

    assert CalendarEventType.RENEWAL in types
    assert CalendarEventType.CANCELLATION_DEADLINE in types

    ren_ev = next(e for e in events if e.event_type == CalendarEventType.RENEWAL)
    dead_ev = next(e for e in events if e.event_type == CalendarEventType.CANCELLATION_DEADLINE)

    assert ren_ev.event_date == datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc)
    # 48h before Nov 1 is Oct 30
    assert dead_ev.event_date == datetime(2026, 10, 30, 0, 0, tzinfo=timezone.utc)
