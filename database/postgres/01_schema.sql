-- ==============================================================================
-- StockSense Database Schema - PostgreSQL 18
-- Dialect: PostgreSQL (Strict Constraints, Identity/Serial, B-Tree Indexes)
-- ==============================================================================

-- 1. Catalog & Master Tables
CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category_id INT NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    unit VARCHAR(20) NOT NULL DEFAULT 'unit',
    cost_price DECIMAL(12, 4) NOT NULL CHECK (cost_price >= 0),
    selling_price DECIMAL(12, 4) NOT NULL CHECK (selling_price >= cost_price),
    reorder_threshold DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_suppliers (
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    supplier_id INT NOT NULL REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    lead_time_days INT NOT NULL CHECK (lead_time_days >= 0),
    minimum_order_qty DECIMAL(12, 4) NOT NULL DEFAULT 1 CHECK (minimum_order_qty > 0),
    pack_size DECIMAL(12, 4) NOT NULL DEFAULT 1 CHECK (pack_size > 0),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (product_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS warehouses (
    warehouse_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    location VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Inventory State & Audit Ledger
CREATE TABLE IF NOT EXISTS stock_balances (
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    warehouse_id INT NOT NULL REFERENCES warehouses(warehouse_id) ON DELETE RESTRICT,
    on_hand_qty DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (on_hand_qty >= 0),
    reserved_qty DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, warehouse_id),
    CONSTRAINT chk_available_non_negative CHECK (on_hand_qty >= reserved_qty)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    movement_id BIGSERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    warehouse_id INT NOT NULL REFERENCES warehouses(warehouse_id) ON DELETE RESTRICT,
    movement_type VARCHAR(30) NOT NULL,
    quantity_delta DECIMAL(12, 4) NOT NULL,
    reference_type VARCHAR(30) NOT NULL,
    reference_id BIGINT NOT NULL,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sales Transactions
CREATE TABLE IF NOT EXISTS sales_orders (
    sales_order_id BIGSERIAL PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    total_amount DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    item_id BIGSERIAL PRIMARY KEY,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders(sales_order_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity DECIMAL(12, 4) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12, 4) NOT NULL CHECK (unit_price >= 0),
    cost_price DECIMAL(12, 4) NOT NULL CHECK (cost_price >= 0)
);

-- 4. Procurement & Goods Receipts
CREATE TABLE IF NOT EXISTS purchase_orders (
    purchase_order_id BIGSERIAL PRIMARY KEY,
    po_number VARCHAR(64) NOT NULL UNIQUE,
    supplier_id INT NOT NULL REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'ORDERED',
    ordered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expected_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    po_item_id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(purchase_order_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity_ordered DECIMAL(12, 4) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost DECIMAL(12, 4) NOT NULL CHECK (unit_cost >= 0),
    CONSTRAINT chk_no_over_receipt CHECK (quantity_received <= quantity_ordered)
);

CREATE TABLE IF NOT EXISTS goods_receipts (
    receipt_id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(purchase_order_id) ON DELETE RESTRICT,
    delivery_note VARCHAR(100),
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
    receipt_item_id BIGSERIAL PRIMARY KEY,
    receipt_id BIGINT NOT NULL REFERENCES goods_receipts(receipt_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity_received DECIMAL(12, 4) NOT NULL CHECK (quantity_received > 0)
);

-- 5. Analytical Daily Demand & Quality Management
CREATE TABLE IF NOT EXISTS daily_demand (
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    demand_date DATE NOT NULL,
    quantity_sold DECIMAL(12, 4) NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
    stockout_flag BOOLEAN NOT NULL DEFAULT FALSE,
    data_status VARCHAR(25) NOT NULL DEFAULT 'NORMAL',
    PRIMARY KEY (product_id, demand_date)
);

CREATE TABLE IF NOT EXISTS data_quality_issues (
    issue_id BIGSERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    issue_type VARCHAR(50) NOT NULL,
    details TEXT NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'FLAGGED',
    resolution_note TEXT
);

-- 6. Forecasting & Model Governance
CREATE TABLE IF NOT EXISTS forecast_runs (
    forecast_run_id BIGSERIAL PRIMARY KEY,
    model_name VARCHAR(50) NOT NULL,
    horizon_days INT NOT NULL CHECK (horizon_days > 0),
    training_start DATE NOT NULL,
    training_end DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecast_values (
    forecast_value_id BIGSERIAL PRIMARY KEY,
    forecast_run_id BIGINT NOT NULL REFERENCES forecast_runs(forecast_run_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    forecast_date DATE NOT NULL,
    predicted_demand DECIMAL(12, 4) NOT NULL CHECK (predicted_demand >= 0),
    lower_bound DECIMAL(12, 4),
    upper_bound DECIMAL(12, 4),
    UNIQUE (forecast_run_id, product_id, forecast_date)
);

CREATE TABLE IF NOT EXISTS model_metrics (
    metric_id BIGSERIAL PRIMARY KEY,
    forecast_run_id BIGINT NOT NULL REFERENCES forecast_runs(forecast_run_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    mae DECIMAL(10, 4) NOT NULL,
    wape DECIMAL(10, 4) NOT NULL,
    bias DECIMAL(10, 4) NOT NULL,
    UNIQUE (forecast_run_id, product_id)
);

-- 7. Replenishment Intelligence & What-If Scenarios
CREATE TABLE IF NOT EXISTS replenishment_recommendations (
    recommendation_id BIGSERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    current_on_hand DECIMAL(12, 4) NOT NULL,
    current_on_order DECIMAL(12, 4) NOT NULL DEFAULT 0,
    lead_time_days INT NOT NULL,
    lead_time_demand DECIMAL(12, 4) NOT NULL,
    safety_stock DECIMAL(12, 4) NOT NULL,
    reorder_point DECIMAL(12, 4) NOT NULL,
    recommended_qty DECIMAL(12, 4) NOT NULL,
    reorder_deadline DATE NOT NULL,
    stockout_risk_score DECIMAL(5, 2) NOT NULL CHECK (stockout_risk_score >= 0 AND stockout_risk_score <= 100),
    explanation_text TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenario_runs (
    scenario_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    demand_multiplier DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
    lead_time_delta_days INT NOT NULL DEFAULT 0,
    safety_stock_factor DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenario_results (
    result_id BIGSERIAL PRIMARY KEY,
    scenario_id BIGINT NOT NULL REFERENCES scenario_runs(scenario_id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    simulated_stockout_risk DECIMAL(5, 2) NOT NULL,
    projected_ending_stock DECIMAL(12, 4) NOT NULL,
    estimated_holding_cost DECIMAL(12, 4) NOT NULL,
    estimated_lost_sales_cost DECIMAL(12, 4) NOT NULL,
    UNIQUE (scenario_id, product_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL DEFAULT 'system',
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    details TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- INDEXING STRATEGY (PostgreSQL)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_time ON stock_movements(product_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_time ON stock_movements(occurred_at);
CREATE INDEX IF NOT EXISTS idx_sales_orders_created ON sales_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_items_prod ON sales_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_order ON sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_prod ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_daily_demand_prod_date ON daily_demand(product_id, demand_date);
CREATE INDEX IF NOT EXISTS idx_daily_demand_date ON daily_demand(demand_date);
CREATE INDEX IF NOT EXISTS idx_forecast_values_prod_date ON forecast_values(product_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_replenish_risk ON replenishment_recommendations(status, stockout_risk_score DESC);
