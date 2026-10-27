import axios from 'axios';
import {
  Product, Category, Supplier, SaleOrder, PurchaseOrder,
  DailyDemandRecord, ForecastData, ReplenishmentRecommendation,
  DataQualityIssue, DataQualitySummary, ScenarioRun, ScenarioDetail, BenchmarkComparison
} from '../types';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // System Health & Engine
  getHealth: () => axios.get('http://localhost:8000/health'),
  getRoot: () => axios.get('http://localhost:8000/'),

  // Products
  getProducts: (categoryId?: number, search?: string) =>
    apiClient.get<Product[]>('/products', { params: { category_id: categoryId, search } }),
  getCategories: () => apiClient.get<Category[]>('/products/categories'),
  getSuppliers: () => apiClient.get<Supplier[]>('/products/suppliers'),
  createProduct: (data: Partial<Product>) => apiClient.post<Product>('/products', data),

  // Sales & Inventory Transactions
  recordSale: (warehouseId: number, items: Array<{ product_id?: number; sku?: string; barcode?: string; quantity: number; unit_price?: number }>) =>
    apiClient.post<SaleOrder>('/inventory/sales', { warehouse_id: warehouseId, items }),
  getSalesOrders: (paramsOrLimit?: number | { limit?: number; start_date?: string; end_date?: string }) => {
    const params = typeof paramsOrLimit === 'number' ? { limit: paramsOrLimit } : paramsOrLimit;
    return apiClient.get<SaleOrder[]>('/inventory/sales', { params });
  },
  uploadSalesCsv: (file: File, mode: string = 'demand_only') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    return apiClient.post<{
      total_rows_parsed: number;
      records_ingested: number;
      products_affected: number;
      new_products_created: number;
      date_min?: string;
      date_max?: string;
      message: string;
    }>('/inventory/sales/upload-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getSampleSalesCsvUrl: () => `${API_BASE_URL}/inventory/sales/template-csv`,
  uploadStockCsv: (file: File, mode: string = 'replace') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    return apiClient.post<{
      total_rows_parsed: number;
      products_updated: number;
      unmatched_rows: number;
      total_units_before: number;
      total_units_after: number;
      message: string;
    }>('/inventory/stock/upload-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getSampleStockCsvUrl: () => `${API_BASE_URL}/inventory/stock/template-csv`,
  getPurchaseOrders: (status?: string) => apiClient.get<PurchaseOrder[]>('/inventory/purchase-orders', { params: { status } }),
  createPurchaseOrder: (data: any) => apiClient.post('/inventory/purchase-orders', data),
  receiveGoods: (data: any) => apiClient.post('/inventory/goods-receipts', data),
  getMovements: (productId?: number, limit: number = 100) =>
    apiClient.get('/inventory/movements', { params: { product_id: productId, limit } }),
  reconcileInventory: () => apiClient.get('/inventory/reconcile'),

  // Demand & Forecasting
  getDailyDemand: (productId: number, days: number = 90) =>
    apiClient.get<DailyDemandRecord[]>(`/forecasting/demand/${productId}`, { params: { days } }),
  generateForecast: (productId: number, modelName: string = 'EMA_14', horizonDays: number = 14, imputeStockouts: boolean = true) =>
    apiClient.post(`/forecasting/generate/${productId}`, null, {
      params: { model_name: modelName, horizon_days: horizonDays, impute_stockouts: imputeStockouts }
    }),
  getForecastHistory: (productId: number) =>
    apiClient.get<ForecastData>(`/forecasting/runs/${productId}`),

  // Replenishment
  getRecommendations: (status?: string) =>
    apiClient.get<ReplenishmentRecommendation[]>('/replenishment/recommendations', { params: { status } }),
  evaluateReplenishment: () => apiClient.post('/replenishment/evaluate'),
  updateRecommendationStatus: (id: number, status: 'ACCEPTED' | 'DISMISSED' | 'PENDING') =>
    apiClient.put(`/replenishment/recommendations/${id}/status`, null, { params: { status } }),
  createPOFromRecommendation: (id: number, quantity?: number) =>
    apiClient.post(`/replenishment/recommendations/${id}/create-po`, { quantity }),
  bulkCreatePO: (recommendation_ids: number[]) =>
    apiClient.post('/replenishment/recommendations/bulk-create-po', { recommendation_ids }),

  // Data Quality
  getIssues: (status?: string, issue_type?: string, limit?: number) =>
    apiClient.get<DataQualityIssue[]>('/data-quality/issues', { params: { status, issue_type, limit } }),
  getAuditSummary: () =>
    apiClient.get<DataQualitySummary>('/data-quality/summary'),
  auditProduct: (productId: number) => apiClient.post(`/data-quality/audit/${productId}`),
  auditAll: () => apiClient.post('/data-quality/audit-all'),
  resolveIssue: (issueId: number, action: 'APPROVED_CORRECTION' | 'IGNORED', note: string) =>
    apiClient.put(`/data-quality/issues/${issueId}`, null, { params: { action, resolution_note: note } }),
  bulkResolveIssues: (data: { issue_ids?: number[]; resolve_all_flagged?: boolean; action: 'APPROVED_CORRECTION' | 'IGNORED'; resolution_note?: string }) =>
    apiClient.post<{ message: string; updated_count: number; action: string }>('/data-quality/issues/bulk-resolve', data),

  // Scenarios
  getScenarios: () => apiClient.get<ScenarioRun[]>('/simulation/scenarios'),
  getScenarioDetail: (id: number) => apiClient.get<ScenarioDetail>(`/simulation/scenarios/${id}`),
  runScenario: (data: { name: string; demand_multiplier: number; lead_time_delta_days: number; safety_stock_factor: number; simulation_days: number }) =>
    apiClient.post<{ message: string; scenario_id: number }>('/simulation/run', data),
  deleteScenario: (id: number) => apiClient.delete(`/simulation/scenarios/${id}`),

  // Benchmarking
  getBenchmarkStatus: () => apiClient.get('/benchmark/status'),
  runBenchmarkComparison: (queryType: string, iterations: number = 5) =>
    apiClient.post<BenchmarkComparison>('/benchmark/compare', { query_type: queryType, iterations }),
};
