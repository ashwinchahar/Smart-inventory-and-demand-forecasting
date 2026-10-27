from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

from app.db.session import get_db
from app.models.inventory import Product, ScenarioRun, ScenarioResult
from app.services.simulation import SimulationService

router = APIRouter(prefix="/simulation", tags=["Scenario Simulation"])

class ScenarioCreateRequest(BaseModel):
    name: str
    demand_multiplier: float = Field(default=1.0, ge=0.1, le=5.0)
    lead_time_delta_days: int = Field(default=0, ge=-10, le=30)
    safety_stock_factor: float = Field(default=1.0, ge=0.1, le=3.0)
    simulation_days: int = Field(default=14, ge=1, le=60)

@router.get("/scenarios")
def list_scenarios(db: Session = Depends(get_db)):
    runs = (
        db.query(ScenarioRun)
        .options(joinedload(ScenarioRun.results))
        .order_by(desc(ScenarioRun.created_at))
        .all()
    )
    out = []
    for r in runs:
        avg_risk = sum(float(res.simulated_stockout_risk) for res in r.results) / max(1, len(r.results))
        total_holding = sum(float(res.estimated_holding_cost) for res in r.results)
        total_lost_sales = sum(float(res.estimated_lost_sales_cost) for res in r.results)
        out.append({
            "scenario_id": r.scenario_id,
            "name": r.name,
            "demand_multiplier": float(r.demand_multiplier),
            "lead_time_delta_days": r.lead_time_delta_days,
            "safety_stock_factor": float(r.safety_stock_factor),
            "created_at": r.created_at,
            "product_count": len(r.results),
            "avg_stockout_risk": round(avg_risk, 2),
            "total_estimated_holding_cost": round(total_holding, 2),
            "total_estimated_lost_sales_cost": round(total_lost_sales, 2)
        })
    return out

@router.get("/scenarios/{scenario_id}")
def get_scenario_details(scenario_id: int, db: Session = Depends(get_db)):
    run = (
        db.query(ScenarioRun)
        .options(
            joinedload(ScenarioRun.results).joinedload(ScenarioResult.product).joinedload(Product.category)
        )
        .filter(ScenarioRun.scenario_id == scenario_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Scenario not found.")

    results = []
    for res in run.results:
        prod = res.product
        cat_name = prod.category.name if (prod and prod.category) else "General"
        results.append({
            "result_id": res.result_id,
            "product_id": res.product_id,
            "sku": prod.sku if prod else "",
            "product_name": prod.name if prod else "",
            "category_name": cat_name,
            "simulated_stockout_risk": float(res.simulated_stockout_risk),
            "projected_ending_stock": float(res.projected_ending_stock),
            "estimated_holding_cost": float(res.estimated_holding_cost),
            "estimated_lost_sales_cost": float(res.estimated_lost_sales_cost)
        })

    avg_risk = sum(float(res.simulated_stockout_risk) for res in run.results) / max(1, len(run.results))
    total_holding = sum(float(res.estimated_holding_cost) for res in run.results)
    total_lost_sales = sum(float(res.estimated_lost_sales_cost) for res in run.results)

    return {
        "scenario_id": run.scenario_id,
        "name": run.name,
        "demand_multiplier": float(run.demand_multiplier),
        "lead_time_delta_days": run.lead_time_delta_days,
        "safety_stock_factor": float(run.safety_stock_factor),
        "created_at": run.created_at,
        "product_count": len(run.results),
        "avg_stockout_risk": round(avg_risk, 2),
        "total_estimated_holding_cost": round(total_holding, 2),
        "total_estimated_lost_sales_cost": round(total_lost_sales, 2),
        "results": results
    }

@router.delete("/scenarios/{scenario_id}")
def delete_scenario(scenario_id: int, db: Session = Depends(get_db)):
    run = db.query(ScenarioRun).filter(ScenarioRun.scenario_id == scenario_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    db.delete(run)
    db.commit()
    return {"message": "Scenario deleted successfully", "scenario_id": scenario_id}

@router.post("/run")
def trigger_scenario(req: ScenarioCreateRequest, db: Session = Depends(get_db)):
    run = SimulationService.run_scenario(
        db,
        name=req.name,
        demand_multiplier=req.demand_multiplier,
        lead_time_delta_days=req.lead_time_delta_days,
        safety_stock_factor=req.safety_stock_factor,
        simulation_days=req.simulation_days
    )
    return {"message": "Scenario evaluated successfully", "scenario_id": run.scenario_id}
