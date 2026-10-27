import React, { useEffect, useState, useMemo } from 'react';
import { 
  Package, AlertTriangle, TrendingUp, DollarSign, Truck, 
  ShoppingCart, RefreshCw, ArrowUpRight, CheckCircle2, 
  ShieldCheck, Clock, ArrowRight, Layers, Check
} from 'lucide-react';
import { api } from '../services/api';
import { 
  Product, ReplenishmentRecommendation, SaleOrder, 
  PurchaseOrder, DataQualityIssue 
} from '../types';

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [recommendations, setRecommendations] = useState<ReplenishmentRecommendation[]>([]);
  const [salesOrders, setSalesOrders] = useState<SaleOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activityTab, setActivityTab] = useState<'sales' | 'deliveries'>('sales');

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [prodRes, recRes, salesRes, poRes, issueRes] = await Promise.all([
        api.getProducts(),
        api.getRecommendations(),
        api.getSalesOrders(10),
        api.getPurchaseOrders(),
        api.getIssues('FLAGGED')
      ]);
      setProducts(prodRes.data || []);
      setRecommendations(recRes.data || []);
      setSalesOrders(salesRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setIssues(issueRes.data || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalValuation = products.reduce((acc, p) => {
      const qty = Number(p.on_hand_qty) || 0;
      const cost = Number(p.cost_price) || 0;
      return acc + (qty * cost);
    }, 0);

    const totalUnits = products.reduce((acc, p) => acc + (Number(p.on_hand_qty) || 0), 0);
    const outOfStockCount = products.filter(p => Number(p.on_hand_qty) <= 0).length;
    const lowStockCount = products.filter(p => Number(p.on_hand_qty) > 0 && Number(p.on_hand_qty) <= Number(p.reorder_threshold)).length;
    const healthyStockCount = products.filter(p => Number(p.on_hand_qty) > Number(p.reorder_threshold)).length;
    
    // Urgent replenishment recommendations
    const urgentRecs = [...recommendations]
      .filter(r => r.stockout_risk_score >= 50 || r.status === 'PENDING')
      .sort((a, b) => b.stockout_risk_score - a.stockout_risk_score);

    // Pending incoming PO shipments
    const pendingPOs = purchaseOrders.filter(po => po.status === 'ORDERED' || po.status === 'PARTIAL');
    const sortedPendingPOs = [...pendingPOs].sort((a, b) => new Date(a.expected_at).getTime() - new Date(b.expected_at).getTime());
    const nextDelivery = sortedPendingPOs.length > 0 ? sortedPendingPOs[0] : null;

    return {
      totalValuation,
      totalUnits,
      outOfStockCount,
      lowStockCount,
      healthyStockCount,
      totalProducts: products.length,
      urgentRecs,
      pendingPOCount: pendingPOs.length,
      nextDelivery
    };
  }, [products, recommendations, purchaseOrders]);

  const healthyPercent = metrics.totalProducts > 0 
    ? Math.round((metrics.healthyStockCount / metrics.totalProducts) * 100) 
    : 0;
  const lowPercent = metrics.totalProducts > 0 
    ? Math.round((metrics.lowStockCount / metrics.totalProducts) * 100) 
    : 0;
  const outPercent = metrics.totalProducts > 0 
    ? Math.round((metrics.outOfStockCount / metrics.totalProducts) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Navigation Shortcuts */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="text-2xl font-bold text-white tracking-tight">Operations Dashboard</h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Real-time inventory valuation, stockout prevention, and order fulfillment status.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono hidden sm:inline-block">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={loadDashboardData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-2 text-xs font-semibold disabled:opacity-50"
              title="Refresh live data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <button
            onClick={() => onNavigate('pos')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-semibold transition group shadow-sm hover:border-amber-400"
          >
            <ShoppingCart className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Point of Sale</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-amber-400/60 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => onNavigate('products')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-semibold transition group shadow-sm hover:border-amber-400"
          >
            <Package className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Live Stock Tracker</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-amber-400/60 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => onNavigate('forecasting')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-semibold transition group shadow-sm hover:border-amber-400"
          >
            <TrendingUp className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Demand Forecast</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-amber-400/60 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => onNavigate('purchase-orders')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs font-semibold transition group shadow-sm hover:border-amber-400"
          >
            <Truck className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Inbound Restocks</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-amber-400/60 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* 4 Core Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Inventory Valuation */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-amber-500/40 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inventory Value</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-amber-300">
              ${metrics.totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {metrics.totalUnits.toLocaleString()} units on hand
            </p>
          </div>
        </div>

        {/* Catalog Health */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-amber-500/40 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Catalog Items</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              {metrics.totalProducts} <span className="text-sm font-normal text-slate-400">SKUs</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="text-emerald-400 font-semibold">{metrics.healthyStockCount} healthy</span>
              <span>•</span>
              <span className="text-amber-400 font-semibold">{metrics.lowStockCount} low</span>
            </p>
          </div>
        </div>

        {/* Stockout Urgency */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stockout Urgency</span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              metrics.outOfStockCount > 0
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-2">
              <span className={metrics.outOfStockCount > 0 ? 'text-rose-400' : 'text-slate-200'}>
                {metrics.outOfStockCount}
              </span>
              <span className="text-xs text-slate-400">out of stock</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {metrics.urgentRecs.length} replenishment reorders queued
            </p>
          </div>
        </div>

        {/* Inbound Restocks */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inbound Shipments</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-white">
              {metrics.pendingPOCount} <span className="text-sm font-normal text-slate-400">POs active</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">
              {metrics.nextDelivery 
                ? `Next ETA: ${new Date(metrics.nextDelivery.expected_at).toLocaleDateString()}` 
                : 'No pending dock deliveries'}
            </p>
          </div>
        </div>
      </div>

      {/* Stock Health Distribution Meter */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Warehouse Inventory Balance Health
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-300 font-medium">Healthy ({metrics.healthyStockCount} · {healthyPercent}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-slate-300 font-medium">Running Low ({metrics.lowStockCount} · {lowPercent}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-300 font-medium">Out of Stock ({metrics.outOfStockCount} · {outPercent}%)</span>
            </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden flex">
          {healthyPercent > 0 && (
            <div 
              style={{ width: `${healthyPercent}%` }} 
              className="bg-emerald-500 transition-all duration-500" 
              title={`Healthy: ${healthyPercent}%`}
            />
          )}
          {lowPercent > 0 && (
            <div 
              style={{ width: `${lowPercent}%` }} 
              className="bg-amber-500 transition-all duration-500" 
              title={`Low Stock: ${lowPercent}%`}
            />
          )}
          {outPercent > 0 && (
            <div 
              style={{ width: `${outPercent}%` }} 
              className="bg-rose-500 transition-all duration-500" 
              title={`Out of Stock: ${outPercent}%`}
            />
          )}
        </div>
      </div>

      {/* Main Operational Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Urgent Replenishment Queue */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Urgent Restock Action Queue
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Items nearest stockout risk based on current sales pace and supplier lead times
                </p>
              </div>
              <button
                onClick={() => onNavigate('replenishment')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                All Policies <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List */}
            <div className="mt-4 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {metrics.urgentRecs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-300">All inventory stock levels healthy</p>
                  <p className="text-[11px] text-slate-500">No urgent replenishment orders required</p>
                </div>
              ) : (
                metrics.urgentRecs.slice(0, 5).map((rec) => (
                  <div 
                    key={rec.recommendation_id}
                    className="p-3.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-300 px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/60">
                          {rec.sku}
                        </span>
                        <span className="text-xs font-medium text-white truncate">
                          {rec.product_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-mono">
                        <span>On Hand: <strong className={Number(rec.current_on_hand) <= 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}>{Number(rec.current_on_hand).toFixed(0)}</strong></span>
                        <span>•</span>
                        <span>Reorder Pt: <strong className="text-slate-300">{Number(rec.reorder_point).toFixed(0)}</strong></span>
                        <span>•</span>
                        <span>Lead: <strong className="text-slate-300">{rec.lead_time_days}d</strong></span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-amber-400 font-mono">
                        +{Number(rec.recommended_qty).toFixed(0)} units
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Due: {rec.reorder_deadline}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Showing top {Math.min(5, metrics.urgentRecs.length)} of {metrics.urgentRecs.length} urgent recommendations
            </span>
            <button
              onClick={() => onNavigate('replenishment')}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5"
            >
              <span>Manage Replenishment</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Live Activity Stream (Recent Sales & Inbound Deliveries) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
                <button
                  onClick={() => setActivityTab('sales')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activityTab === 'sales'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Recent Sales ({salesOrders.length})
                </button>
                <button
                  onClick={() => setActivityTab('deliveries')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activityTab === 'deliveries'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Inbound Restocks ({purchaseOrders.length})
                </button>
              </div>

              {activityTab === 'sales' ? (
                <button
                  onClick={() => onNavigate('orders')}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  View All Sales <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => onNavigate('purchase-orders')}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  View All Orders <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Content for Tabs */}
            <div className="mt-4 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {activityTab === 'sales' ? (
                salesOrders.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-300">No sales transactions logged yet</p>
                    <p className="text-[11px] text-slate-500">Sales orders recorded at POS will appear here live</p>
                  </div>
                ) : (
                  salesOrders.slice(0, 5).map((so) => (
                    <div 
                      key={so.sales_order_id}
                      className="p-3.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 transition flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-emerald-400">
                            {so.order_number}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                            COMPLETED
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400 flex items-center gap-2">
                          <span>{so.items?.length || 0} line items</span>
                          <span>•</span>
                          <span>{new Date(so.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold font-mono text-white">
                          ${Number(so.total_amount).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(so.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : (
                purchaseOrders.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <Truck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-300">No purchase orders scheduled</p>
                  </div>
                ) : (
                  purchaseOrders.slice(0, 5).map((po) => (
                    <div 
                      key={po.purchase_order_id}
                      className="p-3.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 transition flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-purple-300">
                            {po.po_number}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            po.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {po.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400 flex items-center gap-2">
                          <span>{po.supplier_name || `Supplier #${po.supplier_id}`}</span>
                          <span>•</span>
                          <span>{po.items?.length || 0} SKUs</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold font-mono text-slate-200">
                          ETA: {new Date(po.expected_at).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Ordered: {new Date(po.ordered_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>

          {/* Bottom Card Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {activityTab === 'sales'
                ? `Showing latest ${Math.min(5, salesOrders.length)} sales records`
                : `Showing latest ${Math.min(5, purchaseOrders.length)} inbound restock orders`}
            </span>
            <button
              onClick={() => onNavigate(activityTab === 'sales' ? 'orders' : 'purchase-orders')}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Open Full Ledger <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Data Reliability & Verification Notice */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              Data Quality Audit Engine
              {issues.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                  {issues.length} flagged anomalies
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono flex items-center gap-1">
                  <Check className="w-3 h-3" /> 100% clean
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Continuous monitoring for zero-stockout censoring and demand spikes to guarantee forecast model fidelity.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('data-quality')}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition shrink-0"
        >
          Review Data Quality
        </button>
      </div>
    </div>
  );
};
