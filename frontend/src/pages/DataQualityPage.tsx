import React, { useEffect, useState, useMemo } from 'react';
import { 
  ShieldCheck, AlertCircle, CheckCircle2, RefreshCw, Filter, 
  Check, X, Search, CheckCheck, FileText, AlertTriangle, HelpCircle,
  Download, ChevronLeft, ChevronRight, Layers, Sparkles, TrendingUp, Calendar,
  CheckSquare, Square
} from 'lucide-react';
import { api } from '../services/api';
import { DataQualityIssue, DataQualitySummary } from '../types';

export const DataQualityPage: React.FC = () => {
  const [issues, setIssues] = useState<DataQualityIssue[]>([]);
  const [summary, setSummary] = useState<DataQualitySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [bulkActing, setBulkActing] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('FLAGGED');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  // Pagination
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Multi-select for bulk actions
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadSummary = async () => {
    try {
      const res = await api.getAuditSummary();
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to load audit summary:', err);
    }
  };

  const loadIssues = async () => {
    setLoading(true);
    try {
      const res = await api.getIssues(
        statusFilter || undefined,
        typeFilter !== 'ALL' ? typeFilter : undefined,
        2000
      );
      setIssues(res.data || []);
      setSelectedIssueIds([]);
    } catch (err) {
      console.error('Failed to load quality issues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    loadIssues();
  }, [statusFilter, typeFilter]);

  // Run full series automated audit
  const handleRunAudit = async () => {
    setAuditing(true);
    setFeedback(null);
    try {
      const res: any = await api.auditAll();
      await loadSummary();
      await loadIssues();
      setFeedback({
        type: 'success',
        message: res.data?.message || 'Data quality audit complete! Scanned all historical daily demand series.'
      });
      setTimeout(() => setFeedback(null), 6000);
    } catch (err: any) {
      console.error('Audit failed:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to execute automated data quality audit.'
      });
    } finally {
      setAuditing(false);
    }
  };

  // Single issue resolution
  const handleResolve = async (issueId: number, action: 'APPROVED_CORRECTION' | 'IGNORED') => {
    try {
      await api.resolveIssue(
        issueId,
        action,
        action === 'APPROVED_CORRECTION' ? 'Imputed via rolling demand interpolation' : 'Marked as natural demand zero'
      );
      setIssues((prev) =>
        prev.map((it) => (it.issue_id === issueId ? { ...it, status: action } : it))
      );
      await loadSummary();
    } catch (err) {
      console.error('Failed to resolve issue:', err);
    }
  };

  // Bulk resolve all currently flagged records
  const handleApproveAllFlagged = async () => {
    setBulkActing(true);
    setFeedback(null);
    try {
      const res = await api.bulkResolveIssues({
        resolve_all_flagged: true,
        action: 'APPROVED_CORRECTION',
        resolution_note: 'Bulk approved rolling demand interpolation'
      });
      await loadSummary();
      await loadIssues();
      setFeedback({
        type: 'success',
        message: res.data?.message || 'Successfully approved all flagged data quality imputations.'
      });
      setTimeout(() => setFeedback(null), 6000);
    } catch (err: any) {
      console.error('Bulk resolve failed:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to bulk approve flagged issues.'
      });
    } finally {
      setBulkActing(false);
    }
  };

  // Bulk action on selected checkboxes
  const handleBulkSelectedAction = async (action: 'APPROVED_CORRECTION' | 'IGNORED') => {
    if (selectedIssueIds.length === 0) return;
    setBulkActing(true);
    setFeedback(null);
    try {
      const res = await api.bulkResolveIssues({
        issue_ids: selectedIssueIds,
        action,
        resolution_note: action === 'APPROVED_CORRECTION' ? 'Batch approved rolling interpolation' : 'Batch ignored by operator'
      });
      await loadSummary();
      await loadIssues();
      setSelectedIssueIds([]);
      setFeedback({
        type: 'success',
        message: res.data?.message || `Successfully processed ${selectedIssueIds.length} issues.`
      });
      setTimeout(() => setFeedback(null), 6000);
    } catch (err: any) {
      console.error('Bulk selected action failed:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to process selected issues.'
      });
    } finally {
      setBulkActing(false);
    }
  };

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((i) => {
      if (i.category_name) set.add(i.category_name);
    });
    return Array.from(set).sort();
  }, [issues]);

  // Filtered issues list
  const filteredIssues = useMemo(() => {
    const term = search.toLowerCase().trim();
    return issues.filter((i) => {
      if (categoryFilter !== 'ALL' && i.category_name !== categoryFilter) return false;
      if (!term) return true;
      return (
        i.product_name.toLowerCase().includes(term) ||
        i.sku.toLowerCase().includes(term) ||
        i.issue_type.toLowerCase().includes(term) ||
        i.details.toLowerCase().includes(term)
      );
    });
  }, [issues, categoryFilter, search]);

  // Pagination calculation
  const totalItems = filteredIssues.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedIssues = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredIssues.slice(start, start + pageSize);
  }, [filteredIssues, currentPage, pageSize]);

  // Checkbox helpers
  const isAllPageSelected = paginatedIssues.length > 0 && paginatedIssues.every((i) => selectedIssueIds.includes(i.issue_id));
  const toggleSelectAllPage = () => {
    if (isAllPageSelected) {
      const pageIds = new Set(paginatedIssues.map((i) => i.issue_id));
      setSelectedIssueIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newSelected = new Set(selectedIssueIds);
      paginatedIssues.forEach((i) => newSelected.add(i.issue_id));
      setSelectedIssueIds(Array.from(newSelected));
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIssueIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 1-Click Export CSV
  const handleExportCSV = () => {
    if (filteredIssues.length === 0) return;

    const headers = [
      'Issue ID',
      'SKU',
      'Product Name',
      'Department',
      'Issue Category',
      'Diagnostic Evidence',
      'Status',
      'Resolution Note',
      'Detected Date'
    ];

    const rows = filteredIssues.map((i) => [
      i.issue_id,
      `"${i.sku}"`,
      `"${i.product_name.replace(/"/g, '""')}"`,
      `"${i.category_name || 'General'}"`,
      `"${i.issue_type}"`,
      `"${i.details.replace(/"/g, '""')}"`,
      `"${i.status}"`,
      `"${(i.resolution_note || '').replace(/"/g, '""')}"`,
      `"${i.detected_at || ''}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `data_quality_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const flaggedCount = summary?.flagged ?? issues.filter((i) => i.status === 'FLAGGED').length;
  const approvedCount = summary?.approved ?? issues.filter((i) => i.status === 'APPROVED_CORRECTION').length;
  const stockoutCensoredCount = summary?.censored_zeros ?? issues.filter((i) => i.issue_type === 'STOCKOUT_CENSORED').length;
  const anomalyCount = summary?.anomaly_spikes ?? issues.filter((i) => i.issue_type === 'ANOMALY_SPIKE').length;

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-medium shadow-2xl animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-600/50 text-emerald-200'
              : 'bg-rose-950/90 border border-rose-600/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-400" />
            Data Quality & Censored Demand Cleansing
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Detect and impute artificial zero-sales during stockouts and spike anomalies before AI forecasting
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {flaggedCount > 0 && (
            <button
              type="button"
              onClick={handleApproveAllFlagged}
              disabled={bulkActing}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-600/25 transition disabled:opacity-50"
              title="Automatically approve interpolation for all flagged entries"
            >
              <CheckCheck className={`w-4 h-4 ${bulkActing ? 'animate-spin' : ''}`} />
              <span>Approve All Flagged ({flaggedCount.toLocaleString()})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredIssues.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition shadow disabled:opacity-40"
            title="Download CSV audit log"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Export Audit CSV</span>
          </button>

          <button
            type="button"
            onClick={handleRunAudit}
            disabled={auditing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition shadow-lg shadow-purple-600/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${auditing ? 'animate-spin' : ''}`} />
            <span>{auditing ? 'Scanning Series...' : 'Run Full Series Audit'}</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Deck */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Flagged Issues */}
        <div 
          onClick={() => setStatusFilter('FLAGGED')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 hover:border-amber-500/60 transition cursor-pointer space-y-1 shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Flagged for Review</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400 font-mono">{flaggedCount.toLocaleString()}</span>
            <span className="text-xs text-amber-400/80">records</span>
          </div>
          <span className="text-[11px] text-slate-500 block">Pending operator review or auto-impute</span>
        </div>

        {/* Stockout Censored Zeros */}
        <div 
          onClick={() => { setStatusFilter(''); setTypeFilter('STOCKOUT_CENSORED'); }}
          className="p-4 rounded-2xl bg-slate-900/90 border border-rose-500/30 hover:border-rose-500/60 transition cursor-pointer space-y-1 shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Censored Zero-Demand Days</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400 font-mono">{stockoutCensoredCount.toLocaleString()}</span>
            <span className="text-xs text-rose-400/80">days</span>
          </div>
          <span className="text-[11px] text-slate-500 block">Artificial zeroes during stockouts</span>
        </div>

        {/* Anomaly Spikes */}
        <div 
          onClick={() => { setStatusFilter(''); setTypeFilter('ANOMALY_SPIKE'); }}
          className="p-4 rounded-2xl bg-slate-900/90 border border-purple-500/30 hover:border-purple-500/60 transition cursor-pointer space-y-1 shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Demand Anomaly Spikes</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-400 font-mono">{anomalyCount.toLocaleString()}</span>
            <span className="text-xs text-purple-400/80">spikes</span>
          </div>
          <span className="text-[11px] text-slate-500 block">Sales &gt; 3 standard deviations above mean</span>
        </div>

        {/* Approved Imputations */}
        <div 
          onClick={() => setStatusFilter('APPROVED_CORRECTION')}
          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition cursor-pointer space-y-1 shadow-lg"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Approved Imputations</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">{approvedCount.toLocaleString()}</span>
            <span className="text-xs text-emerald-400/80">points</span>
          </div>
          <span className="text-[11px] text-slate-500 block">Cleaned series utilized for AI models</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        {/* Top Filter Row: Search & Status Tabs */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by SKU, product, or reason..."
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 w-full md:w-auto overflow-x-auto">
            {[
              { id: 'FLAGGED', label: `Flagged (${flaggedCount.toLocaleString()})` },
              { id: 'APPROVED_CORRECTION', label: `Approved (${approvedCount.toLocaleString()})` },
              { id: 'IGNORED', label: 'Ignored' },
              { id: '', label: 'All Records' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  statusFilter === tab.id
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Type Filter Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">Issue Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-medium"
            >
              <option value="ALL">All Categories</option>
              <option value="STOCKOUT_CENSORED">Stockout Censored Zeros</option>
              <option value="ANOMALY_SPIKE">Demand Spikes (&gt;3σ)</option>
              <option value="MISSING_DATE">Missing Dates</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider shrink-0 mr-1">
            Department:
          </span>
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
              categoryFilter === 'ALL'
                ? 'bg-purple-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Departments
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
                categoryFilter === cat
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Floating Selected Batch Actions Bar */}
      {selectedIssueIds.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-slate-800/95 border border-purple-500/40 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-white">
            <CheckSquare className="w-4 h-4 text-purple-400" />
            <span>{selectedIssueIds.length} issues selected on current view</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkSelectedAction('APPROVED_CORRECTION')}
              disabled={bulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve Selected</span>
            </button>
            <button
              type="button"
              onClick={() => handleBulkSelectedAction('IGNORED')}
              disabled={bulkActing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-xs transition disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              <span>Ignore Selected</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIssueIds([])}
              className="text-xs text-slate-400 hover:text-white px-2 py-1"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Issues Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAllPage}
                    className="text-slate-400 hover:text-white"
                    title={isAllPageSelected ? 'Deselect Page' : 'Select Page'}
                  >
                    {isAllPageSelected ? (
                      <CheckSquare className="w-4 h-4 text-purple-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">SKU / Product</th>
                <th className="py-3.5 px-4">Issue Category</th>
                <th className="py-3.5 px-4">Diagnostic Evidence</th>
                <th className="py-3.5 px-4">Detected Date</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Human Audit Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
                    Loading audit records...
                  </td>
                </tr>
              ) : paginatedIssues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-sm font-semibold text-slate-300">No data quality issues found</p>
                    <p className="text-xs text-slate-500 mt-1">All demand records in this category pass quality checks.</p>
                  </td>
                </tr>
              ) : (
                paginatedIssues.map((issue) => {
                  const isSelected = selectedIssueIds.includes(issue.issue_id);

                  return (
                    <tr 
                      key={issue.issue_id} 
                      className={`hover:bg-slate-800/40 transition ${isSelected ? 'bg-purple-950/20' : ''}`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectRow(issue.issue_id)}
                          className="text-slate-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-purple-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-300 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                            {issue.sku}
                          </span>
                          {issue.category_name && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                              {issue.category_name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white font-medium mt-1">{issue.product_name}</p>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            issue.issue_type === 'STOCKOUT_CENSORED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : issue.issue_type === 'ANOMALY_SPIKE'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                          }`}
                        >
                          {issue.issue_type === 'STOCKOUT_CENSORED' && <AlertTriangle className="w-3 h-3" />}
                          {issue.issue_type === 'ANOMALY_SPIKE' && <TrendingUp className="w-3 h-3" />}
                          {issue.issue_type === 'MISSING_DATE' && <Calendar className="w-3 h-3" />}
                          {issue.issue_type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 max-w-md">
                        <p className="leading-relaxed">{issue.details}</p>
                        {issue.resolution_note && (
                          <div className="mt-1 text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                            <Check className="w-3 h-3 shrink-0" />
                            <span>Resolution: {issue.resolution_note}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {issue.detected_at ? new Date(issue.detected_at).toLocaleDateString() : 'N/A'}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                            issue.status === 'FLAGGED'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
                              : issue.status === 'APPROVED_CORRECTION'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {issue.status === 'APPROVED_CORRECTION' ? 'Imputed' : issue.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {issue.status === 'FLAGGED' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleResolve(issue.issue_id, 'APPROVED_CORRECTION')}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-600/20"
                              title="Approve demand interpolation"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolve(issue.issue_id, 'IGNORED')}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium transition"
                              title="Ignore anomaly"
                            >
                              <X className="w-3.5 h-3.5" /> Ignore
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleResolve(issue.issue_id, 'FLAGGED' as any)}
                            className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/80 transition"
                          >
                            Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Showing</span>
            <span className="font-mono text-white font-semibold">
              {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </span>
            <span>to</span>
            <span className="font-mono text-white font-semibold">
              {Math.min(currentPage * pageSize, totalItems)}
            </span>
            <span>of</span>
            <span className="font-mono text-white font-semibold">{totalItems.toLocaleString()}</span>
            <span>records</span>

            <span className="mx-2 text-slate-700">|</span>

            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-mono text-xs px-2 text-slate-300">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
