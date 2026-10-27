import React, { useEffect, useState, useMemo } from 'react';
import {
  Truck,
  Package,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Boxes,
  ArrowDownToLine,
  X,
  FileText,
  DollarSign,
  Check,
  Building2,
  Trash2,
  Download,
  Minus,
  Sparkles,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../services/api';
import { PurchaseOrder, Supplier, Product } from '../types';

export const PurchaseOrdersPage: React.FC = () => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'COMPLETED'>('ALL');
  const [search, setSearch] = useState<string>('');
  const [expandedPoId, setExpandedPoId] = useState<number | null>(null);

  // Receive Modal State
  const [receiveModalPo, setReceiveModalPo] = useState<PurchaseOrder | null>(null);
  const [deliveryNote, setDeliveryNote] = useState<string>('');
  const [receiptQuantities, setReceiptQuantities] = useState<Record<number, number>>({});
  const [submittingReceive, setSubmittingReceive] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Create PO Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newPoSupplierId, setNewPoSupplierId] = useState<number>(1);
  const [newPoExpectedDate, setNewPoExpectedDate] = useState<string>(
    new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
  );
  const [newPoItems, setNewPoItems] = useState<Array<{ product_id: number; quantity_ordered: number; unit_cost: number }>>([]);
  const [itemSearchTerm, setItemSearchTerm] = useState<string>('');
  const [submittingCreate, setSubmittingCreate] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        api.getPurchaseOrders(statusFilter === 'ALL' ? undefined : statusFilter),
        api.getSuppliers(),
        api.getProducts()
      ]);
      setPurchaseOrders(poRes.data || []);
      setSuppliers(supRes.data || []);
      setProducts(prodRes.data || []);

      // Seed initial create PO item if empty
      if (newPoItems.length === 0 && prodRes.data && prodRes.data.length > 0) {
        const firstProd = prodRes.data[0];
        setNewPoItems([
          {
            product_id: firstProd.product_id,
            quantity_ordered: 50,
            unit_cost: Number(firstProd.cost_price) || 2.5
          }
        ]);
        if (supRes.data && supRes.data.length > 0) {
          setNewPoSupplierId(supRes.data[0].supplier_id);
        }
      }
    } catch (err) {
      console.error('Failed to load purchase orders data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const filteredOrders = useMemo(() => {
    const term = search.toLowerCase().trim();
    return purchaseOrders.filter((po) => {
      if (!term) return true;
      const matchesPo = po.po_number.toLowerCase().includes(term);
      const matchesSup = (po.supplier_name || '').toLowerCase().includes(term);
      const matchesItem = po.items.some(
        (it) => it.product_name && it.product_name.toLowerCase().includes(term)
      );
      return matchesPo || matchesSup || matchesItem;
    });
  }, [purchaseOrders, search]);

  const openRestocks = purchaseOrders.filter(
    (po) => po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED'
  );

  const pendingUnits = openRestocks.reduce(
    (sum, po) =>
      sum +
      po.items.reduce(
        (iSum, it) => iSum + Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received)),
        0
      ),
    0
  );

  const totalCapitalOnOrder = openRestocks.reduce(
    (sum, po) =>
      sum +
      po.items.reduce((iSum, it) => {
        const rem = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
        return iSum + rem * Number(it.unit_cost);
      }, 0),
    0
  );

  const completedRestocks = purchaseOrders.filter((po) => po.status === 'COMPLETED').length;

  const openReceiveModal = (po: PurchaseOrder) => {
    setReceiveModalPo(po);
    setDeliveryNote(`DELIV-${Math.floor(100000 + Math.random() * 900000)}`);
    const initialQtys: Record<number, number> = {};
    po.items.forEach((it) => {
      const remaining = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
      initialQtys[it.product_id] = remaining;
    });
    setReceiptQuantities(initialQtys);
    setActionErrorMsg(null);
  };

  const handleReceiveAll = () => {
    if (!receiveModalPo) return;
    const allQtys: Record<number, number> = {};
    receiveModalPo.items.forEach((it) => {
      const remaining = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
      allQtys[it.product_id] = remaining;
    });
    setReceiptQuantities(allQtys);
  };

  const handleReceiveNone = () => {
    if (!receiveModalPo) return;
    const zeroQtys: Record<number, number> = {};
    receiveModalPo.items.forEach((it) => {
      zeroQtys[it.product_id] = 0;
    });
    setReceiptQuantities(zeroQtys);
  };

  const updateReceiveQty = (productId: number, delta: number, maxQty: number) => {
    const current = receiptQuantities[productId] ?? 0;
    const next = Math.min(maxQty, Math.max(0, current + delta));
    setReceiptQuantities({ ...receiptQuantities, [productId]: next });
  };

  const handleReceiveGoods = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveModalPo) return;
    setSubmittingReceive(true);
    setActionErrorMsg(null);

    const itemsToReceive = Object.entries(receiptQuantities)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([prodId, qty]) => ({
        product_id: Number(prodId),
        quantity_received: Number(qty)
      }));

    if (itemsToReceive.length === 0) {
      setActionErrorMsg('Please specify at least one item quantity to receive.');
      setSubmittingReceive(false);
      return;
    }

    try {
      await api.receiveGoods({
        purchase_order_id: receiveModalPo.purchase_order_id,
        warehouse_id: 1,
        delivery_note: deliveryNote,
        items: itemsToReceive
      });

      const totalRecvUnits = itemsToReceive.reduce((s, i) => s + i.quantity_received, 0);
      setActionSuccessMsg(
        `Successfully received ${totalRecvUnits.toLocaleString()} units for PO #${receiveModalPo.po_number}. Physical shelf stock updated!`
      );
      setReceiveModalPo(null);
      await loadData();
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to receive goods. Please verify quantities.';
      setActionErrorMsg(msg);
    } finally {
      setSubmittingReceive(false);
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCreate(true);
    setActionErrorMsg(null);

    try {
      await api.createPurchaseOrder({
        supplier_id: Number(newPoSupplierId),
        expected_at: new Date(newPoExpectedDate).toISOString(),
        items: newPoItems.map((item) => ({
          product_id: Number(item.product_id),
          quantity_ordered: Number(item.quantity_ordered),
          unit_cost: Number(item.unit_cost)
        }))
      });

      setActionSuccessMsg('New Purchase Order scheduled and sent to supplier successfully!');
      setShowCreateModal(false);
      await loadData();
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to create purchase order.';
      setActionErrorMsg(msg);
    } finally {
      setSubmittingCreate(false);
    }
  };

  const addItemToNewPo = (product: Product) => {
    const existing = newPoItems.find((it) => it.product_id === product.product_id);
    if (existing) {
      setNewPoItems(
        newPoItems.map((it) =>
          it.product_id === product.product_id ? { ...it, quantity_ordered: it.quantity_ordered + 25 } : it
        )
      );
    } else {
      setNewPoItems([
        ...newPoItems,
        {
          product_id: product.product_id,
          quantity_ordered: 50,
          unit_cost: Number(product.cost_price) || 2.5
        }
      ]);
    }
  };

  const estimatedNewPoTotal = newPoItems.reduce(
    (sum, it) => sum + Number(it.quantity_ordered) * Number(it.unit_cost),
    0
  );

  // CSV Export Manifest Handler
  const handleExportManifestCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = [
      'PO Number',
      'Supplier',
      'Status',
      'Ordered Date',
      'Expected Delivery Date',
      'Total SKUs',
      'Total Ordered Units',
      'Total Received Units',
      'Outstanding Units',
      'Estimated Cost ($)',
      'Items Breakdown'
    ];

    const rows = filteredOrders.map((po) => {
      const ordDate = new Date(po.ordered_at).toLocaleDateString();
      const expDate = new Date(po.expected_at).toLocaleDateString();
      const totOrd = po.items.reduce((s, it) => s + Number(it.quantity_ordered), 0);
      const totRec = po.items.reduce((s, it) => s + Number(it.quantity_received), 0);
      const cost = po.items.reduce((s, it) => s + Number(it.quantity_ordered) * Number(it.unit_cost), 0);
      const breakdown = po.items
        .map((it) => `${it.product_name || `ID#${it.product_id}`} (Ord: ${it.quantity_ordered}, Recv: ${it.quantity_received})`)
        .join('; ');

      return [
        `"${po.po_number}"`,
        `"${po.supplier_name || `Supplier #${po.supplier_id}`}"`,
        `"${po.status}"`,
        `"${ordDate}"`,
        `"${expDate}"`,
        po.items.length,
        totOrd,
        totRec,
        totOrd - totRec,
        cost.toFixed(2),
        `"${breakdown.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `purchase_orders_manifest_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ORDERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            In Transit (Scheduled)
          </span>
        );
      case 'PARTIALLY_RECEIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Boxes className="w-3 h-3" />
            Partially Received
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const getEtaCountdown = (expectedAtStr: string, status: string) => {
    if (status === 'COMPLETED') {
      return (
        <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 text-[10px] inline-flex items-center gap-1">
          <Check className="w-3 h-3" /> Delivered
        </span>
      );
    }
    const now = new Date();
    const eta = new Date(expectedAtStr);
    const diffDays = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 3600 * 24));

    if (diffDays < 0) {
      return (
        <span className="text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 text-[10px] inline-flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Overdue by {Math.abs(diffDays)}d
        </span>
      );
    } else if (diffDays === 0) {
      return (
        <span className="text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 text-[10px] inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Arriving Today
        </span>
      );
    } else {
      return (
        <span className="text-indigo-300 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 text-[10px] inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" /> Expected in {diffDays}d
        </span>
      );
    }
  };

  const totalReceivingUnits = Object.values(receiptQuantities).reduce((s, q) => s + (Number(q) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {actionSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-700/50 text-emerald-300 text-xs sm:text-sm flex items-center justify-between shadow-xl animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-400" />
            Purchase Orders & Inbound Restock
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Track scheduled supplier shipments, monitor delivery ETAs, receive dock deliveries, and schedule purchase orders
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportManifestCSV}
            disabled={filteredOrders.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition disabled:opacity-40"
            title="Export purchase orders manifest to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            Export Manifest ({filteredOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            Schedule New Restock PO
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>In-Transit Shipments</span>
            <Truck className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-bold text-amber-400 font-mono">{openRestocks.length}</span>
          <span className="text-[11px] text-slate-500 block">Awaiting warehouse dock delivery</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Inbound Units on Order</span>
            <Package className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="text-2xl font-bold text-cyan-400 font-mono">{pendingUnits.toLocaleString()}</span>
          <span className="text-[11px] text-slate-500 block">Units replenishing warehouse stock</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Capital on Order</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-bold text-emerald-400 font-mono">
            ${totalCapitalOnOrder.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-slate-500 block">Value of pending delivery stock</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Completed Deliveries</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-2xl font-bold text-white font-mono">{completedRestocks}</span>
          <span className="text-[11px] text-slate-500 block">Archived fully checked-in POs</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO#, supplier, or product..."
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

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: `All Orders (${purchaseOrders.length})` },
            { id: 'ORDERED', label: `In Transit (${purchaseOrders.filter((p) => p.status === 'ORDERED').length})` },
            { id: 'PARTIALLY_RECEIVED', label: `Partially Received (${purchaseOrders.filter((p) => p.status === 'PARTIALLY_RECEIVED').length})` },
            { id: 'COMPLETED', label: `Completed (${completedRestocks})` }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Purchase Orders List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-16 text-center rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            Loading purchase orders and delivery manifests...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-16 text-center rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-400">
            <Truck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-300">No purchase orders found</p>
            <p className="text-xs text-slate-500 mt-1">Try switching status filters or schedule a new restock PO above.</p>
          </div>
        ) : (
          filteredOrders.map((po) => {
            const isExpanded = expandedPoId === po.purchase_order_id;
            const totalOrdered = po.items.reduce((s, it) => s + Number(it.quantity_ordered), 0);
            const totalReceived = po.items.reduce((s, it) => s + Number(it.quantity_received), 0);
            const outstanding = Math.max(0, totalOrdered - totalReceived);
            const pctReceived = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
            const canReceive = po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED';
            const totalEstimatedCost = po.items.reduce(
              (sum, it) => sum + Number(it.quantity_ordered) * Number(it.unit_cost),
              0
            );

            return (
              <div
                key={po.purchase_order_id}
                className="rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 transition-all shadow-lg overflow-hidden"
              >
                <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: PO Number, Status, ETA & Vendor Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm sm:text-base font-bold text-white tracking-wide bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700">
                        {po.po_number}
                      </span>
                      {getStatusBadge(po.status)}
                      {getEtaCountdown(po.expected_at, po.status)}
                    </div>

                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 pt-0.5">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        Supplier: <strong className="text-slate-200">{po.supplier_name || `Supplier #${po.supplier_id}`}</strong>
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        Ordered: {new Date(po.ordered_at).toLocaleDateString()}
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        ETA: <strong className="text-indigo-300">{new Date(po.expected_at).toLocaleDateString()}</strong>
                      </span>
                      <span>&bull;</span>
                      <span className="font-mono text-emerald-400 font-semibold">
                        Value: ${totalEstimatedCost.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Right: Fulfillment Progress & Action Controls */}
                  <div className="flex items-center justify-between lg:justify-end gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                    {/* Progress Bar */}
                    <div className="min-w-[150px] text-right space-y-1.5">
                      <div className="text-xs text-slate-400 flex justify-between gap-2">
                        <span>Fulfillment</span>
                        <span className="font-mono font-bold text-white">
                          {totalReceived} / {totalOrdered} ({pctReceived}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            pctReceived === 100
                              ? 'bg-emerald-500'
                              : pctReceived > 0
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, pctReceived)}%` }}
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      {canReceive && (
                        <button
                          type="button"
                          onClick={() => openReceiveModal(po)}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 transition"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          Receive Delivery
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedPoId(isExpanded ? null : po.purchase_order_id)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Toggle Line Items"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Line Items Drawer */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/70 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        Purchase Order Manifest ({po.items.length} SKUs)
                      </h4>
                      <span className="text-xs font-mono text-slate-400">
                        Total Ordered: <strong className="text-white">{totalOrdered}</strong> &bull; Received: <strong className="text-emerald-400">{totalReceived}</strong> &bull; Outstanding: <strong className="text-amber-400">{outstanding}</strong>
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-semibold">
                            <th className="pb-2.5">Product Name</th>
                            <th className="pb-2.5 text-right">Ordered Qty</th>
                            <th className="pb-2.5 text-right">Received Qty</th>
                            <th className="pb-2.5 text-right">Outstanding</th>
                            <th className="pb-2.5 text-right">Unit Wholesale Cost</th>
                            <th className="pb-2.5 text-right">Estimated Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {po.items.map((it) => {
                            const rem = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
                            return (
                              <tr key={it.po_item_id} className="text-slate-300">
                                <td className="py-2.5 font-sans font-medium text-white">
                                  {it.product_name || `Product #${it.product_id}`}
                                </td>
                                <td className="py-2.5 text-right font-bold text-slate-200">
                                  {Number(it.quantity_ordered)}
                                </td>
                                <td className="py-2.5 text-right font-bold text-emerald-400">
                                  {Number(it.quantity_received)}
                                </td>
                                <td className="py-2.5 text-right font-bold text-amber-400">
                                  {rem}
                                </td>
                                <td className="py-2.5 text-right text-slate-400">
                                  ${Number(it.unit_cost).toFixed(2)}
                                </td>
                                <td className="py-2.5 text-right font-bold text-white">
                                  ${(Number(it.quantity_ordered) * Number(it.unit_cost)).toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Receive Dock Delivery Modal */}
      {receiveModalPo && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
                  Receive Inbound Restock Delivery
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Record physical goods checked into warehouse dock for PO{' '}
                  <strong className="text-white font-mono">{receiveModalPo.po_number}</strong>
                </p>
              </div>
              <button
                onClick={() => setReceiveModalPo(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReceiveGoods} className="p-5 space-y-4">
              {actionErrorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionErrorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Bill of Lading / Delivery Note Number
                </label>
                <input
                  type="text"
                  required
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="e.g. DELIV-92812"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-400">
                    Quantities Checked In at Dock ({totalReceivingUnits} units)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReceiveAll}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Receive All Remaining
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={handleReceiveNone}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-300 underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {receiveModalPo.items.map((it) => {
                    const remaining = Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received));
                    const currentVal = receiptQuantities[it.product_id] ?? 0;

                    return (
                      <div
                        key={it.po_item_id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {it.product_name || `Product #${it.product_id}`}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                            Ordered: {Number(it.quantity_ordered)} &bull; Recv'd: {Number(it.quantity_received)} &bull; Max Left:{' '}
                            <strong className="text-amber-400 font-bold">{remaining}</strong>
                          </p>
                        </div>

                        {/* Incrementer [-] [Qty] [+] */}
                        <div className="flex items-center gap-1.5 shrink-0 bg-slate-900 p-1 rounded-xl border border-slate-700">
                          <button
                            type="button"
                            onClick={() => updateReceiveQty(it.product_id, -10, remaining)}
                            className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition text-xs font-mono font-bold"
                            title="Subtract 10 units"
                          >
                            -10
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            value={currentVal}
                            onChange={(e) =>
                              setReceiptQuantities({
                                ...receiptQuantities,
                                [it.product_id]: Math.min(remaining, Math.max(0, Number(e.target.value)))
                              })
                            }
                            className="w-16 px-1.5 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-right font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => updateReceiveQty(it.product_id, 10, remaining)}
                            className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition text-xs font-mono font-bold"
                            title="Add 10 units"
                          >
                            +10
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReceiveModalPo(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReceive || totalReceivingUnits === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  {submittingReceive ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Receiving Dock Stock...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Check-In {totalReceivingUnits} Units
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule New Restock PO Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-400" />
                  Schedule New Restock Purchase Order
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a vendor, set delivery ETA, and add replenishment items
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="p-5 space-y-4">
              {actionErrorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionErrorMsg}</span>
                </div>
              )}

              {/* Vendor & ETA Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Supplier / Vendor</label>
                  <select
                    value={newPoSupplierId}
                    onChange={(e) => setNewPoSupplierId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    {suppliers.map((s) => (
                      <option key={s.supplier_id} value={s.supplier_id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Expected Delivery ETA</label>
                  <input
                    type="date"
                    required
                    value={newPoExpectedDate}
                    onChange={(e) => setNewPoExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Quick Add Product from Catalog */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Search & Add Products from Catalog (Click card to add)
                </label>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={itemSearchTerm}
                    onChange={(e) => setItemSearchTerm(e.target.value)}
                    placeholder="Search 400+ SKUs by name or SKU..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 max-h-24 scrollbar-thin">
                  {products
                    .filter((p) => {
                      if (!itemSearchTerm) return true;
                      const term = itemSearchTerm.toLowerCase();
                      return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
                    })
                    .slice(0, 15)
                    .map((p) => (
                      <button
                        key={p.product_id}
                        type="button"
                        onClick={() => addItemToNewPo(p)}
                        className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500 hover:bg-slate-800 text-left shrink-0 text-xs transition group"
                      >
                        <p className="font-semibold text-white truncate max-w-[140px] group-hover:text-indigo-200">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {p.sku} &bull; ${Number(p.cost_price).toFixed(2)}
                        </p>
                      </button>
                    ))}
                </div>
              </div>

              {/* Order Items Manifest Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>Selected Line Items ({newPoItems.length})</span>
                  <span className="font-mono text-emerald-400 text-sm font-bold">
                    Est. PO Total: ${estimatedNewPoTotal.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {newPoItems.map((item, idx) => {
                    const prod = products.find((p) => p.product_id === item.product_id);
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-5">
                          <p className="text-xs font-semibold text-white truncate">
                            {prod?.name || `Product #${item.product_id}`}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">{prod?.sku}</p>
                        </div>

                        <div className="col-span-3">
                          <label className="text-[9px] text-slate-400 block mb-0.5">Order Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity_ordered}
                            onChange={(e) => {
                              const newItems = [...newPoItems];
                              newItems[idx].quantity_ordered = Math.max(1, Number(e.target.value));
                              setNewPoItems(newItems);
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white text-right font-mono"
                          />
                        </div>

                        <div className="col-span-3">
                          <label className="text-[9px] text-slate-400 block mb-0.5">Unit Cost ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_cost}
                            onChange={(e) => {
                              const newItems = [...newPoItems];
                              newItems[idx].unit_cost = Number(e.target.value);
                              setNewPoItems(newItems);
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white text-right font-mono"
                          />
                        </div>

                        <div className="col-span-1 text-right pt-3">
                          {newPoItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setNewPoItems(newPoItems.filter((_, i) => i !== idx))}
                              className="text-slate-500 hover:text-rose-400 transition"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate || newPoItems.length === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                >
                  {submittingCreate ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creating PO...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Schedule PO (${estimatedNewPoTotal.toFixed(2)})
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