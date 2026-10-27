import React, { useEffect, useState, useMemo } from 'react';
import { 
  ShoppingCart, CheckCircle2, AlertCircle, Trash2, Plus, 
  Minus, Search, Clock, FileText, Check, ArrowRight, 
  RotateCcw, X, DollarSign, Package, Sparkles
} from 'lucide-react';
import { api } from '../services/api';
import { Product, Category, SaleOrder } from '../types';

export const PointOfSalePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentOrders, setRecentOrders] = useState<SaleOrder[]>([]);
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([]);
  
  const [search, setSearch] = useState<string>('');
  const [selectedCat, setSelectedCat] = useState<number | 'ALL'>('ALL');
  const [loading, setLoading] = useState<boolean>(false);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<SaleOrder | null>(null);

  const loadData = async () => {
    setDataLoading(true);
    try {
      const [prodRes, catRes, ordersRes] = await Promise.all([
        api.getProducts(),
        api.getCategories(),
        api.getSalesOrders(10)
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setRecentOrders(ordersRes.data || []);
    } catch (err) {
      console.error('Failed to load POS data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Products for the POS Catalog Grid
  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();
    return products.filter((p) => {
      // Category match
      if (selectedCat !== 'ALL' && p.category_id !== selectedCat) {
        return false;
      }
      // Search match
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.category_name && p.category_name.toLowerCase().includes(term))
      );
    });
  }, [products, search, selectedCat]);

  // Cart operations
  const addToCart = (product: Product) => {
    const onHand = Number(product.on_hand_qty) || 0;
    if (onHand <= 0) {
      setFeedback({
        type: 'error',
        message: `${product.name} is currently out of stock.`
      });
      return;
    }

    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((item) => item.product.product_id === product.product_id);
      if (existing) {
        if (existing.quantity >= onHand) {
          setFeedback({
            type: 'error',
            message: `Cannot add more. Reached maximum available shelf stock (${onHand} units).`
          });
          return prev;
        }
        return prev.map((item) =>
          item.product.product_id === product.product_id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setFeedback(null);
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.product_id === productId) {
            const onHand = Number(item.product.on_hand_qty) || 0;
            const newQty = item.quantity + delta;
            if (newQty > onHand) {
              setFeedback({
                type: 'error',
                message: `Cannot exceed available shelf stock (${onHand} units).`
              });
              return item;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0);
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.product_id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setFeedback(null);
  };

  // Checkout Execution
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    setFeedback(null);

    try {
      const items = cart.map((c) => ({
        product_id: c.product.product_id,
        quantity: c.quantity,
        unit_price: Number(c.product.selling_price)
      }));

      const res = await api.recordSale(1, items);
      const completedOrder = res.data;
      
      setLastReceipt(completedOrder);
      setCart([]);
      setFeedback({
        type: 'success',
        message: `Order #${completedOrder.order_number} completed! $${Number(completedOrder.total_amount).toFixed(2)} recorded.`
      });
      await loadData();
    } catch (err: any) {
      console.error('Checkout failed:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Transaction failed. Please check inventory levels.'
      });
    } finally {
      setLoading(false);
    }
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.product.selling_price) * item.quantity,
    0
  );
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-indigo-400" />
            Point of Sale Terminal
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Fast grocery checkout with live shelf stock validation and instant inventory deduction
          </p>
        </div>

        {recentOrders.length > 0 && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Last Sale: </span>
            <strong className="text-emerald-400 font-mono">
              ${Number(recentOrders[0].total_amount).toFixed(2)}
            </strong>
            <span className="text-slate-500 font-mono">({recentOrders[0].order_number})</span>
          </div>
        )}
      </div>

      {/* Feedback Toast Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs sm:text-sm font-medium shadow-xl animate-in fade-in ${
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

      {/* POS Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Fast Product Catalog & Search (~65% width) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Search & Category Filter Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by SKU, name, or category..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCat('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  selectedCat === 'ALL'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-800/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                All Items ({products.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.category_id}
                  type="button"
                  onClick={() => setSelectedCat(cat.category_id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    selectedCat === cat.category_id
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-800/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>Showing {filteredProducts.length} items</span>
              <span>Click any product card to add to order</span>
            </div>

            {dataLoading ? (
              <div className="py-24 text-center text-slate-400">
                <RotateCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                Loading inventory catalog...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-20 text-center text-slate-500">
                <Package className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-medium text-slate-400">No products match your search</p>
                <p className="text-xs text-slate-500 mt-0.5">Try clearing the search term or category filter</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[580px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const onHand = Number(p.on_hand_qty) || 0;
                  const isOutOfStock = onHand <= 0;
                  const inCartQty = cart.find((c) => c.product.product_id === p.product_id)?.quantity || 0;

                  return (
                    <button
                      key={p.product_id}
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => addToCart(p)}
                      className={`text-left p-3 rounded-xl border transition flex flex-col justify-between group relative ${
                        isOutOfStock
                          ? 'bg-slate-900/40 border-slate-800/60 opacity-50 cursor-not-allowed'
                          : inCartQty > 0
                          ? 'bg-indigo-950/30 border-indigo-600/70 hover:border-indigo-500 shadow-md shadow-indigo-950/20'
                          : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800/80'
                      }`}
                    >
                      {inCartQty > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white font-mono text-[11px] font-bold flex items-center justify-center shadow">
                          {inCartQty}
                        </span>
                      )}

                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
                          <span className="font-bold text-indigo-300">{p.sku}</span>
                          <span className="truncate max-w-[80px] text-slate-500">{p.unit}</span>
                        </div>
                        <h4 className="text-xs font-semibold text-white line-clamp-2 leading-snug group-hover:text-indigo-200 transition-colors">
                          {p.name}
                        </h4>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                        <span className="text-sm font-bold font-mono text-emerald-400">
                          ${Number(p.selling_price).toFixed(2)}
                        </span>

                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                            isOutOfStock
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : onHand <= Number(p.reorder_threshold)
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isOutOfStock ? '0 in stock' : `${onHand.toFixed(0)} left`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Register Slip & Checkout (~35% width) */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between sticky top-20">
          <div>
            {/* Slip Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Current Order Slip</h2>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-[11px] font-semibold text-slate-400 hover:text-rose-400 flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear All
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="divide-y divide-slate-800/70 max-h-[360px] overflow-y-auto pr-1 mt-2">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-slate-500 space-y-2">
                  <ShoppingCart className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs font-medium text-slate-400">Order slip is empty</p>
                  <p className="text-[11px] text-slate-500 max-w-[200px] mx-auto">
                    Select grocery items on the left to add them to this sale
                  </p>
                </div>
              ) : (
                cart.map(({ product, quantity }) => {
                  const lineTotal = Number(product.selling_price) * quantity;
                  return (
                    <div key={product.product_id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-white truncate">{product.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          ${Number(product.selling_price).toFixed(2)} / {product.unit}
                        </div>
                      </div>

                      {/* Quantity Controls: [-] [Qty] [+] */}
                      <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700/60">
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.product_id, -1)}
                          className="w-6 h-6 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <span className="w-7 text-center font-mono font-bold text-xs text-white">
                          {quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() => updateQuantity(product.product_id, 1)}
                          className="w-6 h-6 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Line Total & Remove */}
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-white w-14 text-right">
                          ${lineTotal.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(product.product_id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition"
                          title="Remove item"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Checkout Footer & Totals */}
          <div className="pt-4 border-t border-slate-800 space-y-3 mt-4">
            <div className="space-y-1.5 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Items in Order</span>
                <span className="font-mono text-slate-200 font-semibold">{totalItemCount} units</span>
              </div>
              <div className="flex justify-between">
                <span>Sales Tax (0%)</span>
                <span className="font-mono text-slate-400">$0.00</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                <span className="text-sm font-bold text-white">Total Amount</span>
                <span className="text-2xl font-black font-mono text-amber-400">
                  ${cartTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={cart.length === 0 || loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-sm transition shadow-lg shadow-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-amber-300/40"
            >
              {loading ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Processing Checkout...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Charge & Complete Sale (${cartTotal.toFixed(2)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Completed Receipt Modal */}
      {lastReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Payment Successful</h3>
              <p className="text-xs text-slate-400 font-mono">
                Order #{lastReceipt.order_number} &bull; {new Date(lastReceipt.created_at).toLocaleTimeString()}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 pb-2 border-b border-slate-700/60">
                Purchased Items ({lastReceipt.items?.length || 0})
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {lastReceipt.items?.map((it) => (
                  <div key={it.item_id} className="flex justify-between items-center text-slate-300">
                    <span className="truncate pr-2">{it.product_name || `SKU #${it.product_id}`}</span>
                    <span className="font-mono shrink-0">
                      {it.quantity} × ${Number(it.unit_price).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-700/60 flex justify-between items-baseline font-bold">
                <span className="text-white">Total Charged</span>
                <span className="font-mono text-base text-emerald-400">
                  ${Number(lastReceipt.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLastReceipt(null)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
              >
                Start Next Customer Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
