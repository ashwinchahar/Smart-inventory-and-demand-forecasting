import React, { useEffect, useState, useMemo } from 'react';
import { 
  Search, Plus, AlertCircle, AlertTriangle, CheckCircle, 
  Package, Truck, Clock, RefreshCw, ShoppingCart, 
  CheckCircle2, X, ShieldAlert, DollarSign, Filter,
  ArrowRight, ChevronDown, Sparkles, FileSpreadsheet,
  UploadCloud, Download
} from 'lucide-react';
import { api } from '../services/api';
import { Product, Category, Supplier, PurchaseOrder, ReplenishmentRecommendation } from '../types';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [recommendations, setRecommendations] = useState<ReplenishmentRecommendation[]>([]);
  
  const [selectedCat, setSelectedCat] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OUT_OF_STOCK' | 'LOW' | 'INBOUND' | 'HEALTHY'>('ALL');
  const [loading, setLoading] = useState<boolean>(true);

  // New product modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCatId, setNewCatId] = useState<number>(1);
  const [newUnit, setNewUnit] = useState('unit');
  const [newCost, setNewCost] = useState('2.50');
  const [newPrice, setNewPrice] = useState('5.99');
  const [newThreshold, setNewThreshold] = useState('25');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittingProduct, setSubmittingProduct] = useState<boolean>(false);

  // Bulk Stock CSV upload state
  const [showStockCsvModal, setShowStockCsvModal] = useState<boolean>(false);
  const [stockUploadFile, setStockUploadFile] = useState<File | null>(null);
  const [stockUploadMode, setStockUploadMode] = useState<'replace' | 'adjust'>('replace');
  const [stockUploading, setStockUploading] = useState<boolean>(false);
  const [stockUploadError, setStockUploadError] = useState<string | null>(null);

  // Quick Restock Modal State
  const [quickRestockProduct, setQuickRestockProduct] = useState<any | null>(null);
  const [quickRestockQty, setQuickRestockQty] = useState<number>(50);
  const [quickRestockSupplierId, setQuickRestockSupplierId] = useState<number>(1);
  const [quickRestockDate, setQuickRestockDate] = useState<string>(
    new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
  );
  const [submittingRestock, setSubmittingRestock] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, supRes, poRes, recRes] = await Promise.all([
        api.getProducts(),
        api.getCategories(),
        api.getSuppliers(),
        api.getPurchaseOrders(),
        api.getRecommendations()
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setSuppliers(supRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setRecommendations(recRes.data || []);
    } catch (err) {
      console.error('Failed to load stock tracker data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Map active inbound Purchase Orders by product_id
  const inboundMap = useMemo(() => {
    const map: Record<number, Array<{ po_number: string; expected_at: string; qty: number }>> = {};
    purchaseOrders
      .filter((po) => po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED')
      .forEach((po) => {
        po.items.forEach((it) => {
          const rem = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
          if (rem > 0) {
            if (!map[it.product_id]) {
              map[it.product_id] = [];
            }
            map[it.product_id].push({
              po_number: po.po_number,
              expected_at: po.expected_at ? po.expected_at.split('T')[0] : '',
              qty: rem
            });
          }
        });
      });
    return map;
  }, [purchaseOrders]);

  // Map recommendations by product_id
  const recMap = useMemo(() => {
    const map: Record<number, ReplenishmentRecommendation> = {};
    recommendations.forEach((r) => {
      map[r.product_id] = r;
    });
    return map;
  }, [recommendations]);

  // Enrich products with Health Status, Inbound POs, and Weekly Restock Suggestions
  const enrichedProducts = useMemo(() => {
    return products.map((p) => {
      const onHand = Number(p.on_hand_qty) || 0;
      const threshold = Number(p.reorder_threshold) || 20;
      const inbounds = inboundMap[p.product_id] || [];
      const totalInbound = inbounds.reduce((sum, item) => sum + item.qty, 0);
      const rec = recMap[p.product_id];

      // Weekly Restock Calculation: covers projected demand buffer minus existing stock and inbound
      let suggestedWeeklyQty = 0;
      if (rec && Number(rec.recommended_qty) > 0) {
        suggestedWeeklyQty = Math.max(0, Number(rec.recommended_qty) - totalInbound);
      } else {
        const weeklyTarget = threshold * 2;
        suggestedWeeklyQty = Math.max(0, weeklyTarget - (onHand + totalInbound));
      }

      // Urgency Ranking (1: Out of Stock -> 5: Healthy)
      let rank = 5;
      let status: 'OUT_OF_STOCK' | 'CRITICAL' | 'LOW' | 'INBOUND' | 'HEALTHY' = 'HEALTHY';

      if (onHand <= 0) {
        rank = 1;
        status = 'OUT_OF_STOCK';
      } else if (onHand <= threshold * 0.5) {
        rank = 2;
        status = 'CRITICAL';
      } else if (onHand <= threshold) {
        rank = 3;
        status = 'LOW';
      } else if (totalInbound > 0) {
        rank = 4;
        status = 'INBOUND';
      } else {
        rank = 5;
        status = 'HEALTHY';
      }

      // Coverage ratio relative to threshold
      const coveragePercent = Math.min(100, Math.round((onHand / Math.max(1, threshold)) * 100));

      return {
        ...p,
        onHand,
        threshold,
        inbounds,
        totalInbound,
        suggestedWeeklyQty: Math.round(suggestedWeeklyQty),
        rank,
        status,
        coveragePercent,
        leadTimeDays: rec ? rec.lead_time_days : 3
      };
    });
  }, [products, inboundMap, recMap]);

  // Filter and Sort: Strictly Running Low to Healthy from top to bottom
  const displayedProducts = useMemo(() => {
    return enrichedProducts
      .filter((p) => {
        // Search filter
        const term = search.toLowerCase();
        const matchesSearch =
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.category_name && p.category_name.toLowerCase().includes(term));

        if (!matchesSearch) return false;

        // Category filter
        if (selectedCat && p.category_id !== selectedCat) return false;

        // Status filter
        if (statusFilter === 'OUT_OF_STOCK') return p.status === 'OUT_OF_STOCK';
        if (statusFilter === 'LOW') return p.status === 'CRITICAL' || p.status === 'LOW';
        if (statusFilter === 'INBOUND') return p.totalInbound > 0;
        if (statusFilter === 'HEALTHY') return p.status === 'HEALTHY';
        return true;
      })
      .sort((a, b) => {
        // 1. Top priority: Out of Stock -> Critical -> Low -> Inbound -> Healthy
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        // 2. Secondary sort: lowest coverage ratio first
        const ratioA = a.onHand / Math.max(1, a.threshold);
        const ratioB = b.onHand / Math.max(1, b.threshold);
        return ratioA - ratioB;
      });
  }, [enrichedProducts, search, selectedCat, statusFilter]);

  // High-level KPIs
  const outOfStockCount = enrichedProducts.filter((p) => p.status === 'OUT_OF_STOCK').length;
  const runningLowCount = enrichedProducts.filter((p) => p.status === 'CRITICAL' || p.status === 'LOW').length;
  const healthyCount = enrichedProducts.filter((p) => p.status === 'HEALTHY').length;
  const totalInboundUnits = enrichedProducts.reduce((sum, p) => sum + p.totalInbound, 0);
  const totalValuation = enrichedProducts.reduce((sum, p) => sum + (p.onHand * Number(p.cost_price || 0)), 0);

  // Open Quick Restock Modal
  const openQuickRestock = (p: typeof enrichedProducts[0]) => {
    setQuickRestockProduct(p);
    const suggested = p.suggestedWeeklyQty > 0 ? p.suggestedWeeklyQty : Math.round(p.threshold * 1.5);
    setQuickRestockQty(suggested);
    setQuickRestockSupplierId(suppliers[0]?.supplier_id || 1);
    const arrivalDate = new Date(Date.now() + p.leadTimeDays * 86400000).toISOString().split('T')[0];
    setQuickRestockDate(arrivalDate);
    setActionErrorMsg(null);
  };

  const handleQuickRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRestockProduct) return;
    setSubmittingRestock(true);
    setActionErrorMsg(null);

    try {
      await api.createPurchaseOrder({
        supplier_id: Number(quickRestockSupplierId),
        expected_at: new Date(quickRestockDate).toISOString(),
        items: [
          {
            product_id: quickRestockProduct.product_id,
            quantity_ordered: Number(quickRestockQty),
            unit_cost: Number(quickRestockProduct.cost_price)
          }
        ]
      });

      setActionSuccessMsg(
        `Scheduled restock of ${quickRestockQty} ${quickRestockProduct.unit}s for ${quickRestockProduct.name}. Expected ETA: ${quickRestockDate}`
      );
      setQuickRestockProduct(null);
      await loadAllData();
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      setActionErrorMsg(err.response?.data?.detail || 'Failed to schedule restock purchase order.');
    } finally {
      setSubmittingRestock(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmittingProduct(true);
    try {
      await api.createProduct({
        sku: newSku.trim().toUpperCase(),
        name: newName.trim(),
        category_id: newCatId,
        unit: newUnit.trim().toLowerCase(),
        cost_price: Number(newCost),
        selling_price: Number(newPrice),
        reorder_threshold: Number(newThreshold)
      });
      setShowAddModal(false);
      setNewSku('');
      setNewName('');
      setActionSuccessMsg(`Product "${newName.trim()}" added to catalog.`);
      await loadAllData();
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Failed to create product.');
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleStockCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockUploadFile) {
      setStockUploadError('Please select a CSV or Excel file.');
      return;
    }
    setStockUploading(true);
    setStockUploadError(null);
    try {
      const res = await api.uploadStockCsv(stockUploadFile, stockUploadMode);
      setActionSuccessMsg(res.data.message);
      setShowStockCsvModal(false);
      setStockUploadFile(null);
      await loadAllData();
      setTimeout(() => setActionSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error('Failed to upload stock CSV:', err);
      setStockUploadError(err.response?.data?.detail || 'Failed to update physical stock counts from file.');
    } finally {
      setStockUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {actionSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-700/50 text-emerald-300 text-xs sm:text-sm flex items-center justify-between shadow-xl animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-6 h-6 text-indigo-400" />
              <h1 className="text-2xl font-bold text-white tracking-tight">Products & Stock Tracker</h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Live shelf inventory ranked by stockout urgency (running low to healthy) with automated replenishment advice
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setShowStockCsvModal(true);
                setStockUploadError(null);
                setStockUploadFile(null);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Update Stock (CSV)
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition"
            >
              <Plus className="w-4 h-4 text-indigo-400" />
              New Product
            </button>
            <button
              onClick={loadAllData}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* 4 Metric Highlights */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Catalog SKUs</span>
              <span className="text-xl font-bold text-white font-mono">{products.length}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Active items</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Package className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Out of Stock</span>
              <span className={`text-xl font-bold font-mono ${outOfStockCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                {outOfStockCount}
              </span>
              <span className="text-[10px] text-rose-400/80 block mt-0.5">Zero shelf inventory</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Running Low</span>
              <span className={`text-xl font-bold font-mono ${runningLowCount > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                {runningLowCount}
              </span>
              <span className="text-[10px] text-amber-400/80 block mt-0.5">Below reorder point</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">In Transit Restocks</span>
              <span className="text-xl font-bold text-blue-400 font-mono">+{totalInboundUnits}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Units en route</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Stock ({products.length})
          </button>
          <button
            onClick={() => setStatusFilter('OUT_OF_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'OUT_OF_STOCK'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-rose-400'
            }`}
          >
            Out of Stock ({outOfStockCount})
          </button>
          <button
            onClick={() => setStatusFilter('LOW')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'LOW'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-amber-400'
            }`}
          >
            Running Low ({runningLowCount})
          </button>
          <button
            onClick={() => setStatusFilter('INBOUND')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'INBOUND'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-blue-400'
            }`}
          >
            Inbound Orders ({enrichedProducts.filter((p) => p.totalInbound > 0).length})
          </button>
          <button
            onClick={() => setStatusFilter('HEALTHY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'HEALTHY'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-400 hover:text-emerald-400'
            }`}
          >
            Healthy ({healthyCount})
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2.5">
          <select
            value={selectedCat || ''}
            onChange={(e) => setSelectedCat(e.target.value ? Number(e.target.value) : undefined)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or name..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">SKU / Commercial Name</th>
                <th className="py-3 px-4 text-right">Physical On Hand</th>
                <th className="py-3 px-4 text-center">Stock Urgency</th>
                <th className="py-3 px-4 text-right">Reorder Threshold</th>
                <th className="py-3 px-4 text-right">Weekly Restock Suggestion</th>
                <th className="py-3 px-4">Scheduled Inbound Restocks</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                    Updating real-time inventory balances...
                  </td>
                </tr>
              ) : displayedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-500">
                    No products matched your search or status filter.
                  </td>
                </tr>
              ) : (
                displayedProducts.map((p) => {
                  const isZero = p.onHand <= 0;
                  const isCrit = p.status === 'CRITICAL';
                  const isLow = p.status === 'LOW';

                  return (
                    <tr
                      key={p.product_id}
                      className={`hover:bg-slate-800/40 transition ${
                        isZero
                          ? 'bg-rose-950/15'
                          : isCrit
                          ? 'bg-amber-950/15'
                          : isLow
                          ? 'bg-amber-950/10'
                          : ''
                      }`}
                    >
                      {/* Product Name & SKU */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-300 px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/60">
                            {p.sku}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700/60">
                            {p.category_name || 'General'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-white mt-1 truncate max-w-xs">{p.name}</p>
                      </td>

                      {/* On Hand Stock with visual mini progress */}
                      <td className="py-3.5 px-4 text-right font-mono">
                        <span
                          className={`text-sm font-bold ${
                            isZero
                              ? 'text-rose-400'
                              : isCrit || isLow
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {p.onHand.toFixed(1)}
                        </span>
                        <span className="text-[11px] text-slate-500 ml-1 font-sans">{p.unit}s</span>

                        {/* Visual mini-bar */}
                        <div className="w-20 ml-auto h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
                          <div 
                            style={{ width: `${p.coveragePercent}%` }}
                            className={`h-full ${
                              isZero 
                                ? 'bg-rose-500' 
                                : isCrit || isLow 
                                ? 'bg-amber-500' 
                                : 'bg-emerald-500'
                            }`}
                          />
                        </div>
                      </td>

                      {/* Urgency Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {isZero ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <ShieldAlert className="w-3 h-3" /> Out of Stock
                          </span>
                        ) : isCrit ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            <AlertCircle className="w-3 h-3" /> Critical Low
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-3 h-3" /> Running Low
                          </span>
                        ) : p.totalInbound > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Truck className="w-3 h-3" /> In Transit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" /> Healthy
                          </span>
                        )}
                      </td>

                      {/* Reorder Threshold */}
                      <td className="py-3.5 px-4 text-right text-slate-300 font-mono">
                        {p.threshold.toFixed(1)} {p.unit}s
                      </td>

                      {/* Weekly Restock Suggestion */}
                      <td className="py-3.5 px-4 text-right font-mono">
                        {p.suggestedWeeklyQty > 0 ? (
                          <div>
                            <span className="text-xs font-bold text-amber-400">
                              +{p.suggestedWeeklyQty} {p.unit}s
                            </span>
                            <span className="text-[10px] text-slate-500 block font-sans">
                              Buffer for 7 days
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 font-sans">
                            0 units <span className="text-[10px]">(Sufficient)</span>
                          </span>
                        )}
                      </td>

                      {/* Scheduled Inbound Restocks Line */}
                      <td className="py-3.5 px-4">
                        {p.inbounds.length > 0 ? (
                          <div className="space-y-1">
                            {p.inbounds.map((inb: any, idx: number) => (
                              <div
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[11px]"
                              >
                                <Truck className="w-3 h-3 text-blue-400 shrink-0" />
                                <span>
                                  <strong>+{inb.qty}</strong> units &bull; ETA:{' '}
                                  <strong>{new Date(inb.expected_at).toLocaleDateString()}</strong> ({inb.po_number})
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : isZero || isCrit || isLow ? (
                          <span className="text-[11px] text-amber-400/90 flex items-center gap-1 font-medium">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            Needs Restock PO
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">&mdash; Stock Adequate</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => openQuickRestock(p)}
                          className={`flex items-center gap-1 mx-auto px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                            isZero || isCrit || isLow
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          <ShoppingCart className="w-3 h-3" />
                          Restock
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Restock Modal */}
      {quickRestockProduct && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-indigo-400" />
                  Order Restock: {quickRestockProduct.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pre-filled with recommended weekly quantity and supplier lead-time ETA
                </p>
              </div>
              <button
                onClick={() => setQuickRestockProduct(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickRestockSubmit} className="p-5 space-y-4">
              {actionErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionErrorMsg}</span>
                </div>
              )}

              {/* Status Context Card */}
              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-slate-400 text-[11px] block">Current On Hand</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {quickRestockProduct.onHand} {quickRestockProduct.unit}s
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Reorder Point</span>
                  <span className="text-sm font-bold text-amber-400 font-mono">
                    {quickRestockProduct.threshold}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Weekly Suggested</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">
                    +{quickRestockProduct.suggestedWeeklyQty}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Supplier</label>
                  <select
                    value={quickRestockSupplierId}
                    onChange={(e) => setQuickRestockSupplierId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {suppliers.map((s) => (
                      <option key={s.supplier_id} value={s.supplier_id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Expected Arrival ETA
                  </label>
                  <input
                    type="date"
                    required
                    value={quickRestockDate}
                    onChange={(e) => setQuickRestockDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Restock Order Quantity ({quickRestockProduct.unit}s)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quickRestockQty}
                  onChange={(e) => setQuickRestockQty(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Estimated PO Cost: $
                  {(Number(quickRestockQty) * Number(quickRestockProduct.cost_price)).toFixed(2)}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setQuickRestockProduct(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRestock}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                >
                  {submittingRestock ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Scheduling PO...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-3.5 h-3.5" />
                      Confirm Restock Order
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Master Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Add New Master Product
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SKU Code</label>
                  <input
                    type="text"
                    required
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="e.g. SKU-BEV-001"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Measurement Unit</label>
                  <input
                    type="text"
                    required
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="unit / kg / pack"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Commercial Product Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Premium Cold Brew Coffee 330ml"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Product Category</label>
                <select
                  value={newCatId}
                  onChange={(e) => setNewCatId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Selling Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Reorder Level</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProduct}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {submittingProduct ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Stock CSV Upload Modal */}
      {showStockCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  Bulk Physical Stock Count Update
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Import counted shelf stock from CSV or Excel to update warehouse balances
                </p>
              </div>
              <button 
                onClick={() => setShowStockCsvModal(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {stockUploadError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{stockUploadError}</span>
              </div>
            )}

            <form onSubmit={handleStockCsvSubmit} className="space-y-4">
              {/* Sample Template Download */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">Need a spreadsheet template?</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Pre-populated with active SKUs & names</span>
                </div>
                <a
                  href={api.getSampleStockCsvUrl()}
                  download="physical_stock_count_template.csv"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-indigo-300 border border-slate-600 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Sample CSV
                </a>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Count Update Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStockUploadMode('replace')}
                    className={`p-3 text-left rounded-xl border text-xs transition ${
                      stockUploadMode === 'replace'
                        ? 'bg-indigo-950/60 border-indigo-600 text-white shadow'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-bold block">Set Exact Count</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Physical stocktake replace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockUploadMode('adjust')}
                    className={`p-3 text-left rounded-xl border text-xs transition ${
                      stockUploadMode === 'adjust'
                        ? 'bg-indigo-950/60 border-indigo-600 text-white shadow'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-bold block">Adjust (+/- Delta)</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Add or remove units</span>
                  </button>
                </div>
              </div>

              {/* File Upload Drop Area */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Upload Spreadsheet (.csv, .xlsx, .xls)</label>
                <div className="relative border-2 border-dashed border-slate-700 hover:border-indigo-500/70 rounded-xl p-5 text-center transition bg-slate-800/30">
                  <input
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setStockUploadFile(e.target.files[0]);
                        setStockUploadError(null);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <UploadCloud className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                  {stockUploadFile ? (
                    <div>
                      <span className="text-xs font-semibold text-emerald-400 block">{stockUploadFile.name}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {(stockUploadFile.size / 1024).toFixed(1)} KB &bull; Click to change
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-medium text-slate-300 block">
                        Drop your file here or click to browse
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Supported headers: <code className="text-slate-400">sku</code>, <code className="text-slate-400">on_hand_qty</code> (or <code className="text-slate-400">stock</code>)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStockCsvModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={stockUploading || !stockUploadFile}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {stockUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Updating Balances...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Apply Stock Update
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
