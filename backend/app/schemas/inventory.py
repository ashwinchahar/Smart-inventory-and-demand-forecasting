from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field

# Category Schemas
class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    category_id: int
    created_at: datetime
    class Config:
        from_attributes = True

# Product Schemas
class ProductBase(BaseModel):
    sku: str
    name: str
    category_id: int
    unit: str = "unit"
    cost_price: Decimal = Field(..., ge=0)
    selling_price: Decimal = Field(..., ge=0)
    reorder_threshold: Decimal = Field(default=Decimal("0.0000"), ge=0)
    is_active: bool = True

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    product_id: int
    created_at: datetime
    category_name: Optional[str] = None
    on_hand_qty: Optional[Decimal] = Decimal("0.0000")
    reserved_qty: Optional[Decimal] = Decimal("0.0000")
    class Config:
        from_attributes = True

# Supplier Schemas
class SupplierBase(BaseModel):
    name: str
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

class SupplierCreate(SupplierBase):
    pass

class SupplierResponse(SupplierBase):
    supplier_id: int
    created_at: datetime
    class Config:
        from_attributes = True

# ProductSupplier Terms
class ProductSupplierCreate(BaseModel):
    product_id: int
    supplier_id: int
    lead_time_days: int = Field(..., ge=0)
    minimum_order_qty: Decimal = Field(default=Decimal("1.0000"), gt=0)
    pack_size: Decimal = Field(default=Decimal("1.0000"), gt=0)
    is_primary: bool = False

class ProductSupplierResponse(ProductSupplierCreate):
    supplier_name: Optional[str] = None
    class Config:
        from_attributes = True

# Sales Transaction Schemas
class SaleItemRequest(BaseModel):
    product_id: Optional[int] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    quantity: Decimal = Field(..., gt=0)
    unit_price: Optional[Decimal] = None  # If None, use current product selling_price

class SaleCreateRequest(BaseModel):
    order_number: Optional[str] = None
    warehouse_id: int = 1
    counter_id: Optional[str] = None
    items: List[SaleItemRequest]

class SalesUploadResponse(BaseModel):
    total_rows_parsed: int
    records_ingested: int
    products_affected: int
    new_products_created: int
    date_min: Optional[str] = None
    date_max: Optional[str] = None
    message: str

class StockUploadResponse(BaseModel):
    total_rows_parsed: int
    products_updated: int
    unmatched_rows: int
    total_units_before: float
    total_units_after: float
    message: str

class SalesOrderItemResponse(BaseModel):
    item_id: int
    product_id: int
    product_name: Optional[str] = None
    sku: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    cost_price: Decimal
    class Config:
        from_attributes = True

class SalesOrderResponse(BaseModel):
    sales_order_id: int
    order_number: str
    status: str
    total_amount: Decimal
    created_at: datetime
    items: List[SalesOrderItemResponse] = []
    class Config:
        from_attributes = True

# Purchasing & Goods Receipt Schemas
class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    quantity_ordered: Decimal = Field(..., gt=0)
    unit_cost: Decimal = Field(..., ge=0)

class PurchaseOrderCreate(BaseModel):
    po_number: Optional[str] = None
    supplier_id: int
    expected_at: datetime
    items: List[PurchaseOrderItemCreate]

class GoodsReceiptItemCreate(BaseModel):
    product_id: int
    quantity_received: Decimal = Field(..., gt=0)

class GoodsReceiptCreate(BaseModel):
    purchase_order_id: int
    warehouse_id: int = 1
    delivery_note: Optional[str] = None
    items: List[GoodsReceiptItemCreate]

# Stock Movement & Ledger Schemas
class StockMovementResponse(BaseModel):
    movement_id: int
    product_id: int
    product_name: Optional[str] = None
    warehouse_id: int
    movement_type: str
    quantity_delta: Decimal
    reference_type: str
    reference_id: int
    occurred_at: datetime
    class Config:
        from_attributes = True

# Reconciliation Schema
class ReconciliationItem(BaseModel):
    product_id: int
    sku: str
    name: str
    stored_on_hand: Decimal
    ledger_sum: Decimal
    discrepancy: Decimal
    is_reconciled: bool

class ReconciliationResponse(BaseModel):
    total_products_checked: int
    discrepancy_count: int
    items: List[ReconciliationItem]
