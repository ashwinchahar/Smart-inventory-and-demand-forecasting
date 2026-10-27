from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Boolean, 
    Numeric, Date, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship
from app.db.session import Base

class Category(Base):
    __tablename__ = "categories"
    
    category_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "products"
    
    product_id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.category_id"), nullable=False)
    unit = Column(String(20), default="unit", nullable=False)
    cost_price = Column(Numeric(12, 4), nullable=False)
    selling_price = Column(Numeric(12, 4), nullable=False)
    reorder_threshold = Column(Numeric(12, 4), default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    category = relationship("Category", back_populates="products")
    suppliers = relationship("ProductSupplier", back_populates="product")
    stock_balances = relationship("StockBalance", back_populates="product")
    daily_demands = relationship("DailyDemand", back_populates="product")
    recommendations = relationship("ReplenishmentRecommendation", back_populates="product")

class Supplier(Base):
    __tablename__ = "suppliers"
    
    supplier_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    product_suppliers = relationship("ProductSupplier", back_populates="supplier")
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")

class ProductSupplier(Base):
    __tablename__ = "product_suppliers"
    
    product_id = Column(Integer, ForeignKey("products.product_id", ondelete="CASCADE"), primary_key=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id", ondelete="CASCADE"), primary_key=True)
    lead_time_days = Column(Integer, nullable=False)
    minimum_order_qty = Column(Numeric(12, 4), default=1, nullable=False)
    pack_size = Column(Numeric(12, 4), default=1, nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    
    product = relationship("Product", back_populates="suppliers")
    supplier = relationship("Supplier", back_populates="product_suppliers")

class Warehouse(Base):
    __tablename__ = "warehouses"
    
    warehouse_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    location = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class StockBalance(Base):
    __tablename__ = "stock_balances"
    
    product_id = Column(Integer, ForeignKey("products.product_id"), primary_key=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), primary_key=True)
    on_hand_qty = Column(Numeric(12, 4), default=0, nullable=False)
    reserved_qty = Column(Numeric(12, 4), default=0, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    product = relationship("Product", back_populates="stock_balances")
    warehouse = relationship("Warehouse")

class StockMovement(Base):
    __tablename__ = "stock_movements"
    
    movement_id = Column(BigInteger, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.warehouse_id"), nullable=False)
    movement_type = Column(String(30), nullable=False)  # 'SALE', 'RECEIPT', 'RETURN', 'ADJUSTMENT'
    quantity_delta = Column(Numeric(12, 4), nullable=False)
    reference_type = Column(String(30), nullable=False)
    reference_id = Column(BigInteger, nullable=False)
    occurred_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    product = relationship("Product")
    warehouse = relationship("Warehouse")

class SalesOrder(Base):
    __tablename__ = "sales_orders"
    
    sales_order_id = Column(BigInteger, primary_key=True, autoincrement=True)
    order_number = Column(String(64), unique=True, nullable=False)
    status = Column(String(20), default="COMPLETED", nullable=False)
    total_amount = Column(Numeric(12, 4), default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    items = relationship("SalesOrderItem", back_populates="order", cascade="all, delete-orphan")

class SalesOrderItem(Base):
    __tablename__ = "sales_order_items"
    
    item_id = Column(BigInteger, primary_key=True, autoincrement=True)
    sales_order_id = Column(BigInteger, ForeignKey("sales_orders.sales_order_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    quantity = Column(Numeric(12, 4), nullable=False)
    unit_price = Column(Numeric(12, 4), nullable=False)
    cost_price = Column(Numeric(12, 4), nullable=False)
    
    order = relationship("SalesOrder", back_populates="items")
    product = relationship("Product")

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    
    purchase_order_id = Column(BigInteger, primary_key=True, autoincrement=True)
    po_number = Column(String(64), unique=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=False)
    status = Column(String(20), default="ORDERED", nullable=False)
    ordered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expected_at = Column(DateTime, nullable=False)
    
    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")
    goods_receipts = relationship("GoodsReceipt", back_populates="purchase_order")

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    
    po_item_id = Column(BigInteger, primary_key=True, autoincrement=True)
    purchase_order_id = Column(BigInteger, ForeignKey("purchase_orders.purchase_order_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    quantity_ordered = Column(Numeric(12, 4), nullable=False)
    quantity_received = Column(Numeric(12, 4), default=0, nullable=False)
    unit_cost = Column(Numeric(12, 4), nullable=False)
    
    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product")

class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"
    
    receipt_id = Column(BigInteger, primary_key=True, autoincrement=True)
    purchase_order_id = Column(BigInteger, ForeignKey("purchase_orders.purchase_order_id"), nullable=False)
    delivery_note = Column(String(100), nullable=True)
    received_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    purchase_order = relationship("PurchaseOrder", back_populates="goods_receipts")
    items = relationship("GoodsReceiptItem", back_populates="receipt", cascade="all, delete-orphan")

class GoodsReceiptItem(Base):
    __tablename__ = "goods_receipt_items"
    
    receipt_item_id = Column(BigInteger, primary_key=True, autoincrement=True)
    receipt_id = Column(BigInteger, ForeignKey("goods_receipts.receipt_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    quantity_received = Column(Numeric(12, 4), nullable=False)
    
    receipt = relationship("GoodsReceipt", back_populates="items")
    product = relationship("Product")

class DailyDemand(Base):
    __tablename__ = "daily_demand"
    
    product_id = Column(Integer, ForeignKey("products.product_id", ondelete="CASCADE"), primary_key=True)
    demand_date = Column(Date, primary_key=True)
    quantity_sold = Column(Numeric(12, 4), default=0, nullable=False)
    stockout_flag = Column(Boolean, default=False, nullable=False)
    data_status = Column(String(25), default="NORMAL", nullable=False)
    
    product = relationship("Product", back_populates="daily_demands")

class DataQualityIssue(Base):
    __tablename__ = "data_quality_issues"
    
    issue_id = Column(BigInteger, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False)
    issue_type = Column(String(50), nullable=False)
    details = Column(Text, nullable=False)
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(20), default="FLAGGED", nullable=False)
    resolution_note = Column(Text, nullable=True)
    
    product = relationship("Product")

class ForecastRun(Base):
    __tablename__ = "forecast_runs"
    
    forecast_run_id = Column(BigInteger, primary_key=True, autoincrement=True)
    model_name = Column(String(50), nullable=False)
    horizon_days = Column(Integer, nullable=False)
    training_start = Column(Date, nullable=False)
    training_end = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    values = relationship("ForecastValue", back_populates="forecast_run", cascade="all, delete-orphan")
    metrics = relationship("ModelMetric", back_populates="forecast_run", cascade="all, delete-orphan")

class ForecastValue(Base):
    __tablename__ = "forecast_values"
    
    forecast_value_id = Column(BigInteger, primary_key=True, autoincrement=True)
    forecast_run_id = Column(BigInteger, ForeignKey("forecast_runs.forecast_run_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False)
    forecast_date = Column(Date, nullable=False)
    predicted_demand = Column(Numeric(12, 4), nullable=False)
    lower_bound = Column(Numeric(12, 4), nullable=True)
    upper_bound = Column(Numeric(12, 4), nullable=True)
    
    __table_args__ = (
        UniqueConstraint("forecast_run_id", "product_id", "forecast_date", name="uq_fr_prod_date"),
    )
    
    forecast_run = relationship("ForecastRun", back_populates="values")
    product = relationship("Product")

class ModelMetric(Base):
    __tablename__ = "model_metrics"
    
    metric_id = Column(BigInteger, primary_key=True, autoincrement=True)
    forecast_run_id = Column(BigInteger, ForeignKey("forecast_runs.forecast_run_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False)
    mae = Column(Numeric(10, 4), nullable=False)
    wape = Column(Numeric(10, 4), nullable=False)
    bias = Column(Numeric(10, 4), nullable=False)
    
    __table_args__ = (
        UniqueConstraint("forecast_run_id", "product_id", name="uq_mm_run_prod"),
    )
    
    forecast_run = relationship("ForecastRun", back_populates="metrics")
    product = relationship("Product")

class ReplenishmentRecommendation(Base):
    __tablename__ = "replenishment_recommendations"
    
    recommendation_id = Column(BigInteger, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False)
    current_on_hand = Column(Numeric(12, 4), nullable=False)
    current_on_order = Column(Numeric(12, 4), default=0, nullable=False)
    lead_time_days = Column(Integer, nullable=False)
    lead_time_demand = Column(Numeric(12, 4), nullable=False)
    safety_stock = Column(Numeric(12, 4), nullable=False)
    reorder_point = Column(Numeric(12, 4), nullable=False)
    recommended_qty = Column(Numeric(12, 4), nullable=False)
    reorder_deadline = Column(Date, nullable=False)
    stockout_risk_score = Column(Numeric(5, 2), nullable=False)
    explanation_text = Column(Text, nullable=False)
    status = Column(String(20), default="PENDING", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    product = relationship("Product", back_populates="recommendations")

class ScenarioRun(Base):
    __tablename__ = "scenario_runs"
    
    scenario_id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    demand_multiplier = Column(Numeric(5, 2), default=1.00, nullable=False)
    lead_time_delta_days = Column(Integer, default=0, nullable=False)
    safety_stock_factor = Column(Numeric(5, 2), default=1.00, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    results = relationship("ScenarioResult", back_populates="scenario", cascade="all, delete-orphan")

class ScenarioResult(Base):
    __tablename__ = "scenario_results"
    
    result_id = Column(BigInteger, primary_key=True, autoincrement=True)
    scenario_id = Column(BigInteger, ForeignKey("scenario_runs.scenario_id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False)
    simulated_stockout_risk = Column(Numeric(5, 2), nullable=False)
    projected_ending_stock = Column(Numeric(12, 4), nullable=False)
    estimated_holding_cost = Column(Numeric(12, 4), nullable=False)
    estimated_lost_sales_cost = Column(Numeric(12, 4), nullable=False)
    
    __table_args__ = (
        UniqueConstraint("scenario_id", "product_id", name="uq_sr_scen_prod"),
    )
    
    scenario = relationship("ScenarioRun", back_populates="results")
    product = relationship("Product")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    audit_id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(String(64), default="system", nullable=False)
    action = Column(String(50), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(64), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
