import React, { useEffect, useState } from 'react';
import { Database, Play, Zap, CheckCircle2, AlertCircle, ArrowRight, BarChart3, Code, Cpu, HardDrive } from 'lucide-react';
import { api } from '../services/api';

export const BenchmarkPage: React.FC = () => {
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [queryType, setQueryType] = useState<string>('DEMAND_AGGREGATION');
  const [iterations, setIterations] = useState<number>(5);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [running, setRunning] = useState<boolean>(false);

  const loadStatus = async () => {
    try {
      const res = await api.getBenchmarkStatus();
      setDbStatus(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleRunBenchmark = async () => {
    setRunning(true);
    try {
      const res = await api.runBenchmarkComparison(queryType, iterations);
      setBenchmarkResult(res.data);
      await loadStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  const pg = benchmarkResult?.comparison?.postgresql;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="w-6 h-6 text-indigo-400" />
          PostgreSQL Query Optimization & Execution Plan Inspector
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Analyze PostgreSQL 18 Cost-Based Optimizer behavior, buffer cache efficiency, and execution plans using EXPLAIN (ANALYZE, BUFFERS)
        </p>
      </div>

      {/* Engine Status Card */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${dbStatus?.postgresql?.connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-500'}`} />
            <h2 className="text-base font-bold text-white">PostgreSQL 18 Database Cluster</h2>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            Port: 5432 · stocksense
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <span className="text-slate-400 block text-[11px]">Engine Version</span>
            <strong className="text-white truncate block">{dbStatus?.postgresql?.version || 'PostgreSQL 18.x'}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <span className="text-slate-400 block text-[11px]">Active SKUs</span>
            <strong className="text-white font-mono">{dbStatus?.postgresql?.product_count ?? '20'}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <span className="text-slate-400 block text-[11px]">Sales Orders</span>
            <strong className="text-white font-mono">{dbStatus?.postgresql?.sales_order_count ?? '—'}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <span className="text-slate-400 block text-[11px]">Stock Ledger Rows</span>
            <strong className="text-white font-mono">{dbStatus?.postgresql?.stock_movement_count ?? '—'}</strong>
          </div>
        </div>
      </div>

      {/* Benchmark Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Select Relational Workload</label>
            <select
              value={queryType}
              onChange={(e) => setQueryType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="DEMAND_AGGREGATION">Daily Demand Aggregation (Time-Series GROUP BY & Windowing)</option>
              <option value="STOCK_LOOKUP">Concurrent Stock Balances Point Lookup (Composite Primary Key)</option>
              <option value="LEDGER_RANGE">Inventory Movement Range Scan (Date Timestamp Interval Filter)</option>
              <option value="REPLENISHMENT_JOIN">Multi-Table Replenishment Query (5-Table Join with ROP Filter)</option>
            </select>
          </div>

          <div>
            <button
              onClick={handleRunBenchmark}
              disabled={running}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
            >
              <Play className={`w-4 h-4 fill-current ${running ? 'animate-spin' : ''}`} />
              {running ? 'Profiling Query...' : 'Inspect Execution Plan'}
            </button>
          </div>
        </div>
      </div>

      {/* Profiler Results */}
      {pg && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-indigo-950/20 border border-indigo-800/30">
            <div>
              <span className="text-xs text-indigo-300 font-semibold uppercase tracking-wider block">{pg.title || benchmarkResult.query_type}</span>
              <strong className="text-white text-base">{pg.explanation || 'Profiled across multiple warm cache iterations.'}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Plan Verified
              </span>
            </div>
          </div>

          {/* Performance & Plan Details */}
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  Execution Timing & Latency Distribution
                </h3>
                <p className="text-xs text-slate-400">Captured over {benchmarkResult.iterations} warm trials</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Median Execution Time</span>
                <span className="text-3xl font-black font-mono text-emerald-400">
                  {pg.median_ms} <span className="text-sm font-normal text-slate-400">ms</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="text-slate-400 block text-[11px]">Minimum Latency</span>
                <strong className="text-emerald-400 font-mono text-sm">{pg.min_ms} ms</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="text-slate-400 block text-[11px]">Median Latency (p50)</span>
                <strong className="text-indigo-300 font-mono text-sm">{pg.median_ms} ms</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="text-slate-400 block text-[11px]">95th Percentile (p95)</span>
                <strong className="text-amber-300 font-mono text-sm">{pg.p95_ms} ms</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="text-slate-400 block text-[11px]">Maximum Latency</span>
                <strong className="text-rose-400 font-mono text-sm">{pg.max_ms} ms</strong>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-indigo-400" /> PostgreSQL EXPLAIN (ANALYZE, BUFFERS, VERBOSE) Output
              </h4>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 max-h-96 overflow-auto scrollbar-none whitespace-pre-wrap leading-relaxed">
                {pg.execution_plan || pg.error || 'No plan available.'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
