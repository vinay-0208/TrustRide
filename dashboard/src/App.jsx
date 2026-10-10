import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
  FileText, IndianRupee, TrendingDown, XCircle, AlertTriangle,
  CheckCircle, Search, Filter, RefreshCw, LayoutDashboard,
  Shield, Activity, Settings, BarChart2, Server, Map, FileSearch,
  ChevronRight, ArrowRight, ShieldCheck, User, X, Info
} from 'lucide-react';

const API_BASE = "http://localhost:8000/api/trust";
const SOCKET_URL = "http://localhost:8000";
const RUP = '\u20B9'; // UTF-8 Indian Rupee

const formatINR = (value, options = {}) => {
  const { fallback = 'N/A', showSign = false } = options;
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return fallback;
  }
  const num = Number(value);
  try {
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    }).format(Math.abs(num));

    if (num < 0) return `-${formatted}`;
    if (showSign && num > 0) return `+${formatted}`;
    return formatted;
  } catch (err) {
    const absVal = Math.abs(num).toFixed(Number.isInteger(num) ? 0 : 2);
    const formatted = `\u20B9${absVal}`;
    if (num < 0) return `-${formatted}`;
    if (showSign && num > 0) return `+${formatted}`;
    return formatted;
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
      <div className="flex h-screen items-center justify-center bg-gray-50 text-indigo-900 font-medium">
        <RefreshCw className="animate-spin mr-3 text-indigo-600" /> Loading TrustRide Intelligence...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-[#0a192f] text-slate-300 flex flex-col shadow-xl z-20 transition-all">
        <div className="p-6 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3 text-white mb-1">
            <ShieldCheck size={28} className="text-blue-400" />
            <h1 className="text-xl font-bold tracking-tight">TrustRide</h1>
          </div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider ml-10">Organisation Dashboard</div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8 no-scrollbar">
          <NavSection title="OVERVIEW">
            <NavItem icon={<LayoutDashboard size={18}/>} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          </NavSection>

          <NavSection title="TRUST INTELLIGENCE">
            <NavItem icon={<FileSearch size={18}/>} label="Trust Records" active={activeTab === 'records'} onClick={() => setActiveTab('records')} />
            <NavItem icon={<IndianRupee size={18}/>} label="Fare Integrity" active={activeTab === 'fare'} onClick={() => setActiveTab('fare')} />
            <NavItem icon={<XCircle size={18}/>} label="Cancellations" active={activeTab === 'cancellations'} onClick={() => setActiveTab('cancellations')} />
            <NavItem icon={<TrendingDown size={18}/>} label="Earnings" active={activeTab === 'earnings'} onClick={() => setActiveTab('earnings')} />
          </NavSection>

          <NavSection title="OPERATIONS & ANALYTICS">
            <NavItem icon={<Map size={18}/>} label="Live Operations" active={activeTab === 'ops'} onClick={() => setActiveTab('ops')} />
            <NavItem icon={<BarChart2 size={18}/>} label="Insights & Reports" active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} />
          </NavSection>
          
          <NavSection title="SYSTEM">
            <NavItem icon={<Settings size={18}/>} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </NavSection>
        </div>
        
        <div className="p-4 border-t border-slate-700/50 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <User size={14} className="text-slate-400" />
            <span>Admin Operator</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>v1.0.0 (Phase 5)</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
        {/* Header */}
        <header className="bg-white px-8 py-5 border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')}
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-1">Unified Transparency Layer: Fare, Cancellations & Earnings</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm font-medium border-r border-slate-200 pr-6">
              <span className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                {connected ? 'Live' : 'Disconnected'}
              </span>
              <span className="flex items-center gap-2 text-slate-500 bg-slate-100 px-3 py-1 rounded-md">
                <Server size={14} /> 
                {storageMode.toUpperCase()}
              </span>
            </div>
            <button 
              onClick={() => fetchData(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium text-sm"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </header>

        {/* Workspace */}
        <main className="flex-1 overflow-y-auto bg-[#F8FAFC] p-8">
          {activeTab === 'overview' && overview && <OverviewTab overview={overview} trips={trips} />}
          {activeTab === 'records' && trips && <RecordsTab trips={trips} />}
          {activeTab === 'fare' && <FareTab overview={overview} trips={trips} />}
          {activeTab === 'cancellations' && <CancellationsTab overview={overview} trips={trips} />}
          {activeTab === 'earnings' && <EarningsTab overview={overview} trips={trips} />}
          {activeTab === 'ops' && trips && <LiveOpsTab trips={trips} />}
          {activeTab === 'insights' && overview && <InsightsTab overview={overview} trips={trips} />}
          {activeTab === 'settings' && <SettingsTab connected={connected} storageMode={storageMode} />}
        </main>
      </div>
    </div>
  );
}

// --- TAB COMPONENTS ---

function OverviewTab({ overview, trips }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        <KpiCard title="Total Trips" value={overview.overview?.totalTrips || 0} icon={<Map />} color="text-indigo-600" bg="bg-indigo-50" />
        <KpiCard title="Fare Discrepancies" value={overview.fareIntegrity?.discrepancyCount || 0} icon={<IndianRupee />} color="text-rose-600" bg="bg-rose-50" />
        <KpiCard title="Earnings Mismatches" value={overview.earnings?.mismatchCount || 0} icon={<TrendingDown />} color="text-orange-600" bg="bg-orange-50" />
        <KpiCard title="Cancellations" value={overview.cancellations?.total || 0} icon={<XCircle />} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard title="Requires Review" value={overview.trustStatus?.review || 0} icon={<AlertTriangle />} color="text-purple-600" bg="bg-purple-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <PillarCard title="Fare Integrity" icon={<IndianRupee size={20} className="text-emerald-500"/>} accent="border-emerald-500">
            <StatRow label="Discrepancy Count" value={overview.fareIntegrity?.discrepancyCount || 0} />
            <StatRow label="Total Disputed Amount" value={formatINR(overview.fareIntegrity?.discrepancyAmount, { fallback: '₹0' })} bold valueColor="text-rose-600" />
            <StatRow label="Total Quoted Fares" value={formatINR(overview.fareIntegrity?.totalQuoted, { fallback: '₹0' })} />
            <StatRow label="Total Final Fares" value={formatINR(overview.fareIntegrity?.totalFinal, { fallback: '₹0' })} />
          </PillarCard>
          
          <PillarCard title="Cancellation Intelligence" icon={<XCircle size={20} className="text-amber-500"/>} accent="border-amber-500">
            <StatRow label="Total Cancellations" value={overview.cancellations?.total || 0} bold />
            <StatRow label="Rider Initiated" value={overview.cancellations?.rider || 0} />
            <StatRow label="Driver Initiated" value={overview.cancellations?.driver || 0} />
            <div className="pt-3 mt-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500 mb-2 uppercase">Reasons</div>
              {overview.cancellations?.reasons && overview.cancellations.reasons.length > 0 ? (
                overview.cancellations.reasons.map((r, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span className="text-slate-600 truncate mr-2">{r.reason}</span>
                    <span className="font-medium bg-slate-100 px-2 rounded-md">{r.count}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">No cancellations recorded</div>
              )}
            </div>
          </PillarCard>

          <PillarCard title="Earnings Transparency" icon={<TrendingDown size={20} className="text-blue-500"/>} accent="border-blue-500">
            <StatRow label="Mismatches Detected" value={overview.earnings?.mismatchCount || 0} bold valueColor="text-orange-600" />
            <StatRow label="Total Promised" value={formatINR(overview.earnings?.promised, { fallback: '₹0' })} />
            <StatRow label="Total Actual Payouts" value={formatINR(overview.earnings?.actual, { fallback: '₹0' })} />
            <StatRow label="Net Difference" value={formatINR(overview.earnings?.difference, { fallback: '₹0' })} />
          </PillarCard>
          
          <PillarCard title="Trust Distribution" icon={<Shield size={20} className="text-purple-500"/>} accent="border-purple-500">
            <TrustDistributionBar overview={overview} />
            <StatRow label="VERIFIED" value={overview.trustStatus?.verified || 0} indicator="bg-emerald-500" />
            <StatRow label="NORMAL" value={overview.trustStatus?.normal || 0} indicator="bg-blue-400" />
            <StatRow label="REVIEW" value={overview.trustStatus?.review || 0} indicator="bg-amber-400" />
            <StatRow label="FLAGGED" value={overview.trustStatus?.flagged || 0} indicator="bg-rose-500" />
          </PillarCard>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-full flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Activity size={20} className="text-indigo-500" /> Recent Trust Activity
            </h3>
            <div className="flex-1 overflow-y-auto space-y-5 pr-2">
              {overview.recentTrips && overview.recentTrips.length > 0 ? (
                overview.recentTrips.slice(0, 8).map(trip => (
                  <div key={trip._id || trip.trustRecordId} className="relative pl-4 border-l-2 border-slate-200">
                    <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-slate-300 border-2 border-white"></div>
                    <div className="text-xs text-slate-500 mb-1">{new Date(trip.createdAt).toLocaleString()}</div>
                    <div className="text-sm font-semibold text-slate-800">{trip.trustRecordId}</div>
                    <div className="text-xs text-slate-600 mt-1">Status: <span className="font-medium">{trip.trustStatus}</span></div>
                    {trip.fareDiscrepancy !== 0 && (
                      <div className="text-xs text-rose-600 mt-0.5">Fare Discrepancy: {formatINR(trip.fareDiscrepancy, { showSign: true, fallback: '₹0' })}</div>
                    )}
                  </div>
                ))
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Financial Definition & Policy Clarity Note */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 text-xs text-blue-900 leading-relaxed flex items-start gap-3">
        <Info className="text-blue-600 shrink-0 mt-0.5" size={16} />
        <div>
          <span className="font-semibold text-blue-950">Fare Integrity Principles:</span>
          <span className="ml-1">
            <strong>Fare Discrepancy Formula:</strong> Final Fare &minus; Quoted Fare.
            Completed rides with zero difference (&plusmn;₹0) contribute to total financial volume but are omitted from discrepancy tables.
            Cancelled rides are tracked separately in Cancellation Intelligence unless a genuine non-zero financial mismatch exists. Missing or invalid values are never treated as verified.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <KpiCard title="Total Discrepancies" value={summary.discrepancyCount || 0} icon={<AlertTriangle/>} color="text-rose-600" bg="bg-rose-50" />
        <KpiCard title="Disputed Amount" value={formatINR(summary.discrepancyAmount, { fallback: '₹0' })} icon={<IndianRupee/>} color="text-rose-600" bg="bg-rose-50" />
        <KpiCard title="Total Quoted Fares" value={formatINR(summary.totalQuoted, { fallback: '₹0' })} icon={<FileText/>} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard title="Total Final Fares" value={formatINR(summary.totalFinal, { fallback: '₹0' })} icon={<CheckCircle/>} color="text-emerald-600" bg="bg-emerald-50" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><IndianRupee size={18} className="text-emerald-500" /> Fare Discrepancy Records</h3>
          <span className="text-xs text-slate-500 font-medium">Displaying non-zero fare mismatches only</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Trust Record ID</th>
                <th className="px-6 py-4">Ride Request ID</th>
                <th className="px-6 py-4">Quoted Fare</th>
                <th className="px-6 py-4">Final Fare</th>
                <th className="px-6 py-4">Difference</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discrepancies.length > 0 ? discrepancies.map(t => (
                <tr key={t.trustRecordId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-700">{t.trustRecordId}</td>
                  <td className="px-6 py-4 text-slate-500">{t.rideRequestId}</td>
                  <td className="px-6 py-4 font-medium">{formatINR(t.before?.quotedFare, { fallback: '₹0' })}</td>
                  <td className="px-6 py-4 font-medium">{formatINR(t.after?.finalFare, { fallback: '₹0' })}</td>
                  <td className="px-6 py-4">
                    <span className={`font-bold ${t.fareDiscrepancy !== 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatINR(t.fareDiscrepancy, { showSign: true, fallback: '₹0' })}
                    </span>
                  </td>
                  <td className="px-6 py-4"><Badge status={t.trustStatus}/></td>
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <KpiCard title="Total Cancellations" value={summary.totalCancellations || 0} icon={<XCircle/>} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard title="Rider Cancelled" value={summary.riderCancellations || 0} icon={<User/>} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard title="Driver Cancelled" value={summary.driverCancellations || 0} icon={<Activity/>} color="text-indigo-600" bg="bg-indigo-50" />
        <KpiCard title="System/Other" value={summary.otherCancellations || 0} icon={<Server/>} color="text-slate-600" bg="bg-slate-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Info size={18} className="text-amber-500" /> Cancellation Reasons</h3>
          <div className="space-y-3">
            {reasons.length > 0 ? reasons.map((r, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-600 font-medium">{r.reason}</span>
                <span className="font-bold bg-white px-2 py-1 rounded shadow-sm text-slate-700">{r.count}</span>
              </div>
            )) : <div className="text-slate-400 text-sm">No reasons recorded</div>}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><XCircle size={18} className="text-amber-500" /> Cancelled Trips Log</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider sticky top-0">
                <tr>
                  <th className="px-6 py-3">Trust Record ID</th>
                  <th className="px-6 py-3">Ride Request ID</th>
                  <th className="px-6 py-3">Cancelled By</th>
                  <th className="px-6 py-3">Reason</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayTrips.length > 0 ? displayTrips.map(t => (
                  <tr key={t.trustRecordId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-bold text-slate-700">{t.trustRecordId}</td>
                    <td className="px-6 py-3 text-slate-500">{t.rideRequestId}</td>
                    <td className="px-6 py-3">
                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-semibold">{t.after?.cancellation?.cancelledBy || 'UNKNOWN'}</span>
                    </td>
                    <td className="px-6 py-3 text-slate-600 truncate max-w-xs">{t.after?.cancellation?.reason || 'No reason provided'}</td>
                    <td className="px-6 py-3"><Badge status={t.trustStatus}/></td>
                  </tr>
                )) : <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-400">No cancelled trips found.</td></tr>}
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Financial Definition & Policy Clarity Note */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 text-xs text-blue-900 leading-relaxed flex items-start gap-3">
        <Info className="text-blue-600 shrink-0 mt-0.5" size={16} />
        <div>
          <span className="font-semibold text-blue-950">Earnings Transparency Principles:</span>
          <span className="ml-1">
            <strong>Earnings Discrepancy Formula:</strong> Actual Driver Earnings &minus; Promised Driver Earnings.
            Completed rides with zero discrepancy contribute fully to aggregate promised/actual driver payouts but are excluded from the discrepancy table.
            Cancelled rides are isolated under Cancellation Intelligence unless a genuine non-zero discrepancy is detected.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <KpiCard title="Total Mismatches" value={summary.mismatchCount || 0} icon={<TrendingDown/>} color="text-orange-600" bg="bg-orange-50" />
        <KpiCard title="Total Difference" value={formatINR(summary.totalDifference, { fallback: '₹0' })} icon={<AlertTriangle/>} color="text-rose-600" bg="bg-rose-50" />
        <KpiCard title="Total Promised" value={formatINR(summary.totalPromised, { fallback: '₹0' })} icon={<IndianRupee/>} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard title="Total Actual Payout" value={formatINR(summary.totalActual, { fallback: '₹0' })} icon={<CheckCircle/>} color="text-emerald-600" bg="bg-emerald-50" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingDown size={18} className="text-blue-500" /> Earnings Discrepancy Records</h3>
          <span className="text-xs text-slate-500 font-medium">Displaying non-zero driver payout mismatches only</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Trust Record ID</th>
                <th className="px-6 py-4">Ride Request ID</th>
                <th className="px-6 py-4">Driver ID</th>
                <th className="px-6 py-4">Promised Earnings</th>
                <th className="px-6 py-4">Actual Earnings</th>
                <th className="px-6 py-4">Difference</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {discrepancies.length > 0 ? discrepancies.map(t => (
                <tr key={t.trustRecordId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-700">{t.trustRecordId}</td>
                  <td className="px-6 py-4 text-slate-500">{t.rideRequestId}</td>
                  <td className="px-6 py-4 text-slate-600">{t.driverId || 'N/A'}</td>
                  <td className="px-6 py-4 font-medium">{formatINR(t.before?.promisedEarnings, { fallback: '₹0' })}</td>
                  <td className="px-6 py-4 font-medium">{formatINR(t.after?.earnings?.actualAmount, { fallback: '₹0' })}</td>
                  <td className="px-6 py-4">
                    <span className={`font-bold ${t.earningsDiscrepancy !== 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                      {formatINR(t.earningsDiscrepancy, { showSign: true, fallback: '₹0' })}
                    </span>
                  </td>
                  <td className="px-6 py-4"><Badge status={t.trustStatus}/></td>
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
      <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-200 flex items-center gap-3 shrink-0 shadow-sm">
        <Info className="text-blue-500" />
        <span className="font-medium text-sm">Live map telemetry is not currently enabled. Operational data is provided in tabular format based on real-time API events.</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-indigo-500" /> Live Trip Operations</h3>
        </div>
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] font-bold tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4">Trust Record ID</th>
                <th className="px-6 py-4">Ride Request ID</th>
                <th className="px-6 py-4">Rider ID</th>
                <th className="px-6 py-4">Driver ID</th>
                <th className="px-6 py-4">Latest Trust Event</th>
                <th className="px-6 py-4">Trust Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.map(t => (
                <tr key={t.trustRecordId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-700">{t.trustRecordId}</td>
                  <td className="px-6 py-4 text-slate-500">{t.rideRequestId}</td>
                  <td className="px-6 py-4 text-slate-600">{t.userId || 'N/A'}</td>
                  <td className="px-6 py-4 text-slate-600">{t.driverId || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">
                      {t.events && t.events.length > 0 ? (t.events[t.events.length - 1]?.type || t.events[t.events.length - 1]?.eventType || 'PENDING') : 'PENDING'}
                    </span>
                  </td>
                  <td className="px-6 py-4"><Badge status={t.trustStatus}/></td>
                </tr>
              ))}
              {trips.length === 0 && <tr><td colSpan="6" className="px-6 py-8 text-center text-slate-400">No active operations.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InsightsTab({ overview, trips }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PillarCard title="Trust Status Distribution" icon={<Shield size={20} className="text-indigo-500"/>} accent="border-indigo-500">
          <TrustDistributionBar overview={overview} />
          <div className="grid grid-cols-2 gap-4 mt-6">
            <StatRow label="VERIFIED" value={overview.trustStatus?.verified || 0} indicator="bg-emerald-500" />
            <StatRow label="NORMAL" value={overview.trustStatus?.normal || 0} indicator="bg-blue-400" />
            <StatRow label="REVIEW" value={overview.trustStatus?.review || 0} indicator="bg-amber-400" />
            <StatRow label="FLAGGED" value={overview.trustStatus?.flagged || 0} indicator="bg-rose-500" />
          </div>
        </PillarCard>
        
        <PillarCard title="Cancellation Breakdown" icon={<XCircle size={20} className="text-amber-500"/>} accent="border-amber-500">
          <div className="space-y-4">
            <StatRow label="Total Cancellations" value={overview.cancellations?.total || 0} bold />
            <StatRow label="Rider Initiated" value={overview.cancellations?.rider || 0} indicator="bg-blue-500" />
            <StatRow label="Driver Initiated" value={overview.cancellations?.driver || 0} indicator="bg-indigo-500" />
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex mt-2">
              {(() => {
                const tot = Math.max(overview.cancellations?.total || 1, 1);
                const r = ((overview.cancellations?.rider || 0) / tot) * 100;
                const d = ((overview.cancellations?.driver || 0) / tot) * 100;
                return (
                  <>
                    <div style={{width: `${r}%`}} className="bg-blue-500 h-2.5"></div>
                    <div style={{width: `${d}%`}} className="bg-indigo-500 h-2.5"></div>
                  </>
                );
              })()}
            </div>
          </div>
        </PillarCard>

        <PillarCard title="Fare Integrity Summary" icon={<IndianRupee size={20} className="text-emerald-500"/>} accent="border-emerald-500">
          <div className="space-y-4">
            <StatRow label="Discrepancy Records" value={overview.fareIntegrity?.discrepancyCount || 0} indicator="bg-rose-500" bold />
            <StatRow label="Total Disputed Amount" value={formatINR(overview.fareIntegrity?.discrepancyAmount, { fallback: '₹0' })} bold valueColor="text-rose-600" />
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-600 mt-4">
              Discrepancy rate represents {((overview.fareIntegrity?.discrepancyCount || 0) / Math.max(overview.overview?.totalTrips || 1, 1) * 100).toFixed(1)}% of total trip volume.
            </div>
          </div>
        </PillarCard>

        <PillarCard title="Earnings Transparency Summary" icon={<TrendingDown size={20} className="text-blue-500"/>} accent="border-blue-500">
           <div className="space-y-4">
            <StatRow label="Promised Total" value={formatINR(overview.earnings?.promised, { fallback: '₹0' })} indicator="bg-blue-500" />
            <StatRow label="Actual Total" value={formatINR(overview.earnings?.actual, { fallback: '₹0' })} indicator="bg-emerald-500" />
            <StatRow label="Net Difference" value={formatINR(overview.earnings?.difference, { fallback: '₹0' })} indicator="bg-orange-500" />
            <StatRow label="Mismatch Count" value={overview.earnings?.mismatchCount || 0} bold valueColor="text-orange-600" />
          </div>
        </PillarCard>
      </div>
    </div>
  );
}

function SettingsTab({ connected, storageMode }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-indigo-500" /> System Status</h3>
        </div>
        <div className="p-6 space-y-5">
          <InfoRow label="Backend Connection" value={connected ? 'Connected' : 'Disconnected'} highlight={!connected} />
          <InfoRow label="Trust Storage Backend" value={storageMode.toUpperCase()} />
          <InfoRow label="API Status" value={connected ? 'Healthy' : 'Unavailable'} highlight={!connected} />
          <InfoRow label="TrustRide Subsystem" value="Operational" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Settings size={18} className="text-slate-500" /> Application Details</h3>
        </div>
        <div className="p-6 space-y-5">
          <InfoRow label="Application" value="TrustRide" />
          <InfoRow label="Dashboard Interface" value="Organisation Dashboard" />
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
    <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Master List */}
      <div className="w-full lg:w-1/3 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-full">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search Record ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {['ALL', 'VERIFIED', 'NORMAL', 'REVIEW', 'FLAGGED'].map(f => (
              <button 
                key={f} 
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
          {filteredTrips.map(trip => (
            <div 
              key={trip.trustRecordId} 
              onClick={() => setSelected(trip)}
              className={`p-4 rounded-xl cursor-pointer border transition-all duration-200 ${selected?.trustRecordId === trip.trustRecordId ? 'border-indigo-500 bg-indigo-50/80 shadow-sm ring-1 ring-indigo-500/20' : 'border-white bg-white hover:border-slate-300 hover:shadow-sm'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-800 text-sm">{trip.trustRecordId}</span>
                <Badge status={trip.trustStatus} />
              </div>
              <div className="text-xs text-slate-500 font-medium mb-2">Ride: {trip.rideRequestId}</div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className={`${trip.fareDiscrepancy !== 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  Fare Diff: {formatINR(trip.fareDiscrepancy, { fallback: '₹0' })}
                </span>
                <span className={`${trip.earningsDiscrepancy !== 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                  Earn Diff: {formatINR(trip.earningsDiscrepancy, { fallback: '₹0' })}
                </span>
              </div>
            </div>
          ))}
          {filteredTrips.length === 0 && (
            <div className="text-center p-8 text-slate-400 text-sm">No records found.</div>
          )}
        </div>
      </div>

      {/* Details View */}
      <div className="w-full lg:w-2/3 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative h-full">
        {selected ? (
          <div className="flex-1 overflow-y-auto animate-in fade-in duration-300">
            <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                  {selected.trustRecordId}
                  <Badge status={selected.trustStatus} size="lg" />
                </h2>
                <div className="flex gap-4 text-sm font-medium text-slate-500">
                  <span>Ride Request: <span className="text-slate-700">{selected.rideRequestId}</span></span>
                  <span>Driver: <span className="text-slate-700">{selected.driverId || 'N/A'}</span></span>
                  <span>Rider: <span className="text-slate-700">{selected.userId || 'N/A'}</span></span>
                </div>
              </div>
            </div>

            <div className="p-8">
              <h3 className="text-lg font-bold text-slate-800 mb-6">Trip Lifecycle Audit</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="relative rounded-2xl border border-slate-200 bg-white p-5 pt-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute top-0 left-0 w-full h-1 bg-blue-400 rounded-t-2xl"></div>
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">1</div> 
                    BEFORE
                  </h4>
                  <div className="space-y-4">
                    <InfoRow label="Quoted Fare" value={formatINR(selected.before?.quotedFare)} />
                    <InfoRow label="Promised Earnings" value={formatINR(selected.before?.promisedEarnings)} />
                    <InfoRow label="Est. Distance" value={selected.before?.estimatedDistance ? `${selected.before.estimatedDistance} km` : 'N/A'} />
                    <InfoRow label="Est. Duration" value={selected.before?.estimatedDuration ? `${selected.before.estimatedDuration} mins` : 'N/A'} />
                  </div>
                </div>

                <div className="relative rounded-2xl border border-slate-200 bg-white p-5 pt-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute top-0 left-0 w-full h-1 bg-amber-400 rounded-t-2xl"></div>
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs">2</div> 
                    DURING
                  </h4>
                  <div className="space-y-4">
                    <InfoRow label="Route Deviation" value={selected.routeDeviation ? `${selected.routeDeviation} km` : '0 km'} />
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-xs font-semibold text-slate-500 mb-2 uppercase">Recorded Events</div>
                      <div className="max-h-32 overflow-y-auto pr-1 space-y-2">
                        {selected.events && selected.events.length > 0 ? (
                          selected.events.map((evt, idx) => (
                            <div key={idx} className="text-xs bg-slate-50 p-2 rounded-md border border-slate-100 font-medium text-slate-700">
                              {evt.eventType}
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-slate-400">No events recorded</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative rounded-2xl border border-slate-200 bg-white p-5 pt-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400 rounded-t-2xl"></div>
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">3</div> 
                    AFTER
                  </h4>
                  <div className="space-y-4">
                    <InfoRow label="Final Fare" value={formatINR(selected.after?.finalFare)} />
                    <InfoRow label="Actual Earnings" value={formatINR(selected.after?.earnings?.actualAmount)} />
                    <InfoRow label="Cancelled" value={selected.after?.cancellation?.cancelled ? 'Yes' : 'No'} highlight={selected.after?.cancellation?.cancelled} />
                    {selected.after?.cancellation?.cancelled && (
                      <InfoRow label="Cancelled By" value={selected.after.cancellation.cancelledBy ?? 'N/A'} highlight />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-5">Integrity Analysis</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                    <div className={`p-3 rounded-full ${selected.fareDiscrepancy !== 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {selected.fareDiscrepancy !== 0 ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Fare Discrepancy</div>
                      <div className={`text-xl font-bold ${selected.fareDiscrepancy !== 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatINR(selected.fareDiscrepancy, { fallback: '₹0' })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                    <div className={`p-3 rounded-full ${selected.earningsDiscrepancy !== 0 ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {selected.earningsDiscrepancy !== 0 ? <TrendingDown size={20} /> : <CheckCircle size={20} />}
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Earnings Mismatch</div>
                      <div className={`text-xl font-bold ${selected.earningsDiscrepancy !== 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                        {formatINR(selected.earningsDiscrepancy, { fallback: '₹0' })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <FileSearch size={64} className="text-slate-200 mb-4" />
            <h3 className="text-xl font-bold text-slate-600">Select a Trust Record</h3>
            <p className="text-sm mt-2 max-w-sm text-center">Choose a record from the list to view its complete lifecycle and integrity analysis.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- SHARED UI COMPONENTS ---

function TabLoader() {
  return (
    <div className="flex h-[400px] items-center justify-center text-slate-400 font-medium">
      <RefreshCw className="animate-spin mr-3 text-slate-300" /> Loading intelligence...
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
    <div className="flex h-4 rounded-full overflow-hidden mb-4 bg-slate-100">
      <div style={{width: `${v}%`}} className="bg-emerald-500"></div>
      <div style={{width: `${n}%`}} className="bg-blue-400"></div>
      <div style={{width: `${r}%`}} className="bg-amber-400"></div>
      <div style={{width: `${f}%`}} className="bg-rose-500"></div>
    </div>
  );
}

function NavSection({ title, children }) {
  return (
    <div className="mb-6">
      <div className="text-[10px] font-bold text-slate-500 mb-3 ml-3 uppercase tracking-widest">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${active ? 'bg-indigo-600/10 text-indigo-400 font-semibold shadow-inner' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
    >
      {icon}
      <span className="text-sm">{label}</span>
      {active && <ChevronRight size={16} className="ml-auto opacity-70" />}
    </button>
  );
}

function KpiCard({ title, value, icon, color, bg }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${bg} ${color}`}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-800 tracking-tight">{value}</div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2">{title}</div>
    </div>
  );
}

function PillarCard({ title, icon, accent, children }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative overflow-hidden`}>
      <div className={`absolute left-0 top-0 w-1 h-full ${accent} bg-current`}></div>
      <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-3">
        {icon} {title}
      </h3>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function StatRow({ label, value, bold = false, valueColor = "text-slate-900", indicator }) {
  return (
    <div className="flex justify-between items-center text-sm py-1">
      <div className="flex items-center gap-2">
        {indicator && <div className={`w-2 h-2 rounded-full ${indicator}`}></div>}
        <span className="text-slate-600">{label}</span>
      </div>
      <span className={`${bold ? 'font-bold' : 'font-semibold'} ${valueColor}`}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value, highlight = false }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

function Badge({ status, size = "sm" }) {
  const mapping = {
    NORMAL: 'bg-blue-50 text-blue-700 border-blue-200',
    VERIFIED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    FLAGGED: 'bg-rose-50 text-rose-700 border-rose-200'
  };
  
  const style = mapping[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  const sizeClasses = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[10px] uppercase tracking-wider';
  
  return (
    <span className={`font-bold rounded-md border ${style} ${sizeClasses}`}>
      {status}
    </span>
  );
}
