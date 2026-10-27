import React, { useEffect, useState, useMemo } from 'react';
import { 
  Sliders, Play, TrendingDown, DollarSign, AlertTriangle, 
  Layers, Trash2, Search, Filter, RefreshCw, Zap, 
  CheckCircle2, ArrowUpDown, Clock, Download, ChevronLeft, ChevronRight,
  ShieldAlert, Package, Check, X
} from 'lucide-react';
import { api } from '../services/api';
import { ScenarioRun, ScenarioDetail } from '../types';

export const SimulationPage: React.FC = () => {
  const [scenarios, setScenarios] = useState<ScenarioRun[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form controls
  const [name, setName] = useState<string>('Holiday Surge & Port Delay');
  const [demandMultiplier, setDemandMultiplier] = useState<number>(1.35);
  const [leadTimeDelta, setLeadTimeDelta] = useState<number>(4);
  const [safetyStockFactor, setSafetyStockFactor] = useState<number>(1.2);
  const [simDays, setSimDays] = useState<number>(14);

  // SKU Table search, filter, and sort
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'risk' | 'lostSales' | 'stock' | 'holdingCost'>('risk');

  // Pagination for SKU results
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const presets = [
    {
      title: 'Holiday Surge',
      multiplier: 1.35,
      leadTime: 4,
      safetyStock: 1.2,
      days: 14,
      desc: '+35% demand spike, 4-day port transit delay'
    },
    {
      title: 'Supply Chain Choke',
      multiplier: 1.0,
      leadTime: 10,
      safetyStock: 1.5,
      days: 21,
      desc: 'Severe 10-day supplier freeze, standard demand'
    },
    {
      title: 'Flash Sale Blitz',
      multiplier: 2.0,
      leadTime: 1,
      safetyStock: 1.0,
      days: 7,
      desc: '2x massive demand spike over 7-day flash promo'
    },
    {
      title: 'Demand Slump',
      multiplier: 0.70,
      leadTime: 0,
      safetyStock: 0.8,
      days: 14,
      desc: '-30% slump, excess stock & holding cost risk'
    }
  ];

  const applyPreset = (p: typeof presets[0]) => {
    setName(p.title);
    setDemandMultiplier(p.multiplier);
    setLeadTimeDelta(p.leadTime);
    setSafetyStockFactor(p.safetyStock);
    setSimDays(p.days);
  };

  const loadScenarios = async (autoSelectFirst: boolean = false) => {
    try {
      setActionError(null);
      const res = await api.getScenarios();
      setScenarios(res.data);
      if (res.data.length > 0 && (autoSelectFirst || !selectedScenario)) {
        loadScenarioDetail(res.data[0].scenario_id);
      } else if (res.data.length === 0) {
        setSelectedScenario(null);
      }
    } catch (err: any) {
      console.error(err);
      setActionError('Failed to load scenarios from the server.');
    }
  };

  const loadScenarioDetail = async (id: number) => {
    setDetailLoading(true);
    setActionError(null);
    setCurrentPage(1);
    try {
      const res = await api.getScenarioDetail(id);
      setSelectedScenario(res.data);
    } catch (err: any) {
      console.error(err);
      setActionError(`Could not load scenario #${id} details.`);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadScenarios(true);
  }, []);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setActionError(null);
    setFeedback(null);
    try {
      const res = await api.runScenario({
        name,
        demand_multiplier: demandMultiplier,
        lead_time_delta_days: leadTimeDelta,
        safety_stock_factor: safetyStockFactor,
        simulation_days: simDays
      });
      await loadScenarios(false);
      if (res.data && res.data.scenario_id) {
        await loadScenarioDetail(res.data.scenario_id);
      }
      setFeedback({
        type: 'success',
        message: `Simulation '${name}' completed across all catalog products!`
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      console.error('Simulation execution failed', err);
      setActionError(err.response?.data?.detail || 'Simulation evaluation failed. Check parameters.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteScenario = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this scenario run?')) return;
    setDeletingId(id);
    try {
      await api.deleteScenario(id);
      const updated = scenarios.filter((s) => s.scenario_id !== id);
      setScenarios(updated);
      if (selectedScenario?.scenario_id === id) {
        if (updated.length > 0) {
          loadScenarioDetail(updated[0].scenario_id);
        } else {
          setSelectedScenario(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete scenario', err);
      setActionError('Failed to delete scenario.');
    } finally {
      setDeletingId(null);
    }
  };

  // Categories list from current scenario results
  const categories = useMemo(() => {
    if (!selectedScenario || !selectedScenario.results) return [];
    const set = new Set<string>();
    selectedScenario.results.forEach((r) => {
      if (r.category_name) set.add(r.category_name);
    });
    return Array.from(set).sort();
  }, [selectedScenario]);

  // Filtered & sorted SKU results
  const filteredResults = useMemo(() => {
    if (!selectedScenario || !selectedScenario.results) return [];
    let list = selectedScenario.results.filter((res) => {
      // Category filter
      if (categoryFilter !== 'ALL' && res.category_name !== categoryFilter) return false;

      // Search match
      const matchSearch =
        !searchTerm ||
        res.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        res.product_name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      // Risk level filter
      const risk = res.simulated_stockout_risk;
      if (riskFilter === 'HIGH') return risk >= 70;
      if (riskFilter === 'MEDIUM') return risk >= 40 && risk < 70;
      if (riskFilter === 'LOW') return risk < 40;
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'risk') return b.simulated_stockout_risk - a.simulated_stockout_risk;
      if (sortBy === 'lostSales') return b.estimated_lost_sales_cost - a.estimated_lost_sales_cost;
      if (sortBy === 'holdingCost') return b.estimated_holding_cost - a.estimated_holding_cost;
      if (sortBy === 'stock') return a.projected_ending_stock - b.projected_ending_stock;
      return 0;
    });

    return list;
  }, [selectedScenario, searchTerm, riskFilter, categoryFilter, sortBy]);

  // Pagination
  const totalItems = filteredResults.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, currentPage, pageSize]);

  // Stockout SKU count in current scenario
  const stockoutSkuCount = useMemo(() => {
    if (!selectedScenario || !selectedScenario.results) return 0;
    return selectedScenario.results.filter((r) => r.projected_ending_stock <= 0).length;
  }, [selectedScenario]);

  // 1-Click Export CSV
  const handleExportCSV = () => {
    if (filteredResults.length === 0 || !selectedScenario) return;

    const headers = [
      'Scenario Run',
      'SKU',
      'Product Name',
      'Department',
      'Projected Ending Stock',
      'Simulated Stockout Risk (%)',
      'Estimated Holding Cost ($)',
      'Estimated Lost Sales Margin ($)'
    ];

    const rows = filteredResults.map((r) => [
      `"${selectedScenario.name}"`,
      `"${r.sku}"`,
      `"${r.product_name.replace(/"/g, '""')}"`,
      `"${r.category_name || 'General'}"`,
      r.projected_ending_stock.toFixed(1),
      r.simulated_stockout_risk.toFixed(1),
      r.estimated_holding_cost.toFixed(2),
      r.estimated_lost_sales_cost.toFixed(2)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `simulation_${selectedScenario.name.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-medium shadow-2xl animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-600/50 text-emerald-200'
              : 'bg-rose-950/90 border border-rose-600/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-6 h-6 text-indigo-400" />
            What-If Scenarios & Supply Chain Simulation
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Stress-test catalog stock against supplier delays, demand shocks, and evaluate holding vs lost margin trade-offs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedScenario && (
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredResults.length === 0}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition shadow disabled:opacity-40"
              title="Download CSV breakdown of simulated results"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export Shock CSV</span>
            </button>
          )}

          <button
            onClick={() => loadScenarios(false)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition shadow"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Runs</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Simulation Controls & Saved Scenarios */}
        <div className="space-y-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Parameters & Shocks
              </h2>
              <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20 font-bold">
                Monte-Carlo Model
              </span>
            </div>

            {/* Quick Retail Presets */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Quick Retail Presets
              </label>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500/50 transition group"
                  >
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 truncate">
                      {p.title}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {p.multiplier}x / +{p.leadTime}d
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleRunSimulation} className="space-y-4 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Scenario Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                  placeholder="e.g. Q4 Surge with Supplier Delays"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-400">Demand Multiplier</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {(demandMultiplier * 100).toFixed(0)}% (
                    {demandMultiplier >= 1
                      ? `+${((demandMultiplier - 1) * 100).toFixed(0)}%`
                      : `-${((1 - demandMultiplier) * 100).toFixed(0)}%`}
                    )
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={demandMultiplier}
                  onChange={(e) => setDemandMultiplier(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-400">Supplier Lead Time Delay</span>
                  <span className="text-amber-400 font-mono font-bold">+{leadTimeDelta} days</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="14"
                  step="1"
                  value={leadTimeDelta}
                  onChange={(e) => setLeadTimeDelta(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-400">Safety Stock Target Factor</span>
                  <span className="text-amber-300 font-mono font-bold">{safetyStockFactor.toFixed(2)}x buffer</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={safetyStockFactor}
                  onChange={(e) => setSafetyStockFactor(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-400">Simulation Horizon</span>
                  <span className="text-amber-400 font-mono font-bold">{simDays} days</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="60"
                  step="7"
                  value={simDays}
                  onChange={(e) => setSimDays(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-xs transition shadow-lg shadow-amber-500/25 disabled:opacity-50 border border-amber-300/40"
              >
                <Play className={`w-4 h-4 fill-current ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Evaluating Scenarios Across Catalog...' : 'Run Simulation'}
              </button>
            </form>
          </div>

          {/* Saved Scenarios Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Saved Scenario Runs ({scenarios.length})
              </h3>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {scenarios.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  No simulations run yet. Use the parameters above to create one.
                </div>
              ) : (
                scenarios.map((s) => (
                  <div
                    key={s.scenario_id}
                    onClick={() => loadScenarioDetail(s.scenario_id)}
                    className={`w-full text-left p-3 rounded-xl text-xs font-medium transition flex items-center justify-between cursor-pointer border ${
                      selectedScenario?.scenario_id === s.scenario_id
                        ? 'bg-indigo-950/60 border-indigo-600 text-white'
                        : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="font-semibold text-slate-200 truncate">{s.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {s.demand_multiplier}x demand · +{s.lead_time_delta_days}d delay
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-mono px-2 py-0.5 rounded text-[11px] font-bold ${
                        (s.avg_stockout_risk ?? 0) >= 70
                          ? 'bg-rose-500/20 text-rose-400'
                          : (s.avg_stockout_risk ?? 0) >= 40
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {(s.avg_stockout_risk ?? 0).toFixed(0)}% risk
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteScenario(s.scenario_id, e)}
                        disabled={deletingId === s.scenario_id}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Delete scenario"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Results Overview & SKU Breakdown */}
        <div className="lg:col-span-2 space-y-5">
          {detailLoading ? (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-900/60 border border-slate-800 rounded-2xl text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
              <p className="text-sm font-medium">Recalculating stock depletion curves...</p>
            </div>
          ) : selectedScenario ? (
            <>
              {/* Scenario Details Header */}
              <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-900/40 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                      Run #{selectedScenario.scenario_id}
                    </span>
                    <h2 className="text-lg font-bold text-white">{selectedScenario.name}</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Assumptions: {selectedScenario.demand_multiplier}x Demand · +{selectedScenario.lead_time_delta_days}d Lead Time · {selectedScenario.safety_stock_factor}x Buffer
                  </p>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Simulated on: {new Date(selectedScenario.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Financial & Risk Impact Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* Average Risk */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Average Stockout Risk</span>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-rose-400">
                    {(selectedScenario.avg_stockout_risk ?? 0).toFixed(1)}%
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Across {selectedScenario.product_count ?? selectedScenario.results?.length ?? 0} SKUs
                  </p>
                </div>

                {/* Stockout SKUs */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Projected Stockouts</span>
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400">
                    {stockoutSkuCount}
                  </div>
                  <p className="text-[11px] text-slate-500">Items reaching 0 stock</p>
                </div>

                {/* Holding Cost */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Projected Holding Cost</span>
                    <DollarSign className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-cyan-400">
                    ${(selectedScenario.total_estimated_holding_cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[11px] text-slate-500">Inventory carrying projection</p>
                </div>

                {/* Lost Sales Margin */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span>Lost Sales Margin</span>
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-rose-400">
                    ${(selectedScenario.total_estimated_lost_sales_cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-[11px] text-slate-500">Potential lost gross profit</p>
                </div>
              </div>

              {/* SKU Impact Table Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-3 p-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <h3 className="font-bold text-white text-sm">Product-Level Shock Breakdown</h3>
                    <p className="text-xs text-slate-400">
                      Showing {filteredResults.length} of {selectedScenario.results?.length || 0} evaluated catalog items
                    </p>
                  </div>

                  {/* Filters & Search */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-44">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search SKU or name..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Risk Filter Buttons */}
                    <div className="flex bg-slate-800/80 p-0.5 rounded-xl border border-slate-700 text-[11px]">
                      {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => {
                            setRiskFilter(lvl);
                            setCurrentPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-medium transition ${
                            riskFilter === lvl
                              ? 'bg-indigo-600 text-white shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {lvl === 'ALL' ? 'All' : lvl === 'HIGH' ? 'Critical' : lvl === 'MEDIUM' ? 'Med' : 'Low'}
                        </button>
                      ))}
                    </div>

                    {/* Sort Selector */}
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="risk">Highest Risk</option>
                      <option value="lostSales">Highest Lost Margin</option>
                      <option value="holdingCost">Highest Holding Cost</option>
                      <option value="stock">Lowest Ending Stock</option>
                    </select>
                  </div>
                </div>

                {/* Department Filter Pills */}
                {categories.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider shrink-0 mr-1">
                      Department:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter('ALL');
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
                        categoryFilter === 'ALL'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(cat);
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
                          categoryFilter === cat
                            ? 'bg-indigo-600 text-white shadow'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto max-h-[460px] border border-slate-800/80 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 uppercase font-semibold text-slate-400 sticky top-0 border-b border-slate-800 text-[10px]">
                      <tr>
                        <th className="py-3 px-4">SKU / Product</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4 text-right">Projected End Stock</th>
                        <th className="py-3 px-4 text-center">Stockout Risk</th>
                        <th className="py-3 px-4 text-right">Est. Holding Cost</th>
                        <th className="py-3 px-4 text-right">Lost Sales Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                      {paginatedResults.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500">
                            No products match your search or filter.
                          </td>
                        </tr>
                      ) : (
                        paginatedResults.map((res) => (
                          <tr key={res.result_id} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-indigo-300 block">{res.sku}</span>
                              <span className="text-white text-xs font-medium truncate block max-w-xs">{res.product_name}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                {res.category_name || 'General'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              {res.projected_ending_stock <= 0 ? (
                                <span className="inline-flex items-center gap-1 text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                  0.0 (Stockout)
                                </span>
                              ) : (
                                <span className="text-slate-200">
                                  {res.projected_ending_stock.toFixed(1)} units
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-mono">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  res.simulated_stockout_risk >= 70
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : res.simulated_stockout_risk >= 40
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}
                              >
                                {res.simulated_stockout_risk.toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-400">
                              ${(res.estimated_holding_cost ?? 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold">
                              {(res.estimated_lost_sales_cost ?? 0) > 0 ? (
                                <span className="text-rose-400">
                                  ${(res.estimated_lost_sales_cost ?? 0).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-500">$0.00</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-2 pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <span>Showing</span>
                    <span className="font-mono text-white font-semibold">
                      {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}
                    </span>
                    <span>to</span>
                    <span className="font-mono text-white font-semibold">
                      {Math.min(currentPage * pageSize, totalItems)}
                    </span>
                    <span>of</span>
                    <span className="font-mono text-white font-semibold">{totalItems.toLocaleString()}</span>
                    <span>items</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <span className="font-mono text-xs px-2 text-slate-300">
                      Page {currentPage} of {totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
                      title="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-28 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-xl">
              <Sliders className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-medium text-slate-300">No Simulation Selected</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Configure your demand shocks and lead time delay on the left, then click &ldquo;Run Simulation&rdquo; to evaluate stockout risks.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
