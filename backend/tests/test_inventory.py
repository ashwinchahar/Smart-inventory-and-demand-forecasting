import pytest
import uuid
from datetime import datetime
import concurrent.futures
from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import SessionLocal
from app.models.inventory import Product, StockBalance, Category, StockMovement
from app.schemas.inventory import SaleCreateRequest, SaleItemRequest

client = TestClient(app)

def test_stock_reconciliation():
    """
    Verifies invariant: stock_balances.on_hand_qty == SUM(stock_movements.quantity_delta)
    """
    response = client.get("/api/v1/inventory/reconcile")
    assert response.status_code == 200
    data = response.json()
    assert data["total_products_checked"] > 0
    assert data["discrepancy_count"] == 0, f"Discrepancies found: {data['items']}"

def test_concurrent_overselling_prevention():
    """
    Spawns 20 concurrent threads trying to purchase 1 unit each
    of an SKU that has only 5 units in stock.
    Asserts:
    1. Exactly 5 transactions succeed (200 OK).
    2. Exactly 15 transactions are rejected (400 Insufficient Stock).
    3. Final on_hand_qty reaches exactly 0.0000. Never negative.
    """
    db = SessionLocal()
    test_run_id = uuid.uuid4().hex[:6].upper()
    try:
        # Create a test product with exactly 5 units
        cat = db.query(Category).first()
        prod = Product(
            sku=f"CONCUR-{test_run_id}",
            name=f"Limited Item {test_run_id}",
            category_id=cat.category_id,
            cost_price=Decimal("10.0000"),
            selling_price=Decimal("20.0000"),
            reorder_threshold=Decimal("2.0000")
        )
        db.add(prod)
        db.flush()

        bal = StockBalance(
            product_id=prod.product_id,
            warehouse_id=1,
            on_hand_qty=Decimal("5.0000"),
            reserved_qty=Decimal("0.0000")
        )
        db.add(bal)

        # Record initial inflow movement for ledger reconciliation
        mvt = StockMovement(
            product_id=prod.product_id,
            warehouse_id=1,
            movement_type="INFLOW",
            quantity_delta=Decimal("5.0000"),
            reference_type="MANUAL_ADJUSTMENT",
            reference_id=1,
            occurred_at=datetime.utcnow()
        )
        db.add(mvt)
        db.commit()
        test_product_id = prod.product_id
    finally:
        db.close()

    def attempt_purchase(thread_id):
        payload = {
            "order_number": f"ORD-{test_run_id}-{thread_id}",
            "warehouse_id": 1,
            "items": [
                {
                    "product_id": test_product_id,
                    "quantity": 1.0,
                    "unit_price": 20.0
                }
            ]
        }
        res = client.post("/api/v1/inventory/sales", json=payload)
        return res.status_code

    # Execute 20 simultaneous threads
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(attempt_purchase, i) for i in range(20)]
        results = [f.result() for f in futures]

    successes = results.count(200)
    failures = results.count(400)

    # Validate exact transactional atomicity
    assert successes == 5, f"Expected exactly 5 purchases, got {successes}."
    assert failures == 15, f"Expected 15 rejections, got {failures}."

    # Validate database balance
    db = SessionLocal()
    try:
        final_bal = db.query(StockBalance).filter(StockBalance.product_id == test_product_id).first()
        assert final_bal.on_hand_qty == Decimal("0.0000")
    finally:
        db.close()

def test_purchase_order_and_goods_receipt_limits():
    """
    Tests purchasing flow and guarantees over-receipt is rejected.
    """
    po_suffix = uuid.uuid4().hex[:6].upper()
    # 1. Create PO for 10 units
    po_payload = {
        "po_number": f"PO-TEST-{po_suffix}",
        "supplier_id": 1,
        "expected_at": "2026-11-01T12:00:00",
        "items": [
            {
                "product_id": 1,
                "quantity_ordered": 10.0,
                "unit_cost": 1.20
            }
        ]
    }
    po_res = client.post("/api/v1/inventory/purchase-orders", json=po_payload)
    assert po_res.status_code == 200
    po_id = po_res.json()["purchase_order_id"]

    # 2. Attempt receipt of 15 units (exceeds 10 ordered) -> Expect 400
    over_receipt_payload = {
        "purchase_order_id": po_id,
        "warehouse_id": 1,
        "items": [{"product_id": 1, "quantity_received": 15.0}]
    }
    res_fail = client.post("/api/v1/inventory/goods-receipts", json=over_receipt_payload)
    assert res_fail.status_code == 400
    assert "exceeds outstanding" in res_fail.json()["detail"]

    # 3. Partial receipt of 6 units -> Expect 200
    partial_payload = {
        "purchase_order_id": po_id,
        "warehouse_id": 1,
        "items": [{"product_id": 1, "quantity_received": 6.0}]
    }
    res_partial = client.post("/api/v1/inventory/goods-receipts", json=partial_payload)
    assert res_partial.status_code == 200

    # 4. Remaining receipt of 4 units -> Expect 200, PO becomes COMPLETED
    final_payload = {
        "purchase_order_id": po_id,
        "warehouse_id": 1,
        "items": [{"product_id": 1, "quantity_received": 4.0}]
    }
    res_final = client.post("/api/v1/inventory/goods-receipts", json=final_payload)
    assert res_final.status_code == 200

def test_record_sale_by_sku_and_daily_demand_rollup():
    """
    Verifies that a live POS sale can be performed by SKU,
    deducts stock atomically, and immediately increments today's daily_demand.
    """
    from app.models.inventory import DailyDemand
    db = SessionLocal()
    sku_token = uuid.uuid4().hex[:6].upper()
    cat = db.query(Category).first()
    
    prod = Product(
        sku=f"SKU-LIVE-{sku_token}",
        name=f"Live POS Test Item {sku_token}",
        category_id=cat.category_id,
        unit="unit",
        cost_price=Decimal("10.0000"),
        selling_price=Decimal("20.0000"),
        reorder_threshold=Decimal("5.0000"),
        is_active=True
    )
    db.add(prod)
    db.flush()

    bal = StockBalance(
        product_id=prod.product_id,
        warehouse_id=1,
        on_hand_qty=Decimal("10.0000"),
        reserved_qty=Decimal("0.0000")
    )
    db.add(bal)
    mv = StockMovement(
        product_id=prod.product_id,
        warehouse_id=1,
        movement_type="OPENING_BALANCE",
        quantity_delta=Decimal("10.0000"),
        reference_type="INITIAL_SETUP",
        reference_id=prod.product_id,
        occurred_at=datetime.utcnow()
    )
    db.add(mv)
    db.commit()
    prod_id = prod.product_id
    db.close()

    # Perform sale using SKU
    sale_payload = {
        "warehouse_id": 1,
        "items": [
            {
                "sku": f"SKU-LIVE-{sku_token}",
                "quantity": 3.0
            }
        ]
    }
    res = client.post("/api/v1/inventory/sales", json=sale_payload)
    assert res.status_code == 200

    # Verify stock balance
    db2 = SessionLocal()
    updated_bal = db2.query(StockBalance).filter(StockBalance.product_id == prod_id, StockBalance.warehouse_id == 1).first()
    assert updated_bal.on_hand_qty == Decimal("7.0000")

    # Verify daily demand rollup for today
    today = datetime.utcnow().date()
    daily = db2.query(DailyDemand).filter(DailyDemand.product_id == prod_id, DailyDemand.demand_date == today).first()
    assert daily is not None
    assert daily.quantity_sold >= Decimal("3.0000")
    db2.close()

def test_sales_csv_upload_and_template():
    """
    Verifies downloading template CSV and uploading a store CSV file.
    """
    # 1. Download template
    tmpl_res = client.get("/api/v1/inventory/sales/template-csv")
    assert tmpl_res.status_code == 200
    assert "date,sku,product_name,quantity_sold" in tmpl_res.text

    # 2. Upload CSV
    csv_data = (
        "date,sku,product_name,quantity_sold,stockout_flag\n"
        "2026-06-01,SKU-CSV-TEST,CSV Imported Item,15,false\n"
        "2026-06-02,SKU-CSV-TEST,CSV Imported Item,20,false\n"
    )
    files = {"file": ("test_sales.csv", csv_data.encode("utf-8"), "text/csv")}
    upload_res = client.post("/api/v1/inventory/sales/upload-csv", files=files)
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert data["records_ingested"] >= 2
    assert data["products_affected"] >= 1

def test_stock_csv_upload_and_template():
    """
    Verifies bulk updating available stock balances via CSV and maintaining double-entry ledger reconciliation.
    """
    # 1. Download stock template
    tmpl_res = client.get("/api/v1/inventory/stock/template-csv")
    assert tmpl_res.status_code == 200
    assert "sku,product_name,on_hand_qty" in tmpl_res.text

    # 2. Upload stock CSV in replace mode
    stock_csv_data = (
        "sku,product_name,on_hand_qty,reorder_threshold\n"
        "SKU-DAIRY-001,Organic Whole Milk 1L,150,30\n"
        "SKU-BAKE-002,Artisan Sourdough Loaf,75,20\n"
    )
    files = {"file": ("stock_take.csv", stock_csv_data.encode("utf-8"), "text/csv")}
    upload_res = client.post("/api/v1/inventory/stock/upload-csv", data={"mode": "replace"}, files=files)
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert data["products_updated"] >= 2
    assert data["total_units_after"] >= 225

    # 3. Check physical balance directly
    db = SessionLocal()
    p = db.query(Product).filter(Product.sku == "SKU-DAIRY-001").first()
    bal = db.query(StockBalance).filter(StockBalance.product_id == p.product_id).first()
    assert bal.on_hand_qty == Decimal("150.0000")
    db.close()

    # 4. Verify reconciliation invariant is preserved (0 discrepancies)
    rec_res = client.get("/api/v1/inventory/reconcile")
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert rec_data["discrepancy_count"] == 0

