# StockSense: Smart Inventory & Demand Forecasting

[![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL-18.0-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.3-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**StockSense** is an enterprise-grade retail inventory optimization and demand forecasting suite. Engineered for supermarkets, grocery chains, and multi-department retail operations, StockSense bridges modern data science algorithms (Holt-Winters, Croston, Moving Averages) directly with day-to-day warehouse replenishments, dock receipts, and point-of-sale checkout workflows.

---

## Key Highlights & Architectural Innovations

### 1. Unified Single-Database Architecture
- **Single Database (PostgreSQL 18)**: Normalized 3NF transactional schema with high-performance indexes on `(product_id, demand_date DESC)` and `(status, created_at DESC)`.
- **Zero N+1 Query Overhead**: Comprehensive `joinedload` relationships across catalog items, suppliers, sales lines, and audit logs.
- **Atomic Operations**: Double-entry stock balance movements preventing race conditions and concurrent overselling via `SELECT FOR UPDATE`.

### 2. Modern 9-Feature Executive Suite (Black & Gold Theme)

| # | Module | Core Functionality |
|---|---|---|
| **1** | **Executive Dashboard** | Real-time catalog valuation, SKU health meter, critical restock queue, and operational telemetry. |
| **2** | **Products & Stock** | Urgency sorting, inline stock coverage meters, and 2-way CSV reconciliation (Stocktake Count Replacement vs Additive Adjustment). |
| **3** | **Point of Sale (POS)** | Card catalog grid (~65%), instant category pills, stock availability limit guards, and itemized checkout register slip (~35%). |
| **4** | **Sales Orders & History** | Mutually exclusive filtering modes (Time Frame without order caps vs Order Count), drawer receipt breakdown, and 1-click CSV export. |
| **5** | **Purchase Orders** | Scheduled vendor restocks, ETA countdown badges (*Overdue*, *Arriving Today*, *Expected in Xd*), and 1-click dock delivery check-in. |
| **6** | **Demand Forecasting** | Multi-model forecasting engine (Holt-Winters, EMA-14, SMA-7, SMA-14, Croston, Naive), stockout depletion curves, and $< 14$ days data guardrail. |
| **7** | **Replenishment Recommendations** | Reorder Point formula ($ROP = LTD + SS$), 1-click PO conversion, inline quantity steppers, and automated bulk grouping by primary supplier. |
| **8** | **Data Quality & Cleansing** | Stockout-censored zero detection, demand spike outliers ($>3\sigma$), sub-20ms atomic bulk resolution, and multi-page pagination. |
| **9** | **What-If Scenarios & Simulation** | Monte Carlo shock engine, demand surge sliders, supplier freeze delays, and holding cost vs lost margin trade-off metrics. |

---

## Technology Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, NumPy, Uvicorn, Pytest.
- **Frontend**: React 18, TypeScript, Vite 8, Tailwind CSS v4, Lucide React, Recharts.
- **Database**: PostgreSQL 18.
- **Design System**: Black & Gold Executive Suite (`#070709` deep onyx canvas, `#0b0b10` elevated cards, `#d4af37` 24k metallic gold accents).

---

## Quickstart Guide

### 1. Clone the Repository
```bash
git clone https://github.com/ashwinchahar/Smart-inventory-and-demand-forecasting.git
cd Smart-inventory-and-demand-forecasting
```

### 2. Database Setup (PostgreSQL 18)
Create a database named `stocksense` in PostgreSQL and run the schema initialization script:
```bash
psql -U postgres -d stocksense -f database/postgres/01_schema.sql
```

### 3. Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate   # On Windows (or source venv/bin/activate on Linux/macOS)
pip install -r requirements.txt

# Copy example environment configuration
cp .env.example .env
# Edit .env with your local PostgreSQL password

# Start FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at `http://127.0.0.1:8000/docs`.

### 4. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Running the Automated Test Suite

The test suite validates data quality censoring detection, multi-model demand forecasts, concurrent overselling prevention, dock receipts, and bulk PO generation:
```bash
cd backend
.\venv\Scripts\pytest tests
```

---

## License

This project is licensed under the [MIT License](LICENSE).
