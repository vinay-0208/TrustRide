import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
  FileText, IndianRupee, TrendingDown, XCircle, AlertTriangle,
  CheckCircle, Search, RefreshCw, LayoutDashboard,
  Shield, Activity, Settings, BarChart2, Server, Map, FileSearch,
  ChevronRight, ShieldCheck, User, Info
} from 'lucide-react';

import {
  isValidFiniteNumber,
  isRecordCancelled,
  formatINR,
  getValidQuotedFare,
  getValidFinalFare,
  getValidPromisedEarnings,
  getValidActualEarnings,
  calculateFareDiscrepancy,
  calculateEarningsVariance
} from './financialValidation';

const API_BASE = "http://localhost:8000/api/trust";
const SOCKET_URL = "http://localhost:8000";

const renderVarianceBadge = (val, label = '') => {
  if (!isValidFiniteNumber(val)) {
    return (
      <span className="font-mono text-slate-400">
        {label ? `${label}: ` : ''}—
      </span>
    );
  }
  const num = Number(val);
  if (num === 0) {
    return (
      <span className="font-mono text-slate-500 font-medium">
        {label ? `${label}: ` : ''}±₹0
      </span>
    );
  }
  const isPositive = num > 0;
  return (
    <span className={`font-mono font-bold ${isPositive ? 'text-rose-600' : 'text-amber-600'}`}>
      {label ? `${label}: ` : ''}{formatINR(num, { showSign: true })}
    </span>
  );
};

const getReviewContext = (trip) => {
  if (!trip) return null;
  if (trip.after?.cancellation?.cancelled) {
    const actor = trip.after.cancellation.cancelledBy ? `by ${trip.after.cancellation.cancelledBy}` : '';
    const reason = trip.after.cancellation.reason;
    if (reason) {
      return `Cancellation: ${reason}${actor ? ` (${actor})` : ''}`;
    }
    return `Trip cancelled${actor ? ` (${actor})` : ''}`;
  }
  if (trip.routeDeviation && typeof trip.routeDeviation === 'number' && trip.routeDeviation > 0) {
    return `Route deviation detected (${trip.routeDeviation} km)`;
  }
  if (trip.routeDeviation === true) {
    return 'Route deviation flagged';
  }
  if (typeof trip.fareDiscrepancy === 'number' && trip.fareDiscrepancy !== 0) {
    return `Fare variance (${formatINR(trip.fareDiscrepancy, { showSign: true })})`;
  }
  if (typeof trip.earningsDiscrepancy === 'number' && trip.earningsDiscrepancy !== 0) {
    return `Earnings mismatch (${formatINR(trip.earningsDiscrepancy, { showSign: true })})`;
  }
  if (trip.before?.quotedFare === null && trip.after?.finalFare === null) {
    return 'Incomplete telemetry: unquoted fare';
  }
  if (Array.isArray(trip.events)) {
    const warnEvt = trip.events.find(e => e.severity === 'WARN' || e.severity === 'ERROR');
    if (warnEvt?.description) {
      return warnEvt.description;
    }
  }
  return null;
};

const TAB_METADATA = {
  overview: {
    title: 'Executive Overview',
    subtitle: 'High-level transparency metrics and operational health summary'
  },
  records: {
    title: 'Trust Records Audit',
    subtitle: 'Immutable trip lifecycle audit logs and integrity analysis'
  },
  fare: {
    title: 'Fare Integrity',
    subtitle: 'Upfront quoted fare locking vs post-trip settlement verification'
  },
  cancellations: {
    title: 'Cancellation Intelligence',
    subtitle: 'Audited cancellation events, actor attribution and reason telemetry'
  },
  earnings: {
    title: 'Earnings Transparency',
    subtitle: 'Promised driver earnings vs actual platform payouts (80% driver / 20% platform)'
  },
  ops: {
    title: 'Live Operations',
    subtitle: 'Real-time dispatch and active trip monitoring via Socket.IO'
  },
  insights: {
    title: 'Insights & Analytics',
    subtitle: 'Aggregate platform integrity distributions and volume proportions'
  },
  settings: {
    title: 'System Settings',
    subtitle: 'Backend infrastructure, storage backend mode, and platform diagnostics'
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [storageMode, setStorageMode] = useState('unknown');

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const t = Date.now();
      const [overviewRes, tripsRes, healthRes] = await Promise.all([
        axios.get(`${API_BASE}/dashboard/overview`, { params: { _t: t } }),
        axios.get(`${API_BASE}/trips`, { params: { _t: t } }),
        axios.get(`${API_BASE}/health`, { params: { _t: t } }).catch(() => null)
      ]);
      setOverview(overviewRes.data.data);
      setTrips(tripsRes.data.data);
      if (healthRes && healthRes.data) {
        setStorageMode(healthRes.data.storage || 'firestore');
      }
      setConnected(true);
    } catch (err) {
      console.error('Error fetching data:', err);
      setConnected(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("trust:updated", () => fetchData(false));
    return () => socket.disconnect();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-700 font-medium">
        <RefreshCw className="animate-spin mr-3 text-teal-600" size={20} /> Loading TrustRide Intelligence...
      </div>
    );
  }

  const currentTabMeta = TAB_METADATA[activeTab] || {
    title: activeTab.charAt(0).toUpperCase() + activeTab.slice(1),
    subtitle: 'Unified Transparency Layer'
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#0a192f] text-slate-300 flex flex-col border-r border-slate-800 shadow-xl z-20 transition-all shrink-0">
        <div className="p-5 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5 text-white mb-1">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white leading-none">TrustRide</h1>
              <div className="text-[10px] font-semibold text-teal-400 tracking-wider mt-1 uppercase">Transparency Engine</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-6 no-scrollbar">
          <NavSection title="OVERVIEW">
            <NavItem icon={<LayoutDashboard size={16}/>} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          </NavSection>

          <NavSection title="TRUST INTELLIGENCE">
            <NavItem icon={<FileSearch size={16}/>} label="Trust Records" active={activeTab === 'records'} onClick={() => setActiveTab('records')} />
            <NavItem icon={<IndianRupee size={16}/>} label="Fare Integrity" active={activeTab === 'fare'} onClick={() => setActiveTab('fare')} />
            <NavItem icon={<XCircle size={16}/>} label="Cancellations" active={activeTab === 'cancellations'} onClick={() => setActiveTab('cancellations')} />
            <NavItem icon={<TrendingDown size={16}/>} label="Earnings" active={activeTab === 'earnings'} onClick={() => setActiveTab('earnings')} />
          </NavSection>

          <NavSection title="OPERATIONS & ANALYTICS">
            <NavItem icon={<Map size={16}/>} label="Live Operations" active={activeTab === 'ops'} onClick={() => setActiveTab('ops')} />
            <NavItem icon={<BarChart2 size={16}/>} label="Insights & Reports" active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} />
          </NavSection>

          <NavSection title="SYSTEM">
            <NavItem icon={<Settings size={16}/>} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </NavSection>
        </nav>

        <div className="p-4 border-t border-slate-800/80 text-xs bg-slate-900/40">
          <div className="flex items-center gap-2 text-slate-300 font-medium mb-1">
            <User size={13} className="text-teal-400" />
            <span>Admin Operator</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Trust Console</span>
            <span className="text-slate-400">v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* Main Viewport Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
        {/* Top Header */}
        <header className="bg-white px-8 py-4 border-b border-slate-200 flex justify-between items-center shadow-xs z-10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {currentTabMeta.title}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {currentTabMeta.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 text-xs font-medium border-r border-slate-200 pr-4">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold border ${
                connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                  : 'bg-rose-50 text-rose-700 border-rose-200/70'
              }`}>
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {connected ? 'Live Sync' : 'Disconnected'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-slate-600 bg-slate-100 border border-slate-200/80 font-mono text-[11px] font-semibold">
                <Server size={12} className="text-slate-500" />
                {storageMode.toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100/80 text-teal-700 border border-teal-200/80 rounded-lg transition-colors font-semibold text-xs shadow-2xs active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* Workspace Canvas */}
        <main className="flex-1 overflow-y-auto bg-[#F8FAFC] p-8">
          {activeTab === 'overview' && overview && <OverviewTab overview={overview} />}
          {activeTab === 'records' && trips && <RecordsTab trips={trips} />}
          {activeTab === 'fare' && <FareTab overview={overview} trips={trips} />}
          {activeTab === 'cancellations' && <CancellationsTab overview={overview} trips={trips} />}
          {activeTab === 'earnings' && <EarningsTab overview={overview} trips={trips} />}
          {activeTab === 'ops' && trips && <LiveOpsTab trips={trips} />}
          {activeTab === 'insights' && overview && <InsightsTab overview={overview} />}
          {activeTab === 'settings' && <SettingsTab connected={connected} storageMode={storageMode} />}
        </main>
      </div>
    </div>
  );
}

// --- TAB COMPONENTS ---

function OverviewTab({ overview }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top 5 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Total Trips" value={overview.overview?.totalTrips || 0} icon={<Map size={18} />} color="text-teal-600" bg="bg-teal-50" subtitle="All recorded rides" />
        <KpiCard title="Fare Discrepancies" value={overview.fareIntegrity?.discrepancyCount || 0} icon={<IndianRupee size={18} />} color="text-rose-600" bg="bg-rose-50" subtitle="Quoted vs settled" />
        <KpiCard title="Earnings Mismatches" value={overview.earnings?.mismatchCount || 0} icon={<TrendingDown size={18} />} color="text-orange-600" bg="bg-orange-50" subtitle="Payout variance" />
        <KpiCard title="Cancellations" value={overview.cancellations?.total || 0} icon={<XCircle size={18} />} color="text-amber-600" bg="bg-amber-50" subtitle="Rider & driver total" />
        <KpiCard title="Requires Review" value={overview.trustStatus?.review || 0} icon={<AlertTriangle size={18} />} color="text-purple-600" bg="bg-purple-50" subtitle="Trust audit state" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <PillarCard title="Fare Integrity" icon={<IndianRupee size={18} className="text-teal-600"/>} accent="border-teal-500">
            <StatRow label="Discrepancy Count" value={overview.fareIntegrity?.discrepancyCount || 0} />
            <StatRow label="Total Disputed Amount" value={formatINR(overview.fareIntegrity?.discrepancyAmount, { fallback: '₹0' })} bold valueColor="text-rose-600" />
            <StatRow label="Total Quoted Fares" value={formatINR(overview.fareIntegrity?.totalQuoted, { fallback: '₹0' })} />
            <StatRow label="Total Final Fares" value={formatINR(overview.fareIntegrity?.totalFinal, { fallback: '₹0' })} />
          </PillarCard>

          <PillarCard title="Cancellation Intelligence" icon={<XCircle size={18} className="text-amber-500"/>} accent="border-amber-500">
            <StatRow label="Total Cancellations" value={overview.cancellations?.total || 0} bold />
            <StatRow label="Rider Initiated" value={overview.cancellations?.rider || 0} />
            <StatRow label="Driver Initiated" value={overview.cancellations?.driver || 0} />
            <div className="pt-3 mt-3 border-t border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Top Recorded Reasons</div>
                {overview.cancellations?.reasons?.length > 0 && (
                  <span className="text-[10px] font-mono text-slate-400 font-semibold">{overview.cancellations.reasons.length} Total</span>
                )}
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {overview.cancellations?.reasons && overview.cancellations.reasons.length > 0 ? (
                  overview.cancellations.reasons.map((r, i) => (
                    <div key={i} className="flex justify-between items-center text-xs py-1 px-1.5 rounded hover:bg-slate-50 transition-colors">
                      <span className="text-slate-600 truncate mr-2" title={r.reason}>{r.reason}</span>
                      <span className="font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono shrink-0">{r.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400">No cancellations recorded</div>
                )}
              </div>
            </div>
          </PillarCard>

          <PillarCard title="Earnings Transparency" icon={<TrendingDown size={18} className="text-blue-500"/>} accent="border-blue-500">
            <StatRow label="Mismatches Detected" value={overview.earnings?.mismatchCount || 0} bold valueColor="text-orange-600" />
            <StatRow label="Total Promised (80%)" value={formatINR(overview.earnings?.promised, { fallback: '₹0' })} />
            <StatRow label="Total Actual Payouts" value={formatINR(overview.earnings?.actual, { fallback: '₹0' })} />
            <StatRow label="Net Difference" value={formatINR(overview.earnings?.difference, { fallback: '₹0' })} />
          </PillarCard>

          <PillarCard title="Trust Distribution" icon={<Shield size={18} className="text-purple-500"/>} accent="border-purple-500">
            <TrustDistributionBar overview={overview} />
            <StatRow label="VERIFIED" value={overview.trustStatus?.verified || 0} indicator="bg-emerald-500" subtitle="Exact fare & payout match" />
            <StatRow label="NORMAL" value={overview.trustStatus?.normal || 0} indicator="bg-blue-400" subtitle="Standard lifecycle without flags" />
            <StatRow label="REVIEW" value={overview.trustStatus?.review || 0} indicator="bg-amber-400" subtitle="Pending manual audit review" />
            <StatRow label="FLAGGED" value={overview.trustStatus?.flagged || 0} indicator="bg-rose-500" subtitle="Discrepancy or violation confirmed" />
          </PillarCard>
        </div>

        {/* Recent Trust Activity Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 p-5 h-full flex flex-col min-h-[460px]">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity size={17} className="text-teal-600" /> Recent Trust Activity
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 max-h-[520px]">
              {overview.recentTrips && overview.recentTrips.length > 0 ? (
                overview.recentTrips.slice(0, 8).map(trip => {
                  const reviewCtx = getReviewContext(trip);
                  return (
                    <div key={trip._id || trip.trustRecordId} className="relative pl-3.5 border-l-2 border-slate-200 hover:border-teal-400 transition-colors">
                      <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-slate-300 border-2 border-white"></div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge status={trip.trustStatus} />
                        <span className="text-[11px] text-slate-400 font-medium">
                          {new Date(trip.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(trip.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 select-all truncate block" title={trip.trustRecordId}>
                        {trip.trustRecordId}
                      </div>
                      {reviewCtx && (
                        <div className="text-[10px] text-amber-800 bg-amber-50/90 px-1.5 py-0.5 rounded border border-amber-200/60 mt-1 truncate" title={reviewCtx}>
                          {reviewCtx}
                        </div>
                      )}
                      <div className="text-[11px] mt-0.5">
                        {trip.fareDiscrepancy !== null && trip.fareDiscrepancy !== undefined ? (
                          trip.fareDiscrepancy !== 0 ? (
                            <span className="font-bold text-rose-600 flex items-center gap-1">
                              <span>Fare Variance:</span>
                              <span>{formatINR(trip.fareDiscrepancy, { showSign: true })}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">Zero fare variance (±₹0)</span>
                          )
                        ) : (
                          <span className="text-slate-400">Fare variance: —</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-slate-400 text-center py-10">No recent activity</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FareTab({ overview, trips }) {
  const [apiSummary, setApiSummary] = useState(null);
  const [apiDiscrepancies, setApiDiscrepancies] = useState([]);
  const [loading, setLoading] = useState(!overview && !trips);

  useEffect(() => {
    if (!overview || !trips) {
      const t = Date.now();
      Promise.all([
        axios.get(`${API_BASE}/fare/summary`, { params: { _t: t } }),
        axios.get(`${API_BASE}/fare/discrepancies`, { params: { _t: t } })
      ]).then(([sumRes, discRes]) => {
        setApiSummary(sumRes.data.data);
        setApiDiscrepancies(discRes.data.data);
        setLoading(false);
      }).catch(console.error);
    }
  }, [overview, trips]);

  if (loading && !overview && !trips) return <TabLoader />;

  const summary = overview?.fareIntegrity || apiSummary || {
    discrepancyCount: 0,
    discrepancyAmount: 0,
    totalQuoted: 0,
    totalFinal: 0
  };

  const discrepancies = trips
    ? trips.filter(t => typeof t.fareDiscrepancy === 'number' && !Number.isNaN(t.fareDiscrepancy) && t.fareDiscrepancy !== 0)
    : apiDiscrepancies;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Financial Definition & Policy Clarity Note */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 text-xs text-slate-700 leading-relaxed flex items-start gap-3 shadow-2xs">
        <div className="p-1.5 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-700 shrink-0 mt-0.5">
          <Info size={15} />
        </div>
        <div>
          <span className="font-bold text-slate-900">Fare Integrity Principles:</span>
          <span className="ml-1 text-slate-600">
            <strong>Fare Discrepancy Formula:</strong> Final Fare &minus; Quoted Fare.
            Completed rides with zero difference (&plusmn;₹0) contribute to total financial volume but are omitted from discrepancy tables.
            Cancelled rides are tracked separately in Cancellation Intelligence unless a genuine non-zero financial mismatch exists. Missing or invalid values are never treated as verified.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Discrepancies" value={summary.discrepancyCount || 0} icon={<AlertTriangle size={18}/>} color="text-rose-600" bg="bg-rose-50" subtitle="Trips with fare variance" />
        <KpiCard title="Disputed Amount" value={formatINR(summary.discrepancyAmount, { fallback: '₹0' })} icon={<IndianRupee size={18}/>} color="text-rose-600" bg="bg-rose-50" subtitle="Net financial variance" />
        <KpiCard title="Total Quoted Fares" value={formatINR(summary.totalQuoted, { fallback: '₹0' })} icon={<FileText size={18}/>} color="text-blue-600" bg="bg-blue-50" subtitle="Agreed upfront total" />
        <KpiCard title="Total Final Fares" value={formatINR(summary.totalFinal, { fallback: '₹0' })} icon={<CheckCircle size={18}/>} color="text-emerald-600" bg="bg-emerald-50" subtitle="Settled trip total" />
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
        <div className="p-4 px-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <IndianRupee size={16} className="text-teal-600" /> Fare Discrepancy Records
          </h3>
          <span className="text-xs text-slate-500 font-medium">Displaying non-zero fare mismatches only</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
            <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Trust Record ID</th>
                <th className="px-6 py-3.5">Ride Request ID</th>
                <th className="px-6 py-3.5">Quoted Fare</th>
                <th className="px-6 py-3.5">Final Fare</th>
                <th className="px-6 py-3.5">Difference</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discrepancies.length > 0 ? discrepancies.map(t => (
                <tr key={t.trustRecordId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-800 select-all" title={t.trustRecordId}>
                    <span className="block max-w-[170px] truncate">{t.trustRecordId}</span>
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-600 select-all" title={t.rideRequestId}>
                    <span className="block max-w-[170px] truncate">{t.rideRequestId}</span>
                  </td>
                  <td className="px-6 py-3.5 font-medium">{formatINR(t.before?.quotedFare)}</td>
                  <td className="px-6 py-3.5 font-medium">{formatINR(t.after?.finalFare)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`font-bold ${t.fareDiscrepancy !== 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatINR(t.fareDiscrepancy, { showSign: true })}
                    </span>
                  </td>
                  <td className="px-6 py-3.5"><Badge status={t.trustStatus}/></td>
                </tr>
              )) : (
                <tr><td colSpan="6" className="px-6 py-8 text-center text-slate-400">No fare discrepancies detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CancellationsTab({ overview, trips: parentTrips }) {
  const [apiSummary, setApiSummary] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [apiTrips, setApiTrips] = useState([]);
  const [loading, setLoading] = useState(!overview && !parentTrips);

  useEffect(() => {
    const t = Date.now();
    axios.get(`${API_BASE}/cancellations/reasons`, { params: { _t: t } })
      .then(res => setReasons(res.data.data))
      .catch(console.error);

    if (!overview || !parentTrips) {
      Promise.all([
        axios.get(`${API_BASE}/cancellations/summary`, { params: { _t: t } }),
        axios.get(`${API_BASE}/trips`, { params: { _t: t } })
      ]).then(([sumRes, tripsRes]) => {
        setApiSummary(sumRes.data.data);
        setApiTrips(tripsRes.data.data.filter(t => t.after?.cancellation?.cancelled));
        setLoading(false);
      }).catch(console.error);
    }
  }, [overview, parentTrips]);

  if (loading && !overview && !parentTrips) return <TabLoader />;

  const summary = overview?.cancellations ? {
    totalCancellations: overview.cancellations.total || 0,
    riderCancellations: overview.cancellations.rider || 0,
    driverCancellations: overview.cancellations.driver || 0,
    otherCancellations: (overview.cancellations.total || 0) - (overview.cancellations.rider || 0) - (overview.cancellations.driver || 0)
  } : (apiSummary || {
    totalCancellations: 0,
    riderCancellations: 0,
    driverCancellations: 0,
    otherCancellations: 0
  });

  const displayTrips = parentTrips
    ? parentTrips.filter(t => t.after?.cancellation?.cancelled)
    : apiTrips;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Cancellations" value={summary.totalCancellations || 0} icon={<XCircle size={18}/>} color="text-amber-600" bg="bg-amber-50" subtitle="Platform-wide cancellations" />
        <KpiCard title="Rider Cancelled" value={summary.riderCancellations || 0} icon={<User size={18}/>} color="text-blue-600" bg="bg-blue-50" subtitle="Passenger initiated" />
        <KpiCard title="Driver Cancelled" value={summary.driverCancellations || 0} icon={<Activity size={18}/>} color="text-teal-600" bg="bg-teal-50" subtitle="Driver partner initiated" />
        <KpiCard title="System / Other" value={summary.otherCancellations || 0} icon={<Server size={18}/>} color="text-slate-600" bg="bg-slate-50" subtitle="Timeout or admin cancel" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-xl shadow-xs border border-slate-200/90 p-5 flex flex-col min-h-[480px]">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Info size={16} className="text-amber-500" /> Cancellation Reasons
            </h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
              {reasons.length} Categories
            </span>
          </div>
          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {reasons.length > 0 ? reasons.map((r, i) => (
              <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50/80 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                <span className="text-slate-700 font-medium text-xs truncate mr-2" title={r.reason}>{r.reason}</span>
                <span className="font-bold font-mono bg-white px-2 py-0.5 rounded shadow-2xs text-slate-700 text-xs border border-slate-100 shrink-0">{r.count}</span>
              </div>
            )) : <div className="text-slate-400 text-xs py-8 text-center">No reasons recorded</div>}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden flex flex-col min-h-[480px]">
          <div className="p-4 px-6 border-b border-slate-100 bg-slate-50/50 shrink-0 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <XCircle size={16} className="text-amber-500" /> Cancelled Trips Log
            </h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
              {displayTrips.length} Cancelled Trips
            </span>
          </div>
          <div className="overflow-x-auto flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[680px]">
              <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3.5">Trust Record ID</th>
                  <th className="px-5 py-3.5">Ride Request ID</th>
                  <th className="px-5 py-3.5">Cancelled By</th>
                  <th className="px-5 py-3.5">Reason</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayTrips.length > 0 ? displayTrips.map(t => (
                  <tr key={t.trustRecordId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-800 select-all" title={t.trustRecordId}>
                      <span className="block max-w-[170px] truncate">{t.trustRecordId}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 select-all" title={t.rideRequestId}>
                      <span className="block max-w-[170px] truncate">{t.rideRequestId}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                        t.after?.cancellation?.cancelledBy === 'RIDER'
                          ? 'bg-blue-50 text-blue-700 border-blue-200/70'
                          : t.after?.cancellation?.cancelledBy === 'DRIVER'
                          ? 'bg-teal-50 text-teal-700 border-teal-200/70'
                          : 'bg-slate-100 text-slate-700 border-slate-200/70'
                      }`}>
                        {t.after?.cancellation?.cancelledBy || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 text-xs font-medium max-w-xs truncate" title={t.after?.cancellation?.reason || 'No reason provided'}>
                      {t.after?.cancellation?.reason || 'No reason provided'}
                    </td>
                    <td className="px-5 py-3.5"><Badge status={t.trustStatus}/></td>
                  </tr>
                )) : <tr><td colSpan="5" className="px-5 py-8 text-center text-slate-400">No cancelled trips found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function EarningsTab({ overview, trips }) {
  const [apiSummary, setApiSummary] = useState(null);
  const [apiDiscrepancies, setApiDiscrepancies] = useState([]);
  const [loading, setLoading] = useState(!overview && !trips);

  useEffect(() => {
    if (!overview || !trips) {
      const t = Date.now();
      Promise.all([
        axios.get(`${API_BASE}/earnings/summary`, { params: { _t: t } }),
        axios.get(`${API_BASE}/earnings/discrepancies`, { params: { _t: t } })
      ]).then(([sumRes, discRes]) => {
        setApiSummary(sumRes.data.data);
        setApiDiscrepancies(discRes.data.data);
        setLoading(false);
      }).catch(console.error);
    }
  }, [overview, trips]);

  if (loading && !overview && !trips) return <TabLoader />;

  const summary = overview?.earnings ? {
    mismatchCount: overview.earnings.mismatchCount || 0,
    totalDifference: overview.earnings.difference || 0,
    totalPromised: overview.earnings.promised || 0,
    totalActual: overview.earnings.actual || 0,
    totalCommission: overview.earnings.commission || 0
  } : (apiSummary || {
    mismatchCount: 0,
    totalDifference: 0,
    totalPromised: 0,
    totalActual: 0,
    totalCommission: 0
  });

  const discrepancies = trips
    ? trips.filter(t => typeof t.earningsDiscrepancy === 'number' && !Number.isNaN(t.earningsDiscrepancy) && t.earningsDiscrepancy !== 0)
    : apiDiscrepancies;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Financial Definition & Policy Clarity Note */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 text-xs text-slate-700 leading-relaxed flex items-start gap-3 shadow-2xs">
        <div className="p-1.5 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-700 shrink-0 mt-0.5">
          <Info size={15} />
        </div>
        <div>
          <span className="font-bold text-slate-900">Earnings Transparency Principles:</span>
          <span className="ml-1 text-slate-600">
            <strong>Earnings Discrepancy Formula:</strong> Actual Driver Earnings &minus; Promised Driver Earnings.
            The platform models an 80% driver payout and 20% platform commission. Completed rides with zero discrepancy contribute fully to aggregate promised/actual driver payouts. Calculated earnings represent transparency audit comparisons and are not proof of external banking settlements.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Mismatches" value={summary.mismatchCount || 0} icon={<TrendingDown size={18}/>} color="text-orange-600" bg="bg-orange-50" subtitle="Driver payout variances" />
        <KpiCard title="Total Difference" value={formatINR(summary.totalDifference, { fallback: '₹0' })} icon={<AlertTriangle size={18}/>} color="text-rose-600" bg="bg-rose-50" subtitle="Net payout variance" />
        <KpiCard title="Total Promised (80%)" value={formatINR(summary.totalPromised, { fallback: '₹0' })} icon={<IndianRupee size={18}/>} color="text-blue-600" bg="bg-blue-50" subtitle="Agreed net total" />
        <KpiCard title="Total Actual Payout" value={formatINR(summary.totalActual, { fallback: '₹0' })} icon={<CheckCircle size={18}/>} color="text-emerald-600" bg="bg-emerald-50" subtitle="Settled net payouts" />
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
        <div className="p-4 px-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <TrendingDown size={16} className="text-teal-600" /> Earnings Discrepancy Records
          </h3>
          <span className="text-xs text-slate-500 font-medium">Displaying non-zero driver payout mismatches only</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[760px]">
            <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Trust Record ID</th>
                <th className="px-6 py-3.5">Ride Request ID</th>
                <th className="px-6 py-3.5">Driver ID</th>
                <th className="px-6 py-3.5">Promised Earnings</th>
                <th className="px-6 py-3.5">Actual Earnings</th>
                <th className="px-6 py-3.5">Difference</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discrepancies.length > 0 ? discrepancies.map(t => (
                <tr key={t.trustRecordId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-800 select-all" title={t.trustRecordId}>
                    <span className="block max-w-[170px] truncate">{t.trustRecordId}</span>
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-600 select-all" title={t.rideRequestId}>
                    <span className="block max-w-[170px] truncate">{t.rideRequestId}</span>
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-600 select-all" title={t.driverId}>
                    {t.driverId ? <span className="block max-w-[140px] truncate">{t.driverId}</span> : <span className="text-slate-400 font-sans">—</span>}
                  </td>
                  <td className="px-6 py-3.5 font-medium">{formatINR(t.before?.promisedEarnings)}</td>
                  <td className="px-6 py-3.5 font-medium">{formatINR(t.after?.earnings?.actualAmount)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`font-bold ${t.earningsDiscrepancy !== 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                      {formatINR(t.earningsDiscrepancy, { showSign: true })}
                    </span>
                  </td>
                  <td className="px-6 py-3.5"><Badge status={t.trustStatus}/></td>
                </tr>
              )) : <tr><td colSpan="7" className="px-6 py-8 text-center text-slate-400">No earnings mismatches detected.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LiveOpsTab({ trips }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col">
      <div className="bg-slate-50 text-slate-700 p-4 rounded-xl border border-slate-200/90 flex items-center gap-3 shrink-0 shadow-2xs text-xs">
        <div className="p-1 rounded-md bg-teal-50 border border-teal-200 text-teal-700">
          <Info size={14} />
        </div>
        <span className="font-medium">Live map telemetry is not currently enabled. Operational data is provided in tabular format based on real-time API events.</span>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden flex flex-col flex-1">
        <div className="p-4 px-6 border-b border-slate-100 bg-slate-50/50 shrink-0 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Activity size={16} className="text-teal-600" /> Live Trip Operations
          </h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full font-mono">
            {trips.length} Total Records
          </span>
        </div>
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[760px]">
            <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3.5">Trust Record ID</th>
                <th className="px-6 py-3.5">Ride Request ID</th>
                <th className="px-6 py-3.5">Rider ID</th>
                <th className="px-6 py-3.5">Driver ID</th>
                <th className="px-6 py-3.5">Latest Trust Event</th>
                <th className="px-6 py-3.5">Trust Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.map(t => {
                const riderIdentifier = t.userId || t.riderId;
                return (
                  <tr key={t.trustRecordId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-800 select-all" title={t.trustRecordId}>
                      <span className="block max-w-[170px] truncate">{t.trustRecordId}</span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-600 select-all" title={t.rideRequestId}>
                      <span className="block max-w-[170px] truncate">{t.rideRequestId}</span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-600 select-all" title={riderIdentifier}>
                      {riderIdentifier ? <span className="block max-w-[140px] truncate">{riderIdentifier}</span> : <span className="text-slate-400 font-sans">—</span>}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-600 select-all" title={t.driverId}>
                      {t.driverId ? <span className="block max-w-[140px] truncate">{t.driverId}</span> : <span className="text-slate-400 font-sans">—</span>}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-xs font-semibold font-mono border border-slate-200/60">
                        {t.events && t.events.length > 0 ? (t.events[t.events.length - 1]?.type || t.events[t.events.length - 1]?.eventType || 'PENDING') : 'PENDING'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5"><Badge status={t.trustStatus}/></td>
                  </tr>
                );
              })}
              {trips.length === 0 && <tr><td colSpan="6" className="px-6 py-8 text-center text-slate-400">No active operations.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InsightsTab({ overview }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PillarCard title="Trust Status Distribution" icon={<Shield size={18} className="text-teal-600"/>} accent="border-teal-500">
          <TrustDistributionBar overview={overview} />
          {(() => {
            const total = Math.max(overview.overview?.totalTrips || 1, 1);
            const vCount = overview.trustStatus?.verified || 0;
            const nCount = overview.trustStatus?.normal || 0;
            const rCount = overview.trustStatus?.review || 0;
            const fCount = overview.trustStatus?.flagged || 0;
            const vPct = ((vCount / total) * 100).toFixed(1);
            const nPct = ((nCount / total) * 100).toFixed(1);
            const rPct = ((rCount / total) * 100).toFixed(1);
            const fPct = ((fCount / total) * 100).toFixed(1);
            return (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <StatRow label="VERIFIED" value={`${vCount} (${vPct}%)`} indicator="bg-emerald-500" subtitle="Exact fare & payout match" />
                <StatRow label="NORMAL" value={`${nCount} (${nPct}%)`} indicator="bg-blue-400" subtitle="Standard lifecycle without flags" />
                <StatRow label="REVIEW" value={`${rCount} (${rPct}%)`} indicator="bg-amber-400" subtitle="Manual audit needed" />
                <StatRow label="FLAGGED" value={`${fCount} (${fPct}%)`} indicator="bg-rose-500" subtitle="Discrepancy confirmed" />
              </div>
            );
          })()}
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">Audit Definition:</span> REVIEW denotes records requiring human inspection (such as mid-trip cancellations or unquoted data) and is accounted separately from confirmed financial fraud or intentional driver underpayments.
          </div>
        </PillarCard>

        <PillarCard title="Cancellation Breakdown" icon={<XCircle size={18} className="text-amber-500"/>} accent="border-amber-500">
          {(() => {
            const tot = Math.max(overview.cancellations?.total || 1, 1);
            const rCount = overview.cancellations?.rider || 0;
            const dCount = overview.cancellations?.driver || 0;
            const oCount = Math.max(0, (overview.cancellations?.total || 0) - rCount - dCount);
            const rPct = ((rCount / tot) * 100).toFixed(1);
            const dPct = ((dCount / tot) * 100).toFixed(1);
            const oPct = ((oCount / tot) * 100).toFixed(1);
            return (
              <div className="space-y-3">
                <StatRow label="Total Cancellations" value={overview.cancellations?.total || 0} bold />
                <StatRow label="Rider Initiated" value={`${rCount} (${rPct}%)`} indicator="bg-blue-500" />
                <StatRow label="Driver Initiated" value={`${dCount} (${dPct}%)`} indicator="bg-teal-500" />
                {oCount > 0 && <StatRow label="System / Other" value={`${oCount} (${oPct}%)`} indicator="bg-slate-400" />}
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex mt-2">
                  <div style={{width: `${rPct}%`}} className="bg-blue-500 h-2.5" title={`Rider: ${rPct}%`}></div>
                  <div style={{width: `${dPct}%`}} className="bg-teal-500 h-2.5" title={`Driver: ${dPct}%`}></div>
                  {oCount > 0 && <div style={{width: `${oPct}%`}} className="bg-slate-400 h-2.5" title={`Other: ${oPct}%`}></div>}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                  Cancellations reflect lifecycle terminations and are accounted separately from fare/earnings discrepancies.
                </div>
              </div>
            );
          })()}
        </PillarCard>

        <PillarCard title="Fare Integrity Summary" icon={<IndianRupee size={18} className="text-teal-600"/>} accent="border-teal-500">
          <div className="space-y-3">
            <StatRow label="Discrepancy Records" value={overview.fareIntegrity?.discrepancyCount || 0} indicator="bg-rose-500" bold />
            <StatRow label="Total Disputed Amount" value={formatINR(overview.fareIntegrity?.discrepancyAmount, { fallback: '₹0' })} bold valueColor="text-rose-600" subtitle="Final minus Quoted net variance" />
            <StatRow label="Total Quoted Fares" value={formatINR(overview.fareIntegrity?.totalQuoted, { fallback: '₹0' })} />
            <StatRow label="Total Final Fares" value={formatINR(overview.fareIntegrity?.totalFinal, { fallback: '₹0' })} />
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-600 mt-2 font-medium">
              Discrepancy rate represents {((overview.fareIntegrity?.discrepancyCount || 0) / Math.max(overview.overview?.totalTrips || 1, 1) * 100).toFixed(1)}% of total trip volume.
            </div>
          </div>
        </PillarCard>

        <PillarCard title="Earnings Transparency Summary" icon={<TrendingDown size={18} className="text-blue-500"/>} accent="border-blue-500">
           <div className="space-y-3">
            <StatRow label="Promised Total (80%)" value={formatINR(overview.earnings?.promised, { fallback: '₹0' })} indicator="bg-blue-500" />
            <StatRow label="Actual Total" value={formatINR(overview.earnings?.actual, { fallback: '₹0' })} indicator="bg-emerald-500" />
            <StatRow label="Net Difference" value={formatINR(overview.earnings?.difference, { fallback: '₹0' })} indicator="bg-orange-500" subtitle="Actual minus Promised (Positive = surplus, Negative = shortfall)" />
            <StatRow label="Mismatch Count" value={overview.earnings?.mismatchCount || 0} bold valueColor="text-orange-600" />
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-600 mt-2 font-medium">
              Based on the 80% driver payout and 20% platform commission model.
            </div>
          </div>
        </PillarCard>
      </div>
    </div>
  );
}

function SettingsTab({ connected, storageMode }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
        <div className="p-4 px-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Activity size={16} className="text-teal-600" /> System Status</h3>
        </div>
        <div className="p-6 space-y-4">
          <InfoRow label="Backend Connection" value={connected ? 'Connected' : 'Disconnected'} highlight={!connected} />
          <InfoRow label="Trust Storage Backend" value={storageMode.toUpperCase()} />
          <InfoRow label="API Status" value={connected ? 'Healthy' : 'Unavailable'} highlight={!connected} />
          <InfoRow label="TrustRide Subsystem" value="Operational" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
        <div className="p-4 px-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Settings size={16} className="text-slate-500" /> Application Details</h3>
        </div>
        <div className="p-6 space-y-4">
          <InfoRow label="Application" value="TrustRide" />
          <InfoRow label="Dashboard Interface" value="Operations & Transparency Dashboard" />
          <InfoRow label="Architecture" value={`Node.js / Express + ${storageMode.charAt(0).toUpperCase() + storageMode.slice(1)}`} />
          <InfoRow label="Deployment Environment" value="Development" />
          <InfoRow label="Core UI Version" value="v1.0.0 (Phase 5)" />
        </div>
      </div>
    </div>
  );
}

// --- RECORDS TAB ---

function RecordsTab({ trips }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');

  const filteredTrips = trips.filter(t => {
    const matchesSearch = t.trustRecordId?.toLowerCase().includes(search.toLowerCase()) ||
                          t.rideRequestId?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'ALL' || t.trustStatus === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6 animate-in fade-in duration-300">
      {/* Master List */}
      <div className="w-full lg:w-1/3 flex flex-col bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden h-full">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search Record or Ride ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {['ALL', 'VERIFIED', 'NORMAL', 'REVIEW', 'FLAGGED'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  filter === f
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-slate-50/60">
          {filteredTrips.map((trip, tripIdx) => {
            const reviewCtx = getReviewContext(trip);
            const tripFareCalc = calculateFareDiscrepancy(trip);
            const tripEarnCalc = calculateEarningsVariance(trip);
            return (
              <div
                key={trip.trustRecordId || trip.rideRequestId || tripIdx}
                onClick={() => setSelected(trip)}
                className={`p-3.5 rounded-xl cursor-pointer border transition-all duration-150 ${
                  selected?.trustRecordId === trip.trustRecordId
                    ? 'border-teal-500 bg-teal-50/70 shadow-xs ring-2 ring-teal-500/30 border-l-4 border-l-teal-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <span className="font-mono font-bold text-slate-800 text-xs select-all truncate block max-w-[170px]" title={trip.trustRecordId}>{trip.trustRecordId}</span>
                  <Badge status={trip.trustStatus} />
                </div>
                <div className="text-[11px] font-mono text-slate-500 mb-1.5 select-all truncate" title={trip.rideRequestId}>Ride: {trip.rideRequestId}</div>
                {reviewCtx && (
                  <div className="text-[11px] text-amber-800 bg-amber-50/90 px-2 py-0.5 rounded border border-amber-200/60 mb-2 truncate" title={reviewCtx}>
                    {reviewCtx}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[11px] font-medium">
                  {renderVarianceBadge(tripFareCalc.available ? tripFareCalc.difference : null, 'Fare')}
                  {renderVarianceBadge(tripEarnCalc.available ? tripEarnCalc.difference : null, 'Earn')}
                </div>
              </div>
            );
          })}
          {filteredTrips.length === 0 && (
            <div className="text-center p-8 text-slate-400 text-xs">No records found matching filters.</div>
          )}
        </div>
      </div>

      {/* Details View */}
      <div className="w-full lg:w-2/3 flex flex-col bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden relative h-full">
        {selected ? (() => {
          const validQuotedFare = getValidQuotedFare(selected);
          const validPromisedEarnings = getValidPromisedEarnings(selected);
          const validFinalFare = getValidFinalFare(selected);
          const validActualEarnings = getValidActualEarnings(selected);
          const fareCalc = calculateFareDiscrepancy(selected);
          const earnCalc = calculateEarningsVariance(selected);
          const reviewCtx = getReviewContext(selected);

          return (
            <div className="flex-1 overflow-y-auto animate-in fade-in duration-200">
              <div className="p-6 border-b border-slate-100 bg-slate-50/40 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-1.5 flex items-center gap-2.5 font-mono select-all">
                    {selected.trustRecordId}
                    <Badge status={selected.trustStatus} size="lg" />
                  </h2>
                  <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-500 font-mono">
                    <span>Ride Request: <span className="text-slate-700 font-bold select-all" title={selected.rideRequestId}>{selected.rideRequestId}</span></span>
                    <span>Driver: <span className="text-slate-700 font-bold select-all" title={selected.driverId}>{selected.driverId || '—'}</span></span>
                    <span>Rider: <span className="text-slate-700 font-bold select-all" title={selected.userId || selected.riderId}>{selected.userId || selected.riderId || '—'}</span></span>
                  </div>
                </div>
              </div>

              {reviewCtx && (
                <div className="mx-6 mt-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-3 shadow-2xs">
                  <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-900">Audit Review Context</div>
                    <div className="text-amber-800 mt-0.5 font-medium">{reviewCtx}</div>
                    <div className="text-[11px] text-amber-700/90 mt-1">
                      {fareCalc.available && fareCalc.difference === 0 && earnCalc.available && earnCalc.difference === 0
                        ? 'Note: Zero recorded financial discrepancy. Flagged for operational review (e.g. cancellation or lifecycle anomaly) rather than confirmed financial variance.'
                        : isRecordCancelled(selected)
                        ? 'Note: Trip was cancelled before completion. Flagged for operational review rather than confirmed financial variance.'
                        : 'Record flagged for manual operator inspection against dispatch and transaction logs.'}
                    </div>
                  </div>
                </div>
              )}

              <div className="p-6 space-y-6">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Trip Lifecycle Audit</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="relative rounded-xl border border-slate-200 bg-white p-4.5 pt-5 shadow-2xs border-t-2 border-t-blue-500">
                    <h4 className="font-bold text-slate-800 mb-3.5 flex items-center gap-2 text-xs uppercase tracking-wider">
                      <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">1</div>
                      BEFORE
                    </h4>
                    <div className="space-y-3">
                      <InfoRow label="Quoted Fare" value={formatINR(validQuotedFare)} />
                      <InfoRow label="Promised Earnings" value={formatINR(validPromisedEarnings)} />
                      <InfoRow label="Est. Distance" value={selected.before?.estimatedDistance ? `${selected.before.estimatedDistance} km` : '—'} />
                      <InfoRow label="Est. Duration" value={selected.before?.estimatedDuration ? `${selected.before.estimatedDuration} mins` : '—'} />
                    </div>
                  </div>

                  <div className="relative rounded-xl border border-slate-200 bg-white p-4.5 pt-5 shadow-2xs border-t-2 border-t-amber-500">
                    <h4 className="font-bold text-slate-800 mb-3.5 flex items-center gap-2 text-xs uppercase tracking-wider">
                      <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold">2</div>
                      DURING
                    </h4>
                    <div className="space-y-3">
                      <InfoRow
                        label="Route Deviation"
                        value={typeof selected.routeDeviation === 'number' && selected.routeDeviation > 0 ? `${selected.routeDeviation} km` : selected.routeDeviation === true ? 'Flagged' : '0 km (Normal)'}
                      />
                      <div className="pt-2 border-t border-slate-100">
                        <div className="text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Recorded Events</div>
                        <div className="max-h-32 overflow-y-auto pr-1 space-y-1.5">
                          {selected.events && selected.events.length > 0 ? (
                            selected.events.map((evt, idx) => (
                              <div key={idx} className="text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
                                <div className="font-mono font-semibold text-slate-800">{evt.eventType || evt.type}</div>
                                {evt.description && (
                                  <div className="text-[10px] text-slate-500 font-sans mt-0.5">{evt.description}</div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-slate-400">No events recorded</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="relative rounded-xl border border-slate-200 bg-white p-4.5 pt-5 shadow-2xs border-t-2 border-t-emerald-500">
                    <h4 className="font-bold text-slate-800 mb-3.5 flex items-center gap-2 text-xs uppercase tracking-wider">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">3</div>
                      AFTER
                    </h4>
                    <div className="space-y-3">
                      <InfoRow label="Final Fare" value={formatINR(validFinalFare)} />
                      <InfoRow label="Actual Earnings" value={formatINR(validActualEarnings)} />
                      <InfoRow label="Cancelled" value={selected.after?.cancellation?.cancelled ? 'Yes' : 'No'} highlight={selected.after?.cancellation?.cancelled} />
                      {selected.after?.cancellation?.cancelled && (
                        <>
                          <InfoRow label="Cancelled By" value={selected.after.cancellation.cancelledBy ?? 'UNKNOWN'} highlight />
                          {selected.after.cancellation.reason && (
                            <div className="pt-1 text-[11px]">
                              <span className="text-slate-500">Reason: </span>
                              <span className="text-slate-800 font-medium">{selected.after.cancellation.reason}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Integrity Analysis</h4>
                    <span className="text-[11px] text-slate-400">Independent Fare vs Earnings reconciliation</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3.5 bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-2xs">
                      <div className={`p-2.5 rounded-lg ${
                        !fareCalc.available
                          ? 'bg-slate-100 text-slate-500'
                          : fareCalc.difference !== 0
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {!fareCalc.available ? (
                          <Info size={18} />
                        ) : fareCalc.difference !== 0 ? (
                          <AlertTriangle size={18} />
                        ) : (
                          <CheckCircle size={18} />
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Fare Discrepancy</div>
                        <div className={`text-base font-bold ${
                          !fareCalc.available
                            ? 'text-slate-500 font-sans'
                            : fareCalc.difference !== 0
                            ? 'text-rose-600 font-mono'
                            : 'text-emerald-600 font-mono'
                        }`}>
                          {fareCalc.display}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {fareCalc.subtext}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5 bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-2xs">
                      <div className={`p-2.5 rounded-lg ${
                        !earnCalc.available
                          ? 'bg-slate-100 text-slate-500'
                          : earnCalc.difference !== 0
                          ? 'bg-orange-50 text-orange-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {!earnCalc.available ? (
                          <Info size={18} />
                        ) : earnCalc.difference !== 0 ? (
                          <TrendingDown size={18} />
                        ) : (
                          <CheckCircle size={18} />
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Earnings Variance</div>
                        <div className={`text-base font-bold ${
                          !earnCalc.available
                            ? 'text-slate-500 font-sans'
                            : earnCalc.difference !== 0
                            ? 'text-orange-600 font-mono'
                            : 'text-emerald-600 font-mono'
                        }`}>
                          {earnCalc.display}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {earnCalc.subtext}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          );
        })() : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 max-w-md mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-600 mb-4 shadow-2xs">
              <FileSearch size={28} />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1.5">Select a Trust Record to Audit</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Choose any record from the list on the left to inspect its immutable 3-stage lifecycle, fare verification, and driver earnings breakdown.
            </p>
            <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-left space-y-2.5 text-xs text-slate-600 shadow-2xs">
              <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider mb-1">Audit Panel Contains:</div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">1</span>
                <span><strong>BEFORE:</strong> Upfront quoted fares, promised earnings, route telemetry</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold">2</span>
                <span><strong>DURING:</strong> Real-time route deviation & audit event logs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">3</span>
                <span><strong>AFTER:</strong> Final settlement fares, net driver payouts & cancellation attribution</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- SHARED UI COMPONENTS ---

function TabLoader() {
  return (
    <div className="flex h-[360px] items-center justify-center text-slate-400 font-medium text-xs">
      <RefreshCw className="animate-spin mr-2.5 text-teal-600" size={16} /> Loading intelligence data...
    </div>
  );
}

function TrustDistributionBar({ overview }) {
  const total = Math.max(overview.overview?.totalTrips || 1, 1);
  const v = ((overview.trustStatus?.verified || 0) / total) * 100;
  const n = ((overview.trustStatus?.normal || 0) / total) * 100;
  const r = ((overview.trustStatus?.review || 0) / total) * 100;
  const f = ((overview.trustStatus?.flagged || 0) / total) * 100;
  return (
    <div className="flex h-3 rounded-full overflow-hidden mb-3.5 bg-slate-100">
      <div style={{width: `${v}%`}} className="bg-emerald-500"></div>
      <div style={{width: `${n}%`}} className="bg-blue-400"></div>
      <div style={{width: `${r}%`}} className="bg-amber-400"></div>
      <div style={{width: `${f}%`}} className="bg-rose-500"></div>
    </div>
  );
}

function NavSection({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 mb-2 ml-3 uppercase tracking-wider">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 cursor-pointer ${
        active
          ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400 shadow-2xs'
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 font-medium'
      }`}
    >
      <span className={active ? 'text-teal-400' : 'text-slate-400'}>{icon}</span>
      <span className="text-xs">{label}</span>
      {active && <ChevronRight size={14} className="ml-auto text-teal-400 opacity-80" />}
    </button>
  );
}

function KpiCard({ title, value, icon, color, bg, subtitle }) {
  return (
    <div className="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between">
      <div className="flex justify-between items-start mb-2.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        <div className={`w-8 h-8 rounded-lg ${bg} ${color} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">{value}</div>
        {subtitle && <div className="text-[11px] text-slate-400 mt-1 font-medium">{subtitle}</div>}
      </div>
    </div>
  );
}

function PillarCard({ title, icon, accent = "border-teal-500", children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-5 relative overflow-hidden flex flex-col justify-between">
      <div>
        <div className={`absolute left-0 top-0 w-1 h-full ${accent} bg-current`}></div>
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
          {icon} {title}
        </h3>
        <div className="space-y-2.5">
          {children}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, bold = false, valueColor = "text-slate-900", indicator, subtitle }) {
  return (
    <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-50 last:border-b-0">
      <div className="flex items-center gap-2">
        {indicator && <div className={`w-2 h-2 rounded-full ${indicator} shrink-0`}></div>}
        <div>
          <span className="text-slate-600 font-medium">{label}</span>
          {subtitle && <div className="text-[10px] text-slate-400">{subtitle}</div>}
        </div>
      </div>
      <span className={`${bold ? 'font-bold' : 'font-semibold'} ${valueColor} text-right`}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value, highlight = false }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/60' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

function Badge({ status, size = "sm" }) {
  const mapping = {
    NORMAL: 'bg-blue-50 text-blue-700 border-blue-200/70',
    VERIFIED: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    REVIEW: 'bg-amber-50 text-amber-700 border-amber-200/70',
    FLAGGED: 'bg-rose-50 text-rose-700 border-rose-200/70'
  };

  const style = mapping[status] || 'bg-slate-100 text-slate-600 border-slate-200/70';
  const sizeClasses = size === 'lg' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px] uppercase tracking-wider';

  return (
    <span className={`inline-flex items-center font-bold rounded-md border ${style} ${sizeClasses}`}>
      {status || 'UNKNOWN'}
    </span>
  );
}
