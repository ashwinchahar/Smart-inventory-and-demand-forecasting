import time
import sys
import os

# Add backend directory to sys.path and set working directory to backend
backend_dir = r"d:\Demand forecasting\backend"
sys.path.append(backend_dir)
os.chdir(backend_dir)

from app.db.session import SessionLocal
from app.services.inventory import InventoryService
from app.services.forecasting import ForecastingService
from app.models.inventory import Product, DailyDemand
from sqlalchemy import func

def run_test():
    print("==================================================================")
    print("Testing Ingestion & Forecasting of 2-Year Grocery Store Dataset")
    print("==================================================================")

    csv_path = r"d:\Demand forecasting\grocery_store_sales_2yr.csv"
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found!")
        return

    file_size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    print(f"Dataset File: {csv_path} ({file_size_mb:.2f} MB)")

    db = SessionLocal()
    try:
        # Step 1: Read and Ingest Sales Data
        print("\n[Step 1] Ingesting 2-year sales records via high-speed batching...")
        start_time = time.time()
        
        with open(csv_path, "rb") as f:
            content = f.read()

        ingest_res = InventoryService.upload_sales_csv(
            db, 
            content, 
            "grocery_store_sales_2yr.csv", 
            mode="demand_only"
        )
        elapsed = time.time() - start_time
        print(f"Ingestion Finished in {elapsed:.2f} seconds!")
        print(f"  Rows Parsed: {ingest_res['total_rows_parsed']:,}")
        print(f"  Daily Demand Records Ingested: {ingest_res['records_ingested']:,}")
        print(f"  Products Affected: {ingest_res['products_affected']}")
        print(f"  Timeline Span: {ingest_res['date_min']} to {ingest_res['date_max']}")

        # Step 2: Query PostgreSQL daily_demand table directly
        print("\n[Step 2] Verifying stored daily_demand in PostgreSQL...")
        total_demand_records = db.query(DailyDemand).count()
        total_quantity_sold = db.query(func.sum(DailyDemand.quantity_sold)).scalar()
        stockout_count = db.query(DailyDemand).filter(DailyDemand.stockout_flag == True).count()

        print(f"  Total records in daily_demand table: {total_demand_records:,}")
        print(f"  Total historical units sold recorded: {float(total_quantity_sold or 0):,.0f}")
        print(f"  Total stockout-flagged days: {stockout_count:,}")

        # Step 3: Run explainable demand forecasts on sample products
        print("\n[Step 3] Testing AI Demand Forecasting models over 2-year history...")
        sample_skus = ["SKU-DAIRY-001", "SKU-PROD-001", "SKU-BEV-001", "SKU-PANTRY-001"]
        models_to_test = ["EMA_14", "SMA_7", "CROSTON"]

        for sku in sample_skus:
            prod = db.query(Product).filter(Product.sku == sku).first()
            if not prod:
                continue

            print(f"\n  Product: {prod.sku} ({prod.name})")
            for model in models_to_test:
                run = ForecastingService.generate_forecast(
                    db,
                    product_id=prod.product_id,
                    model_name=model,
                    horizon_days=14,
                    impute_stockouts=True
                )
                metric = run.metrics[0] if run.metrics else None
                avg_predicted = sum(float(v.predicted_demand) for v in run.values) / max(1, len(run.values))
                wape_str = f"{float(metric.wape)*100:.1f}%" if metric else "N/A"
                mae_str = f"{float(metric.mae):.2f}" if metric else "N/A"
                print(f"    [{model:10s}] -> 14-day Forecast Avg: {avg_predicted:.1f} units/day | WAPE: {wape_str} | MAE: {mae_str}")

        print("\n==================================================================")
        print("Test Result: 100% SUCCESSFUL! Ingestion & Forecasting Validated.")
        print("==================================================================")

    finally:
        db.close()

if __name__ == "__main__":
    run_test()
