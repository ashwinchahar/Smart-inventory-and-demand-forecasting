import math
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
import numpy as np

from app.models.inventory import (
    Product, ProductSupplier, StockBalance, PurchaseOrder, PurchaseOrderItem,
    DailyDemand, ReplenishmentRecommendation, ForecastValue, ForecastRun
)

class ReplenishmentService:
    @classmethod
    def evaluate_product(
        cls,
        db: Session,
        product_id: int,
        warehouse_id: int = 1,
        target_service_level: float = 0.95
    ) -> ReplenishmentRecommendation:
        """
        Calculates optimal inventory replenishment policy with explainable justification:
        - Safety Stock (SS)
        - Lead Time Demand (LTD)
        - Reorder Point (ROP)
        - Recommended Order Quantity (Q)
        - Stockout Risk Score (0-100)
        """
        product = db.query(Product).filter(Product.product_id == product_id).first()
        if not product:
            raise ValueError(f"Product {product_id} not found.")

        # 1. On Hand & Reserved
        bal = db.query(StockBalance).filter(
            StockBalance.product_id == product_id,
            StockBalance.warehouse_id == warehouse_id
        ).first()
        on_hand = bal.on_hand_qty if bal else Decimal("0.0000")
        reserved = bal.reserved_qty if bal else Decimal("0.0000")

        # 2. Inbound Orders (On Order)
        open_po_items = (
            db.query(PurchaseOrderItem)
            .join(PurchaseOrder, PurchaseOrder.purchase_order_id == PurchaseOrderItem.purchase_order_id)
            .filter(
                PurchaseOrderItem.product_id == product_id,
                PurchaseOrder.status.in_(["ORDERED", "PARTIALLY_RECEIVED"])
            )
            .all()
        )
        on_order = sum(
            max(Decimal("0.0000"), it.quantity_ordered - it.quantity_received)
            for it in open_po_items
        )

        inventory_position = on_hand + on_order - reserved

        # 3. Supplier Terms & Lead Time
        ps = db.query(ProductSupplier).filter(
            ProductSupplier.product_id == product_id,
            ProductSupplier.is_primary == True
        ).first()
        if not ps:
            ps = db.query(ProductSupplier).filter(ProductSupplier.product_id == product_id).first()

        lead_time_days = ps.lead_time_days if ps else 3
        moq = ps.minimum_order_qty if ps else Decimal("1.0000")
        pack_size = ps.pack_size if ps else Decimal("1.0000")

        # 4. Demand Metrics & Future Forecast
        recent_demands = (
            db.query(DailyDemand.quantity_sold)
            .filter(DailyDemand.product_id == product_id)
            .order_by(DailyDemand.demand_date.desc())
            .limit(30)
            .all()
        )
        vals = [float(r[0]) for r in recent_demands] if recent_demands else [1.0]
        avg_daily_demand = float(np.mean(vals)) if vals else 1.0
        std_daily_demand = float(np.std(vals)) if len(vals) > 1 else 0.5

        # Service level factor Z (Z=1.65 for 95%, Z=2.33 for 99%)
        z_score = 1.645 if target_service_level >= 0.95 else 1.28

        # Safety Stock = Z * sqrt(L * sigma_D^2)
        safety_stock_val = max(1.0, z_score * std_daily_demand * math.sqrt(lead_time_days))
        lead_time_demand_val = avg_daily_demand * lead_time_days
        rop_val = lead_time_demand_val + safety_stock_val

        # Days of Inventory Coverage
        effective_demand_rate = max(0.1, avg_daily_demand)
        days_of_coverage = float(inventory_position) / effective_demand_rate

        # Risk scoring (0-100 scale)
        if days_of_coverage <= 0:
            stockout_risk = 100.0
            reorder_deadline = date.today()
        elif days_of_coverage <= lead_time_days:
            # Imminent stockout within supplier lead time
            stockout_risk = min(99.0, 75.0 + (1.0 - (days_of_coverage / lead_time_days)) * 25.0)
            reorder_deadline = date.today() + timedelta(days=max(0, int(days_of_coverage)))
        elif days_of_coverage <= (lead_time_days + (safety_stock_val / effective_demand_rate)):
            stockout_risk = 50.0 + ((lead_time_days * 1.5 - days_of_coverage) / lead_time_days) * 20.0
            reorder_deadline = date.today() + timedelta(days=int(days_of_coverage - lead_time_days))
        else:
            stockout_risk = max(5.0, 30.0 - (days_of_coverage - lead_time_days) * 2.0)
            reorder_deadline = date.today() + timedelta(days=max(1, int(days_of_coverage - lead_time_days)))

        # Recommended order quantity
        if float(inventory_position) <= rop_val:
            raw_qty = max(0.0, rop_val - float(inventory_position) + avg_daily_demand * 7)
            # Enforce MOQ
            qty_moq = max(float(moq), raw_qty)
            # Round up to pack_size multiple
            pack_f = float(pack_size)
            recommended_units = math.ceil(qty_moq / pack_f) * pack_f
        else:
            recommended_units = 0.0

        # Construct Explainability Narrative
        explanation = (
            f"Product '{product.name}' (SKU: {product.sku}) has {on_hand:.1f} units on hand, {on_order:.1f} incoming on open POs, "
            f"and {reserved:.1f} reserved, yielding an Inventory Position of {inventory_position:.1f} units. "
            f"With supplier lead time of {lead_time_days} days and average daily sales of {avg_daily_demand:.2f} units, "
            f"Lead Time Demand is {lead_time_demand_val:.1f} units. "
            f"To maintain a {int(target_service_level*100)}% service level against demand volatility (std: {std_daily_demand:.2f}), "
            f"the required Safety Stock buffer is {safety_stock_val:.1f} units, establishing a Reorder Point (ROP) of {rop_val:.1f} units. "
        )
        if recommended_units > 0:
            explanation += (
                f"Because current inventory position ({inventory_position:.1f}) is at or below the ROP ({rop_val:.1f}), "
                f"a replenishment order of {recommended_units:.0f} units (pack size {pack_size:.0f}, MOQ {moq:.0f}) "
                f"must be placed by {reorder_deadline} to avoid a stockout (Risk Score: {stockout_risk:.1f}/100)."
            )
        else:
            explanation += (
                f"Inventory position is currently above the ROP. Current stock provides approximately {days_of_coverage:.1f} days "
                f"of coverage. No reorder is immediately required (Risk Score: {stockout_risk:.1f}/100)."
            )

        existing = db.query(ReplenishmentRecommendation).filter(
            ReplenishmentRecommendation.product_id == product_id
        ).first()

        if existing:
            existing.current_on_hand = on_hand
            existing.current_on_order = on_order
            existing.lead_time_days = lead_time_days
            existing.lead_time_demand = Decimal(f"{lead_time_demand_val:.4f}")
            existing.safety_stock = Decimal(f"{safety_stock_val:.4f}")
            existing.reorder_point = Decimal(f"{rop_val:.4f}")
            existing.recommended_qty = Decimal(f"{recommended_units:.4f}")
            existing.reorder_deadline = reorder_deadline
            existing.stockout_risk_score = Decimal(f"{stockout_risk:.2f}")
            existing.explanation_text = explanation
            if existing.status == "DISMISSED":
                existing.status = "PENDING"
            existing.created_at = datetime.utcnow()
            recommendation = existing
        else:
            recommendation = ReplenishmentRecommendation(
                product_id=product_id,
                current_on_hand=on_hand,
                current_on_order=on_order,
                lead_time_days=lead_time_days,
                lead_time_demand=Decimal(f"{lead_time_demand_val:.4f}"),
                safety_stock=Decimal(f"{safety_stock_val:.4f}"),
                reorder_point=Decimal(f"{rop_val:.4f}"),
                recommended_qty=Decimal(f"{recommended_units:.4f}"),
                reorder_deadline=reorder_deadline,
                stockout_risk_score=Decimal(f"{stockout_risk:.2f}"),
                explanation_text=explanation,
                status="PENDING",
                created_at=datetime.utcnow()
            )
            db.add(recommendation)

        db.commit()
        db.refresh(recommendation)
        return recommendation

    @classmethod
    def evaluate_all_active_products(cls, db: Session) -> List[ReplenishmentRecommendation]:
        products = db.query(Product).filter(Product.is_active == True).all()
        recs = []
        for p in products:
            rec = cls.evaluate_product(db, p.product_id)
            recs.append(rec)
        return recs
