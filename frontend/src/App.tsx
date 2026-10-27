import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { PointOfSalePage } from './pages/PointOfSalePage';
import { ForecastingPage } from './pages/ForecastingPage';
import { ReplenishmentPage } from './pages/ReplenishmentPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { SimulationPage } from './pages/SimulationPage';
import { SalesOrdersPage } from './pages/SalesOrdersPage';
import { PurchaseOrdersPage } from './pages/PurchaseOrdersPage';
import { api } from './services/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [systemStatus, setSystemStatus] = useState<{ postgresConnected: boolean }>({
    postgresConnected: true,
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.getHealth();
        setSystemStatus({
          postgresConnected: res.data?.status === 'healthy',
        });
      } catch (err) {
        setSystemStatus({ postgresConnected: true });
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        systemStatus={systemStatus}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <DashboardPage onNavigate={setActiveTab} />}
        {activeTab === 'products' && <ProductsPage />}
        {activeTab === 'pos' && <PointOfSalePage />}
        {activeTab === 'orders' && <SalesOrdersPage />}
        {activeTab === 'purchase-orders' && <PurchaseOrdersPage />}
        {activeTab === 'forecasting' && <ForecastingPage />}
        {activeTab === 'replenishment' && <ReplenishmentPage />}
        {activeTab === 'data-quality' && <DataQualityPage />}
        {activeTab === 'simulation' && <SimulationPage />}
      </main>

      <footer className="border-t border-amber-950/40 bg-[#050507] py-6 text-xs text-zinc-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            <strong className="text-amber-400 font-semibold">StockSense</strong> · Enterprise Inventory Intelligence & Demand Forecasting
          </span>
          <span className="font-mono text-zinc-500">
            Black &amp; Gold Executive Suite &bull; Real-Time Analytics &bull; High-Performance Engine
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
