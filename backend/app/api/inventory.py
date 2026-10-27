from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

from app.db.session import get_db
from app.models.inventory import (
    SalesOrder, SalesOrderItem, PurchaseOrder, PurchaseOrderItem,
    GoodsReceipt, StockMovement, Product
)
from app.schemas.inventory import (
    SaleCreateRequest, SalesOrderResponse, SalesOrderItemResponse,
    PurchaseOrderCreate, GoodsReceiptCreate,
    StockMovementResponse, ReconciliationResponse, SalesUploadResponse, StockUploadResponse
)
from app.services.inventory import InventoryService

router = APIRouter(prefix="/inventory", tags=["Inventory & Transactions"])

@router.post("/sales/upload-csv", response_model=SalesUploadResponse)
async def upload_sales_csv(
    file: UploadFile = File(...),
    mode: str = Form("demand_only"),
    db: Session = Depends(get_db)
):
    """
    Bulk uploads historical store sales records from CSV or Excel file.
    Feeds quantities into daily_demand for instant training of demand forecasting models.
    """
    content = await file.read()
    result = InventoryService.upload_sales_csv(db, content, file.filename or "upload.csv", mode)
    return result

@router.get("/sales/template-csv")
def download_sample_csv():
    """
    Provides a standardized sample CSV template for store managers and testing.
    """
    csv_content = (
        "date,sku,product_name,quantity_sold,stockout_flag\n"
        "2026-05-01,SKU-MILK-001,Whole Milk 1L,45,false\n"
        "2026-05-01,SKU-YOG-002,Greek Yogurt 500g,22,false\n"
        "2026-05-01,SKU-OAT-003,Organic Oat Milk 1L,18,false\n"
        "2026-05-02,SKU-MILK-001,Whole Milk 1L,0,true\n"
        "2026-05-02,SKU-YOG-002,Greek Yogurt 500g,28,false\n"
        "2026-05-02,SKU-OAT-003,Organic Oat Milk 1L,15,false\n"
        "2026-05-03,SKU-MILK-001,Whole Milk 1L,52,false\n"
        "2026-05-03,SKU-YOG-002,Greek Yogurt 500g,30,false\n"
        "2026-05-03,SKU-OAT-003,Organic Oat Milk 1L,21,false\n"
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_store_sales_history.csv"}
    )

@router.post("/stock/upload-csv", response_model=StockUploadResponse)
async def upload_stock_csv(
    file: UploadFile = File(...),
    mode: str = Form("replace"),
    warehouse_id: int = Form(1),
    db: Session = Depends(get_db)
):
    """
    Bulk updates physical on-hand stock balances from a CSV or Excel count file.
    Modes:
      - 'replace' (default): Sets physical on-hand stock directly to the counted amount (e.g. stocktake).
      - 'adjust': Adds or subtracts (+/-) delta to existing on-hand stock.
    Maintains double-entry ledger invariant by posting StockMovement entries.
    """
    content = await file.read()
    result = InventoryService.upload_stock_csv(db, content, file.filename or "stock.csv", mode, warehouse_id)
    return result

@router.get("/stock/template-csv")
def download_sample_stock_csv(db: Session = Depends(get_db)):
    """
    Provides a standardized sample CSV template for physical stock counts & stocktakes.
    Pre-populates sample active products for easy editing.
    """
    prods = db.query(Product).filter(Product.is_active == True).limit(5).all()
    lines = ["sku,product_name,on_hand_qty,reorder_threshold"]
    if prods:
        for p in prods:
            bal = p.stock_balances[0].on_hand_qty if p.stock_balances else 50
            lines.append(f"{p.sku},{p.name},{bal:.0f},{p.reorder_threshold:.0f}")
    else:
        lines.append("SKU-DAIRY-001,Organic Whole Milk 1L,120,25")
        lines.append("SKU-BAKE-002,Artisan Sourdough Loaf,45,15")
        lines.append("SKU-BEV-003,Cold Brew Coffee 330ml,80,20")

    csv_content = "\n".join(lines) + "\n"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=physical_stock_count_template.csv"}
    )

@router.post("/sales", response_model=SalesOrderResponse)
def record_sale(req: SaleCreateRequest, db: Session = Depends(get_db)):
    """
    Executes an atomic checkout.
    Guarantees no overselling via pessimistic row-level locking.
    """
    order = InventoryService.record_sale(db, req)
    
    # Format response
    items_resp = []
    for it in order.items:
        prod = db.query(Product).filter(Product.product_id == it.product_id).first()
        items_resp.append(SalesOrderItemResponse(
            item_id=it.item_id,
            product_id=it.product_id,
            product_name=prod.name if prod else None,
            sku=prod.sku if prod else None,
            quantity=it.quantity,
            unit_price=it.unit_price,
            cost_price=it.cost_price
        ))

    return SalesOrderResponse(
        sales_order_id=order.sales_order_id,
        order_number=order.order_number,
        status=order.status,
        total_amount=order.total_amount,
        created_at=order.created_at,
        items=items_resp
    )

@router.get("/sales", response_model=List[SalesOrderResponse])
def list_sales(
    limit: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = (
        db.query(SalesOrder)
        .options(joinedload(SalesOrder.items).joinedload(SalesOrderItem.product))
    )
    if start_date:
        query = query.filter(SalesOrder.created_at >= start_date)
    if end_date:
        query = query.filter(SalesOrder.created_at <= end_date)

    query = query.order_by(desc(SalesOrder.created_at))

    if limit is not None and limit > 0:
        query = query.limit(limit)

    orders = query.all()
    res = []
    for o in orders:
        items = []
        for it in o.items:
            prod = it.product
            items.append(SalesOrderItemResponse(
                item_id=it.item_id,
                product_id=it.product_id,
                product_name=prod.name if prod else None,
                sku=prod.sku if prod else None,
                quantity=it.quantity,
                unit_price=it.unit_price,
                cost_price=it.cost_price
            ))
        res.append(SalesOrderResponse(
            sales_order_id=o.sales_order_id,
            order_number=o.order_number,
            status=o.status,
            total_amount=o.total_amount,
            created_at=o.created_at,
            items=items
        ))
    return res

@router.post("/purchase-orders")
def create_purchase_order(req: PurchaseOrderCreate, db: Session = Depends(get_db)):
    po = InventoryService.create_purchase_order(db, req)
    return {"message": "Purchase order created", "purchase_order_id": po.purchase_order_id, "po_number": po.po_number}

@router.get("/purchase-orders")
def list_purchase_orders(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
            joinedload(PurchaseOrder.supplier)
        )
    )
    if status:
        query = query.filter(PurchaseOrder.status == status)
    pos = query.order_by(desc(PurchaseOrder.ordered_at)).all()
    
    out = []
    for p in pos:
        items = []
        for it in p.items:
            prod = it.product
            items.append({
                "po_item_id": it.po_item_id,
                "product_id": it.product_id,
                "product_name": prod.name if prod else None,
                "quantity_ordered": it.quantity_ordered,
                "quantity_received": it.quantity_received,
                "unit_cost": it.unit_cost
            })
        out.append({
            "purchase_order_id": p.purchase_order_id,
            "po_number": p.po_number,
            "supplier_id": p.supplier_id,
            "supplier_name": p.supplier.name if p.supplier else None,
            "status": p.status,
            "ordered_at": p.ordered_at,
            "expected_at": p.expected_at,
            "items": items
        })
    return out

@router.post("/goods-receipts")
def receive_goods(req: GoodsReceiptCreate, db: Session = Depends(get_db)):
    receipt = InventoryService.receive_goods(db, req)
    return {"message": "Goods received successfully", "receipt_id": receipt.receipt_id}

@router.get("/movements", response_model=List[StockMovementResponse])
def get_stock_movements(product_id: Optional[int] = None, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(StockMovement)
    if product_id:
        query = query.filter(StockMovement.product_id == product_id)
    movements = query.order_by(desc(StockMovement.occurred_at)).limit(limit).all()

    resp = []
    for m in movements:
        prod = db.query(Product).filter(Product.product_id == m.product_id).first()
        resp.append(StockMovementResponse(
            movement_id=m.movement_id,
            product_id=m.product_id,
            product_name=prod.name if prod else None,
            warehouse_id=m.warehouse_id,
            movement_type=m.movement_type,
            quantity_delta=m.quantity_delta,
            reference_type=m.reference_type,
            reference_id=m.reference_id,
            occurred_at=m.occurred_at
        ))
    return resp

@router.get("/reconcile", response_model=ReconciliationResponse)
def reconcile_inventory(warehouse_id: int = 1, db: Session = Depends(get_db)):
    """
    Verifies mathematical invariant:
    stock_balances.on_hand_qty == SUM(stock_movements.quantity_delta)
    """
    return InventoryService.reconcile_stock(db, warehouse_id)
