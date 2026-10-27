import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, 
  Tooltip, CartesianGrid, ReferenceLine 
} from 'recharts';
import { 
  TrendingUp, Play, Calendar, Package, Truck, Clock, 
  AlertTriangle, AlertCircle, CheckCircle2, Search, ChevronDown, 
  ArrowRight, ShieldAlert, Sparkles, RefreshCw, Layers, DollarSign, Info,
  X, Check, Gauge, ShoppingCart, Upload, Download, ChevronLeft, ChevronRight,
  Eye, EyeOff
} from 'lucide-react';
import { api } from '../services/api';
import { Product, DailyDemandRecord, ForecastData, PurchaseOrder, ReplenishmentRecommendation } from '../types';

export const ForecastingPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Model & Horizon Controls
  const [modelName, setModelName] = useState<string>('HOLT_WINTERS');
  const [horizonDays, setHorizonDays] = useState<number>(14);
  const [imputeStockouts, setImputeStockouts] = useState<boolean>(true);
  const [timelineGranularity, setTimelineGranularity] = useState<'days' | 'month' | 'year'>('days');

  // Chart layer visibility toggles
  const [showConfidenceBand, setShowConfidenceBand] = useState<boolean>(true);
  const [showActuals, setShowActuals] = useState<boolean>(true);
  const [showForecast, setShowForecast] = useState<boolean>(true);
  const [showDepletion, setShowDepletion] = useState<boolean>(true);

  // Loaded Data
  const [demandData, setDemandData] = useState<DailyDemandRecord[]>([]);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [recommendations, setRecommendations] = useState<ReplenishmentRecommendation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadInitialCatalog = async () => {
    try {
      const [prodRes, poRes, recRes] = await Promise.all([
        api.getProducts(),
        api.getPurchaseOrders(),
        api.getRecommendations()
      ]);
      setProducts(prodRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setRecommendations(recRes.data || []);
      if (prodRes.data && prodRes.data.length > 0) {
        setSelectedProductId(prodRes.data[0].product_id);
      }
    } catch (err) {
      console.error('Failed to load initial catalog:', err);
    }
  };

  useEffect(() => {
    loadInitialCatalog();
  }, []);

  const loadForecastAndDemand = async (prodId: number) => {
    setLoading(true);
    try {
      const [demandRes, forecastRes] = await Promise.all([
        api.getDailyDemand(prodId, 365),
        api.getForecastHistory(prodId)
      ]);
      setDemandData(demandRes.data || []);
      setForecastData(forecastRes.data || null);
    } catch (err) {
      console.error('Failed to load forecast and demand data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProductId) {
      loadForecastAndDemand(selectedProductId);
    }
  }, [selectedProductId]);

  const handleGenerateForecast = async () => {
    if (demandData.length < 14) {
      setFeedback({
        type: 'error',
        message: `There are not enough sales records for this product (${demandData.length} records found, minimum 14 required) to fit a ${modelName} forecast model.`
      });
      return;
    }

    setGenerating(true);
    setFeedback(null);
    try {
      await api.generateForecast(selectedProductId, modelName, horizonDays, imputeStockouts);
      await loadForecastAndDemand(selectedProductId);
      const prodName = products.find((p) => p.product_id === selectedProductId)?.name || 'SKU';
      setFeedback({
        type: 'success',
        message: `Generated ${horizonDays}-day forecast for ${prodName} using ${modelName.replace('_', ' ')}.`
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      console.error('Forecast generation failed:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Forecast generation failed. Please verify demand history.'
      });
    } finally {
      setGenerating(false);
    }
  };

  const selectedProductIndex = products.findIndex((p) => p.product_id === selectedProductId);
  const selectedProduct = products[selectedProductIndex];
  const currentStock = Number(selectedProduct?.on_hand_qty || 0);

  // Navigate to previous or next SKU
  const navigateSku = (delta: number) => {
    if (products.length === 0) return;
    const nextIdx = (selectedProductIndex + delta + products.length) % products.length;
    setSelectedProductId(products[nextIdx].product_id);
    setIsDropdownOpen(false);
  };

  // Check if we have sufficient sales history for forecasting
  const hasSufficientHistory = useMemo(() => {
    if (forecastData && forecastData.has_sufficient_history === false) return false;
    if (demandData.length < 14) return false;
    return (forecastData?.values?.length ?? 0) > 0;
  }, [forecastData, demandData]);

  // Replenishment recommendation for selected product
  const rec = recommendations.find((r) => r.product_id === selectedProductId);
  const leadTimeDays = rec ? rec.lead_time_days : 3;
  const reorderPoint = rec ? Number(rec.reorder_point) : Number(selectedProduct?.reorder_threshold || 20);
  const recommendedOrderQty = rec ? Number(rec.recommended_qty) : Math.max(0, reorderPoint * 2 - currentStock);

  // Scheduled Inbound Deliveries for this product from open Purchase Orders
  const inboundShipments = useMemo(() => {
    const list: Array<{ po_number: string; expected_date: string; qty: number }> = [];
    purchaseOrders
      .filter((po) => po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED')
      .forEach((po) => {
        po.items
          .filter((it) => it.product_id === selectedProductId)
          .forEach((it) => {
            const rem = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
            if (rem > 0) {
              list.push({
                po_number: po.po_number,
                expected_date: po.expected_at ? po.expected_at.split('T')[0] : '',
                qty: rem
              });
            }
          });
      });
    return list;
  }, [purchaseOrders, selectedProductId]);

  // Map inbound quantity by date
  const inboundByDate = useMemo(() => {
    const map: Record<string, number> = {};
    inboundShipments.forEach((s) => {
      if (s.expected_date) {
        map[s.expected_date] = (map[s.expected_date] || 0) + s.qty;
      }
    });
    return map;
  }, [inboundShipments]);

  // Aggregate past sales records based on timelineGranularity
  const aggregatedPastDemand = useMemo(() => {
    if (timelineGranularity === 'days') {
      return demandData.slice(-60).map((d) => ({
        label: d.demand_date,
        actualSales: d.quantity_sold,
        stockout: d.stockout_flag
      }));
    }

    if (timelineGranularity === 'month') {
      const monthMap: Record<string, { totalQty: number; hasStockout: boolean }> = {};
      demandData.forEach((d) => {
        const monthKey = d.demand_date.substring(0, 7);
        if (!monthMap[monthKey]) {
          monthMap[monthKey] = { totalQty: 0, hasStockout: false };
        }
        monthMap[monthKey].totalQty += d.quantity_sold;
        if (d.stockout_flag) monthMap[monthKey].hasStockout = true;
      });

      return Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, val]) => ({
          label: m,
          actualSales: Math.round(val.totalQty * 10) / 10,
          stockout: val.hasStockout
        }));
    }

    // By Year
    const yearMap: Record<string, { totalQty: number; hasStockout: boolean }> = {};
    demandData.forEach((d) => {
      const yearKey = d.demand_date.substring(0, 4);
      if (!yearMap[yearKey]) {
        yearMap[yearKey] = { totalQty: 0, hasStockout: false };
      }
      yearMap[yearKey].totalQty += d.quantity_sold;
      if (d.stockout_flag) yearMap[yearKey].hasStockout = true;
    });

    return Object.entries(yearMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([y, val]) => ({
        label: y,
        actualSales: Math.round(val.totalQty * 10) / 10,
        stockout: val.hasStockout
      }));
  }, [demandData, timelineGranularity]);

  // Stockout Run-Out & Reorder Timing Simulation
  const { chartPoints, runOutDate, reorderMustDate, stockRunwayDays, totalHorizonDemand, futureManifest } = useMemo(() => {
    const points: any[] = [];
    const manifest: Array<{
      date: string;
      demand: number;
      inbound: number;
      endingStock: number;
      status: 'SAFE' | 'WARNING' | 'STOCKOUT';
    }> = [];

    // Historical points
    aggregatedPastDemand.forEach((p) => {
      points.push({
        date: p.label,
        actualSales: p.actualSales,
        forecastDemand: null,
        simulatedStock: null,
        lowerBound: null,
        upperBound: null,
        inboundArrival: null,
        isRunOut: false,
        isReorderDeadline: false
      });
    });

    // If there is insufficient history or no forecast values, return early without computing fake stockout dates
    const forecastVals = forecastData?.values || [];
    if (!hasSufficientHistory || forecastVals.length === 0) {
      return {
        chartPoints: points,
        runOutDate: null,
        reorderMustDate: null,
        stockRunwayDays: null,
        totalHorizonDemand: 0,
        futureManifest: []
      };
    }

    let runDate: string | null = null;
    let runningShelfStock = currentStock;
    let horizonSum = 0;

    forecastVals.forEach((v) => {
      const pDemand = Number(v.predicted_demand);
      horizonSum += pDemand;

      const inbound = inboundByDate[v.forecast_date] || 0;
      runningShelfStock = runningShelfStock - pDemand + inbound;

      const isStockoutNow = runningShelfStock <= 0;
      if (isStockoutNow && !runDate) {
        runDate = v.forecast_date;
      }

      const pointStock = Math.max(0, runningShelfStock);

      manifest.push({
        date: v.forecast_date,
        demand: Math.round(pDemand * 10) / 10,
        inbound,
        endingStock: Math.round(pointStock * 10) / 10,
        status: isStockoutNow ? 'STOCKOUT' : pointStock <= reorderPoint ? 'WARNING' : 'SAFE'
      });

      points.push({
        date: v.forecast_date,
        actualSales: null,
        forecastDemand: Math.round(pDemand * 10) / 10,
        simulatedStock: Math.round(pointStock * 10) / 10,
        lowerBound: v.lower_bound !== null && v.lower_bound !== undefined ? Math.round(Number(v.lower_bound) * 10) / 10 : null,
        upperBound: v.upper_bound !== null && v.upper_bound !== undefined ? Math.round(Number(v.upper_bound) * 10) / 10 : null,
        inboundArrival: inbound > 0 ? inbound : null,
        isRunOut: runDate === v.forecast_date,
        isReorderDeadline: false
      });
    });

    // Reorder deadline calculation
    let reorderDateStr: string | null = null;
    if (runDate) {
      const runTime = new Date(runDate).getTime();
      const reorderTime = runTime - leadTimeDays * 86400000;
      reorderDateStr = new Date(reorderTime).toISOString().split('T')[0];
    } else {
      const avgDailyDemand = forecastVals.length > 0 ? horizonSum / forecastVals.length : 0;
      if (avgDailyDemand > 0) {
        const daysUntilReorder = Math.max(0, (currentStock - reorderPoint) / avgDailyDemand);
        const reorderTime = Date.now() + daysUntilReorder * 86400000;
        reorderDateStr = new Date(reorderTime).toISOString().split('T')[0];
      }
    }

    points.forEach((pt) => {
      if (reorderDateStr && pt.date === reorderDateStr) {
        pt.isReorderDeadline = true;
      }
    });

    const avgVelocity = forecastVals.length > 0 ? horizonSum / forecastVals.length : 0;
    const runway = avgVelocity > 0 ? currentStock / avgVelocity : 999;

    return {
      chartPoints: points,
      runOutDate: runDate,
      reorderMustDate: reorderDateStr,
      stockRunwayDays: Math.round(runway * 10) / 10,
      totalHorizonDemand: Math.round(horizonSum * 10) / 10,
      futureManifest: manifest
    };
  }, [aggregatedPastDemand, forecastData, currentStock, reorderPoint, leadTimeDays, inboundByDate, hasSufficientHistory]);

  // Unique categories for filtering
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category_name) set.add(p.category_name);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filter products for dropdown
  const filteredProducts = useMemo(() => {
    const term = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      if (selectedCategoryFilter !== 'ALL' && p.category_name !== selectedCategoryFilter) {
        return false;
      }
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.category_name && p.category_name.toLowerCase().includes(term))
      );
    });
  }, [products, searchQuery, selectedCategoryFilter]);

  // Export Forecast Manifest to CSV
  const handleExportForecastCSV = () => {
    if (futureManifest.length === 0) return;

    const headers = [
      'Date',
      'Day of Week',
      'Predicted Demand (Units)',
      'Scheduled Inbound Receipts (Units)',
      'Projected Ending Shelf Stock (Units)',
      'Status',
      'Action Needed'
    ];

    const rows = futureManifest.map((row) => {
      const d = new Date(row.date);
      const dayOfWeek = d.toLocaleDateString(undefined, { weekday: 'long' });
      const action =
        row.status === 'STOCKOUT'
          ? 'Immediate Restock Required'
          : row.status === 'WARNING'
          ? 'Reorder Window Active'
          : 'Normal Stock';

      return [
        `"${row.date}"`,
        `"${dayOfWeek}"`,
        row.demand,
        row.inbound,
        row.endingStock,
        `"${row.status}"`,
        `"${action}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sku = selectedProduct?.sku || 'SKU';
    link.setAttribute('download', `demand_forecast_${sku}_${new Date().toISOString().slice(0, 10)}.csv`);
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
          className={`p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-medium shadow-xl animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-700/50 text-emerald-300'
              : 'bg-rose-950/80 border border-rose-700/50 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            Demand Forecasting & Stockout Run-Out
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Predict upcoming unit demand, simulate shelf stock exhaustion, and pinpoint exact reorder deadlines
          </p>
        </div>

        {/* Timeline Granularity Toggle Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 shadow-lg">
          <span className="text-[11px] font-semibold text-slate-400 px-2.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Timeline:
          </span>
          {(['days', 'month', 'year'] as const).map((gran) => (
            <button
              key={gran}
              type="button"
              onClick={() => setTimelineGranularity(gran)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                timelineGranularity === gran
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {gran === 'days' ? 'Daily' : gran === 'month' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>

      {/* Warning Notice: Insufficient Sales History */}
      {!hasSufficientHistory && (
        <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-600/40 shadow-xl space-y-3 animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Not Enough Sales Records for Forecasting: {selectedProduct?.name} ({selectedProduct?.sku})
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {demandData.length} records found / 14 required
                </span>
              </div>
              <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
                There are not enough sales records for this product to forecast future demand or predict a projected stock-out date. 
                At least <strong>14 days</strong> of historical daily demand records are required to identify seasonal variations and generate reliable statistical predictions.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-400 font-medium">To enable forecasting for this item:</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-medium border border-slate-700 flex items-center gap-1.5">
                  <ShoppingCart className="w-3.5 h-3.5 text-indigo-400" />
                  Record transactions in Point of Sale
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-medium border border-slate-700 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  Import sales history in Sales Records tab
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Hero Selector & Model Tuning Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        {/* Top: Product Hero Row with Prev/Next buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3 relative" ref={dropdownRef}>
            <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-indigo-300 border border-slate-700">
                  {selectedProduct?.sku || 'SKU'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {selectedProduct?.category_name || 'Grocery'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-1.5">
                {selectedProduct?.name || 'Select a product'}
              </h2>
            </div>
          </div>

          {/* Product Picker Modal Button & Quick SKU Steppers */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateSku(-1)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Previous SKU"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span>Change Product (Search 400+ SKUs)</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            <button
              type="button"
              onClick={() => navigateSku(1)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Next SKU"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Dropdown Menu Modal */}
            {isDropdownOpen && (
              <div className="absolute left-4 right-4 sm:left-auto sm:right-10 top-36 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden w-full max-w-lg animate-in fade-in zoom-in-95 duration-100">
                <div className="p-3 border-b border-slate-800 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by SKU, product name, or category..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                      autoFocus
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition ${
                        selectedCategoryFilter === 'ALL'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All ({products.length})
                    </button>
                    {categoriesList.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategoryFilter(cat)}
                        className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition ${
                          selectedCategoryFilter === cat
                            ? 'bg-indigo-600 text-white shadow'
                            : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60 p-1.5">
                  {filteredProducts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">No matching products found</div>
                  ) : (
                    <>
                      {filteredProducts.slice(0, 50).map((p) => {
                        const onHand = Number(p.on_hand_qty) || 0;
                        const isSelected = p.product_id === selectedProductId;
                        return (
                          <div
                            key={p.product_id}
                            onClick={() => {
                              setSelectedProductId(p.product_id);
                              setIsDropdownOpen(false);
                              setSearchQuery('');
                            }}
                            className={`p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition ${
                              isSelected
                                ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                                : 'hover:bg-slate-800/80 text-slate-300'
                            }`}
                          >
                            <div className="space-y-0.5 min-w-0 pr-2">
                              <p className="text-xs font-medium text-white truncate">{p.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {p.sku} &bull; {p.category_name || 'Grocery'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                                  onHand <= 0
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : onHand <= Number(p.reorder_threshold)
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {onHand <= 0 ? 'Out of stock' : `${onHand} in stock`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {filteredProducts.length > 50 && (
                        <div className="p-2 text-center text-[11px] text-slate-500 font-medium">
                          Showing top 50 matches. Type to search all {filteredProducts.length} items.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Model Tuning Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end pt-1">
          {/* Model Selector (5 cols) */}
          <div className="lg:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Forecasting Model Algorithm</label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="HOLT_WINTERS">Holt-Winters Additive Seasonality (Best for Grocery)</option>
              <option value="EMA_14">Exponential Smoothing (14-Day EMA)</option>
              <option value="SMA_7">Moving Average (7-Day SMA)</option>
              <option value="SMA_14">Moving Average (14-Day SMA)</option>
              <option value="CROSTON">Croston's Method (Intermittent Demand)</option>
              <option value="NAIVE">Naive Baseline (Lag-1 Demand)</option>
            </select>
          </div>

          {/* Horizon Selector (3 cols) */}
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Forecast Horizon</label>
            <select
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value={7}>7 Days Ahead</option>
              <option value={14}>14 Days Ahead (Standard 2-Week)</option>
              <option value={30}>30 Days Ahead (Monthly)</option>
            </select>
          </div>

          {/* Imputation Checkbox (2 cols) */}
          <div className="lg:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer pb-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={imputeStockouts}
                onChange={(e) => setImputeStockouts(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-800"
              />
              <span className="text-[11px] text-slate-300">Impute Stockouts</span>
            </label>
          </div>

          {/* Fit Button (2 cols) */}
          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={handleGenerateForecast}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 fill-current ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Forecasting...' : 'Fit Model'}
            </button>
          </div>
        </div>

        {/* Accuracy Badges Bar */}
        {hasSufficientHistory && forecastData?.metrics && (
          <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Model Confidence & Error Metrics:</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                WAPE: <strong className="text-indigo-400">{(forecastData.metrics.wape * 100).toFixed(1)}%</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                MAE: <strong className="text-emerald-400">{forecastData.metrics.mae.toFixed(2)} units</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Bias: <strong className="text-cyan-400">{forecastData.metrics.bias > 0 ? `+${forecastData.metrics.bias.toFixed(2)}` : forecastData.metrics.bias.toFixed(2)}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4 Actionable Restock & Run-Out Intelligence Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Current Stock & Runway */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Physical Shelf Stock</span>
            <Package className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{currentStock}</span>
            <span className="text-xs text-slate-400">units on hand</span>
          </div>
          <div className="pt-1 flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-cyan-300 font-medium">
              Runway:{' '}
              <strong>
                {hasSufficientHistory
                  ? stockRunwayDays !== null && stockRunwayDays > 100
                    ? '> 100 days'
                    : `${stockRunwayDays} days`
                  : 'Needs sales data'}
              </strong>
            </span>
          </div>
        </div>

        {/* Card 2: Projected Stockout Run-Out Date */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Projected Run-Out Date</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl font-bold font-mono ${
                !hasSufficientHistory
                  ? 'text-amber-400 text-base'
                  : runOutDate
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {!hasSufficientHistory
                ? 'Insufficient Data'
                : runOutDate
                ? new Date(runOutDate).toLocaleDateString()
                : 'No Stockout Risk'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            {!hasSufficientHistory
              ? 'Need ≥ 14 sales records to predict exhaustion date'
              : runOutDate
              ? 'Units drop to zero based on projected sales velocity'
              : `Current shelf stock covers the full ${horizonDays}-day horizon`}
          </p>
        </div>

        {/* Card 3: Must Reorder Date & Quantity */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Place Reorder Deadline</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold font-mono ${!hasSufficientHistory ? 'text-amber-400 text-base' : 'text-amber-400'}`}>
              {!hasSufficientHistory
                ? 'Insufficient Data'
                : reorderMustDate
                ? new Date(reorderMustDate).toLocaleDateString()
                : 'Today'}
            </span>
          </div>
          <p className="text-[11px] text-amber-300/80">
            {!hasSufficientHistory
              ? 'Cannot estimate demand velocity without sales history'
              : `Reorder ${recommendedOrderQty} units (${leadTimeDays}d lead time) to arrive before run-out`}
          </p>
        </div>

        {/* Card 4: Scheduled Restocks */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Scheduled Inbound Shipments</span>
            <Truck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-blue-400">
              {inboundShipments.reduce((s, it) => s + it.qty, 0)}
            </span>
            <span className="text-xs text-slate-400">units arriving</span>
          </div>
          <p className="text-[11px] text-slate-500">
            {inboundShipments.length > 0
              ? `${inboundShipments.length} PO shipment(s) in transit`
              : 'No purchase order restocks pending'}
          </p>
        </div>
      </div>

      {/* The Visual Stockout Run-Out & Inventory Overlay Graph */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Inventory Depletion Path & Demand Forecast</span>
              <span className="text-xs font-normal text-slate-400">
                ({selectedProduct ? `${selectedProduct.name} · ${selectedProduct.sku}` : ''})
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Timeline: {timelineGranularity === 'days' ? 'Daily Observations' : timelineGranularity === 'month' ? 'Monthly Aggregates' : 'Annual Macro View'} &bull; 95% Confidence Interval
            </p>
          </div>

          {/* Interactive Chart Layer Toggles */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowActuals(!showActuals)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
                showActuals ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-slate-800/40 text-slate-500 border-slate-800 line-through'
              }`}
            >
              <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" /> Past Sales ({demandData.length}d)
            </button>

            {hasSufficientHistory && (
              <>
                <button
                  type="button"
                  onClick={() => setShowForecast(!showForecast)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
                    showForecast ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' : 'bg-slate-800/40 text-slate-500 border-slate-800 line-through'
                  }`}
                >
                  <span className="w-2.5 h-0.5 bg-indigo-500 border-dashed inline-block" /> Forecast Demand
                </button>

                <button
                  type="button"
                  onClick={() => setShowDepletion(!showDepletion)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
                    showDepletion ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800/40 text-slate-500 border-slate-800 line-through'
                  }`}
                >
                  <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> Shelf Stock Depletion
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfidenceBand(!showConfidenceBand)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition ${
                    showConfidenceBand ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' : 'bg-slate-800/40 text-slate-500 border-slate-800 line-through'
                  }`}
                >
                  {showConfidenceBand ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>95% Band</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartPoints} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#161622" />
              <XAxis dataKey="date" stroke="#71717a" tick={{ fontSize: 11 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0a0a0f',
                  borderColor: 'rgba(212, 175, 55, 0.35)',
                  borderRadius: '1rem',
                  fontSize: '12px',
                  boxShadow: '0 20px 30px -5px rgb(0 0 0 / 0.8)'
                }}
                labelStyle={{ color: '#f3d068', fontWeight: 'bold' }}
              />

              {hasSufficientHistory && showConfidenceBand && (
                <>
                  {/* Shaded 95% Confidence Interval Band */}
                  <Area
                    type="monotone"
                    dataKey="upperBound"
                    stroke="transparent"
                    fill="#d4af37"
                    fillOpacity={0.14}
                    name="Upper 95% Bound"
                  />
                  <Area
                    type="monotone"
                    dataKey="lowerBound"
                    stroke="transparent"
                    fill="#070709"
                    fillOpacity={0.92}
                    name="Lower 95% Bound"
                  />
                </>
              )}

              {/* Reference Lines for Current Stock and Reorder Point */}
              <ReferenceLine
                y={currentStock}
                stroke="#f3d068"
                strokeDasharray="4 4"
                label={{
                  value: `Current Stock (${currentStock})`,
                  fill: '#f3d068',
                  fontSize: 10,
                  position: 'top'
                }}
              />
              <ReferenceLine
                y={reorderPoint}
                stroke="#c59728"
                strokeDasharray="3 3"
                label={{
                  value: `Reorder Level (${reorderPoint})`,
                  fill: '#c59728',
                  fontSize: 10,
                  position: 'bottom'
                }}
              />

              {/* Historical Past Sales Line */}
              {showActuals && (
                <Line
                  type="monotone"
                  dataKey="actualSales"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  name="Actual Sales (Past)"
                />
              )}

              {hasSufficientHistory && showForecast && (
                <Line
                  type="monotone"
                  dataKey="forecastDemand"
                  stroke="#d4af37"
                  strokeWidth={2.8}
                  strokeDasharray="5 5"
                  dot={{ r: 3, fill: '#f3d068' }}
                  name="Predicted Demand"
                />
              )}

              {hasSufficientHistory && showDepletion && (
                <Line
                  type="monotone"
                  dataKey="simulatedStock"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  name="Projected Shelf Stock"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Dynamic Contextual Guidance Banner */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              {!hasSufficientHistory ? (
                <>
                  <strong className="text-amber-400">Notice:</strong> There are not enough sales records for this product to forecast future demand or estimate stock-out run-out dates. Add sales transactions to activate predictive trajectories.
                </>
              ) : runOutDate ? (
                <>
                  <strong className="text-rose-400">Critical Restock Alert:</strong> At the current forecasted demand rate of ~
                  {(totalHorizonDemand / horizonDays).toFixed(1)} units/day, stock is projected to run out on{' '}
                  <strong className="text-rose-400">{new Date(runOutDate).toLocaleDateString()}</strong>. Placing an order
                  by <strong className="text-amber-400">{reorderMustDate ? new Date(reorderMustDate).toLocaleDateString() : 'Today'}</strong>{' '}
                  guarantees shipment delivery ({leadTimeDays}-day lead time) before exhaustion.
                </>
              ) : (
                <>
                  <strong className="text-emerald-400">Inventory Health Optimal:</strong> Shelf stock of {currentStock} units is sufficient to cover
                  all {totalHorizonDemand} forecasted units over the next {horizonDays} days without stockout risk.
                </>
              )}
            </span>
          </div>

          {hasSufficientHistory && (
            <a
              href="#manifest-table"
              className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 shrink-0"
            >
              <span>View Day-by-Day Forecast Breakdown</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Day-by-Day Horizon Breakdown Table */}
      <div id="manifest-table" className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Day-by-Day Forecast & Inventory Trajectory ({horizonDays} Days Ahead)
            </h3>
            <p className="text-xs text-slate-400">
              Detailed breakdown of predicted sales, scheduled dock receipts, and simulated ending shelf stock
            </p>
          </div>

          {hasSufficientHistory && futureManifest.length > 0 && (
            <button
              type="button"
              onClick={handleExportForecastCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition self-start sm:self-auto"
              title="Download forecast schedule to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              Export Forecast CSV
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase">
                <th className="pb-3 px-3">Date</th>
                <th className="pb-3 px-3 text-right">Predicted Demand</th>
                <th className="pb-3 px-3 text-right">Inbound PO Receipts</th>
                <th className="pb-3 px-3 text-right">Projected Shelf Stock</th>
                <th className="pb-3 px-3 text-center">Status</th>
                <th className="pb-3 px-3 text-right">Action Needed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {!hasSufficientHistory || futureManifest.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                    <AlertTriangle className="w-7 h-7 text-amber-400 mx-auto mb-1" />
                    <p className="text-sm font-semibold text-slate-300">
                      Not Enough Sales Records Available
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto font-sans">
                      Found {demandData.length} daily demand observations for this product (minimum 14 required). Demand forecasting and stock-out run-out dates will appear once sufficient sales history is accumulated.
                    </p>
                  </td>
                </tr>
              ) : (
                futureManifest.map((row) => (
                  <tr
                    key={row.date}
                    className={`hover:bg-slate-800/40 transition ${
                      row.status === 'STOCKOUT'
                        ? 'bg-rose-950/20 text-rose-300'
                        : row.status === 'WARNING'
                        ? 'bg-amber-950/20 text-amber-300'
                        : 'text-slate-300'
                    }`}
                  >
                    <td className="py-3 px-3 font-sans font-medium text-white flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {new Date(row.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-indigo-400">
                      {row.demand} units
                    </td>
                    <td className="py-3 px-3 text-right text-blue-400 font-semibold">
                      {row.inbound > 0 ? `+${row.inbound} units` : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-400">
                      {row.endingStock} units
                    </td>
                    <td className="py-3 px-3 text-center font-sans">
                      {row.status === 'STOCKOUT' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Stockout
                        </span>
                      ) : row.status === 'WARNING' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Below Reorder
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Safe
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-sans">
                      {row.status === 'STOCKOUT' ? (
                        <span className="text-rose-400 font-semibold">Immediate Restock Required</span>
                      ) : row.status === 'WARNING' ? (
                        <span className="text-amber-400 font-semibold">Reorder Window Active</span>
                      ) : (
                        <span className="text-slate-500">Normal Stock</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};