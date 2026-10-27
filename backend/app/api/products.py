from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.inventory import Category, Product, Supplier, ProductSupplier, StockBalance
from app.schemas.inventory import (
    CategoryResponse, CategoryCreate,
    ProductResponse, ProductCreate,
    SupplierResponse, SupplierCreate,
    ProductSupplierResponse, ProductSupplierCreate
)

router = APIRouter(prefix="/products", tags=["Products & Catalog"])

@router.get("/categories", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.name.asc()).all()

@router.post("/categories", response_model=CategoryResponse)
def create_category(cat: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(Category).filter(Category.name == cat.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists.")
    c = Category(name=cat.name, description=cat.description)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@router.get("/suppliers", response_model=List[SupplierResponse])
def list_suppliers(db: Session = Depends(get_db)):
    return db.query(Supplier).order_by(Supplier.name.asc()).all()

@router.post("/suppliers", response_model=SupplierResponse)
def create_supplier(supp: SupplierCreate, db: Session = Depends(get_db)):
    s = Supplier(name=supp.name, contact_email=supp.contact_email, contact_phone=supp.contact_phone)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.get("", response_model=List[ProductResponse])
def list_products(
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = (
        db.query(
            Product,
            Category.name.label("category_name"),
            func.coalesce(StockBalance.on_hand_qty, Decimal("0.0000")).label("on_hand_qty"),
            func.coalesce(StockBalance.reserved_qty, Decimal("0.0000")).label("reserved_qty")
        )
        .join(Category, Category.category_id == Product.category_id)
        .outerjoin(StockBalance, (StockBalance.product_id == Product.product_id) & (StockBalance.warehouse_id == 1))
    )

    if category_id:
        query = query.filter(Product.category_id == category_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))

    results = query.order_by(Product.product_id.asc()).all()

    response = []
    for p, cat_name, on_hand, reserved in results:
        resp = ProductResponse(
            product_id=p.product_id,
            sku=p.sku,
            name=p.name,
            category_id=p.category_id,
            unit=p.unit,
            cost_price=p.cost_price,
            selling_price=p.selling_price,
            reorder_threshold=p.reorder_threshold,
            is_active=p.is_active,
            created_at=p.created_at,
            category_name=cat_name,
            on_hand_qty=on_hand,
            reserved_qty=reserved
        )
        response.append(resp)
    return response

@router.post("", response_model=ProductResponse)
def create_product(prod: ProductCreate, db: Session = Depends(get_db)):
    existing = db.query(Product).filter(Product.sku == prod.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product with this SKU already exists.")

    p = Product(
        sku=prod.sku,
        name=prod.name,
        category_id=prod.category_id,
        unit=prod.unit,
        cost_price=prod.cost_price,
        selling_price=prod.selling_price,
        reorder_threshold=prod.reorder_threshold,
        is_active=prod.is_active
    )
    db.add(p)
    db.flush()

    # Initialize zero stock balance for warehouse 1
    bal = StockBalance(product_id=p.product_id, warehouse_id=1, on_hand_qty=0, reserved_qty=0)
    db.add(bal)
    db.commit()
    db.refresh(p)

    cat = db.query(Category).filter(Category.category_id == p.category_id).first()
    return ProductResponse(
        product_id=p.product_id,
        sku=p.sku,
        name=p.name,
        category_id=p.category_id,
        unit=p.unit,
        cost_price=p.cost_price,
        selling_price=p.selling_price,
        reorder_threshold=p.reorder_threshold,
        is_active=p.is_active,
        created_at=p.created_at,
        category_name=cat.name if cat else None,
        on_hand_qty=Decimal("0.0000"),
        reserved_qty=Decimal("0.0000")
    )
