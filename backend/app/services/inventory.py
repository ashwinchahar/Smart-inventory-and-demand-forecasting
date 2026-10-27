import uuid
from decimal import Decimal
from typing import List
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.inventory import (
    Product, Warehouse, StockBalance, StockMovement,
    SalesOrder, SalesOrderItem, PurchaseOrder, PurchaseOrderItem,
    GoodsReceipt, GoodsReceiptItem, AuditLog, DailyDemand, Category
)
from app.schemas.inventory import (
    SaleCreateRequest, SalesOrderResponse, SalesOrderItemResponse,
    PurchaseOrderCreate, GoodsReceiptCreate,
    ReconciliationResponse, ReconciliationItem
)

class InventoryService:
    @staticmethod
    def record_sale(db: Session, req: SaleCreateRequest) -> SalesOrder:
        """
        Executes an atomic checkout.
        Acquires row-level pessimistic locks (SELECT ... FOR UPDATE) on stock_balances
        to guarantee concurrent transactions cannot oversell.
        """
        # Ensure default warehouse exists
        wh = db.query(Warehouse).filter(Warehouse.warehouse_id == req.warehouse_id).first()
        if not wh:
            wh = Warehouse(warehouse_id=req.warehouse_id, name="Main Store")
            db.add(wh)
            db.flush()

        order_no = req.order_number or f"SO-{int(datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:6].upper()}"
        
        # Check idempotency
        existing_order = db.query(SalesOrder).filter(SalesOrder.order_number == order_no).first()
        if existing_order:
            raise HTTPException(status_code=409, detail=f"Order {order_no} already exists (duplicate submission).")

        order = SalesOrder(order_number=order_no, status="COMPLETED", total_amount=Decimal("0.0000"))
        db.add(order)
        db.flush()

        total_amount = Decimal("0.0000")

        # Resolve products by product_id, sku, or barcode
        resolved_items = []
        for it in req.items:
            prod = None
            if it.product_id:
                prod = db.query(Product).filter(Product.product_id == it.product_id, Product.is_active == True).first()
            elif it.sku:
                prod = db.query(Product).filter(func.lower(Product.sku) == it.sku.strip().lower(), Product.is_active == True).first()
            elif it.barcode:
                prod = db.query(Product).filter(func.lower(Product.sku) == it.barcode.strip().lower(), Product.is_active == True).first()
            
            if not prod:
                ident = it.sku or it.barcode or str(it.product_id)
                raise HTTPException(status_code=404, detail=f"Product '{ident}' not found or inactive.")
            resolved_items.append((it, prod))

        # Sort items by product_id to prevent database deadlocks on concurrent transactions
        sorted_pairs = sorted(resolved_items, key=lambda pair: pair[1].product_id)
        today = datetime.utcnow().date()

        for item, product in sorted_pairs:
            # Row-level lock on stock balance
            balance = (
                db.query(StockBalance)
                .filter(StockBalance.product_id == product.product_id, StockBalance.warehouse_id == req.warehouse_id)
                .with_for_update()
                .first()
            )

            if not balance:
                balance = StockBalance(
                    product_id=product.product_id,
                    warehouse_id=req.warehouse_id,
                    on_hand_qty=Decimal("0.0000"),
                    reserved_qty=Decimal("0.0000")
                )
                db.add(balance)
                db.flush()

            available_qty = balance.on_hand_qty - balance.reserved_qty
            if available_qty < item.quantity:
                db.rollback()
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient inventory for '{product.name}' (SKU: {product.sku}). Available: {available_qty}, Requested: {item.quantity}."
                )

            # Deduct inventory
            balance.on_hand_qty -= item.quantity
            balance.updated_at = datetime.utcnow()

            # Record in immutable movement ledger
            movement = StockMovement(
                product_id=product.product_id,
                warehouse_id=req.warehouse_id,
                movement_type="SALE",
                quantity_delta=-item.quantity,
                reference_type="SALES_ORDER",
                reference_id=order.sales_order_id,
                occurred_at=datetime.utcnow()
            )
            db.add(movement)

            # Record line item
            price = item.unit_price if item.unit_price is not None else product.selling_price
            order_item = SalesOrderItem(
                sales_order_id=order.sales_order_id,
                product_id=product.product_id,
                quantity=item.quantity,
                unit_price=price,
                cost_price=product.cost_price
            )
            db.add(order_item)
            total_amount += (item.quantity * price)

            # Live rollup into DailyDemand for AI forecasting models
            daily = (
                db.query(DailyDemand)
                .filter(DailyDemand.product_id == product.product_id, DailyDemand.demand_date == today)
                .first()
            )
            if not daily:
                daily = DailyDemand(
                    product_id=product.product_id,
                    demand_date=today,
                    quantity_sold=Decimal("0.0000"),
                    stockout_flag=False,
                    data_status="NORMAL"
                )
                db.add(daily)
                db.flush()
            daily.quantity_sold += item.quantity
            if balance.on_hand_qty <= 0:
                daily.stockout_flag = True

        order.total_amount = total_amount
        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def upload_sales_csv(db: Session, file_content: bytes, filename: str, mode: str = "demand_only") -> dict:
        """
        Parses store sales CSV or Excel export and ingests historical quantities into daily_demand.
        Auto-creates missing products if new SKUs are found.
        """
        import io
        import pandas as pd

        if filename.lower().endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(file_content))
        else:
            df = pd.read_csv(io.BytesIO(file_content))

        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded file contains no data.")

        # Normalize column names
        normalized_cols = {str(c).strip().lower(): c for c in df.columns}

        date_candidates = ['date', 'demand_date', 'transaction_date', 'created_at', 'timestamp', 'time', 'day']
        sku_candidates = ['sku', 'product_sku', 'item_code', 'product_id', 'barcode', 'code']
        name_candidates = ['product_name', 'name', 'product', 'item_name', 'item', 'description']
        qty_candidates = ['quantity_sold', 'quantity', 'units_sold', 'qty', 'units', 'count', 'amount_sold']
        stockout_candidates = ['stockout_flag', 'stockout', 'is_stockout', 'out_of_stock']

        date_col = next((normalized_cols[c] for c in date_candidates if c in normalized_cols), None)
        sku_col = next((normalized_cols[c] for c in sku_candidates if c in normalized_cols), None)
        name_col = next((normalized_cols[c] for c in name_candidates if c in normalized_cols), None)
        qty_col = next((normalized_cols[c] for c in qty_candidates if c in normalized_cols), None)
        stockout_col = next((normalized_cols[c] for c in stockout_candidates if c in normalized_cols), None)

        if not date_col:
            raise HTTPException(status_code=400, detail="Missing required Date column (e.g. 'date', 'demand_date').")
        if not sku_col and not name_col:
            raise HTTPException(status_code=400, detail="Missing required Product identifier column (e.g. 'sku' or 'product_name').")
        if not qty_col:
            raise HTTPException(status_code=400, detail="Missing required Quantity column (e.g. 'quantity_sold', 'quantity', 'qty').")

        # Parse date and quantity
        df['parsed_date'] = pd.to_datetime(df[date_col], errors='coerce').dt.date
        df['parsed_qty'] = pd.to_numeric(df[qty_col], errors='coerce').fillna(0)
        
        valid_df = df[df['parsed_date'].notnull() & (df['parsed_qty'] >= 0)].copy()
        if valid_df.empty:
            raise HTTPException(status_code=400, detail="No valid date and positive quantity rows found in file.")

        # Ensure default category for imported products
        default_cat = db.query(Category).filter(Category.name == "Imported Catalog").first()
        if not default_cat:
            default_cat = Category(name="Imported Catalog", description="Auto-created category for CSV imported products")
            db.add(default_cat)
            db.flush()

        prod_cache = {}
        all_prods = db.query(Product).all()
        for p in all_prods:
            prod_cache[p.sku.lower()] = p
            prod_cache[p.name.lower()] = p

        new_products_created = 0
        products_affected = set()
        records_to_upsert = {}

        for _, row in valid_df.iterrows():
            d = row['parsed_date']
            qty = Decimal(str(round(float(row['parsed_qty']), 4)))
            
            raw_sku = str(row[sku_col]).strip() if sku_col and pd.notnull(row[sku_col]) else None
            raw_name = str(row[name_col]).strip() if name_col and pd.notnull(row[name_col]) else None

            lookup_key = (raw_sku or raw_name or "").lower()
            if not lookup_key or lookup_key == 'nan':
                continue

            prod = prod_cache.get(lookup_key)
            if not prod and raw_sku:
                prod = prod_cache.get(raw_sku.lower())
            if not prod and raw_name:
                prod = prod_cache.get(raw_name.lower())

            if not prod:
                sku_val = raw_sku or f"SKU-IMP-{uuid.uuid4().hex[:6].upper()}"
                name_val = raw_name or raw_sku or "Imported Product"
                prod = Product(
                    sku=sku_val[:50],
                    name=name_val[:255],
                    category_id=default_cat.category_id,
                    unit="unit",
                    cost_price=Decimal("10.0000"),
                    selling_price=Decimal("15.0000"),
                    reorder_threshold=Decimal("10.0000"),
                    is_active=True
                )
                db.add(prod)
                db.flush()
                sb = StockBalance(product_id=prod.product_id, warehouse_id=1, on_hand_qty=Decimal("100.0000"), reserved_qty=Decimal("0.0000"))
                db.add(sb)
                mv = StockMovement(
                    product_id=prod.product_id,
                    warehouse_id=1,
                    movement_type="OPENING_BALANCE",
                    quantity_delta=Decimal("100.0000"),
                    reference_type="INITIAL_SETUP",
                    reference_id=prod.product_id,
                    occurred_at=datetime.utcnow()
                )
                db.add(mv)
                prod_cache[prod.sku.lower()] = prod
                prod_cache[prod.name.lower()] = prod
                new_products_created += 1

            pid = prod.product_id
            products_affected.add(pid)

            is_stockout = False
            if stockout_col and pd.notnull(row[stockout_col]):
                val = str(row[stockout_col]).strip().lower()
                is_stockout = val in ['1', 'true', 'yes', 't', 'y']

            key = (pid, d)
            if key not in records_to_upsert:
                records_to_upsert[key] = {'qty': Decimal("0.0000"), 'stockout': is_stockout}
            records_to_upsert[key]['qty'] += qty
            if is_stockout:
                records_to_upsert[key]['stockout'] = True

        # High-performance bulk upsert in batches using PostgreSQL on_conflict_do_update
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        batch_size = 5000
        records_list = [
            {
                "product_id": pid,
                "demand_date": d,
                "quantity_sold": data['qty'],
                "stockout_flag": data['stockout'],
                "data_status": "NORMAL"
            }
            for (pid, d), data in records_to_upsert.items()
        ]

        for i in range(0, len(records_list), batch_size):
            chunk = records_list[i:i + batch_size]
            stmt = pg_insert(DailyDemand).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=['product_id', 'demand_date'],
                set_={
                    'quantity_sold': DailyDemand.quantity_sold + stmt.excluded.quantity_sold,
                    'stockout_flag': DailyDemand.stockout_flag | stmt.excluded.stockout_flag
                }
            )
            db.execute(stmt)

        db.commit()

        dates = [d for (_, d) in records_to_upsert.keys()]
        date_min = min(dates).isoformat() if dates else None
        date_max = max(dates).isoformat() if dates else None

        return {
            "total_rows_parsed": len(df),
            "records_ingested": len(records_to_upsert),
            "products_affected": len(products_affected),
            "new_products_created": new_products_created,
            "date_min": date_min,
            "date_max": date_max,
            "message": f"Successfully ingested {len(records_to_upsert)} daily demand records across {len(products_affected)} products ({new_products_created} newly created) from {date_min} to {date_max}."
        }

    @staticmethod
    def upload_stock_csv(db: Session, file_content: bytes, filename: str, mode: str = "replace", warehouse_id: int = 1) -> dict:
        """
        Bulk updates on-hand stock balances from a CSV or Excel count file.
        Modes:
          - 'replace' (default): Sets physical on-hand stock directly to the counted amount (e.g. stocktake).
          - 'adjust': Adds or subtracts (+/-) delta to existing on-hand stock.
        Maintains double-entry ledger invariant by posting StockMovement entries.
        """
        import io
        import pandas as pd

        if filename.lower().endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(file_content))
        else:
            df = pd.read_csv(io.BytesIO(file_content))

        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded stock file contains no rows.")

        normalized_cols = {str(c).strip().lower(): c for c in df.columns}

        sku_candidates = ['sku', 'product_sku', 'item_code', 'barcode', 'code']
        name_candidates = ['product_name', 'name', 'product', 'item_name', 'item', 'description']
        qty_candidates = ['on_hand_qty', 'stock', 'current_stock', 'quantity', 'qty', 'physical_count', 'count', 'units']
        threshold_candidates = ['reorder_threshold', 'reorder_point', 'threshold', 'min_stock']
        category_candidates = ['category', 'category_name', 'dept', 'department']
        unit_candidates = ['unit', 'uom', 'measurement_unit']
        cost_candidates = ['cost_price', 'cost', 'unit_cost', 'buy_price']
        price_candidates = ['selling_price', 'price', 'retail_price', 'unit_price']

        sku_col = next((normalized_cols[c] for c in sku_candidates if c in normalized_cols), None)
        name_col = next((normalized_cols[c] for c in name_candidates if c in normalized_cols), None)
        qty_col = next((normalized_cols[c] for c in qty_candidates if c in normalized_cols), None)
        threshold_col = next((normalized_cols[c] for c in threshold_candidates if c in normalized_cols), None)
        category_col = next((normalized_cols[c] for c in category_candidates if c in normalized_cols), None)
        unit_col = next((normalized_cols[c] for c in unit_candidates if c in normalized_cols), None)
        cost_col = next((normalized_cols[c] for c in cost_candidates if c in normalized_cols), None)
        price_col = next((normalized_cols[c] for c in price_candidates if c in normalized_cols), None)

        if not sku_col and not name_col:
            raise HTTPException(status_code=400, detail="Missing SKU or Product Name column in file.")
        if not qty_col:
            raise HTTPException(status_code=400, detail="Missing stock quantity column (e.g. 'on_hand_qty', 'stock', 'qty').")

        df['parsed_qty'] = pd.to_numeric(df[qty_col], errors='coerce')
        valid_df = df[df['parsed_qty'].notnull()].copy()
        if valid_df.empty:
            raise HTTPException(status_code=400, detail="No rows with valid numeric stock quantities found.")

        # Default fallback category
        default_cat = db.query(Category).filter(Category.name == "Imported Catalog").first()
        if not default_cat:
            default_cat = Category(name="Imported Catalog", description="Default category for imported items")
            db.add(default_cat)
            db.flush()

        # Build product lookup cache
        prod_cache = {}
        all_prods = db.query(Product).all()
        for p in all_prods:
            prod_cache[p.sku.strip().lower()] = p
            prod_cache[p.name.strip().lower()] = p

        products_updated = 0
        new_products_created = 0
        unmatched_rows = 0
        total_units_before = 0.0
        total_units_after = 0.0

        for _, row in valid_df.iterrows():
            raw_sku = str(row[sku_col]).strip() if sku_col and pd.notnull(row[sku_col]) else None
            raw_name = str(row[name_col]).strip() if name_col and pd.notnull(row[name_col]) else None

            prod = None
            if raw_sku and raw_sku.lower() in prod_cache:
                prod = prod_cache[raw_sku.lower()]
            elif raw_name and raw_name.lower() in prod_cache:
                prod = prod_cache[raw_name.lower()]

            parsed_qty = Decimal(str(round(float(row['parsed_qty']), 4)))

            if not prod:
                # Auto-create new product
                cat_id = default_cat.category_id
                if category_col and pd.notnull(row[category_col]):
                    cat_name = str(row[category_col]).strip()
                    if cat_name:
                        cat_obj = db.query(Category).filter(Category.name.ilike(cat_name)).first()
                        if not cat_obj:
                            cat_obj = Category(name=cat_name, description=f"Catalog category for {cat_name}")
                            db.add(cat_obj)
                            db.flush()
                        cat_id = cat_obj.category_id

                unit_val = str(row[unit_col]).strip().lower() if unit_col and pd.notnull(row[unit_col]) else "unit"
                cost_val = Decimal(str(round(float(row[cost_col]), 2))) if cost_col and pd.notnull(row[cost_col]) else Decimal("3.0000")
                price_val = Decimal(str(round(float(row[price_col]), 2))) if price_col and pd.notnull(row[price_col]) else Decimal("5.5000")
                thresh_val = Decimal(str(round(float(row[threshold_col]), 2))) if threshold_col and pd.notnull(row[threshold_col]) else Decimal("20.0000")

                sku_val = raw_sku or f"SKU-{uuid.uuid4().hex[:6].upper()}"
                name_val = raw_name or sku_val

                prod = Product(
                    sku=sku_val[:50],
                    name=name_val[:255],
                    category_id=cat_id,
                    unit=unit_val[:20],
                    cost_price=cost_val,
                    selling_price=price_val,
                    reorder_threshold=thresh_val,
                    is_active=True
                )
                db.add(prod)
                db.flush()

                # Opening balance for new product
                bal = StockBalance(
                    product_id=prod.product_id,
                    warehouse_id=warehouse_id,
                    on_hand_qty=max(Decimal("0.0000"), parsed_qty),
                    reserved_qty=Decimal("0.0000"),
                    updated_at=datetime.utcnow()
                )
                db.add(bal)

                mv = StockMovement(
                    product_id=prod.product_id,
                    warehouse_id=warehouse_id,
                    movement_type="OPENING_BALANCE",
                    quantity_delta=max(Decimal("0.0000"), parsed_qty),
                    reference_type="STOCK_CSV_IMPORT",
                    reference_id=prod.product_id,
                    occurred_at=datetime.utcnow()
                )
                db.add(mv)

                prod_cache[prod.sku.strip().lower()] = prod
                prod_cache[prod.name.strip().lower()] = prod
                new_products_created += 1
                products_updated += 1
                total_units_after += float(parsed_qty)
                continue

            bal = db.query(StockBalance).filter(
                StockBalance.product_id == prod.product_id,
                StockBalance.warehouse_id == warehouse_id
            ).first()

            if not bal:
                bal = StockBalance(
                    product_id=prod.product_id,
                    warehouse_id=warehouse_id,
                    on_hand_qty=Decimal("0.0000"),
                    reserved_qty=Decimal("0.0000"),
                    updated_at=datetime.utcnow()
                )
                db.add(bal)
                db.flush()

            old_qty = Decimal(str(bal.on_hand_qty))
            total_units_before += float(old_qty)

            if mode == "adjust":
                new_qty = max(Decimal("0.0000"), old_qty + parsed_qty)
            else:  # replace / stock count
                new_qty = max(Decimal("0.0000"), parsed_qty)

            delta = new_qty - old_qty
            total_units_after += float(new_qty)

            if delta != Decimal("0.0000"):
                bal.on_hand_qty = new_qty
                bal.updated_at = datetime.utcnow()

                movement = StockMovement(
                    product_id=prod.product_id,
                    warehouse_id=warehouse_id,
                    movement_type="STOCK_TAKE_ADJUSTMENT" if mode == "replace" else "MANUAL_ADJUSTMENT",
                    quantity_delta=delta,
                    reference_type="STOCK_CSV_IMPORT",
                    reference_id=prod.product_id,
                    occurred_at=datetime.utcnow()
                )
                db.add(movement)

            if threshold_col and pd.notnull(row[threshold_col]):
                try:
                    thresh_val = Decimal(str(round(float(row[threshold_col]), 2)))
                    if thresh_val >= 0:
                        prod.reorder_threshold = thresh_val
                except Exception:
                    pass

            products_updated += 1

        db.commit()

        action_word = "replaced with physical counts" if mode == "replace" else "adjusted"
        created_clause = f" ({new_products_created} newly created)" if new_products_created > 0 else ""
        return {
            "total_rows_parsed": len(df),
            "products_updated": products_updated,
            "unmatched_rows": unmatched_rows,
            "total_units_before": round(total_units_before, 2),
            "total_units_after": round(total_units_after, 2),
            "message": f"Successfully {action_word} for {products_updated} products{created_clause}. Total on-hand changed from {total_units_before:.0f} to {total_units_after:.0f} units."
        }

    @staticmethod
    def create_purchase_order(db: Session, req: PurchaseOrderCreate) -> PurchaseOrder:
        po_no = req.po_number or f"PO-{int(datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:6].upper()}"
        po = PurchaseOrder(
            po_number=po_no,
            supplier_id=req.supplier_id,
            status="ORDERED",
            ordered_at=datetime.utcnow(),
            expected_at=req.expected_at
        )
        db.add(po)
        db.flush()

        for it in req.items:
            po_item = PurchaseOrderItem(
                purchase_order_id=po.purchase_order_id,
                product_id=it.product_id,
                quantity_ordered=it.quantity_ordered,
                quantity_received=Decimal("0.0000"),
                unit_cost=it.unit_cost
            )
            db.add(po_item)

        db.commit()
        db.refresh(po)
        return po

    @staticmethod
    def receive_goods(db: Session, req: GoodsReceiptCreate) -> GoodsReceipt:
        """
        Records delivery receipt against an open purchase order.
        Guarantees that received quantities do not exceed outstanding order quantities.
        Increments physical stock_balances and writes to stock_movements ledger atomically.
        """
        po = db.query(PurchaseOrder).filter(PurchaseOrder.purchase_order_id == req.purchase_order_id).first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found.")
        if po.status in ("COMPLETED", "CANCELLED"):
            raise HTTPException(status_code=400, detail=f"Cannot receive goods for PO in '{po.status}' state.")

        receipt = GoodsReceipt(
            purchase_order_id=req.purchase_order_id,
            delivery_note=req.delivery_note,
            received_at=datetime.utcnow()
        )
        db.add(receipt)
        db.flush()

        # Lock and update PO items and balances
        for it in req.items:
            po_item = (
                db.query(PurchaseOrderItem)
                .filter(
                    PurchaseOrderItem.purchase_order_id == req.purchase_order_id,
                    PurchaseOrderItem.product_id == it.product_id
                )
                .with_for_update()
                .first()
            )
            if not po_item:
                raise HTTPException(status_code=400, detail=f"Product {it.product_id} is not part of PO {po.po_number}.")

            outstanding = po_item.quantity_ordered - po_item.quantity_received
            if it.quantity_received > outstanding:
                db.rollback()
                raise HTTPException(
                    status_code=400,
                    detail=f"Received quantity ({it.quantity_received}) exceeds outstanding order quantity ({outstanding}) for product {it.product_id}."
                )

            po_item.quantity_received += it.quantity_received

            # Update stock balance
            balance = (
                db.query(StockBalance)
                .filter(StockBalance.product_id == it.product_id, StockBalance.warehouse_id == req.warehouse_id)
                .with_for_update()
                .first()
            )
            if not balance:
                balance = StockBalance(
                    product_id=it.product_id,
                    warehouse_id=req.warehouse_id,
                    on_hand_qty=Decimal("0.0000"),
                    reserved_qty=Decimal("0.0000")
                )
                db.add(balance)
                db.flush()

            balance.on_hand_qty += it.quantity_received
            balance.updated_at = datetime.utcnow()

            # Ledger movement
            movement = StockMovement(
                product_id=it.product_id,
                warehouse_id=req.warehouse_id,
                movement_type="RECEIPT",
                quantity_delta=it.quantity_received,
                reference_type="GOODS_RECEIPT",
                reference_id=receipt.receipt_id,
                occurred_at=datetime.utcnow()
            )
            db.add(movement)

            receipt_item = GoodsReceiptItem(
                receipt_id=receipt.receipt_id,
                product_id=it.product_id,
                quantity_received=it.quantity_received
            )
            db.add(receipt_item)

        # Update PO overall status
        all_po_items = db.query(PurchaseOrderItem).filter(PurchaseOrderItem.purchase_order_id == po.purchase_order_id).all()
        all_fulfilled = all(item.quantity_received >= item.quantity_ordered for item in all_po_items)
        po.status = "COMPLETED" if all_fulfilled else "PARTIALLY_RECEIVED"

        db.commit()
        db.refresh(receipt)
        return receipt

    @staticmethod
    def reconcile_stock(db: Session, warehouse_id: int = 1) -> ReconciliationResponse:
        """
        Audits stored snapshot state (stock_balances) against the immutable transaction ledger (stock_movements).
        Invariant: stock_balances.on_hand_qty == SUM(stock_movements.quantity_delta)
        """
        products = db.query(Product).all()
        items: List[ReconciliationItem] = []
        discrepancy_count = 0

        for p in products:
            bal = db.query(StockBalance).filter(
                StockBalance.product_id == p.product_id,
                StockBalance.warehouse_id == warehouse_id
            ).first()
            stored_qty = bal.on_hand_qty if bal else Decimal("0.0000")

            ledger_sum = db.query(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).filter(
                StockMovement.product_id == p.product_id,
                StockMovement.warehouse_id == warehouse_id
            ).scalar()
            ledger_sum = Decimal(str(ledger_sum))

            diff = stored_qty - ledger_sum
            is_ok = abs(diff) < Decimal("0.0001")
            if not is_ok:
                discrepancy_count += 1

            items.append(ReconciliationItem(
                product_id=p.product_id,
                sku=p.sku,
                name=p.name,
                stored_on_hand=stored_qty,
                ledger_sum=ledger_sum,
                discrepancy=diff,
                is_reconciled=is_ok
            ))

        return ReconciliationResponse(
            total_products_checked=len(products),
            discrepancy_count=discrepancy_count,
            items=items
        )
