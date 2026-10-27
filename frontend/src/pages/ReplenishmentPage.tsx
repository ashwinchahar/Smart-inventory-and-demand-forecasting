import React, { useEffect, useState, useMemo } from 'react';
import { 
  AlertTriangle, AlertCircle, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, 
  HelpCircle, ArrowRight, ShieldCheck, Clock, Search, X, Check,
  Package, DollarSign, Layers, CheckCheck, Truck, Download, Plus, Minus,
  Building2, Calendar, FileText
} from 'lucide-react';
import { api } from '../services/api';
import { ReplenishmentRecommendation } from '../types';

export const ReplenishmentPage: React.FC = () => {
  const [recommendations, setRecommendations] = useState<ReplenishmentRecommendation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<number | 'bulk' | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  
  // Search & Filtering
  const [search, setSearch] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'CRITICAL' | 'MODERATE' | 'SAFE' | 'PENDING' | 'ACCEPTED'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'risk_desc' | 'qty_desc' | 'cost_desc' | 'name_asc'>('risk_desc');

  // Local overrides for order quantities (user adjustments before creating PO)
  const [customQuantities, setCustomQuantities] = useState<Record<number, number>>({});

  // Feedback toast / modal
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; poNumber?: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getRecommendations();
      setRecommendations(res.data || []);
    } catch (err) {
      console.error('Failed to load replenishment recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEvaluate = async () => {
    setEvaluating(true);
    setFeedback(null);
    try {
      await api.evaluateReplenishment();
      await loadData();
      setFeedback({
        type: 'success',
        message: 'Replenishment policies and reorder points recalculated across all active catalog products.'
      });
      setTimeout(() => setFeedback(null), 6000);
    } catch (err: any) {
      console.error('Failed to recalculate policies:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to recalculate replenishment policies.'
      });
    } finally {
      setEvaluating(false);
    }
  };

  // Convert single recommendation to PO
  const handleCreatePO = async (rec: ReplenishmentRecommendation) => {
    setActionInProgress(rec.recommendation_id);
    setFeedback(null);
    try {
      const targetQty = customQuantities[rec.recommendation_id] ?? (rec.recommended_qty > 0 ? rec.recommended_qty : rec.reorder_point);
      const res: any = await api.createPOFromRecommendation(rec.recommendation_id, targetQty);
      
      const poNum = res.data?.po_number;
      setRecommendations((prev) =>
        prev.map((r) =>
          r.recommendation_id === rec.recommendation_id
            ? { ...r, status: 'ACCEPTED', current_on_order: r.current_on_order + targetQty, po_number: poNum }
            : r
        )
      );

      setFeedback({
        type: 'success',
        message: `Generated Purchase Order ${poNum} for ${rec.product_name} (${targetQty} units). Available to receive on Purchase Orders screen.`,
        poNumber: poNum
      });
      setTimeout(() => setFeedback(null), 8000);
    } catch (err: any) {
      console.error('Failed to create purchase order from recommendation:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to create purchase order.'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  // Bulk convert all critical pending recommendations to POs
  const handleBulkCreateCriticalPOs = async () => {
    const criticalPending = recommendations.filter(
      (r) => r.status === 'PENDING' && r.stockout_risk_score >= 70
    );
    if (criticalPending.length === 0) return;

    setActionInProgress('bulk');
    setFeedback(null);
    try {
      const ids = criticalPending.map((r) => r.recommendation_id);
      const res: any = await api.bulkCreatePO(ids);
      const createdPOs = res.data?.created_pos || [];

      // Update state locally
      setRecommendations((prev) =>
        prev.map((r) => {
          if (ids.includes(r.recommendation_id)) {
            const addedQty = customQuantities[r.recommendation_id] ?? (r.recommended_qty > 0 ? r.recommended_qty : r.reorder_point);
            return { ...r, status: 'ACCEPTED', current_on_order: r.current_on_order + addedQty };
          }
          return r;
        })
      );

      setFeedback({
        type: 'success',
        message: `Successfully generated ${createdPOs.length} consolidated Purchase Order(s) covering ${criticalPending.length} critical items.`
      });
      setTimeout(() => setFeedback(null), 8000);
    } catch (err: any) {
      console.error('Failed to bulk generate purchase orders:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to generate bulk purchase orders.'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStatusUpdate = async (id: number, status: 'ACCEPTED' | 'DISMISSED' | 'PENDING') => {
    try {
      await api.updateRecommendationStatus(id, status);
      setRecommendations((prev) =>
        prev.map((r) => (r.recommendation_id === id ? { ...r, status } : r))
      );
    } catch (err) {
      console.error('Failed to update recommendation status:', err);
    }
  };

  const updateQuantity = (recId: number, delta: number, currentBase: number) => {
    setCustomQuantities((prev) => {
      const current = prev[recId] ?? currentBase;
      const next = Math.max(1, current + delta);
      return { ...prev, [recId]: next };
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    recommendations.forEach((r) => {
      if (r.category_name) set.add(r.category_name);
    });
    return Array.from(set).sort();
  }, [recommendations]);

  // Filtered & Sorted Recommendations
  const filteredRecs = useMemo(() => {
    const term = search.toLowerCase().trim();
    return recommendations
      .filter((rec) => {
        // Risk / Status filter
        if (riskFilter === 'CRITICAL' && rec.stockout_risk_score < 70) return false;
        if (riskFilter === 'MODERATE' && (rec.stockout_risk_score < 40 || rec.stockout_risk_score >= 70)) return false;
        if (riskFilter === 'SAFE' && rec.stockout_risk_score >= 40) return false;
        if (riskFilter === 'PENDING' && rec.status !== 'PENDING') return false;
        if (riskFilter === 'ACCEPTED' && rec.status !== 'ACCEPTED') return false;

        // Category filter
        if (selectedCategory !== 'ALL' && rec.category_name !== selectedCategory) return false;

        // Search match
        if (!term) return true;
        return (
          rec.product_name.toLowerCase().includes(term) ||
          rec.sku.toLowerCase().includes(term) ||
          (rec.supplier_name && rec.supplier_name.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'risk_desc') return b.stockout_risk_score - a.stockout_risk_score;
        if (sortBy === 'qty_desc') return b.recommended_qty - a.recommended_qty;
        if (sortBy === 'cost_desc') {
          const costA = (a.cost_price || 0) * a.recommended_qty;
          const costB = (b.cost_price || 0) * b.recommended_qty;
          return costB - costA;
        }
        if (sortBy === 'name_asc') return a.product_name.localeCompare(b.product_name);
        return 0;
      });
  }, [recommendations, search, riskFilter, selectedCategory, sortBy]);

  // Summary Metrics
  const criticalCount = recommendations.filter((r) => r.stockout_risk_score >= 70 && r.status === 'PENDING').length;
  const moderateCount = recommendations.filter((r) => r.stockout_risk_score >= 40 && r.stockout_risk_score < 70 && r.status === 'PENDING').length;
  const safeCount = recommendations.filter((r) => r.stockout_risk_score < 40).length;
  const pendingCount = recommendations.filter((r) => r.status === 'PENDING').length;
  const approvedCount = recommendations.filter((r) => r.status === 'ACCEPTED').length;

  const totalPendingUnits = recommendations
    .filter((r) => r.status === 'PENDING')
    .reduce((sum, r) => sum + Number(r.recommended_qty || 0), 0);

  const totalPendingCost = recommendations
    .filter((r) => r.status === 'PENDING')
    .reduce((sum, r) => sum + Number(r.recommended_qty || 0) * Number(r.cost_price || 0), 0);

  // 1-Click Export CSV Manifest
  const handleExportCSV = () => {
    if (filteredRecs.length === 0) return;

    const headers = [
      'SKU',
      'Product Name',
      'Department',
      'Supplier',
      'Status',
      'Stockout Risk (%)',
      'On Hand Qty',
      'On Order Qty',
      'Lead Time (Days)',
      'Lead Time Demand',
      'Safety Stock',
      'Reorder Point (ROP)',
      'Recommended Qty',
      'Unit Cost ($)',
      'Total Restock Cost ($)',
      'Order Deadline'
    ];

    const rows = filteredRecs.map((r) => {
      const targetQty = customQuantities[r.recommendation_id] ?? r.recommended_qty;
      const unitCost = r.cost_price || 0;
      const totalCost = targetQty * unitCost;
      return [
        `"${r.sku}"`,
        `"${r.product_name.replace(/"/g, '""')}"`,
        `"${r.category_name || 'General'}"`,
        `"${(r.supplier_name || 'Default Wholesale').replace(/"/g, '""')}"`,
        `"${r.status}"`,
        r.stockout_risk_score,
        r.current_on_hand,
        r.current_on_order,
        r.lead_time_days,
        r.lead_time_demand,
        r.safety_stock,
        r.reorder_point,
        targetQty,
        unitCost.toFixed(2),
        totalCost.toFixed(2),
        `"${r.reorder_deadline}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `replenishment_orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-medium shadow-2xl animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-600/50 text-emerald-200'
              : 'bg-rose-950/90 border border-rose-600/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            Replenishment Recommendations & Automated POs
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Calculated Reorder Points (ROP), safety stock buffers, and 1-click supplier Purchase Order generation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {criticalCount > 0 && (
            <button
              type="button"
              onClick={handleBulkCreateCriticalPOs}
              disabled={actionInProgress === 'bulk'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition shadow-lg shadow-rose-600/25 disabled:opacity-50"
              title="Automatically generate POs for all critical stockout items"
            >
              <Truck className={`w-4 h-4 ${actionInProgress === 'bulk' ? 'animate-bounce' : ''}`} />
              <span>Generate POs for Critical ({criticalCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredRecs.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition shadow disabled:opacity-40"
            title="Download CSV manifest of recommendations"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export Manifest CSV</span>
          </button>

          <button
            type="button"
            onClick={handleEvaluate}
            disabled={evaluating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
            <span>{evaluating ? 'Recalculating...' : 'Recalculate Policies'}</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Deck */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Critical Card */}
        <div 
          onClick={() => setRiskFilter('CRITICAL')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-rose-500/30 hover:border-rose-500/60 transition cursor-pointer space-y-1 shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Critical Stockout Risk</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400 font-mono">{criticalCount}</span>
            <span className="text-xs text-rose-400/80">SKUs</span>
          </div>
          <span className="text-[11px] text-slate-500 block">Inventory below supplier lead demand</span>
        </div>

        {/* Moderate Attention */}
        <div 
          onClick={() => setRiskFilter('MODERATE')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 hover:border-amber-500/60 transition cursor-pointer space-y-1 shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Moderate Attention</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400 font-mono">{moderateCount}</span>
            <span className="text-xs text-amber-400/80">SKUs</span>
          </div>
          <span className="text-[11px] text-slate-500 block">Approaching safety stock threshold</span>
        </div>

        {/* Pending Order Volume */}
        <div 
          onClick={() => setRiskFilter('PENDING')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition cursor-pointer space-y-1 shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Pending Order Volume</span>
            <Package className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-cyan-400 font-mono">
              {totalPendingUnits.toLocaleString()}
            </span>
            <span className="text-xs text-cyan-400/80">units</span>
          </div>
          <span className="text-[11px] text-slate-500 block">{pendingCount} orders awaiting PO dispatch</span>
        </div>

        {/* Total Restock Capital */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Estimated PO Capital</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              ${totalPendingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 block">Wholesale reorder value</span>
        </div>
      </div>

      {/* Filter, Department & Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        {/* Top Filter Row */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU, or supplier..."
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Risk Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 w-full md:w-auto overflow-x-auto">
            {[
              { id: 'ALL', label: `All (${recommendations.length})` },
              { id: 'CRITICAL', label: `Critical (${criticalCount})`, badgeColor: 'text-rose-400' },
              { id: 'MODERATE', label: `Moderate (${moderateCount})`, badgeColor: 'text-amber-400' },
              { id: 'SAFE', label: `Healthy (${safeCount})`, badgeColor: 'text-emerald-400' },
              { id: 'PENDING', label: `Pending (${pendingCount})` },
              { id: 'ACCEPTED', label: `Approved (${approvedCount})` }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRiskFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  riskFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="risk_desc">Highest Stockout Risk</option>
              <option value="qty_desc">Highest Order Units</option>
              <option value="cost_desc">Highest Restock Capital</option>
              <option value="name_asc">Product Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider shrink-0 mr-1">
            Department:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
              selectedCategory === 'ALL'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Departments
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations Cards List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-16 text-center rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            Evaluating inventory replenishment policies across catalog...
          </div>
        ) : filteredRecs.length === 0 ? (
          <div className="p-16 text-center rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-400">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-300">No matching recommendations found</p>
            <p className="text-xs text-slate-500 mt-1">Try broadening your search or department filter.</p>
          </div>
        ) : (
          filteredRecs.map((rec) => {
            const isExpanded = expandedId === rec.recommendation_id;
            const isHighRisk = rec.stockout_risk_score >= 70;
            const isMediumRisk = rec.stockout_risk_score >= 40 && rec.stockout_risk_score < 70;
            const unitCost = rec.cost_price || 0;
            const orderQty = customQuantities[rec.recommendation_id] ?? (rec.recommended_qty > 0 ? rec.recommended_qty : rec.reorder_point);
            const totalOrderCost = orderQty * unitCost;

            // Compute buffer meter percentages
            const inventoryPosition = rec.current_on_hand + rec.current_on_order;
            const rop = rec.reorder_point;
            const maxRef = Math.max(rop * 1.3, inventoryPosition * 1.1, 1);
            const stockPct = Math.min(100, Math.round((rec.current_on_hand / maxRef) * 100));
            const onOrderPct = Math.min(100 - stockPct, Math.round((rec.current_on_order / maxRef) * 100));
            const ropPct = Math.min(100, Math.round((rop / maxRef) * 100));

            return (
              <div
                key={rec.recommendation_id}
                className={`bg-slate-900/90 border rounded-2xl transition shadow-lg overflow-hidden ${
                  isHighRisk 
                    ? 'border-rose-500/40 hover:border-rose-500/60' 
                    : isMediumRisk 
                    ? 'border-amber-500/30 hover:border-amber-500/50' 
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Main Card Body */}
                <div 
                  className="p-5 cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                  onClick={() => toggleExpand(rec.recommendation_id)}
                >
                  {/* Left Column: Product Info & Position Matrix */}
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-indigo-300 border border-slate-700">
                        {rec.sku}
                      </span>
                      <h3 className="text-sm sm:text-base font-bold text-white">{rec.product_name}</h3>
                      {rec.category_name && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                          {rec.category_name}
                        </span>
                      )}
                      {rec.supplier_name && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 flex items-center gap-1 font-medium">
                          <Building2 className="w-3 h-3 text-indigo-400" />
                          {rec.supplier_name}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto sm:ml-0 ${
                        rec.status === 'ACCEPTED' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : rec.status === 'DISMISSED' 
                          ? 'bg-slate-800 text-slate-500' 
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {rec.status === 'ACCEPTED' ? 'PO Created' : rec.status}
                      </span>
                    </div>

                    {/* Stock Position Matrix Tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800">
                        <span className="text-slate-400 block text-[11px]">Shelf Stock</span>
                        <strong className={`font-mono text-sm ${rec.current_on_hand <= 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                          {rec.current_on_hand} units
                        </strong>
                        {rec.current_on_order > 0 && (
                          <span className="text-[10px] text-cyan-400 block">+{rec.current_on_order} incoming</span>
                        )}
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800">
                        <span className="text-slate-400 block text-[11px]">Reorder Point (ROP)</span>
                        <strong className="text-indigo-300 font-mono text-sm">{rec.reorder_point} units</strong>
                        <span className="text-[10px] text-slate-500 block">LTD {rec.lead_time_demand} + SS {rec.safety_stock}</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800">
                        <span className="text-slate-400 block text-[11px]">Lead Time</span>
                        <strong className="text-slate-200 font-mono text-sm">{rec.lead_time_days} days</strong>
                        <span className="text-[10px] text-slate-500 block">Vendor transit window</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800">
                        <span className="text-slate-400 block text-[11px]">Reorder Deadline</span>
                        <strong className="text-amber-400 font-mono text-xs flex items-center gap-1 mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-amber-400" /> 
                          {rec.reorder_deadline}
                        </strong>
                      </div>
                    </div>

                    {/* Visual Stacked Stock vs ROP Buffer Meter */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Inventory Position vs ROP Target:</span>
                        <span className="font-mono text-slate-300">
                          {inventoryPosition} / {rop} units ({Math.round((inventoryPosition / (rop || 1)) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-800/90 relative overflow-hidden flex">
                        <div 
                          className={`h-full ${isHighRisk ? 'bg-rose-500' : isMediumRisk ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${stockPct}%` }}
                          title={`Shelf Stock: ${rec.current_on_hand} units`}
                        />
                        <div 
                          className="h-full bg-cyan-500" 
                          style={{ width: `${onOrderPct}%` }}
                          title={`Inbound PO: ${rec.current_on_order} units`}
                        />
                        {/* Dotted Marker for ROP */}
                        <div 
                          className="absolute top-0 bottom-0 w-1 bg-white shadow-sm"
                          style={{ left: `${ropPct}%` }}
                          title={`Reorder Point: ${rop} units`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Risk Badge, Order Stepper & PO Generation */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-end justify-between gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between lg:justify-end">
                      {/* Risk Score Pill */}
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Stockout Risk</div>
                        <div className={`text-xl font-black font-mono ${
                          isHighRisk ? 'text-rose-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {rec.stockout_risk_score}%
                        </div>
                      </div>

                      {/* Financial Value */}
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Estimated PO Value</div>
                        <div className="text-base font-bold font-mono text-emerald-400">
                          ${totalOrderCost.toFixed(2)}
                        </div>
                        <span className="text-[10px] text-slate-500 block">${unitCost.toFixed(2)}/unit</span>
                      </div>
                    </div>

                    {/* Order Controls & Action Buttons */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end" onClick={(e) => e.stopPropagation()}>
                      {rec.status === 'PENDING' ? (
                        <>
                          {/* Quantity Stepper */}
                          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl p-0.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(rec.recommendation_id, -10, rec.recommended_qty || rec.reorder_point)}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700"
                              title="Decrease 10 units"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono text-xs font-bold px-2.5 text-white min-w-[3rem] text-center">
                              {orderQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(rec.recommendation_id, 10, rec.recommended_qty || rec.reorder_point)}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700"
                              title="Increase 10 units"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* 1-Click Create PO Button */}
                          <button
                            type="button"
                            onClick={() => handleCreatePO(rec)}
                            disabled={actionInProgress === rec.recommendation_id}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-xs transition shadow-md shadow-amber-500/25 disabled:opacity-50 border border-amber-300/40"
                            title="Generate official Purchase Order immediately"
                          >
                            <Truck className={`w-3.5 h-3.5 ${actionInProgress === rec.recommendation_id ? 'animate-bounce' : ''}`} />
                            <span>Convert to PO</span>
                          </button>

                          {/* Dismiss Button */}
                          <button
                            type="button"
                            onClick={() => handleStatusUpdate(rec.recommendation_id, 'DISMISSED')}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                            title="Dismiss recommendation"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : rec.status === 'ACCEPTED' ? (
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 text-xs font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            PO Dispatched
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(rec.recommendation_id, 'PENDING')}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                        >
                          Reopen
                        </button>
                      )}

                      <button 
                        onClick={() => toggleExpand(rec.recommendation_id)} 
                        className="text-slate-400 hover:text-white p-1 ml-1"
                        title={isExpanded ? 'Collapse' : 'Expand Details'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Explainability Breakdown Accordion */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-3 border-t border-slate-800/80 bg-slate-950/50 space-y-3">
                    <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/30">
                      <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-indigo-400" /> Mathematical Policy Justification
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {rec.explanation_text}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <span className="text-slate-400 block mb-0.5 text-[11px]">Lead Time Demand (LTD)</span>
                        <div className="font-mono text-sm font-bold text-white">{rec.lead_time_demand} units</div>
                        <span className="text-[10px] text-slate-500">Sales expected during {rec.lead_time_days}-day vendor delivery window</span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <span className="text-slate-400 block mb-0.5 text-[11px]">Safety Stock Buffer (SS)</span>
                        <div className="font-mono text-sm font-bold text-cyan-400">{rec.safety_stock} units</div>
                        <span className="text-[10px] text-slate-500">Buffer protecting against demand shocks at 95% service level</span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <span className="text-slate-400 block mb-0.5 text-[11px]">Formula Calculation</span>
                        <div className="font-mono text-sm font-bold text-indigo-400">ROP = LTD + SS</div>
                        <span className="text-[10px] text-slate-500">{rec.lead_time_demand} + {rec.safety_stock} = {rec.reorder_point}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
