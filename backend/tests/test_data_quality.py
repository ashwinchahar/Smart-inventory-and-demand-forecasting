import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_data_quality_audit_and_censoring_detection():
    """
    Verifies that the audit service flags:
    1. Stockout-censored zeros (injected for SKU-DAIRY-002).
    2. Statistical anomaly spikes (injected for SKU-SNK-001).
    """
    # Run audit on all SKUs
    audit_res = client.post("/api/v1/data-quality/audit-all")
    assert audit_res.status_code == 200

    # Retrieve detected issues
    issues_res = client.get("/api/v1/data-quality/issues")
    assert issues_res.status_code == 200
    issues = issues_res.json()

    types = [i["issue_type"] for i in issues]
    assert "STOCKOUT_CENSORED" in types, "Stockout censoring was not detected!"
    assert "ANOMALY_SPIKE" in types, "Demand anomaly spike was not detected!"

    # Test resolving an issue
    target_issue = issues[0]
    resolve_res = client.put(
        f"/api/v1/data-quality/issues/{target_issue['issue_id']}?action=APPROVED_CORRECTION&resolution_note=Imputed+via+7-day+rolling+mean"
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "APPROVED_CORRECTION"
