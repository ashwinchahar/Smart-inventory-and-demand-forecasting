export interface Product {
  product_id: number;
  sku: string;
  name: string;
  category_id: number;
  category_name?: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  reorder_threshold: number;
  is_active: boolean;
  on_hand_qty: number;
  reserved_qty: number;
  created_at: string;
}

export interface Category {
  category_id: number;
  name: string;
  description?: string;
}

export interface Supplier {
  supplier_id: number;
  name: string;
  contact_email?: string;
  contact_phone?: string;
}

export interface SaleItemRequest {
  product_id: number;
  quantity: number;
  unit_price?: number;
}

export interface SaleOrder {
  sales_order_id: number;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  items: Array<{
    item_id: number;
    product_id: number;
    product_name?: string;
    sku?: string;
    quantity: number;
    unit_price: number;
    cost_price: number;
  }>;
}

export interface PurchaseOrder {
  purchase_order_id: number;
  po_number: string;
  supplier_id: number;
  supplier_name?: string;
  status: string;
  ordered_at: string;
  expected_at: string;
  items: Array<{
    po_item_id: number;
    product_id: number;
    product_name?: string;
    quantity_ordered: number;
    quantity_received: number;
    unit_cost: number;
  }>;
}

export interface DailyDemandRecord {
  demand_date: string;
  quantity_sold: number;
  stockout_flag: boolean;
  data_status: string;
}

export interface ForecastData {
  has_sufficient_history?: boolean;
  demand_record_count?: number;
  min_required_records?: number;
  message?: string;
  run?: {
    forecast_run_id: number;
    model_name: string;
    horizon_days: number;
    training_start: string;
    training_end: string;
    created_at: string;
  } | null;
  metrics?: {
    mae: number;
    wape: number;
    bias: number;
  } | null;
  values: Array<{
    forecast_date: string;
    predicted_demand: number;
    lower_bound?: number;
    upper_bound?: number;
  }>;
}

export interface ReplenishmentRecommendation {
  recommendation_id: number;
  product_id: number;
  sku: string;
  product_name: string;
  category_name?: string;
  cost_price?: number;
  selling_price?: number;
  supplier_id?: number;
  supplier_name?: string;
  current_on_hand: number;
  current_on_order: number;
  lead_time_days: number;
  lead_time_demand: number;
  safety_stock: number;
  reorder_point: number;
  recommended_qty: number;
  reorder_deadline: string;
  stockout_risk_score: number;
  explanation_text: string;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED';
  created_at: string;
  po_number?: string;
}

export interface DataQualityIssue {
  issue_id: number;
  product_id: number;
  sku: string;
  product_name: string;
  category_name?: string;
  issue_type: string;
  details: string;
  detected_at: string;
  status: 'FLAGGED' | 'APPROVED_CORRECTION' | 'IGNORED';
  resolution_note?: string;
}

export interface DataQualitySummary {
  total: number;
  flagged: number;
  approved: number;
  ignored: number;
  censored_zeros: number;
  anomaly_spikes: number;
  missing_dates: number;
}

export interface ScenarioRun {
  scenario_id: number;
  name: string;
  demand_multiplier: number;
  lead_time_delta_days: number;
  safety_stock_factor: number;
  created_at: string;
  product_count: number;
  avg_stockout_risk: number;
  total_estimated_holding_cost: number;
  total_estimated_lost_sales_cost: number;
}

export interface ScenarioDetail extends ScenarioRun {
  results: Array<{
    result_id: number;
    product_id: number;
    sku: string;
    product_name: string;
    category_name?: string;
    simulated_stockout_risk: number;
    projected_ending_stock: number;
    estimated_holding_cost: number;
    estimated_lost_sales_cost: number;
  }>;
}

export interface BenchmarkComparison {
  query_type: string;
  iterations: number;
  comparison: {
    postgresql: {
      median_ms: number;
      min_ms: number;
      max_ms: number;
      latencies_ms: number[];
      execution_plan: string;
      error?: string;
    };
    mysql: {
      median_ms: number;
      min_ms: number;
      max_ms: number;
      latencies_ms: number[];
      execution_plan: string;
      error?: string;
    };
  };
}
