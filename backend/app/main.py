from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import (
    products, inventory, forecasting, replenishment, data_quality, simulation, benchmark
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Smart Inventory Management and Explainable Demand Forecasting System (PostgreSQL vs MySQL comparative evaluation)",
    version="1.0.0"
)

# Enable CORS for React frontend (Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all modules
app.include_router(products.router, prefix=settings.API_V1_STR)
app.include_router(inventory.router, prefix=settings.API_V1_STR)
app.include_router(forecasting.router, prefix=settings.API_V1_STR)
app.include_router(replenishment.router, prefix=settings.API_V1_STR)
app.include_router(data_quality.router, prefix=settings.API_V1_STR)
app.include_router(simulation.router, prefix=settings.API_V1_STR)
app.include_router(benchmark.router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "project": "StockSense",
        "status": "online",
        "docs_url": "/docs",
        "current_active_engine": settings.DB_ENGINE
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "engine": settings.DB_ENGINE}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
