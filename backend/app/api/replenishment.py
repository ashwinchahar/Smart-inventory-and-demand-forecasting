import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

from app.db.session import get_db
from app.models.inventory import (
    Product, ProductSupplier, Supplier, PurchaseOrder, PurchaseOrderItem,
    ReplenishmentRecommendation
)
from app.services.replenishment import ReplenishmentService

router = APIRouter(prefix="/replenishment", tags=["Replenishment Intelligence"])

class CreatePORequest(BaseModel):
    quantity: Optional[float] = None

class BulkPORequest(BaseModel):
    recommendation_ids: List[int]

@router.get("/recommendations")
def list_recommendations(status: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Lists replenishment recommendations ranked by stockout risk score (descending)
    with full product, department, cost, and supplier metadata via joinedload.
    """
    query = (
        db.query(ReplenishmentRecommendation)
        .options(
            joinedload(ReplenishmentRecommendation.product).joinedload(Product.category),
            joinedload(ReplenishmentRecommendation.product).joinedload(Product.suppliers).joinedload(ProductSupplier.supplier)
        )
    )
    if status:
        query = query.filter(ReplenishmentRecommendation.status == status)
    
    recs = query.order_by(desc(ReplenishmentRecommendation.stockout_risk_score)).all()

    result = []
    for r in recs:
        p = r.product
        supplier_name = "Default Wholesale"
        supplier_id = 1
        if p.suppliers:
            primary_ps = next((s for s in p.suppliers if s.is_primary), p.suppliers[0])
            if primary_ps and primary_ps.supplier:
                supplier_name = primary_ps.supplier.name
                supplier_id = primary_ps.supplier_id

        result.append({
            "recommendation_id": r.recommendation_id,
            "product_id": r.product_id,
            "sku": p.sku,
            "product_name": p.name,
            "category_name": p.category.name if p.category else "General Grocery",
            "cost_price": float(p.cost_price),
            "selling_price": float(p.selling_price),
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "current_on_hand": float(r.current_on_hand),
            "current_on_order": float(r.current_on_order),
            "lead_time_days": r.lead_time_days,
            "lead_time_demand": float(r.lead_time_demand),
            "safety_stock": float(r.safety_stock),
            "reorder_point": float(r.reorder_point),
            "recommended_qty": float(r.recommended_qty),
            "reorder_deadline": r.reorder_deadline.isoformat(),
            "stockout_risk_score": float(r.stockout_risk_score),
            "explanation_text": r.explanation_text,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })

    return result

@router.post("/evaluate")
def run_evaluation(db: Session = Depends(get_db)):
    """
    Recalculates inventory position, ROP, safety stock, and recommendations
    across all active SKUs.
    """
    results = ReplenishmentService.evaluate_all_active_products(db)
    return {"message": f"Successfully evaluated {len(results)} products."}

@router.put("/recommendations/{recommendation_id}/status")
def update_status(recommendation_id: int, status: str = Query(..., pattern="^(ACCEPTED|DISMISSED|PENDING)$"), db: Session = Depends(get_db)):
    rec = db.query(ReplenishmentRecommendation).filter(ReplenishmentRecommendation.recommendation_id == recommendation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found.")
    rec.status = status
    db.commit()
    return {"message": "Status updated successfully", "status": status}

@router.post("/recommendations/{recommendation_id}/create-po")
def create_po_from_recommendation(
    recommendation_id: int, 
    req: Optional[CreatePORequest] = None, 
    db: Session = Depends(get_db)
):
    """
    Directly converts a single replenishment recommendation into an official Purchase Order.
    """
    rec = db.query(ReplenishmentRecommendation).filter(
        ReplenishmentRecommendation.recommendation_id == recommendation_id
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found.")

    product = db.query(Product).filter(Product.product_id == rec.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    # Determine supplier
    ps = db.query(ProductSupplier).filter(
        ProductSupplier.product_id == rec.product_id, 
        ProductSupplier.is_primary == True
    ).first()
    if not ps:
        ps = db.query(ProductSupplier).filter(ProductSupplier.product_id == rec.product_id).first()

    supplier_id = ps.supplier_id if ps else 1
    supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()
    supplier_name = supplier.name if supplier else "Vendor"
    lead_days = ps.lead_time_days if ps else rec.lead_time_days
    expected_at = datetime.utcnow() + timedelta(days=lead_days)

    ordered_qty = req.quantity if (req and req.quantity and req.quantity > 0) else float(rec.recommended_qty)
    if ordered_qty <= 0:
        ordered_qty = float(rec.reorder_point) if float(rec.reorder_point) > 0 else 10.0

    po_number = f"PO-{int(datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:4].upper()}"
    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=supplier_id,
        status="ORDERED",
        ordered_at=datetime.utcnow(),
        expected_at=expected_at
    )
    db.add(po)
    db.flush()

    po_item = PurchaseOrderItem(
        purchase_order_id=po.purchase_order_id,
        product_id=rec.product_id,
        quantity_ordered=Decimal(str(ordered_qty)),
        quantity_received=Decimal("0.0"),
        unit_cost=product.cost_price
    )
    db.add(po_item)

    # Update recommendation
    rec.status = "ACCEPTED"
    rec.current_on_order = rec.current_on_order + Decimal(str(ordered_qty))
    db.commit()

    return {
        "message": f"Successfully created Purchase Order {po_number} with {supplier_name}",
        "po_number": po_number,
        "purchase_order_id": po.purchase_order_id,
        "supplier_name": supplier_name,
        "ordered_qty": ordered_qty,
        "status": "ACCEPTED"
    }

@router.post("/recommendations/bulk-create-po")
def bulk_create_po(
    req: BulkPORequest, 
    db: Session = Depends(get_db)
):
    """
    Groups selected recommendations by supplier and generates consolidated Purchase Orders.
    """
    if not req.recommendation_ids:
        raise HTTPException(status_code=400, detail="No recommendations specified.")

    recs = (
        db.query(ReplenishmentRecommendation)
        .options(
            joinedload(ReplenishmentRecommendation.product).joinedload(Product.suppliers).joinedload(ProductSupplier.supplier)
        )
        .filter(ReplenishmentRecommendation.recommendation_id.in_(req.recommendation_ids))
        .all()
    )

    if not recs:
        raise HTTPException(status_code=404, detail="No matching recommendations found.")

    # Group by supplier
    supplier_groups = {}
    for r in recs:
        p = r.product
        supplier_id = 1
        supplier_name = "Wholesale Supplier"
        lead_days = r.lead_time_days or 3

        if p.suppliers:
            ps = next((s for s in p.suppliers if s.is_primary), p.suppliers[0])
            if ps:
                supplier_id = ps.supplier_id
                lead_days = ps.lead_time_days
                if ps.supplier:
                    supplier_name = ps.supplier.name

        if supplier_id not in supplier_groups:
            supplier_groups[supplier_id] = {
                "supplier_name": supplier_name,
                "lead_days": lead_days,
                "items": []
            }
        supplier_groups[supplier_id]["items"].append(r)

    created_pos = []
    now = datetime.utcnow()

    for supp_id, data in supplier_groups.items():
        po_number = f"PO-{int(now.timestamp())}-{uuid.uuid4().hex[:4].upper()}"
        expected_at = now + timedelta(days=data["lead_days"])
        po = PurchaseOrder(
            po_number=po_number,
            supplier_id=supp_id,
            status="ORDERED",
            ordered_at=now,
            expected_at=expected_at
        )
        db.add(po)
        db.flush()

        total_units = Decimal("0")
        for r in data["items"]:
            qty = r.recommended_qty if r.recommended_qty > 0 else r.reorder_point
            if qty <= 0:
                qty = Decimal("10.0")

            po_item = PurchaseOrderItem(
                purchase_order_id=po.purchase_order_id,
                product_id=r.product_id,
                quantity_ordered=qty,
                quantity_received=Decimal("0.0"),
                unit_cost=r.product.cost_price
            )
            db.add(po_item)
            total_units += qty

            r.status = "ACCEPTED"
            r.current_on_order = r.current_on_order + qty

        created_pos.append({
            "po_number": po_number,
            "purchase_order_id": po.purchase_order_id,
            "supplier_name": data["supplier_name"],
            "line_items_count": len(data["items"]),
            "total_units": float(total_units)
        })

    db.commit()

    return {
        "message": f"Successfully generated {len(created_pos)} consolidated Purchase Order(s).",
        "created_pos": created_pos,
        "total_recommendations_approved": len(recs)
    }
