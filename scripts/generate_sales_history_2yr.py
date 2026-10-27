import csv
import math
import random
from datetime import date, timedelta

# Set seed for reproducible generation
random.seed(42)

# Load 400 products from grocery_store_stock_400.csv
products_file = r"d:\Demand forecasting\grocery_store_stock_400.csv"
products = []

with open(products_file, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        products.append({
            "sku": row["sku"],
            "name": row["product_name"],
            "category": row["category"],
            "threshold": int(float(row["reorder_threshold"])),
            "on_hand": int(float(row["on_hand_qty"]))
        })

print(f"Loaded {len(products)} products from {products_file}")

# 2-Year Date Range: 730 days ending at 2026-10-26
end_date = date(2026, 10, 26)
start_date = end_date - timedelta(days=729)  # 730 days total

print(f"Generating 2-year daily sales records from {start_date} to {end_date} (730 days)...")

# Weekly Day of Week Multipliers (Monday=0 ... Sunday=6)
dow_factors = {
    0: 0.90,  # Monday
    1: 0.85,  # Tuesday
    2: 0.85,  # Wednesday
    3: 0.95,  # Thursday
    4: 1.25,  # Friday (surge)
    5: 1.40,  # Saturday (peak grocery shopping)
    6: 1.30   # Sunday (high family shopping)
}

# Base velocity by category
cat_base_velocity = {
    "Dairy & Plant-Based": (18, 42),
    "Fresh Produce": (16, 45),
    "Bakery & Breakfast": (14, 35),
    "Beverages": (12, 38),
    "Pantry & Dry Goods": (7, 22),
    "Snacks & Confectionery": (8, 24),
    "Meat, Poultry & Seafood": (6, 18),
    "Frozen Foods": (5, 16),
    "Household & Cleaning": (3, 10)
}

# Assign each product an inherent mean velocity based on its category
prod_profiles = {}
for p in products:
    cat = p["category"]
    vmin, vmax = cat_base_velocity.get(cat, (8, 20))
    # Base velocity proportional to threshold
    rel = p["threshold"] / 35.0
    mean_daily = random.uniform(vmin, vmax) * rel
    prod_profiles[p["sku"]] = {
        "mean_daily": max(2.0, mean_daily),
        "is_currently_out": p["on_hand"] == 0,
        "is_currently_low": 0 < p["on_hand"] <= p["threshold"]
    }

output_csv = r"d:\Demand forecasting\grocery_store_sales_2yr.csv"
public_csv = r"d:\Demand forecasting\frontend\public\grocery_store_sales_2yr.csv"

total_records = 0
total_sales_units = 0
total_stockouts = 0

fieldnames = ["date", "sku", "product_name", "quantity_sold", "stockout_flag"]

with open(output_csv, "w", newline="", encoding="utf-8") as f_out, \
     open(public_csv, "w", newline="", encoding="utf-8") as f_pub:
    
    w_out = csv.writer(f_out)
    w_pub = csv.writer(f_pub)
    
    w_out.writerow(fieldnames)
    w_pub.writerow(fieldnames)

    curr_date = start_date
    day_idx = 0

    while curr_date <= end_date:
        dow = curr_date.weekday()
        dow_mult = dow_factors[dow]
        month = curr_date.month

        # Progress update every 90 days
        if day_idx % 90 == 0:
            print(f"Processing Day {day_idx + 1}/730: {curr_date}...")

        batch_rows = []

        for p in products:
            sku = p["sku"]
            name = p["name"]
            cat = p["category"]
            prof = prod_profiles[sku]

            # Seasonal category modifiers
            season_mult = 1.0
            if cat == "Beverages" or cat == "Frozen Foods":
                if month in (6, 7, 8):  # Summer heat
                    season_mult = 1.35
                elif month in (12, 1, 2):
                    season_mult = 0.85
            elif cat in ("Bakery & Breakfast", "Meat, Poultry & Seafood", "Snacks & Confectionery"):
                if month in (11, 12):  # Holiday feasts & festivities
                    season_mult = 1.40
                elif month == 1:       # Post-holiday health slump
                    season_mult = 0.88

            expected = prof["mean_daily"] * dow_mult * season_mult

            # Stockout check
            # 1. If product is currently out of stock, last 4 days are stockout zeros
            days_from_end = (end_date - curr_date).days
            if prof["is_currently_out"] and days_from_end <= 4:
                qty = 0
                is_stockout = True
            # 2. Random sporadic stockout (~1.5% chance)
            elif random.random() < 0.015:
                qty = 0
                is_stockout = True
            else:
                # Gaussian noise around expected demand
                noise = random.gauss(0, max(1.0, math.sqrt(expected)))
                qty = max(0, int(round(expected + noise)))
                is_stockout = False

            batch_rows.append([
                curr_date.isoformat(),
                sku,
                name,
                qty,
                "true" if is_stockout else "false"
            ])

            total_sales_units += qty
            if is_stockout:
                total_stockouts += 1

        w_out.writerows(batch_rows)
        w_pub.writerows(batch_rows)
        total_records += len(batch_rows)

        curr_date += timedelta(days=1)
        day_idx += 1

print("\n--- 2-Year Grocery Store Sales Dataset Generated Successfully ---")
print(f"Output File: {output_csv}")
print(f"Public Download: {public_csv}")
print(f"Date Span: {start_date} to {end_date} (730 days)")
print(f"Total Products Tracked: {len(products)}")
print(f"Total Daily Demand Rows: {total_records:,}")
print(f"Total Units Sold: {total_sales_units:,}")
print(f"Stockout Censored Days: {total_stockouts:,} ({total_stockouts/total_records*100:.2f}%)")
