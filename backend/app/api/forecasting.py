from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.models.inventory import (
    Product, DailyDemand, ForecastRun, ForecastValue, ModelMetric
)
from app.services.forecasting import ForecastingService

router = APIRouter(prefix="/forecasting", tags=["Demand Forecasting"])

@router.get("/demand/{product_id}")
def get_daily_demand(product_id: int, days: int = 365, db: Session = Depends(get_db)):
    records = (
        db.query(DailyDemand)
        .filter(DailyDemand.product_id == product_id)
        .order_by(desc(DailyDemand.demand_date))
        .limit(days)
        .all()
    )
    records.reverse()
    return [
        {
            "demand_date": r.demand_date.isoformat(),
            "quantity_sold": float(r.quantity_sold),
            "stockout_flag": r.stockout_flag,
            "data_status": r.data_status
        }
        for r in records
    ]

@router.post("/generate/{product_id}")
def trigger_forecast(
    product_id: int,
    model_name: str = Query("EMA_14", description="Model: NAIVE, SMA_7, SMA_14, EMA_14, HOLT_WINTERS, CROSTON"),
    horizon_days: int = Query(14, ge=1, le=90),
    impute_stockouts: bool = Query(True),
    db: Session = Depends(get_db)
):
    prod = db.query(Product).filter(Product.product_id == product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found.")

    demand_count = db.query(DailyDemand).filter(DailyDemand.product_id == product_id).count()
    if demand_count < 14:
        raise HTTPException(
            status_code=400,
            detail=f"There are not enough sales records for this product ({demand_count} found, minimum 14 required) to forecast demand and calculate stock-out run-out dates."
        )

    run = ForecastingService.generate_forecast(
        db,
        product_id=product_id,
        model_name=model_name,
        horizon_days=horizon_days,
        impute_stockouts=impute_stockouts
    )
    return {
        "message": "Forecast generated successfully",
        "forecast_run_id": run.forecast_run_id,
        "model_name": run.model_name,
        "horizon_days": run.horizon_days,
        "training_end": run.training_end.isoformat()
    }

@router.get("/runs/{product_id}")
def get_forecast_history(product_id: int, db: Session = Depends(get_db)):
    demand_count = db.query(DailyDemand).filter(DailyDemand.product_id == product_id).count()

    if demand_count < 14:
        return {
            "has_sufficient_history": False,
            "demand_record_count": demand_count,
            "min_required_records": 14,
            "message": f"There are not enough sales records for this product ({demand_count} records found, minimum 14 required) to forecast sales, predict demand, or estimate stock-out run-out dates.",
            "values": [],
            "metrics": None,
            "run": None
        }

    # Get latest forecast run
    latest_val = (
        db.query(ForecastValue)
        .filter(ForecastValue.product_id == product_id)
        .order_by(desc(ForecastValue.forecast_value_id))
        .first()
    )

    # If no forecast run exists yet, but sufficient records exist, auto-generate initial forecast
    if not latest_val:
        run = ForecastingService.generate_forecast(
            db,
            product_id=product_id,
            model_name="HOLT_WINTERS",
            horizon_days=14,
            impute_stockouts=True
        )
    else:
        run = db.query(ForecastRun).filter(ForecastRun.forecast_run_id == latest_val.forecast_run_id).first()

    values = (
        db.query(ForecastValue)
        .filter(ForecastValue.forecast_run_id == run.forecast_run_id, ForecastValue.product_id == product_id)
        .order_by(ForecastValue.forecast_date.asc())
        .all()
    )
    metric = (
        db.query(ModelMetric)
        .filter(ModelMetric.forecast_run_id == run.forecast_run_id, ModelMetric.product_id == product_id)
        .first()
    )

    return {
        "has_sufficient_history": True,
        "demand_record_count": demand_count,
        "min_required_records": 14,
        "message": None,
        "run": {
            "forecast_run_id": run.forecast_run_id,
            "model_name": run.model_name,
            "horizon_days": run.horizon_days,
            "training_start": run.training_start.isoformat(),
            "training_end": run.training_end.isoformat(),
            "created_at": run.created_at
        },
        "metrics": {
            "mae": float(metric.mae) if metric else 0.0,
            "wape": float(metric.wape) if metric else 0.0,
            "bias": float(metric.bias) if metric else 0.0
        } if metric else None,
        "values": [
            {
                "forecast_date": v.forecast_date.isoformat(),
                "predicted_demand": float(v.predicted_demand),
                "lower_bound": float(v.lower_bound) if v.lower_bound is not None else None,
                "upper_bound": float(v.upper_bound) if v.upper_bound is not None else None
            }
            for v in values
        ]
    }
