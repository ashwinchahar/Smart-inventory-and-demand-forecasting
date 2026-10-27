import time
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from app.db.session import engine
from app.core.config import settings

router = APIRouter(prefix="/benchmark", tags=["PostgreSQL Query Performance & Plan Inspector"])

class BenchmarkRequest(BaseModel):
    query_type: str = "DEMAND_AGGREGATION"  # 'DEMAND_AGGREGATION', 'STOCK_LOOKUP', 'LEDGER_RANGE', 'REPLENISHMENT_JOIN'
    iterations: int = 5

BENCHMARK_QUERIES = {
    "DEMAND_AGGREGATION": {
        "title": "Analytical Demand Aggregation (OLAP)",
        "sql": """
            SELECT product_id, DATE_TRUNC('week', demand_date) AS week_start,
                   SUM(quantity_sold) AS total_sold, AVG(quantity_sold) AS avg_sold
            FROM daily_demand
            WHERE demand_date >= '2025-01-01'
            GROUP BY product_id, DATE_TRUNC('week', demand_date)
            ORDER BY product_id, week_start;
        """,
        "explanation": "Demonstrates PostgreSQL's Hash Aggregate and parallel sequence scan capabilities over 3,600 time-series records."
    },
    "STOCK_LOOKUP": {
        "title": "Transactional Stock Balance Lookup (OLTP)",
        "sql": """
            SELECT p.product_id, p.sku, p.name, sb.on_hand_qty, sb.reserved_qty
            FROM products p
            JOIN stock_balances sb ON p.product_id = sb.product_id
            WHERE p.is_active = TRUE AND sb.on_hand_qty > 0;
        """,
        "explanation": "Point query testing primary key composite index traversal on stock_balances joined with products."
    },
    "LEDGER_RANGE": {
        "title": "Movement Ledger Date Range Scan",
        "sql": """
            SELECT sm.movement_id, sm.product_id, sm.movement_type, sm.quantity_delta, sm.occurred_at
            FROM stock_movements sm
            WHERE sm.occurred_at >= NOW() - INTERVAL '60 days'
            ORDER BY sm.occurred_at DESC
            LIMIT 500;
        """,
        "explanation": "Validates Bitmap Index Scan over timestamp index (idx_stock_movements_time), pre-sorting pointers before heap page access."
    },
    "REPLENISHMENT_JOIN": {
        "title": "Replenishment 5-Table Relational Join",
        "sql": """
            SELECT p.product_id, p.sku, p.name, c.name AS category_name,
                   sb.on_hand_qty, ps.lead_time_days, ps.minimum_order_qty, s.name AS supplier_name
            FROM products p
            JOIN categories c ON p.category_id = c.category_id
            JOIN stock_balances sb ON p.product_id = sb.product_id
            JOIN product_suppliers ps ON p.product_id = ps.product_id AND ps.is_primary = TRUE
            JOIN suppliers s ON ps.supplier_id = s.supplier_id
            WHERE sb.on_hand_qty <= p.reorder_threshold
            ORDER BY sb.on_hand_qty ASC;
        """,
        "explanation": "Complex multi-table join resolving supplier lead times, primary vendor constraints, and reorder points."
    }
}

@router.get("/status")
def get_benchmark_environment_status():
    status = {"postgresql": {"connected": False}}

    try:
        with engine.connect() as conn:
            pg_ver = conn.execute(text("SELECT version();")).scalar()
            pg_rows = conn.execute(text("SELECT count(*) FROM products;")).scalar()
            pg_sales = conn.execute(text("SELECT count(*) FROM sales_orders;")).scalar()
            pg_movements = conn.execute(text("SELECT count(*) FROM stock_movements;")).scalar()
            status["postgresql"] = {
                "connected": True,
                "version": pg_ver.split(",")[0],
                "port": settings.POSTGRES_PORT,
                "product_count": pg_rows,
                "sales_order_count": pg_sales,
                "stock_movement_count": pg_movements
            }
    except Exception as e:
        status["postgresql"]["error"] = str(e)

    return status

@router.post("/compare")
def analyze_query_performance(req: BenchmarkRequest):
    if req.query_type not in BENCHMARK_QUERIES:
        raise HTTPException(status_code=400, detail=f"Invalid query type. Options: {list(BENCHMARK_QUERIES.keys())}")

    query_meta = BENCHMARK_QUERIES[req.query_type]
    sql = query_meta["sql"]

    results = {}

    try:
        latencies = []
        with engine.connect() as conn:
            # Warm up buffer pool
            conn.execute(text(sql))
            
            for _ in range(req.iterations):
                t0 = time.perf_counter()
                conn.execute(text(sql))
                t1 = time.perf_counter()
                latencies.append((t1 - t0) * 1000.0)

            # Detailed Cost-Based Execution Plan with Buffer I/O metrics
            plan_res = conn.execute(text(f"EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS) {sql}")).fetchall()
            pg_plan = "\n".join([r[0] for r in plan_res])

        sorted_latencies = sorted(latencies)
        results["postgresql"] = {
            "median_ms": round(float(sorted_latencies[len(sorted_latencies) // 2]), 3),
            "min_ms": round(float(min(latencies)), 3),
            "max_ms": round(float(max(latencies)), 3),
            "p95_ms": round(float(sorted_latencies[int(len(sorted_latencies) * 0.95)]), 3),
            "latencies_ms": [round(x, 3) for x in latencies],
            "execution_plan": pg_plan,
            "title": query_meta["title"],
            "explanation": query_meta["explanation"]
        }
    except Exception as e:
        results["postgresql"] = {"error": str(e)}

    return {
        "query_type": req.query_type,
        "iterations": req.iterations,
        "comparison": results
    }
