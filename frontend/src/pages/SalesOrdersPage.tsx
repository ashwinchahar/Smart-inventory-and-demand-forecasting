import React, { useEffect, useState, useMemo } from 'react';
import { 
  Receipt, Search, Calendar, ChevronDown, ChevronUp, ShoppingBag, 
  DollarSign, Clock, RefreshCw, Upload, Download, FileSpreadsheet, 
  CheckCircle2, AlertCircle, X, FileText, ArrowUpDown, Filter, Eye,
  Sparkles, Check, Layers
} from 'lucide-react';
import { api } from '../services/api';
import { SaleOrder } from '../types';

export const SalesOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Mutually Exclusive Filter Modes:
  // 1. 'TIME': All orders within a time frame (zero order count limit)
  // 2. 'COUNT': Latest N orders regardless of date
  const [filterMode, setFilterMode] = useState<'TIME' | 'COUNT'>('TIME');
  const [timePreset, setTimePreset] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [orderCount, setOrderCount] = useState<number>(50);

  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // CSV Ingestion State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<string>('demand_only');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<{
    total_rows_parsed: number;
    records_ingested: number;
    products_affected: number;
    new_products_created: number;
    date_min?: string;
    date_max?: string;
    message: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      let params: { limit?: number; start_date?: string } = {};

      if (filterMode === 'TIME') {
        const now = new Date();
        if (timePreset === 'TODAY') {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          params.start_date = start.toISOString();
        } else if (timePreset === 'WEEK') {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0);
          params.start_date = start.toISOString();
        } else if (timePreset === 'MONTH') {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0);
          params.start_date = start.toISOString();
        }
        // In TIME mode, limit is intentionally undefined so 100% of orders in the timeframe are returned!
      } else {
        // In COUNT mode, orderCount is applied without any date restriction
        params.limit = orderCount;
      }

      const res = await api.getSalesOrders(params);
      setOrders(res.data || []);
    } catch (err) {
      console.error('Failed to load sales orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [filterMode, timePreset, orderCount]);

  // Search Filtering
  const filteredOrders = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return orders;

    return orders.filter((o) => {
      const matchesOrderNo = o.order_number.toLowerCase().includes(term);
      const matchesItem = o.items.some(
        (it) =>
          (it.product_name && it.product_name.toLowerCase().includes(term)) ||
          (it.sku && it.sku.toLowerCase().includes(term))
      );
      return matchesOrderNo || matchesItem;
    });
  }, [orders, search]);

  // Summary Metrics
  const totalRevenue = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + Number(o.total_amount), 0),
    [filteredOrders]
  );
  const totalUnitsSold = useMemo(
    () => filteredOrders.reduce((sum, o) => sum + o.items.reduce((iSum, it) => iSum + Number(it.quantity), 0), 0),
    [filteredOrders]
  );
  const avgOrderValue = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;

  // Toggle order expansion
  const toggleExpand = (id: number) => {
    setExpandedOrderId(expandedOrderId === id ? null : id);
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = [
      'Order Number',
      'Date',
      'Time',
      'Item Count',
      'Total Units',
      'Total Amount ($)',
      'Status',
      'Item Breakdown'
    ];

    const rows = filteredOrders.map((o) => {
      const d = new Date(o.created_at);
      const dateStr = d.toLocaleDateString();
      const timeStr = d.toLocaleTimeString();
      const totalUnits = o.items.reduce((s, it) => s + Number(it.quantity), 0);
      const breakdown = o.items
        .map((it) => `${it.product_name || it.sku || 'Item'} (${it.quantity}x @ $${Number(it.unit_price).toFixed(2)})`)
        .join('; ');

      return [
        `"${o.order_number}"`,
        `"${dateStr}"`,
        `"${timeStr}"`,
        o.items.length,
        totalUnits,
        Number(o.total_amount).toFixed(2),
        `"${o.status}"`,
        `"${breakdown.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filterDesc = filterMode === 'TIME' ? `time_${timePreset.toLowerCase()}` : `latest_${orderCount}`;
    link.setAttribute('download', `sales_orders_${filterDesc}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Ingestion Handler
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await api.uploadSalesCsv(selectedFile, uploadMode);
      setUploadResult(res.data);
      setSelectedFile(null);
      await loadOrders();
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to parse and ingest sales records.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Notification */}
      {uploadResult && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-700/50 text-emerald-300 text-xs sm:text-sm flex items-start justify-between shadow-xl animate-in fade-in">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">{uploadResult.message}</p>
              <p className="text-xs text-emerald-400/80">
                Parsed {uploadResult.total_rows_parsed.toLocaleString()} rows &bull; Updated {uploadResult.products_affected} products &bull; {uploadResult.new_products_created} new SKUs auto-registered for AI forecasting
                {uploadResult.date_min && uploadResult.date_max && ` (${uploadResult.date_min} to ${uploadResult.date_max})`}
              </p>
            </div>
          </div>
          <button onClick={() => setUploadResult(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-indigo-400" />
            Sales History & Orders
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Review customer checkout receipts, export transaction logs, and import historical POS records for AI demand forecasting
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredOrders.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition disabled:opacity-40"
            title="Export currently filtered orders to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            Export CSV ({filteredOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Sales Records
          </button>

          <button
            type="button"
            onClick={loadOrders}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Summary Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Orders Matching</span>
            <Receipt className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-2xl font-bold text-white font-mono">{filteredOrders.length}</span>
          <span className="text-[11px] text-slate-500 block">
            {filterMode === 'TIME'
              ? `All orders in ${timePreset === 'ALL' ? 'entire history' : timePreset.toLowerCase()}`
              : `Latest ${orderCount} orders`}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Gross Revenue</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-bold text-amber-400 font-mono">
            ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-slate-500 block">Total amount across matching orders</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Average Ticket Value</span>
            <ShoppingBag className="w-4 h-4 text-amber-300" />
          </div>
          <span className="text-2xl font-bold text-amber-300 font-mono">
            ${avgOrderValue.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 block">Average spend per basket</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Units Sold</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-2xl font-bold text-purple-400 font-mono">
            {totalUnitsSold.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[11px] text-slate-500 block">Total physical items handed out</span>
        </div>
      </div>

      {/* Mutually Exclusive Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3.5">
        {/* Top Row: Search Input + Mode Toggle Tabs */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Order #, SKU, or Product Name..."
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

          {/* Primary Filter Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setFilterMode('TIME')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === 'TIME'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Filter by Time Frame (No Limit)
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('COUNT')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === 'COUNT'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Filter by Order Count
            </button>
          </div>
        </div>

        {/* Sub Row: Active Mode Pills & Indicator */}
        <div className="pt-2.5 border-t border-slate-800/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {filterMode === 'TIME' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1 font-medium">Time Window:</span>
              {[
                { id: 'ALL', label: 'All Time' },
                { id: 'TODAY', label: 'Today (All Orders)' },
                { id: 'WEEK', label: 'Past 7 Days (All Orders)' },
                { id: 'MONTH', label: 'Past 30 Days (All Orders)' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimePreset(t.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    timePreset === t.id
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1 font-medium">Fetch Latest N Orders:</span>
              {[25, 50, 100, 250, 500].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setOrderCount(count)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold font-mono transition ${
                    orderCount === count
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  Latest {count}
                </button>
              ))}
            </div>
          )}

          {/* Active Mode Clarification */}
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {filterMode === 'TIME' ? (
              <span>
                Time Mode active: loading <strong>100% of orders</strong> in timeframe (no quantity cap)
              </span>
            ) : (
              <span>
                Order Count active: loading <strong>latest {orderCount} orders</strong> regardless of date
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Order Number</th>
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Items Summary</th>
                <th className="py-3.5 px-4">Total Units</th>
                <th className="py-3.5 px-4">Total Paid</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading transaction records...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm font-medium text-slate-400">No sales transactions found</p>
                    <p className="text-xs text-slate-500 mt-1">Try adjusting the search query or active filter mode</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isExpanded = expandedOrderId === order.sales_order_id;
                  const orderDate = new Date(order.created_at);
                  const formattedDate = orderDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  });
                  const formattedTime = orderDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit'
                  });
                  const totalUnits = order.items.reduce((s, it) => s + Number(it.quantity), 0);

                  return (
                    <React.Fragment key={order.sales_order_id}>
                      <tr
                        onClick={() => toggleExpand(order.sales_order_id)}
                        className={`hover:bg-slate-800/40 cursor-pointer transition ${
                          isExpanded ? 'bg-indigo-950/20' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-lg text-xs">
                            {order.order_number}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{formattedDate}</span>
                            <span className="text-slate-500">&bull;</span>
                            <span className="text-slate-400">{formattedTime}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-300 max-w-xs">
                          {order.items.length === 1 ? (
                            <span className="truncate block">
                              {order.items[0].product_name || `Product #${order.items[0].product_id}`}
                            </span>
                          ) : (
                            <span className="text-slate-300">
                              <strong className="text-white">{order.items.length} items</strong>
                              <span className="text-slate-500 ml-1">
                                ({order.items[0].product_name || 'Item'} + {order.items.length - 1} more)
                              </span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-200">
                          {totalUnits} units
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
                          ${Number(order.total_amount).toFixed(2)}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            {order.status || 'PAID'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Receipt Breakdown Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-950/70 border-t border-b border-indigo-900/30">
                          <td colSpan={7} className="p-4 sm:p-5">
                            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-xl max-w-3xl">
                              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-indigo-400" />
                                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                                    Itemized Register Receipt: {order.order_number}
                                  </h4>
                                </div>
                                <span className="text-[11px] font-mono text-slate-400">
                                  Timestamp: {new Date(order.created_at).toLocaleString()}
                                </span>
                              </div>

                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-semibold">
                                  <tr>
                                    <th className="py-2.5 px-3">SKU</th>
                                    <th className="py-2.5 px-3">Product Name</th>
                                    <th className="py-2.5 px-3 text-right">Quantity</th>
                                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50 font-mono">
                                  {order.items.map((it) => (
                                    <tr key={it.item_id} className="text-slate-300">
                                      <td className="py-2 px-3 text-indigo-400 font-bold">{it.sku || 'SKU-N/A'}</td>
                                      <td className="py-2 px-3 font-sans text-white font-medium">
                                        {it.product_name || `Product #${it.product_id}`}
                                      </td>
                                      <td className="py-2 px-3 text-right font-bold text-slate-200">
                                        {Number(it.quantity)}
                                      </td>
                                      <td className="py-2 px-3 text-right text-slate-400">
                                        ${Number(it.unit_price).toFixed(2)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-bold text-emerald-400">
                                        ${(Number(it.quantity) * Number(it.unit_price)).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              <div className="pt-3 border-t border-slate-800 flex justify-end gap-6 text-xs">
                                <div className="space-y-1 text-right text-slate-400">
                                  <div>Subtotal:</div>
                                  <div>Sales Tax (0%):</div>
                                  <div className="text-sm font-bold text-white pt-1">Total Charged:</div>
                                </div>
                                <div className="space-y-1 text-right font-mono font-bold">
                                  <div className="text-slate-200">${Number(order.total_amount).toFixed(2)}</div>
                                  <div className="text-slate-400">$0.00</div>
                                  <div className="text-base text-emerald-400 pt-1">
                                    ${Number(order.total_amount).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV / Excel Ingestion Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                  Import Store Sales Records (CSV / Excel)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Feed historical product quantities for AI demand forecasting
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadError(null);
                  setSelectedFile(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="p-5 space-y-4">
              {uploadError && (
                <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Ingestion Mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Ingestion Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadMode('demand_only')}
                    className={`p-3 rounded-xl border text-left transition ${
                      uploadMode === 'demand_only'
                        ? 'border-indigo-500 bg-indigo-950/40 text-white shadow'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-bold flex items-center gap-1.5 text-indigo-400">
                      <FileText className="w-3.5 h-3.5" />
                      Demand Mode
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Enriches AI daily demand curves without modifying physical shelf stock.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUploadMode('batch_sales')}
                    className={`p-3 rounded-xl border text-left transition ${
                      uploadMode === 'batch_sales'
                        ? 'border-indigo-500 bg-indigo-950/40 text-white shadow'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <p className="text-xs font-bold flex items-center gap-1.5 text-indigo-400">
                      <Receipt className="w-3.5 h-3.5" />
                      Full Transactions
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Records sales orders, ledger movements, and updates live physical stock.
                    </p>
                  </button>
                </div>
              </div>

              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Select CSV or Excel (.xlsx) File
                </label>
                <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-950/40 relative">
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    required
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        setUploadError(null);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-400" />
                      <span className="text-xs font-semibold text-white">{selectedFile.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-slate-500" />
                      <p className="text-xs font-semibold text-slate-300">
                        Drag and drop your sales spreadsheet here, or click to browse
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Supported: Date, SKU (or Product Name), Quantity, Stockout Flag
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Templates & Datasets Shortcut Bar */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Standard 50-Row Sample Template:</span>
                  <a
                    href={api.getSampleSalesCsvUrl()}
                    download="sample_store_sales_history.csv"
                    className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                </div>
                <div className="flex items-center justify-between text-slate-400 pt-1.5 border-t border-slate-700/60">
                  <span>Full 2-Year Grocery History (400 SKUs):</span>
                  <a
                    href="/grocery_store_sales_2yr.csv"
                    download="grocery_store_sales_2yr.csv"
                    className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download (18 MB)
                  </a>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadError(null);
                    setSelectedFile(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Parsing & Ingesting Records...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Upload & Ingest Records
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