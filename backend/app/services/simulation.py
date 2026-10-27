from datetime import datetime
from decimal import Decimal
from typing import List, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.models.inventory import (
    Product, ProductSupplier, StockBalance, DailyDemand, ScenarioRun, ScenarioResult
)
import numpy as np

class SimulationService:
    @classmethod
    def run_scenario(
        cls,
        db: Session,
        name: str,
        demand_multiplier: float = 1.0,
        lead_time_delta_days: int = 0,
        safety_stock_factor: float = 1.0,
        simulation_days: int = 14
    ) -> ScenarioRun:
        """
        Simulates supply chain disruptions and demand shocks across the inventory catalog.
        Estimates projected ending inventory, stockout probabilities, and financial impact.
        """
        run = ScenarioRun(
            name=name,
            demand_multiplier=Decimal(f"{demand_multiplier:.2f}"),
            lead_time_delta_days=lead_time_delta_days,
            safety_stock_factor=Decimal(f"{safety_stock_factor:.2f}"),
            created_at=datetime.utcnow()
        )
        db.add(run)
        db.flush()

        # Preload all active products with suppliers and balances in a single query
        products = (
            db.query(Product)
            .options(
                joinedload(Product.stock_balances),
                joinedload(Product.suppliers)
            )
            .filter(Product.is_active == True)
            .all()
        )

        # Bulk compute recent daily demand averages across all products in 1 query
        avg_demands = (
            db.query(DailyDemand.product_id, func.avg(DailyDemand.quantity_sold))
            .group_by(DailyDemand.product_id)
            .all()
        )
        avg_demand_map = {p_id: float(avg_qty or 2.0) for p_id, avg_qty in avg_demands}

        daily_holding_rate = 0.20 / 365.0

        for p in products:
            bal = p.stock_balances[0] if p.stock_balances else None
            current_on_hand = float(bal.on_hand_qty) if bal else 0.0

            ps = next((s for s in p.suppliers if s.is_primary), p.suppliers[0]) if p.suppliers else None
            base_lead_time = ps.lead_time_days if ps else 3
            simulated_lead_time = max(1, base_lead_time + lead_time_delta_days)

            base_daily = avg_demand_map.get(p.product_id, 2.0)
            
            # Apply shock multiplier
            simulated_daily_demand = max(0.01, base_daily * demand_multiplier)
            total_simulated_demand = simulated_daily_demand * simulation_days

            # Inventory trajectory
            projected_ending_stock = max(0.0, current_on_hand - total_simulated_demand)
            unmet_demand = max(0.0, total_simulated_demand - current_on_hand)

            # Stockout risk calculation factoring lead time demand and safety stock buffer
            target_buffer = max(1.0, (simulated_daily_demand * simulated_lead_time) * safety_stock_factor)
            if current_on_hand <= 0:
                simulated_risk = 100.0
            elif current_on_hand < target_buffer:
                deficit_ratio = (target_buffer - current_on_hand) / target_buffer
                simulated_risk = min(99.0, 50.0 + (deficit_ratio * 49.0))
            else:
                coverage_ratio = current_on_hand / target_buffer
                simulated_risk = max(5.0, min(45.0, 30.0 / max(0.1, coverage_ratio)))

            # Financial implications
            unit_cost = float(p.cost_price or 0.0)
            unit_price = float(p.selling_price or 0.0)
            unit_margin = max(0.0, unit_price - unit_cost)

            # Annual holding cost assumed 20%
            avg_stock_held = (current_on_hand + projected_ending_stock) / 2.0
            estimated_holding_cost = max(0.0, avg_stock_held * unit_cost * daily_holding_rate * simulation_days)
            estimated_lost_sales_cost = max(0.0, unmet_demand * unit_margin)

            result = ScenarioResult(
                scenario_id=run.scenario_id,
                product_id=p.product_id,
                simulated_stockout_risk=Decimal(f"{simulated_risk:.2f}"),
                projected_ending_stock=Decimal(f"{projected_ending_stock:.4f}"),
                estimated_holding_cost=Decimal(f"{estimated_holding_cost:.4f}"),
                estimated_lost_sales_cost=Decimal(f"{estimated_lost_sales_cost:.4f}")
            )
            db.add(result)

        db.commit()
        db.refresh(run)
        return run
