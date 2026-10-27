import time
import json
from decimal import Decimal
from sqlalchemy import text
from app.db.session import engine
from app.api.benchmark import BENCHMARK_QUERIES

def run_benchmarks(iterations: int = 10, output_file: str | None = None):
    print("=======================================================================")
    print("StockSense: PostgreSQL 18 Query Performance & Plan Optimization")
    print(f"Iterations per query workload: {iterations}")
    print("=======================================================================")

    summary_results = {}

    with engine.connect() as conn:
        for q_name, meta in BENCHMARK_QUERIES.items():
            print(f"\nEvaluating: {meta['title']} ({q_name})...")
            sql = meta["sql"]

            # Warm up buffer pool
            conn.execute(text(sql))
            latencies = []
            for _ in range(iterations):
                t0 = time.perf_counter()
                conn.execute(text(sql))
                t1 = time.perf_counter()
                latencies.append((t1 - t0) * 1000.0)

            # Capture detailed EXPLAIN (ANALYZE, BUFFERS)
            plan_res = conn.execute(text(f"EXPLAIN (ANALYZE, BUFFERS) {sql}")).fetchall()
            pg_plan = "\n".join([r[0] for r in plan_res])

            sorted_lat = sorted(latencies)
            med = sorted_lat[len(sorted_lat) // 2]
            p95 = sorted_lat[int(len(sorted_lat) * 0.95)]
            min_l = min(latencies)
            max_l = max(latencies)

            print(f" -> Median: {med:.3f} ms | p95: {p95:.3f} ms | Range: [{min_l:.3f} - {max_l:.3f}] ms")

            summary_results[q_name] = {
                "title": meta["title"],
                "median_ms": round(med, 3),
                "p95_ms": round(p95, 3),
                "min_ms": round(min_l, 3),
                "max_ms": round(max_l, 3),
                "plan": pg_plan
            }

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(summary_results, f, indent=2)
        print(f"\nResults saved to: {output_file}")
    else:
        print("\nBenchmark completed successfully!")

    return summary_results

if __name__ == "__main__":
    run_benchmarks()
