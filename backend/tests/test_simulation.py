import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_simulation_lifecycle_and_metrics():
    """
    Verifies end-to-end execution of What-If Scenarios:
    1. Triggers a scenario simulation with demand surge & lead time shock.
    2. Validates listing scenarios with accurate aggregated metrics.
    3. Validates detailed per-SKU breakdown including avg_stockout_risk and holding/lost sales costs.
    4. Validates deleting a scenario.
    """
    # 1. Run scenario
    payload = {
        "name": "Integration Test Black Friday Surge",
        "demand_multiplier": 1.75,
        "lead_time_delta_days": 5,
        "safety_stock_factor": 1.3,
        "simulation_days": 14
    }
    run_res = client.post("/api/v1/simulation/run", json=payload)
    assert run_res.status_code == 200, run_res.text
    run_data = run_res.json()
    assert "scenario_id" in run_data
    scenario_id = run_data["scenario_id"]

    # 2. List scenarios
    list_res = client.get("/api/v1/simulation/scenarios")
    assert list_res.status_code == 200
    scenarios = list_res.json()
    assert len(scenarios) > 0

    found = next((s for s in scenarios if s["scenario_id"] == scenario_id), None)
    assert found is not None
    assert found["name"] == payload["name"]
    assert "avg_stockout_risk" in found
    assert "total_estimated_holding_cost" in found
    assert "total_estimated_lost_sales_cost" in found
    assert found["product_count"] > 0

    # 3. Get scenario details
    detail_res = client.get(f"/api/v1/simulation/scenarios/{scenario_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["scenario_id"] == scenario_id
    assert "avg_stockout_risk" in detail
    assert "total_estimated_holding_cost" in detail
    assert "total_estimated_lost_sales_cost" in detail
    assert "product_count" in detail
    assert "results" in detail
    assert len(detail["results"]) > 0

    first_item = detail["results"][0]
    assert "sku" in first_item
    assert "product_name" in first_item
    assert "simulated_stockout_risk" in first_item
    assert "projected_ending_stock" in first_item
    assert "estimated_holding_cost" in first_item
    assert "estimated_lost_sales_cost" in first_item

    # 4. Delete scenario
    del_res = client.delete(f"/api/v1/simulation/scenarios/{scenario_id}")
    assert del_res.status_code == 200

    # Confirm it is deleted
    get_del = client.get(f"/api/v1/simulation/scenarios/{scenario_id}")
    assert get_del.status_code == 404
