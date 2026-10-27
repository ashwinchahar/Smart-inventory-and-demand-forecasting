import random
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
import numpy as np
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.inventory import (
    Category, Product, Supplier, ProductSupplier, Warehouse,
    StockBalance, StockMovement, SalesOrder, SalesOrderItem,
    DailyDemand, DataQualityIssue
)

# Deterministic seed for reproducible academic experimentation
RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)

CATEGORIES_DATA = [
    ("Dairy & Refrigerated", "Milk, yogurt, cheeses, and butter"),
    ("Bakery & Breakfast", "Fresh breads, rolls, and cereal"),
    ("Beverages", "Juices, sodas, water, and teas"),
    ("Pantry & Dry Goods", "Pasta, rice, flour, and sauces"),
    ("Snacks & Confectionery", "Chips, cookies, and chocolate"),
    ("Fresh Produce", "Fruits and vegetables with short shelf-life"),
    ("Household & Cleaning", "Detergents, paper towels, and soaps")
]

SUPPLIERS_DATA = [
    ("Metro Dairy Direct", "orders@metrodairy.com", "+1-800-555-0101"),
    ("Artisan Grain & Flour Co", "supply@artisangrain.com", "+1-800-555-0102"),
    ("Apex Beverage Distributors", "logistics@apexbev.com", "+1-800-555-0103"),
    ("Global Pantry Imports", "fulfillment@globalpantry.com", "+1-800-555-0104"),
    ("Valley Fresh Growers", "sales@valleyfresh.com", "+1-800-555-0105"),
    ("EcoClean Supply Partners", "orders@ecoclean.com", "+1-800-555-0106")
]

PRODUCTS_SPEC = [
    # Dairy
    ("SKU-DAIRY-001", "Whole Milk 1L", "Dairy & Refrigerated", "carton", 1.20, 2.49, "STABLE", 25, 4),
    ("SKU-DAIRY-002", "Greek Yogurt 500g", "Dairy & Refrigerated", "tub", 1.80, 3.79, "WEEKLY", 15, 3),
    ("SKU-DAIRY-003", "Organic Oat Milk 1L", "Dairy & Refrigerated", "carton", 1.95, 3.99, "TRENDING", 12, 5),
    ("SKU-DAIRY-004", "Cheddar Cheese Block 250g", "Dairy & Refrigerated", "pack", 2.50, 4.89, "STABLE", 10, 7),
    ("SKU-DAIRY-005", "Artisan Truffle Butter 100g", "Dairy & Refrigerated", "pack", 4.20, 8.50, "INTERMITTENT", 2, 10),

    # Bakery
    ("SKU-BAKE-001", "Sourdough Bread Loaf", "Bakery & Breakfast", "loaf", 1.40, 3.29, "WEEKLY", 20, 2),
    ("SKU-BAKE-002", "Whole Wheat Toast 400g", "Bakery & Breakfast", "loaf", 0.90, 2.19, "STABLE", 30, 2),
    ("SKU-BAKE-003", "Butter Croissant 4-Pack", "Bakery & Breakfast", "box", 2.10, 4.49, "WEEKLY", 15, 3),

    # Beverages
    ("SKU-BEV-001", "Sparkling Spring Water 500ml", "Beverages", "bottle", 0.40, 1.29, "STABLE", 40, 5),
    ("SKU-BEV-002", "100% Orange Juice 1L", "Beverages", "bottle", 1.50, 3.49, "WEEKLY", 18, 4),
    ("SKU-BEV-003", "Cold Brew Coffee 330ml", "Beverages", "can", 1.60, 3.89, "TRENDING", 22, 4),
    ("SKU-BEV-004", "Matcha Ceremonial Grade 30g", "Beverages", "tin", 9.00, 18.99, "INTERMITTENT", 1, 14),

    # Produce
    ("SKU-PROD-001", "Organic Cavendish Bananas", "Fresh Produce", "kg", 0.80, 1.89, "STABLE", 35, 2),
    ("SKU-PROD-002", "Avocados Hass 4-Pack", "Fresh Produce", "bag", 2.00, 4.29, "WEEKLY", 16, 3),
    ("SKU-PROD-003", "Baby Spinach 200g", "Fresh Produce", "bag", 1.10, 2.49, "STABLE", 20, 2),

    # Pantry & Snacks
    ("SKU-PAN-001", "Extra Virgin Olive Oil 500ml", "Pantry & Dry Goods", "bottle", 4.50, 8.99, "STABLE", 8, 7),
    ("SKU-PAN-002", "Italian Penne Rigate 500g", "Pantry & Dry Goods", "box", 0.75, 1.69, "STABLE", 25, 6),
    ("SKU-SNK-001", "Sea Salt Kettle Chips 150g", "Snacks & Confectionery", "bag", 1.10, 2.79, "WEEKLY", 28, 4),
    ("SKU-SNK-002", "Dark Chocolate 70% 100g", "Snacks & Confectionery", "bar", 1.30, 2.99, "STABLE", 14, 5),
    ("SKU-CLEN-001", "Eco Multi-Surface Cleaner 750ml", "Household & Cleaning", "bottle", 2.20, 4.99, "STABLE", 10, 7)
]

def seed_database(days_history: int = 180):
    print(f"\n========================================================")
    print(f"Seeding PostgreSQL 18 Database (History: {days_history} days)...")
    print(f"========================================================")

    db = SessionLocal()

    try:
        # 1. Clean existing records in correct foreign-key order
        print("Cleaning previous test data...")
        tables = [
            "audit_logs", "scenario_results", "scenario_runs",
            "replenishment_recommendations", "model_metrics", "forecast_values",
            "forecast_runs", "data_quality_issues", "daily_demand",
            "goods_receipt_items", "goods_receipts", "purchase_order_items",
            "purchase_orders", "sales_order_items", "sales_orders",
            "stock_movements", "stock_balances", "warehouses",
            "product_suppliers", "suppliers", "products", "categories"
        ]
        for tbl in tables:
            db.execute(text(f"DELETE FROM {tbl};"))
        db.commit()

        # 2. Warehouses
        wh = Warehouse(warehouse_id=1, name="Main Supermarket Floor", location="Central Avenue Store #1")
        db.add(wh)
        db.flush()

        # 3. Categories
        cat_map = {}
        for name, desc in CATEGORIES_DATA:
            cat = Category(name=name, description=desc)
            db.add(cat)
            db.flush()
            cat_map[name] = cat.category_id

        # 4. Suppliers
        supp_map = {}
        for idx, (name, email, phone) in enumerate(SUPPLIERS_DATA, start=1):
            s = Supplier(supplier_id=idx, name=name, contact_email=email, contact_phone=phone)
            db.add(s)
            db.flush()
            supp_map[name] = s.supplier_id

        # 5. Products & ProductSuppliers
        created_products = []
        supplier_ids = list(supp_map.values())

        for idx, (sku, name, cat_name, unit, cost, price, pattern, base_demand, lead_time) in enumerate(PRODUCTS_SPEC, start=1):
            p = Product(
                product_id=idx,
                sku=sku,
                name=name,
                category_id=cat_map[cat_name],
                unit=unit,
                cost_price=Decimal(f"{cost:.4f}"),
                selling_price=Decimal(f"{price:.4f}"),
                reorder_threshold=Decimal(f"{base_demand * 3:.4f}"),
                is_active=True
            )
            db.add(p)
            db.flush()

            # Assign supplier
            assigned_supp = supplier_ids[idx % len(supplier_ids)]
            ps = ProductSupplier(
                product_id=p.product_id,
                supplier_id=assigned_supp,
                lead_time_days=lead_time,
                minimum_order_qty=Decimal("10.0000"),
                pack_size=Decimal("5.0000"),
                is_primary=True
            )
            db.add(ps)

            # Starting stock balance
            initial_stock = Decimal(f"{base_demand * 12:.4f}")
            bal = StockBalance(
                product_id=p.product_id,
                warehouse_id=1,
                on_hand_qty=initial_stock,
                reserved_qty=Decimal("0.0000")
            )
            db.add(bal)

            # Initial movement
            mov = StockMovement(
                product_id=p.product_id,
                warehouse_id=1,
                movement_type="INITIAL_SETUP",
                quantity_delta=initial_stock,
                reference_type="INVENTORY_COUNT",
                reference_id=1,
                occurred_at=datetime.utcnow() - timedelta(days=days_history + 1)
            )
            db.add(mov)

            created_products.append((p, pattern, base_demand))

        db.commit()

        # 6. Generate Realistic Time-Series Daily Demand & Sales
        print(f"Generating realistic daily demand & transaction ledgers...")
        start_date = date.today() - timedelta(days=days_history)

        total_orders = 0
        total_items = 0

        for p, pattern, base_rate in created_products:
            current_on_hand = float(p.reorder_threshold) * 4.0

            for d_idx in range(days_history):
                day = start_date + timedelta(days=d_idx)
                weekday = day.weekday()  # 0=Monday, 5=Saturday, 6=Sunday

                # Pattern logic
                if pattern == "STABLE":
                    noise = np.random.normal(0, base_rate * 0.15)
                    qty = max(0.0, base_rate + noise)

                elif pattern == "WEEKLY":
                    # Friday, Saturday, Sunday surge
                    multiplier = 1.6 if weekday in (4, 5, 6) else 0.8
                    noise = np.random.normal(0, base_rate * 0.15)
                    qty = max(0.0, (base_rate * multiplier) + noise)

                elif pattern == "TRENDING":
                    # Upward trend over time (+50% across the period)
                    growth = 1.0 + (0.5 * (d_idx / days_history))
                    noise = np.random.normal(0, base_rate * 0.20)
                    qty = max(0.0, (base_rate * growth) + noise)

                elif pattern == "INTERMITTENT":
                    # 75% chance of zero demand, 25% chance of small batch
                    if random.random() < 0.25:
                        qty = float(random.choice([1, 2, 3, 4]))
                    else:
                        qty = 0.0

                # Introduce intentional stockout period for product SKU-DAIRY-002
                stockout = False
                data_status = "NORMAL"
                if p.sku == "SKU-DAIRY-002" and 40 <= d_idx <= 45:
                    stockout = True
                    qty = 0.0
                    data_status = "CENSORED_STOCKOUT"

                # Introduce intentional promotional demand spike for product SKU-SNK-001
                if p.sku == "SKU-SNK-001" and d_idx == 110:
                    qty = base_rate * 4.5
                    data_status = "ANOMALY_SPIKE"

                sold_qty = round(qty, 2)

                # Record daily_demand
                dd = DailyDemand(
                    product_id=p.product_id,
                    demand_date=day,
                    quantity_sold=Decimal(f"{sold_qty:.4f}"),
                    stockout_flag=stockout,
                    data_status=data_status
                )
                db.add(dd)

                # If sold, create SalesOrder and StockMovement every few days
                if sold_qty > 0 and (d_idx % 2 == 0 or sold_qty > 10):
                    order_time = datetime.combine(day, datetime.min.time()) + timedelta(hours=random.randint(9, 20))
                    so = SalesOrder(
                        order_number=f"SO-{day.strftime('%Y%m%d')}-{p.product_id}-{d_idx}",
                        status="COMPLETED",
                        total_amount=Decimal(f"{sold_qty * float(p.selling_price):.4f}"),
                        created_at=order_time
                    )
                    db.add(so)
                    db.flush()

                    soi = SalesOrderItem(
                        sales_order_id=so.sales_order_id,
                        product_id=p.product_id,
                        quantity=Decimal(f"{sold_qty:.4f}"),
                        unit_price=p.selling_price,
                        cost_price=p.cost_price
                    )
                    db.add(soi)

                    sm = StockMovement(
                        product_id=p.product_id,
                        warehouse_id=1,
                        movement_type="SALE",
                        quantity_delta=Decimal(f"{-sold_qty:.4f}"),
                        reference_type="SALES_ORDER",
                        reference_id=so.sales_order_id,
                        occurred_at=order_time
                    )
                    db.add(sm)
                    total_orders += 1
                    total_items += 1

            # Update final stock balance to reconcile accurately
            total_delta = db.query(func.sum(StockMovement.quantity_delta)).filter(
                StockMovement.product_id == p.product_id,
                StockMovement.warehouse_id == 1
            ).scalar()
            
            final_bal = db.query(StockBalance).filter(
                StockBalance.product_id == p.product_id,
                StockBalance.warehouse_id == 1
            ).first()
            if final_bal and total_delta:
                # If negative, simulate a replenishing shipment receipt
                if total_delta < 10:
                    top_up = abs(total_delta) + Decimal(f"{base_rate * 10:.4f}")
                    receipt_mov = StockMovement(
                        product_id=p.product_id,
                        warehouse_id=1,
                        movement_type="RECEIPT",
                        quantity_delta=top_up,
                        reference_type="PURCHASE_RECEIPT",
                        reference_id=999,
                        occurred_at=datetime.utcnow()
                    )
                    db.add(receipt_mov)
                    total_delta += top_up

                final_bal.on_hand_qty = total_delta
                final_bal.updated_at = datetime.utcnow()

            db.commit()

        # Synchronize PostgreSQL sequences so subsequent auto-increment inserts don't collide
        db.execute(text("SELECT setval('products_product_id_seq', (SELECT COALESCE(MAX(product_id), 1) FROM products));"))
        db.execute(text("SELECT setval('categories_category_id_seq', (SELECT COALESCE(MAX(category_id), 1) FROM categories));"))
        db.execute(text("SELECT setval('suppliers_supplier_id_seq', (SELECT COALESCE(MAX(supplier_id), 1) FROM suppliers));"))
        db.execute(text("SELECT setval('warehouses_warehouse_id_seq', (SELECT COALESCE(MAX(warehouse_id), 1) FROM warehouses));"))
        db.execute(text("SELECT setval('sales_orders_sales_order_id_seq', (SELECT COALESCE(MAX(sales_order_id), 1) FROM sales_orders));"))
        db.execute(text("SELECT setval('sales_order_items_item_id_seq', (SELECT COALESCE(MAX(item_id), 1) FROM sales_order_items));"))
        db.execute(text("SELECT setval('stock_movements_movement_id_seq', (SELECT COALESCE(MAX(movement_id), 1) FROM stock_movements));"))
        db.commit()

        print("Database 'POSTGRESQL' populated successfully!")
        print(f"- Products: {len(PRODUCTS_SPEC)}")
        print(f"- Daily Demand rows: {len(PRODUCTS_SPEC) * days_history}")
        print(f"- Sales Orders created: {total_orders}")

    finally:
        db.close()

if __name__ == "__main__":
    from sqlalchemy import text
    seed_database(days_history=180)
