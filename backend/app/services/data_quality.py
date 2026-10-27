from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
import numpy as np
from app.models.inventory import (
    Product, DailyDemand, StockBalance, StockMovement, DataQualityIssue
)

class DataQualityService:
    @staticmethod
    def audit_daily_demand(db: Session, product_id: int) -> List[Dict[str, Any]]:
        """
        Audits the daily demand sequence for an SKU:
        1. Identifies missing dates in the time series.
        2. Distinguishes genuine zero demand from stockout-censored demand.
        3. Flags statistical demand spikes (> 3 standard deviations).
        """
        records = (
            db.query(DailyDemand)
            .filter(DailyDemand.product_id == product_id)
            .order_by(DailyDemand.demand_date.asc())
            .all()
        )
        if not records or len(records) < 3:
            return []

        detected_issues: List[Dict[str, Any]] = []

        # 1. Missing dates check
        start_date = records[0].demand_date
        end_date = records[-1].demand_date
        existing_dates = {r.demand_date for r in records}

        curr = start_date
        missing_dates = []
        while curr <= end_date:
            if curr not in existing_dates:
                missing_dates.append(curr.isoformat())
            curr += timedelta(days=1)

        if missing_dates:
            issue = DataQualityIssue(
                product_id=product_id,
                issue_type="MISSING_DATE",
                details=f"Missing {len(missing_dates)} calendar dates between {start_date} and {end_date}: {missing_dates[:5]}...",
                detected_at=datetime.utcnow(),
                status="FLAGGED"
            )
            db.add(issue)
            detected_issues.append({"type": "MISSING_DATE", "count": len(missing_dates), "dates": missing_dates[:5]})

        # 2. Stockout Censoring & Anomaly Spike Detection
        quantities = [float(r.quantity_sold) for r in records]
        mean_qty = float(np.mean(quantities))
        std_qty = float(np.std(quantities))
        spike_threshold = mean_qty + (3.0 * std_qty) if std_qty > 0 else 999999.0

        # Pre-cache existing issue signatures for this product to avoid N+1 queries
        existing_issues = (
            db.query(DataQualityIssue.issue_type, DataQualityIssue.details)
            .filter(DataQualityIssue.product_id == product_id)
            .all()
        )
        existing_details_set = {f"{itype}::{detail}" for itype, detail in existing_issues}

        for r in records:
            date_str = r.demand_date.isoformat()

            # Check stockout censoring: zero sales on a day when stock was 0
            if (r.quantity_sold == Decimal("0.0000") and r.stockout_flag) or r.data_status == "CENSORED_STOCKOUT":
                r.data_status = "CENSORED_STOCKOUT"
                issue_detail = f"Zero sales on {r.demand_date} coincided with stockout. Censored observation flagged for demand imputation."
                issue_key = f"STOCKOUT_CENSORED::{issue_detail}"

                if issue_key not in existing_details_set:
                    issue = DataQualityIssue(
                        product_id=product_id,
                        issue_type="STOCKOUT_CENSORED",
                        details=issue_detail,
                        detected_at=datetime.utcnow(),
                        status="FLAGGED"
                    )
                    db.add(issue)
                    existing_details_set.add(issue_key)
                    detected_issues.append({"type": "STOCKOUT_CENSORED", "date": date_str})

            # Check demand spikes
            elif float(r.quantity_sold) > spike_threshold and float(r.quantity_sold) > 5.0:
                issue_detail = f"Demand spike detected on {r.demand_date}: sold {r.quantity_sold} (historical mean: {mean_qty:.2f}, std: {std_qty:.2f})."
                issue_key = f"ANOMALY_SPIKE::{issue_detail}"

                if issue_key not in existing_details_set:
                    r.data_status = "ANOMALY_SPIKE"
                    issue = DataQualityIssue(
                        product_id=product_id,
                        issue_type="ANOMALY_SPIKE",
                        details=issue_detail,
                        detected_at=datetime.utcnow(),
                        status="FLAGGED"
                    )
                    db.add(issue)
                    existing_details_set.add(issue_key)
                    detected_issues.append({"type": "ANOMALY_SPIKE", "date": date_str, "qty": float(r.quantity_sold)})

        db.commit()
        return detected_issues

    @staticmethod
    def resolve_issue(db: Session, issue_id: int, action: str, resolution_note: str) -> DataQualityIssue:
        issue = db.query(DataQualityIssue).filter(DataQualityIssue.issue_id == issue_id).first()
        if not issue:
            raise ValueError(f"Issue {issue_id} not found.")

        issue.status = action  # 'APPROVED_CORRECTION', 'IGNORED'
        issue.resolution_note = resolution_note
        db.commit()
        db.refresh(issue)
        return issue
