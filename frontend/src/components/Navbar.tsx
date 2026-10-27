import React from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, TrendingUp, 
  AlertTriangle, ShieldCheck, Sliders, Activity,
  Receipt, Truck, Crown
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  systemStatus: {
    postgresConnected: boolean;
    mysqlConnected?: boolean;
  };
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, systemStatus }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products & Stock', icon: Package },
    { id: 'pos', label: 'Point of Sale', icon: ShoppingCart },
    { id: 'orders', label: 'Sales History', icon: Receipt },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: Truck },
    { id: 'forecasting', label: 'Demand Forecast', icon: TrendingUp },
    { id: 'replenishment', label: 'Replenishment', icon: AlertTriangle },
    { id: 'data-quality', label: 'Data Quality', icon: ShieldCheck },
    { id: 'simulation', label: 'What-If Scenarios', icon: Sliders },
  ];

  return (
    <header className="bg-[#0a0a0f]/95 backdrop-blur-md border-b border-amber-500/20 sticky top-0 z-50 shadow-2xl shadow-black/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Crown className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl font-black bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent tracking-tight">
                StockSense
              </span>
              <span className="hidden sm:inline-block ml-2.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-inner">
                Black &amp; Gold Edition
              </span>
            </div>
          </div>

          {/* Engine Status Indicator */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/60 border border-amber-500/20 shadow-inner">
              <span className={`w-2.5 h-2.5 rounded-full ${systemStatus.postgresConnected ? 'bg-amber-400 shadow-[0_0_10px_#f59e0b]' : 'bg-red-500'}`} />
              <span className="text-amber-200/90 font-mono text-[11px]">System Online</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1.5 overflow-x-auto pb-2 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black shadow-lg shadow-amber-500/25 font-bold scale-[1.02]'
                    : 'text-zinc-400 hover:text-amber-200 hover:bg-white/[0.04] border border-transparent hover:border-amber-500/20'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-black stroke-[2.5]' : 'text-amber-400/70'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
