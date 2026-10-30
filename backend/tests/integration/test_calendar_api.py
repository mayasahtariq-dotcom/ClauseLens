"""Integration tests for Subscription Renewal & Expiry Calendar API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from clauselens.adapters.persistence.models import Base
from clauselens.adapters.persistence.sqlalchemy_repository import SqlAlchemyRepository, create_db_engine
from clauselens.api.app import create_app
from clauselens.container import build_container
from tests.conftest import make_settings


@pytest.fixture
def client(tmp_path) -> TestClient:
    settings = make_settings(
        database_url=f"sqlite:///{tmp_path / 'calendar_api.db'}",
        cors_origins="https://app.example",
        rate_limit_investigations_per_minute=1000,
    )
    engine = create_db_engine(settings)
    Base.metadata.create_all(engine)
    container = build_container(settings, repository=SqlAlchemyRepository(engine))
    return TestClient(create_app(settings, container))


def test_subscriptions_and_calendar_api_in_inr(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    trial_exp = now + timedelta(days=7)
    next_ren = now + timedelta(days=30)

    # 1. Create Subscription with INR currency
    sub_data = {
        "vendor_name": "Hotstar",
        "plan_name": "Super",
        "status": "active",
        "billing_frequency": "monthly",
        "recurring_amount": 299.0,
        "currency": "INR",
        "start_date": now.isoformat(),
        "next_renewal_date": next_ren.isoformat(),
        "trial_start_date": now.isoformat(),
        "trial_expiry_date": trial_exp.isoformat(),
        "cancellation_notice_hours": 48,
        "notes": "IPL subscription",
    }
    create_res = client.post("/api/subscriptions", json=sub_data)
    assert create_res.status_code == 201, create_res.text
    sub = create_res.json()
    sub_id = sub["id"]
    assert sub["vendor_name"] == "Hotstar"
    assert sub["currency"] == "INR"
    assert sub["recurring_amount"] == 299.0
    assert sub["cancellation_notice_hours"] == 48

    # 2. List Subscriptions
    list_res = client.get("/api/subscriptions")
    assert list_res.status_code == 200
    subs = list_res.json()
    assert len(subs) == 1
    assert subs[0]["id"] == sub_id

    # 3. Get Calendar Events (with rupee formatting)
    cal_res = client.get("/api/calendar/events")
    assert cal_res.status_code == 200
    events = cal_res.json()
    assert len(events) >= 2
    types = {e["event_type"] for e in events}
    assert "trial_expiry" in types
    assert "renewal" in types or "cancellation_deadline" in types
    
    # Check currency formatting
    ren_event = next(e for e in events if e["event_type"] == "renewal")
    assert "₹" in ren_event["title"]
    assert ren_event["currency"] == "INR"

    # 4. Update Subscription
    patch_res = client.patch(f"/api/subscriptions/{sub_id}", json={"recurring_amount": 349.0})
    assert patch_res.status_code == 200
    assert patch_res.json()["recurring_amount"] == 349.0

    # 5. Delete Subscription
    del_res = client.delete(f"/api/subscriptions/{sub_id}")
    assert del_res.status_code == 200
    assert client.get(f"/api/subscriptions/{sub_id}").status_code == 404
