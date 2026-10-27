from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

from app.models.inventory import (
    DailyDemand, ForecastRun, ForecastValue, ModelMetric
)

class ForecastingService:
    @staticmethod
    def _croston_forecast(series: np.ndarray, horizon: int) -> float:
        """
        Croston's method for intermittent demand:
        Decomposes demand into non-zero size (z) and inter-arrival intervals (p).
        """
        non_zero_indices = np.where(series > 0)[0]
        if len(non_zero_indices) < 2:
            return float(np.mean(series)) if len(series) > 0 else 0.0

        intervals = np.diff(non_zero_indices)
        demands = series[non_zero_indices]

        alpha = 0.1
        z = demands[0]
        p = intervals[0] if len(intervals) > 0 else 1.0

        for i in range(1, len(demands)):
            z = alpha * demands[i] + (1 - alpha) * z
            if i - 1 < len(intervals):
                p = alpha * intervals[i - 1] + (1 - alpha) * p

        rate = z / p if p > 0 else 0.0
        return max(0.0, float(rate))

    @staticmethod
    def generate_forecast(
        db: Session,
        product_id: int,
        model_name: str = "EMA_14",
        horizon_days: int = 14,
        impute_stockouts: bool = True
    ) -> ForecastRun:
        """
        Executes a reproducible forecast run for a given product and model.
        Supports: 'NAIVE', 'SMA_7', 'SMA_14', 'EMA_14', 'HOLT_WINTERS', 'CROSTON'.
        """
        records = (
            db.query(DailyDemand)
            .filter(DailyDemand.product_id == product_id)
            .order_by(DailyDemand.demand_date.asc())
            .all()
        )

        if not records or len(records) < 7:
            # Fallback when insufficient history
            training_start = records[0].demand_date if records else date.today()
            training_end = records[-1].demand_date if records else date.today()
            run = ForecastRun(
                model_name=model_name,
                horizon_days=horizon_days,
                training_start=training_start,
                training_end=training_end,
                created_at=datetime.utcnow()
            )
            db.add(run)
            db.flush()

            base_val = float(records[-1].quantity_sold) if records else 1.0
            for h in range(1, horizon_days + 1):
                f_date = training_end + timedelta(days=h)
                val = ForecastValue(
                    forecast_run_id=run.forecast_run_id,
                    product_id=product_id,
                    forecast_date=f_date,
                    predicted_demand=Decimal(f"{base_val:.4f}"),
                    lower_bound=Decimal(f"{max(0.0, base_val * 0.8):.4f}"),
                    upper_bound=Decimal(f"{base_val * 1.2:.4f}")
                )
                db.add(val)

            metric = ModelMetric(
                forecast_run_id=run.forecast_run_id,
                product_id=product_id,
                mae=Decimal("0.0000"),
                wape=Decimal("0.0000"),
                bias=Decimal("0.0000")
            )
            db.add(metric)
            db.commit()
            return run

        df = pd.DataFrame([
            {
                "date": pd.to_datetime(r.demand_date),
                "demand": float(r.quantity_sold),
                "status": r.data_status,
                "stockout": r.stockout_flag
            }
            for r in records
        ]).set_index("date").sort_index()

        # Data quality-aware imputation: Replace stockout-censored zeros with 7-day rolling mean
        if impute_stockouts:
            rolling_mean = df["demand"].rolling(7, min_periods=1).mean()
            censored_mask = (df["status"] == "CENSORED_STOCKOUT") | ((df["demand"] == 0) & df["stockout"])
            df.loc[censored_mask, "demand"] = rolling_mean[censored_mask]

        series = df["demand"].values
        history_len = len(series)

        # Backtesting evaluation split (last horizon_days as holdout test if history is sufficient)
        eval_split = min(horizon_days, max(3, int(history_len * 0.2)))
        train_series = series[:-eval_split]
        test_series = series[-eval_split:]

        # Fit model on training slice to compute backtest metrics
        preds_eval = ForecastingService._predict_series(train_series, model_name, eval_split)
        
        # Calculate MAE, WAPE, Bias
        abs_errors = np.abs(test_series - preds_eval)
        mae = float(np.mean(abs_errors))
        total_actual = float(np.sum(test_series))
        wape = float(np.sum(abs_errors) / total_actual) if total_actual > 0 else 0.0
        bias = float(np.sum(preds_eval - test_series) / total_actual) if total_actual > 0 else 0.0

        # Now forecast into the actual future using full series
        future_preds = ForecastingService._predict_series(series, model_name, horizon_days)
        std_residual = float(np.std(abs_errors)) if len(abs_errors) > 0 else 1.0

        training_start = records[0].demand_date
        training_end = records[-1].demand_date

        run = ForecastRun(
            model_name=model_name,
            horizon_days=horizon_days,
            training_start=training_start,
            training_end=training_end,
            created_at=datetime.utcnow()
        )
        db.add(run)
        db.flush()

        # Save forecast values with confidence intervals
        for h in range(1, horizon_days + 1):
            f_date = training_end + timedelta(days=h)
            pred = max(0.0, float(future_preds[h - 1]))
            lower = max(0.0, pred - 1.96 * std_residual)
            upper = pred + 1.96 * std_residual

            val = ForecastValue(
                forecast_run_id=run.forecast_run_id,
                product_id=product_id,
                forecast_date=f_date,
                predicted_demand=Decimal(f"{pred:.4f}"),
                lower_bound=Decimal(f"{lower:.4f}"),
                upper_bound=Decimal(f"{upper:.4f}")
            )
            db.add(val)

        metric = ModelMetric(
            forecast_run_id=run.forecast_run_id,
            product_id=product_id,
            mae=Decimal(f"{mae:.4f}"),
            wape=Decimal(f"{wape:.4f}"),
            bias=Decimal(f"{bias:.4f}")
        )
        db.add(metric)
        db.commit()
        return run

    @staticmethod
    def _predict_series(series: np.ndarray, model_name: str, horizon: int) -> np.ndarray:
        if len(series) == 0:
            return np.ones(horizon)

        if model_name == "NAIVE":
            last_val = series[-1]
            return np.full(horizon, last_val)

        elif model_name in ("SMA_7", "SMA_14"):
            window = 7 if model_name == "SMA_7" else 14
            avg = float(np.mean(series[-window:])) if len(series) >= window else float(np.mean(series))
            return np.full(horizon, max(0.0, avg))

        elif model_name == "CROSTON":
            croston_val = ForecastingService._croston_forecast(series, horizon)
            return np.full(horizon, croston_val)

        elif model_name in ("EMA_14", "HOLT_WINTERS"):
            try:
                if len(series) >= 14 and model_name == "HOLT_WINTERS":
                    # Additive trend with weekly seasonality (period=7)
                    model = ExponentialSmoothing(
                        series,
                        trend="add",
                        seasonal="add",
                        seasonal_periods=7,
                        initialization_method="estimated"
                    ).fit(smoothing_level=0.2, smoothing_trend=0.1, smoothing_seasonal=0.1)
                    forecast = model.forecast(horizon)
                    return np.clip(forecast, 0, None)
                else:
                    # Single Exponential Smoothing
                    model = ExponentialSmoothing(series, trend=None, seasonal=None).fit(smoothing_level=0.3)
                    return np.clip(model.forecast(horizon), 0, None)
            except Exception:
                # Fallback to moving average if solver encounters non-invertibility
                avg = float(np.mean(series[-7:]))
                return np.full(horizon, max(0.0, avg))

        # Default fallback
        return np.full(horizon, float(np.mean(series[-7:])))
