from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func

from app.db.session import get_db
from app.models.inventory import Product, DataQualityIssue, Category
from app.services.data_quality import DataQualityService

router = APIRouter(prefix="/data-quality", tags=["Data Quality & Audit"])

class BulkResolveRequest(BaseModel):
    issue_ids: Optional[List[int]] = None
    resolve_all_flagged: Optional[bool] = False
    action: str = "APPROVED_CORRECTION"
    resolution_note: Optional[str] = "Approved demand imputation"

@router.get("/summary")
def get_audit_summary(db: Session = Depends(get_db)):
    """
    Returns aggregated audit metrics across the entire product catalog.
    """
    flagged = db.query(func.count(DataQualityIssue.issue_id)).filter(DataQualityIssue.status == "FLAGGED").scalar() or 0
    approved = db.query(func.count(DataQualityIssue.issue_id)).filter(DataQualityIssue.status == "APPROVED_CORRECTION").scalar() or 0
    ignored = db.query(func.count(DataQualityIssue.issue_id)).filter(DataQualityIssue.status == "IGNORED").scalar() or 0
    censored = db.query(func.count(DataQualityIssue.issue_id)).filter(DataQualityIssue.issue_type == "STOCKOUT_CENSORED").scalar() or 0
    anomalies = db.query(func.count(DataQualityIssue.issue_id)).filter(DataQualityIssue.issue_type == "ANOMALY_SPIKE").scalar() or 0
    missing = db.query(func.count(DataQualityIssue.issue_id)).filter(DataQualityIssue.issue_type == "MISSING_DATE").scalar() or 0
    total = flagged + approved + ignored

    return {
        "total": total,
        "flagged": flagged,
        "approved": approved,
        "ignored": ignored,
        "censored_zeros": censored,
        "anomaly_spikes": anomalies,
        "missing_dates": missing
    }

@router.get("/issues")
def list_issues(
    status: Optional[str] = None, 
    issue_type: Optional[str] = None,
    limit: Optional[int] = Query(None, ge=1, le=5000),
    db: Session = Depends(get_db)
):
    query = (
        db.query(DataQualityIssue)
        .options(
            joinedload(DataQualityIssue.product).joinedload(Product.category)
        )
    )
    if status:
        query = query.filter(DataQualityIssue.status == status)
    if issue_type:
        query = query.filter(DataQualityIssue.issue_type == issue_type)

    query = query.order_by(desc(DataQualityIssue.detected_at), desc(DataQualityIssue.issue_id))

    if limit:
        query = query.limit(limit)

    issues = query.all()
    return [
        {
            "issue_id": i.issue_id,
            "product_id": i.product_id,
            "sku": i.product.sku,
            "product_name": i.product.name,
            "category_name": i.product.category.name if i.product.category else "General",
            "issue_type": i.issue_type,
            "details": i.details,
            "detected_at": i.detected_at.isoformat() if i.detected_at else None,
            "status": i.status,
            "resolution_note": i.resolution_note
        }
        for i in issues
    ]

@router.post("/issues/bulk-resolve")
def bulk_resolve(req: BulkResolveRequest, db: Session = Depends(get_db)):
    """
    Executes a high-performance single SQL update for all specified issues or all flagged issues.
    """
    query = db.query(DataQualityIssue)
    if req.resolve_all_flagged:
        query = query.filter(DataQualityIssue.status == "FLAGGED")
    elif req.issue_ids:
        query = query.filter(DataQualityIssue.issue_id.in_(req.issue_ids))
    else:
        raise HTTPException(status_code=400, detail="No issues specified for bulk resolution.")

    count = query.update(
        {
            DataQualityIssue.status: req.action,
            DataQualityIssue.resolution_note: req.resolution_note or f"Bulk resolved: {req.action}"
        },
        synchronize_session=False
    )
    db.commit()
    return {
        "message": f"Successfully updated {count} issue(s) to {req.action}.",
        "updated_count": count,
        "action": req.action
    }

@router.post("/audit/{product_id}")
def audit_product(product_id: int, db: Session = Depends(get_db)):
    issues = DataQualityService.audit_daily_demand(db, product_id)
    return {"message": f"Audit complete. Found {len(issues)} issues.", "issues": issues}

@router.post("/audit-all")
def audit_all_products(db: Session = Depends(get_db)):
    products = db.query(Product).filter(Product.is_active == True).all()
    total_found = 0
    for p in products:
        issues = DataQualityService.audit_daily_demand(db, p.product_id)
        total_found += len(issues)
    return {"message": f"Full audit complete across {len(products)} products. Detected {total_found} issues."}

@router.put("/issues/{issue_id}")
def resolve_issue(
    issue_id: int,
    action: str = Query(..., pattern="^(APPROVED_CORRECTION|IGNORED)$"),
    resolution_note: str = Query("Resolved by user"),
    db: Session = Depends(get_db)
):
    try:
        updated = DataQualityService.resolve_issue(db, issue_id, action, resolution_note)
        return {"message": "Issue status updated", "issue_id": updated.issue_id, "status": updated.status}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
