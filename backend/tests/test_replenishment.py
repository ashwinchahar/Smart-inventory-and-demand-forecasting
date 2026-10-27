import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_replenishment_listing_and_po_conversion():
    # 1. Fetch recommendations
    res = client.get("/api/v1/replenishment/recommendations")
    assert res.status_code == 200
    recs = res.json()
    assert len(recs) > 0

    first = recs[0]
    assert "sku" in first
    assert "product_name" in first
    assert "category_name" in first
    assert "stockout_risk_score" in first
    assert "reorder_point" in first

    # 2. Pick a pending recommendation and convert to PO
    pending = next((r for r in recs if r["status"] == "PENDING"), None)
    if pending:
        po_res = client.post(
            f"/api/v1/replenishment/recommendations/{pending['recommendation_id']}/create-po",
            json={"quantity": 30.0}
        )
        assert po_res.status_code == 200
        data = po_res.json()
        assert "po_number" in data
        assert data["status"] == "ACCEPTED"
        assert data["ordered_qty"] == 30.0

def test_replenishment_bulk_po_generation():
    res = client.get("/api/v1/replenishment/recommendations")
    assert res.status_code == 200
    recs = res.json()

    # Pick up to 3 pending recommendations
    pending_recs = [r for r in recs if r["status"] == "PENDING"][:3]
    if pending_recs:
        ids = [r["recommendation_id"] for r in pending_recs]
        bulk_res = client.post(
            "/api/v1/replenishment/recommendations/bulk-create-po",
            json={"recommendation_ids": ids}
        )
        assert bulk_res.status_code == 200
        data = bulk_res.json()
        assert len(data["created_pos"]) >= 1
        assert data["total_recommendations_approved"] == len(ids)
