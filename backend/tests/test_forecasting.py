import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_forecasting_pipeline_all_models():
    """
    Tests forecasting execution and metric evaluation across all models:
    NAIVE, SMA_7, SMA_14, EMA_14, HOLT_WINTERS, CROSTON.
    """
    product_id = 1
    models = ["NAIVE", "SMA_7", "SMA_14", "EMA_14", "HOLT_WINTERS", "CROSTON"]

    for model in models:
        # Trigger generation
        res = client.post(f"/api/v1/forecasting/generate/{product_id}?model_name={model}&horizon_days=14")
        assert res.status_code == 200, f"Model {model} failed: {res.text}"
        data = res.json()
        assert data["model_name"] == model
        assert data["horizon_days"] == 14

        # Fetch results
        hist_res = client.get(f"/api/v1/forecasting/runs/{product_id}")
        assert hist_res.status_code == 200
        hist_data = hist_res.json()
        assert len(hist_data["values"]) == 14
        assert hist_data["metrics"] is not None
        assert hist_data["metrics"]["mae"] >= 0
        assert hist_data["metrics"]["wape"] >= 0
