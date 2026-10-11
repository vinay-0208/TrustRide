import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform
} from 'react-native';
import io from 'socket.io-client';

const API_URL = 'http://127.0.0.1:8000/api';
const SOCKET_URL = 'http://127.0.0.1:8000';

// Dynamic Android & iOS system insets for Edge-to-Edge display
const STATUSBAR_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 40) : 0;
const BOTTOM_NAV_INSET = Platform.OS === 'android' ? 24 : 12;

export const formatINR = (
  value: number | string | null | undefined,
  options: { fallback?: string; showSign?: boolean } = {}
): string => {
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
    const formatted = `₹${absVal}`;
    if (num < 0) return `-${formatted}`;
    if (showSign && num > 0) return `+${formatted}`;
    return formatted;
  }
};

const RIDER_CANCELLATION_REASONS = [
  'Change of plans',
  'Booked by mistake',
  'Driver taking too long',
  'Found another ride',
  'Other'
];

const DRIVER_CANCELLATION_REASONS = [
  'Vehicle breakdown',
  'Safety concern',
  'Unable to reach pickup',
  'Emergency',
  'Other'
];

let socket: any = null;

export default function App() {
  // Authentication & Demo User State
  const [user, setUser] = useState<any>(null);
  const [driverId, setDriverId] = useState<any>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Navigation State
  // Rider tabs: 'book' | 'ledger' | 'profile'
  // Driver tabs: 'queue' | 'ledger' | 'profile'
  const [activeTab, setActiveTab] = useState<'book' | 'queue' | 'ledger' | 'profile'>('book');

  // Real-time Connection State
  const [isConnected, setIsConnected] = useState(false);

  // Active Ride & Queue State
  const [rides, setRides] = useState<any[]>([]);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [requestError, setRequestError] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);

  // Booking Form State
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [quotedFare, setQuotedFare] = useState('');

  // Cancellation Modal State
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [customExplanation, setCustomExplanation] = useState('');
  const [cancelModalError, setCancelModalError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // History / Audit Ledger State
  const [historyRides, setHistoryRides] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistoryRide, setSelectedHistoryRide] = useState<any>(null);

  const currentRideRef = useRef<any>(null);
  currentRideRef.current = currentRide;

  // ----------------------------------------------------
  // Data Fetching Handlers
  // ----------------------------------------------------
  const fetchPendingRequests = useCallback(async () => {
    try {
      setRequestError('');
      const res = await fetch(`${API_URL}/rides/requests`);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      if (data.rides && Array.isArray(data.rides)) {
        setRides((prev) => {
          const map = new Map<string, any>();
          data.rides.forEach((r: any) => map.set(r.id, r));
          prev.forEach((r: any) => {
            if (!map.has(r.id) && r.status === 'requested') {
              map.set(r.id, r);
            }
          });
          return Array.from(map.values()).filter((r) => r.status === 'requested');
        });
      }
    } catch (e: any) {
      console.warn('Failed to fetch pending requests:', e.message);
      setRequestError('Failed to load pending requests: ' + e.message);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      setHistoryLoading(true);
      setHistoryError('');
      let url = `${API_URL}/rides/history?role=${user.role}&userId=${user.id}`;
      if (user.role === 'driver' && driverId) {
        url += `&driverId=${driverId}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      setHistoryRides(data.rides || []);
    } catch (e: any) {
      setHistoryError('Failed to load history: ' + e.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [user, driverId]);

  // ----------------------------------------------------
  // Socket.IO Lifecycle
  // ----------------------------------------------------
  useEffect(() => {
    if (user) {
      if (!socket) socket = io(SOCKET_URL);

      const onConnect = () => {
        setIsConnected(true);
        const activeDriverId = driverId || user?.driverId || (user?.role === 'driver' ? user?.id : undefined);
        socket.emit('join', { userId: user.id, role: user.role, driverId: activeDriverId });
        if (user.role === 'driver') {
          fetchPendingRequests();
        }
      };

      const onDisconnect = () => {
        setIsConnected(false);
      };

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);

      if (socket.connected) {
        onConnect();
      }

      if (user.role === 'rider') {
        const onAccept = (ride: any) => {
          setCurrentRide(ride);
          setActiveTab('book');
        };
        const onStart = (ride: any) => {
          setCurrentRide(ride);
          setActiveTab('book');
        };
        const onComplete = (ride: any) => {
          setCurrentRide(ride);
          setActiveTab('book');
        };
        const onCancel = (data: any) => {
          const ride = data?.ride || data;
          setCancelModalVisible(false);
          if (currentRideRef.current && currentRideRef.current.id === ride?.id) {
            setCurrentRide(null);
            Alert.alert('Ride Cancelled', `The ride was cancelled: ${ride?.cancellationReason || 'No reason provided'}`);
          }
        };

        socket.on('ride:accepted', onAccept);
        socket.on('ride:started', onStart);
        socket.on('ride:completed', onComplete);
        socket.on('ride:cancelled', onCancel);

        return () => {
          if (socket) {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('ride:accepted', onAccept);
            socket.off('ride:started', onStart);
            socket.off('ride:completed', onComplete);
            socket.off('ride:cancelled', onCancel);
          }
        };
      } else if (user.role === 'driver') {
        fetchPendingRequests();

        const onNewRide = (ride: any) => {
          setRides((prev) => {
            if (prev.some((r) => r.id === ride.id)) return prev;
            return [ride, ...prev];
          });
        };
        const onAccept = (ride: any) => {
          setRides((prev) => prev.filter((r) => r.id !== ride.id));
          const activeDriverId = driverId || user?.driverId || user?.id;
          if (ride.driverId === activeDriverId || (driverId && ride.driverId === driverId)) {
            setCurrentRide(ride);
            setActiveTab('queue');
          }
        };
        const onCancel = (data: any) => {
          const ride = data?.ride || data;
          setRides((prev) => prev.filter((r) => r.id !== ride?.id));
          setCancelModalVisible(false);
          if (currentRideRef.current && currentRideRef.current.id === ride?.id) {
            setCurrentRide(null);
            Alert.alert('Ride Cancelled', `The ride was cancelled: ${ride?.cancellationReason || 'No reason provided'}`);
          }
        };
        const onStart = (ride: any) => {
          setRides((prev) => prev.filter((r) => r.id !== ride.id));
          const activeDriverId = driverId || user?.driverId || user?.id;
          if (ride.driverId === activeDriverId || (driverId && ride.driverId === driverId)) {
            setCurrentRide(ride);
            setActiveTab('queue');
          }
        };
        const onComplete = (ride: any) => {
          setRides((prev) => prev.filter((r) => r.id !== ride.id));
          const activeDriverId = driverId || user?.driverId || user?.id;
          if (ride.driverId === activeDriverId || (driverId && ride.driverId === driverId)) {
            setCurrentRide(ride);
            setActiveTab('queue');
          }
        };

        socket.on('ride:new', onNewRide);
        socket.on('ride:accepted', onAccept);
        socket.on('ride:cancelled', onCancel);
        socket.on('ride:started', onStart);
        socket.on('ride:completed', onComplete);

        return () => {
          if (socket) {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('ride:new', onNewRide);
            socket.off('ride:accepted', onAccept);
            socket.off('ride:cancelled', onCancel);
            socket.off('ride:started', onStart);
            socket.off('ride:completed', onComplete);
          }
        };
      }
    }
  }, [user, driverId, fetchPendingRequests]);

  // Refresh history automatically on switching to ledger tab
  useEffect(() => {
    if (user && activeTab === 'ledger') {
      fetchHistory();
    }
  }, [user, activeTab, fetchHistory]);

  // ----------------------------------------------------
  // Action Handlers
  // ----------------------------------------------------
  const login = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLoginError('Please enter a demo user or driver name.');
      return;
    }

    try {
      setIsLoggingIn(true);
      setLoginError('');
      const res = await fetch(API_URL + '/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, role })
      });
      const data = await res.json();
      setUser(data.user);
      if (data.driverId) setDriverId(data.driverId);

      // Default role landing screen: Rider -> Book Ride; Driver -> Requests Queue
      setActiveTab(data.user.role === 'rider' ? 'book' : 'queue');

      // Check ONLY for an in-flight active ride (requested, accepted, in_progress)
      const activeRideRes = await fetch(
        `${API_URL}/rides/active?role=${data.user.role}&userId=${data.user.id}${data.driverId ? `&driverId=${data.driverId}` : ''}`
      );
      const activeData = await activeRideRes.json();

      if (activeData.ride) {
        // If an in-flight trip is actually active, restore it
        setCurrentRide(activeData.ride);
      } else {
        // Fresh session: ensure no stale completed ride is displayed
        setCurrentRide(null);
      }
    } catch (e: any) {
      setLoginError(e.message || 'Login connection failed. Check backend status.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const requestRide = () => {
    if (!socket) return;
    if (!pickup.trim() || !destination.trim() || !quotedFare.trim()) {
      Alert.alert('Missing Fields', 'Please provide pickup location, destination, and quoted fare.');
      return;
    }

    setIsRequesting(true);
    socket.emit('ride:create', { riderId: user.id, pickup: pickup.trim(), destination: destination.trim(), quotedFare: quotedFare.trim() }, (res: any) => {
      setIsRequesting(false);
      if (res.success) {
        setCurrentRide(res.ride);
        setActiveTab('book');
      } else {
        Alert.alert('Request Failed', res.error || 'Could not broadcast ride request.');
      }
    });
  };

  const acceptRide = (ride: any) => {
    if (!socket) return;
    const activeDriverId = driverId || user?.id;
    socket.emit('ride:accept', { rideId: ride.id, driverId: activeDriverId }, (res: any) => {
      if (res.success) {
        setRides((prev) => prev.filter((r) => r.id !== ride.id));
        setCurrentRide(res.ride);
        setActiveTab('queue');
      } else {
        Alert.alert('Cannot Accept', res.error || 'Failed to accept ride request.');
        fetchPendingRequests();
      }
    });
  };

  const startTrip = () => {
    if (!socket || !currentRide) return;
    const activeDriverId = driverId || user?.id;
    socket.emit('ride:start', { rideId: currentRide.id, driverId: activeDriverId }, (res: any) => {
      if (res.success) {
        setCurrentRide(res.ride);
      } else {
        Alert.alert('Action Failed', res.error || 'Failed to start trip.');
      }
    });
  };

  const completeTrip = () => {
    if (!socket || !currentRide) return;
    const activeDriverId = driverId || user?.id;
    socket.emit('ride:complete', { rideId: currentRide.id, driverId: activeDriverId }, (res: any) => {
      if (res.success) {
        setCurrentRide(res.ride);
      } else {
        Alert.alert('Settlement Failed', res.error || 'Failed to settle and complete trip.');
      }
    });
  };

  const openCancelModal = () => {
    setSelectedReason('');
    setCustomExplanation('');
    setCancelModalError('');
    setIsCancelling(false);
    setCancelModalVisible(true);
  };

  const confirmCancelRide = () => {
    if (!selectedReason) {
      setCancelModalError('Please select a cancellation reason.');
      return;
    }
    if (selectedReason === 'Other' && !customExplanation.trim()) {
      setCancelModalError('Please provide a short explanation for "Other".');
      return;
    }

    if (!socket || !currentRide) {
      setCancelModalError('Cannot cancel: not connected or no active ride.');
      return;
    }

    const isDriver = user?.role === 'driver';
    const finalReason = selectedReason === 'Other' ? `Other: ${customExplanation.trim()}` : selectedReason;

    setIsCancelling(true);
    setCancelModalError('');

    const payload = {
      rideId: currentRide.id,
      cancelledBy: isDriver ? 'DRIVER' : 'RIDER',
      reason: finalReason,
      userId: user?.id,
      driverId: isDriver ? (driverId || user?.id) : undefined
    };

    socket.emit('ride:cancel', payload, (res: any) => {
      setIsCancelling(false);
      if (res?.success) {
        setCancelModalVisible(false);
        setCurrentRide(null);
      } else {
        setCancelModalError(res?.error || 'Failed to cancel ride.');
      }
    });
  };

  const logout = () => {
    setUser(null);
    setDriverId(null);
    setRides([]);
    setCurrentRide(null);
    setHistoryRides([]);
    setSelectedHistoryRide(null);
    setHistoryError('');
    setPickup('');
    setDestination('');
    setQuotedFare('');
    setRequestError('');
    setName('');
    setRole('rider');
    setActiveTab('book');
    setCancelModalVisible(false);
    setSelectedReason('');
    setCustomExplanation('');
    setCancelModalError('');
    setIsCancelling(false);
    setIsConnected(false);
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  const isTripActive = currentRide && ['requested', 'accepted', 'in_progress'].includes(currentRide.status);

  // ----------------------------------------------------
  // Render: Demo Login Screen (When !user)
  // ----------------------------------------------------
  if (!user) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0a192f" translucent={true} />
        {/* Top Header with Inset Clearance */}
        <View style={styles.headerContainer}>
          <View style={styles.brandTitleRow}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>TR</Text>
            </View>
            <View style={styles.brandTextCol}>
              <Text style={styles.brandName}>TrustRide</Text>
              <Text style={styles.headerSubtitle}>Demo Environment</Text>
            </View>
          </View>
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>PROTOTYPE</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Informational Callout */}
          <View style={styles.prototypeCallout}>
            <View style={styles.calloutHeader}>
              <View style={styles.calloutDot} />
              <Text style={styles.calloutTitle}>Demonstration Environment</Text>
            </View>
            <Text style={styles.calloutText}>
              Demonstrates upfront fare locking, real-time dispatch, and immutable post-trip settlement verification. No passwords or OTPs required.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Demo Workspace Access</Text>
              <Text style={styles.cardSubtitle}>
                Select an account role and enter your demonstration identity.
              </Text>
            </View>

            {loginError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{loginError}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Demonstration Name</Text>
            <TextInput
              style={styles.cleanInput}
              placeholder="e.g. Alice Walker, Rahul Sharma"
              placeholderTextColor="#94a3b8"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Select Workspace Role</Text>
            <View style={styles.roleSelectionContainer}>
              <TouchableOpacity
                style={[styles.roleCard, role === 'rider' && styles.roleCardActive]}
                onPress={() => setRole('rider')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardHeader}>
                  <View style={[styles.roleRadioCircle, role === 'rider' && styles.roleRadioCircleActive]}>
                    {role === 'rider' && <View style={styles.roleRadioDot} />}
                  </View>
                  <Text style={[styles.roleCardTitle, role === 'rider' && styles.roleCardTitleActive]}>
                    Passenger / Rider
                  </Text>
                </View>
                <Text style={styles.roleCardDesc}>
                  Request rides with locked upfront pricing and review immutable Firestore fare logs.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, role === 'driver' && styles.roleCardActive]}
                onPress={() => setRole('driver')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardHeader}>
                  <View style={[styles.roleRadioCircle, role === 'driver' && styles.roleRadioCircleActive]}>
                    {role === 'driver' && <View style={styles.roleRadioDot} />}
                  </View>
                  <Text style={[styles.roleCardTitle, role === 'driver' && styles.roleCardTitleActive]}>
                    Driver Partner
                  </Text>
                </View>
                <Text style={styles.roleCardDesc}>
                  Accept broadcast requests, verify 80% net payouts, and inspect platform fees.
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, isLoggingIn && { opacity: 0.7 }]}
              onPress={login}
              disabled={isLoggingIn}
              activeOpacity={0.85}
            >
              {isLoggingIn ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  Enter as {role === 'rider' ? 'Passenger' : 'Driver Partner'} →
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ----------------------------------------------------
  // Render: Logged-in Workspace (Rider or Driver)
  // ----------------------------------------------------
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a192f" translucent={true} />

      {/* Shared Header with Edge-to-Edge Status Bar Inset */}
      <View style={styles.headerContainer}>
        <View style={styles.brandTitleRow}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>TR</Text>
          </View>
          <View style={styles.brandTextCol}>
            <Text style={styles.brandName}>TrustRide</Text>
            <Text style={styles.headerSubtitle}>
              {user.role === 'rider' ? 'Passenger Portal' : 'Driver Partner'}
            </Text>
          </View>
        </View>

        {/* Compact unified role & connectivity indicator */}
        <View style={styles.headerRightInfo}>
          <View style={styles.unifiedStatusBadge}>
            <View style={[styles.statusDot, isConnected ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.unifiedStatusText}>
              {user.role === 'rider' ? 'RIDER' : 'DRIVER'}
            </Text>
          </View>
        </View>
      </View>

      {/* Persistent Active Ride Banner (Visible when user browses ledger/profile during active trip) */}
      {isTripActive && activeTab !== (user.role === 'rider' ? 'book' : 'queue') && (
        <TouchableOpacity
          style={styles.activeRideBanner}
          onPress={() => setActiveTab(user.role === 'rider' ? 'book' : 'queue')}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.pulseDot} />
              <Text style={styles.activeRideBannerTitle}>
                Trip Active: {currentRide.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.activeRideBannerSub} numberOfLines={1}>
              {currentRide.pickup} → {currentRide.destination} • {formatINR(currentRide.acceptedFare || currentRide.quotedFare)}
            </Text>
          </View>
          <View style={styles.activeRideBannerAction}>
            <Text style={styles.activeRideBannerActionText}>View Trip →</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Main Workspace Content Area */}
      <View style={{ flex: 1 }}>
        {/* ================================================= */}
        {/* RIDER: TAB 1 - BOOK RIDE & ACTIVE RIDE WORKFLOW   */}
        {/* ================================================= */}
        {user.role === 'rider' && activeTab === 'book' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Case A: Active In-Flight Ride — Requested / Waiting */}
            {currentRide?.status === 'requested' && (
              <View style={styles.card}>
                <View style={styles.statusBannerPending}>
                  <ActivityIndicator size="small" color="#0d9488" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statusBannerTextPending}>Broadcasting Request</Text>
                    <Text style={styles.statusBannerSubTextPending}>Awaiting driver acceptance on local network</Text>
                  </View>
                </View>

                <View style={styles.compactRouteBox}>
                  <View style={styles.routeItemRow}>
                    <View style={styles.pickupDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Pickup</Text>
                      <Text style={styles.routeItemText}>{currentRide?.pickup}</Text>
                    </View>
                  </View>
                  <View style={styles.routeConnectorLine} />
                  <View style={styles.routeItemRow}>
                    <View style={styles.dropoffSquare} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Destination</Text>
                      <Text style={styles.routeItemText}>{currentRide?.destination}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.fareHighlightStrip}>
                  <Text style={styles.fareHighlightLabel}>Locked Quoted Fare</Text>
                  <Text style={styles.fareHighlightValue}>{formatINR(currentRide?.quotedFare)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.cancelRideBtn}
                  onPress={openCancelModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelRideBtnText}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Case B: Active In-Flight Ride — Driver Accepted */}
            {currentRide?.status === 'accepted' && (
              <View style={styles.card}>
                <View style={styles.statusBannerSuccess}>
                  <Text style={styles.statusBannerTextSuccess}>Driver En Route</Text>
                  <Text style={styles.statusBannerSubTextSuccess}>Driver accepted your trip request</Text>
                </View>

                <View style={styles.compactMetaRow}>
                  <Text style={styles.metaRowLabel}>Assigned Driver:</Text>
                  <Text style={styles.metaRowValue}>{currentRide?.driverId}</Text>
                </View>

                <View style={styles.compactRouteBox}>
                  <View style={styles.routeItemRow}>
                    <View style={styles.pickupDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Pickup</Text>
                      <Text style={styles.routeItemText}>{currentRide?.pickup}</Text>
                    </View>
                  </View>
                  <View style={styles.routeConnectorLine} />
                  <View style={styles.routeItemRow}>
                    <View style={styles.dropoffSquare} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Destination</Text>
                      <Text style={styles.routeItemText}>{currentRide?.destination}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.fareHighlightStrip}>
                  <Text style={styles.fareHighlightLabel}>Agreed Locked Fare</Text>
                  <Text style={styles.fareHighlightValue}>{formatINR(currentRide?.acceptedFare)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.cancelRideBtn}
                  onPress={openCancelModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Case C: Active In-Flight Ride — Trip In Progress (Started) */}
            {currentRide?.status === 'in_progress' && (
              <View style={styles.card}>
                <View style={styles.statusBannerActive}>
                  <Text style={styles.statusBannerTextActive}>Trip in Progress</Text>
                  <Text style={styles.statusBannerSubTextActive}>En route to destination with locked fare</Text>
                </View>

                <View style={styles.compactRouteBox}>
                  <View style={styles.routeItemRow}>
                    <View style={styles.dropoffSquare} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Heading To</Text>
                      <Text style={styles.routeItemText}>{currentRide?.destination}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.fareHighlightStrip}>
                  <Text style={styles.fareHighlightLabel}>Agreed Locked Fare</Text>
                  <Text style={styles.fareHighlightValue}>{formatINR(currentRide?.acceptedFare)}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.cancelRideBtn, { marginTop: 14 }]}
                  onPress={openCancelModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelRideBtnText}>Cancel Active Trip</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Case D: Contextual Completed Ride Confirmation (shown only immediately after live completion) */}
            {currentRide?.status === 'completed' && (
              <View style={styles.card}>
                <View style={styles.statusBannerCompleted}>
                  <Text style={styles.statusBannerTextCompleted}>Trip Completed</Text>
                  <Text style={styles.statusBannerSubTextCompleted}>Settlement verified against initial quote</Text>
                </View>

                <View style={styles.compactRouteBox}>
                  <View style={styles.routeItemRow}>
                    <View style={styles.pickupDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Pickup</Text>
                      <Text style={styles.routeItemText}>{currentRide?.pickup}</Text>
                    </View>
                  </View>
                  <View style={styles.routeConnectorLine} />
                  <View style={styles.routeItemRow}>
                    <View style={styles.dropoffSquare} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Destination</Text>
                      <Text style={styles.routeItemText}>{currentRide?.destination}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.completedFareCard}>
                  <Text style={styles.completedFareLabel}>Final Settled Fare</Text>
                  <Text style={styles.completedFareValue}>{formatINR(currentRide?.finalFare)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => {
                    setCurrentRide(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Book Another Ride</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryBtn, { marginTop: 10 }]}
                  onPress={() => {
                    setCurrentRide(null);
                    setActiveTab('ledger');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>View in Activity Ledger</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Case E: Default Landing Screen — Fresh Rider Booking Home Form */}
            {(!currentRide || currentRide?.status === 'cancelled') && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Book a TrustRide</Text>
                  <Text style={styles.cardSubtitle}>
                    Upfront locked pricing verified against post-trip settlement
                  </Text>
                </View>

                {/* Direct, clean form fields */}
                <View style={styles.formSection}>
                  <View style={styles.formGroup}>
                    <View style={styles.inputHeaderRow}>
                      <View style={styles.pickupDot} />
                      <Text style={styles.fieldLabel}>Pickup Location</Text>
                    </View>
                    <TextInput
                      style={styles.cleanInput}
                      placeholder="e.g. 123 Main St, Campus Gate 1"
                      placeholderTextColor="#94a3b8"
                      value={pickup}
                      onChangeText={setPickup}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <View style={styles.inputHeaderRow}>
                      <View style={styles.dropoffSquare} />
                      <Text style={styles.fieldLabel}>Destination Location</Text>
                    </View>
                    <TextInput
                      style={styles.cleanInput}
                      placeholder="e.g. Airport Terminal 2, Central Station"
                      placeholderTextColor="#94a3b8"
                      value={destination}
                      onChangeText={setDestination}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <View style={styles.inputHeaderRow}>
                      <Text style={styles.rupeePrefix}>₹</Text>
                      <Text style={styles.fieldLabel}>Quoted Fare (INR)</Text>
                    </View>
                    <TextInput
                      style={styles.cleanInput}
                      placeholder="e.g. 150"
                      placeholderTextColor="#94a3b8"
                      value={quotedFare}
                      onChangeText={setQuotedFare}
                      keyboardType="numeric"
                    />
                    <Text style={styles.inputHint}>
                      Agreed upfront fare. Locked into Firestore upon broadcast.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, isRequesting && { opacity: 0.7 }]}
                  onPress={requestRide}
                  disabled={isRequesting}
                  activeOpacity={0.85}
                >
                  {isRequesting ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Confirm & Broadcast Request →</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.integrityNoticeBox}>
                  <Text style={styles.integrityNoticeTitle}>Trust Guarantee</Text>
                  <Text style={styles.integrityNoticeText}>
                    The quoted fare is locked upon broadcast. Any variance at settlement is automatically flagged on the monitoring dashboard.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* ================================================= */}
        {/* DRIVER: TAB 1 - REQUESTS QUEUE & ACTIVE WORKFLOW  */}
        {/* ================================================= */}
        {user.role === 'driver' && activeTab === 'queue' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Active Assignment in progress — Driver Accepted */}
            {currentRide?.status === 'accepted' && (
              <View style={styles.card}>
                <View style={styles.statusBannerSuccess}>
                  <Text style={styles.statusBannerTextSuccess}>Assignment Accepted</Text>
                  <Text style={styles.statusBannerSubTextSuccess}>Proceed to pickup passenger</Text>
                </View>

                <View style={styles.compactRouteBox}>
                  <View style={styles.routeItemRow}>
                    <View style={styles.pickupDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Pickup</Text>
                      <Text style={styles.routeItemText}>{currentRide?.pickup}</Text>
                    </View>
                  </View>
                  <View style={styles.routeConnectorLine} />
                  <View style={styles.routeItemRow}>
                    <View style={styles.dropoffSquare} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Destination</Text>
                      <Text style={styles.routeItemText}>{currentRide?.destination}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.fareHighlightStrip}>
                  <Text style={styles.fareHighlightLabel}>Accepted Fare</Text>
                  <Text style={styles.fareHighlightValue}>{formatINR(currentRide?.acceptedFare)}</Text>
                </View>

                <TouchableOpacity style={styles.primaryBtnSuccess} onPress={startTrip} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnSuccessText}>Start Trip</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cancelRideBtn, { marginTop: 10 }]}
                  onPress={openCancelModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelRideBtnText}>Cancel Assignment</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Active Assignment in progress — Trip In Progress (Started) */}
            {currentRide?.status === 'in_progress' && (
              <View style={styles.card}>
                <View style={styles.statusBannerActive}>
                  <Text style={styles.statusBannerTextActive}>Trip in Progress</Text>
                  <Text style={styles.statusBannerSubTextActive}>Driving to destination with locked fare</Text>
                </View>

                <View style={styles.compactRouteBox}>
                  <View style={styles.routeItemRow}>
                    <View style={styles.dropoffSquare} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routeItemLabel}>Destination</Text>
                      <Text style={styles.routeItemText}>{currentRide?.destination}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.fareHighlightStrip}>
                  <Text style={styles.fareHighlightLabel}>Settlement Fare</Text>
                  <Text style={styles.fareHighlightValue}>{formatINR(currentRide?.acceptedFare)}</Text>
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={completeTrip} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>Complete Trip & Settle</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cancelRideBtn, { marginTop: 10 }]}
                  onPress={openCancelModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelRideBtnText}>Cancel Trip</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Contextual Completed Ride Confirmation for Driver */}
            {currentRide?.status === 'completed' && (
              <View style={styles.card}>
                <View style={styles.statusBannerCompleted}>
                  <Text style={styles.statusBannerTextCompleted}>Trip Completed & Settled</Text>
                  <Text style={styles.statusBannerSubTextCompleted}>Settlement finalized and credited to driver balance</Text>
                </View>

                <View style={styles.completedFareCard}>
                  <Text style={styles.completedFareLabel}>Final Settled Fare</Text>
                  <Text style={styles.completedFareValue}>{formatINR(currentRide?.finalFare)}</Text>
                </View>

                <View style={{ gap: 8 }}>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => { setCurrentRide(null); setActiveTab('ledger'); }} activeOpacity={0.85}>
                    <Text style={styles.primaryBtnText}>View Earnings in Ledger</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setCurrentRide(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.secondaryBtnText}>Back to Requests Queue</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Default Landing Screen — Incoming Requests Queue */}
            {(!currentRide || currentRide?.status === 'cancelled') && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.cardTitle}>Incoming Requests</Text>
                    <Text style={styles.cardSubtitle}>Real-time passenger broadcast queue</Text>
                  </View>
                  <TouchableOpacity style={styles.compactOutlineBtn} onPress={fetchPendingRequests} activeOpacity={0.75}>
                    <Text style={styles.compactOutlineBtnText}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                {requestError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>{requestError}</Text>
                  </View>
                ) : null}

                {rides.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <Text style={styles.emptyStateTitle}>Queue is empty</Text>
                    <Text style={styles.emptyStateSubtitle}>
                      New nearby ride broadcasts will appear here in real time. Use Rider workspace to request rides.
                    </Text>
                  </View>
                ) : (
                  rides.map((r) => (
                    <View key={r.id} style={styles.driverRequestCard}>
                      <View style={styles.requestCardTopRow}>
                        <View style={styles.badgePending}>
                          <Text style={styles.badgeTextPending}>NEW</Text>
                        </View>
                        <Text style={styles.requestCardGrossFare}>
                          {formatINR(r.quotedFare)}
                        </Text>
                      </View>

                      {/* Clear, wrapped pickup and dropoff lines */}
                      <View style={styles.requestRouteBlock}>
                        <View style={styles.routeItemRow}>
                          <View style={styles.pickupDot} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.routePointLabel}>Pickup</Text>
                            <Text style={styles.requestRouteText}>{r.pickup}</Text>
                          </View>
                        </View>
                        <View style={styles.routeConnectorLineShort} />
                        <View style={styles.routeItemRow}>
                          <View style={styles.dropoffSquare} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.routePointLabel}>Dropoff</Text>
                            <Text style={styles.requestRouteText}>{r.destination}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.driverPayoutStrip}>
                        <Text style={styles.driverPayoutStripLabel}>Promised Net (80%):</Text>
                        <Text style={styles.driverPayoutStripValue}>
                          {formatINR(Number(r.quotedFare) * 0.8)}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => acceptRide(r)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.acceptBtnText}>Accept Ride</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        )}

        {/* ================================================= */}
        {/* COMMON: TAB 2 - ACTIVITY / AUDIT LEDGER           */}
        {/* ================================================= */}
        {activeTab === 'ledger' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.cardTitle}>
                    {selectedHistoryRide
                      ? 'Audit Record'
                      : user?.role === 'rider'
                      ? 'Passenger Ledger'
                      : 'Driver Ledger'}
                  </Text>
                  <Text style={styles.cardSubtitle}>Immutable Firestore transparency records</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {!selectedHistoryRide && (
                    <TouchableOpacity style={styles.compactOutlineBtn} onPress={fetchHistory} activeOpacity={0.75}>
                      <Text style={styles.compactOutlineBtnText}>Refresh</Text>
                    </TouchableOpacity>
                  )}
                  {selectedHistoryRide && (
                    <TouchableOpacity
                      style={styles.compactSecondaryBtn}
                      onPress={() => setSelectedHistoryRide(null)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.compactSecondaryBtnText}>Back to List</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {historyLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#0d9488" />
                  <Text style={styles.loadingText}>Loading audit ledger...</Text>
                </View>
              ) : historyError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{historyError}</Text>
                  <TouchableOpacity style={[styles.primaryBtn, { marginTop: 8 }]} onPress={fetchHistory} activeOpacity={0.85}>
                    <Text style={styles.primaryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : selectedHistoryRide ? (
                /* Inspection Detail View */
                <View style={{ gap: 10 }}>
                  <View style={styles.auditHeaderCard}>
                    <View style={styles.compactRouteBox}>
                      <View style={styles.routeItemRow}>
                        <View style={styles.pickupDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.routeItemLabel}>Pickup</Text>
                          <Text style={styles.routeItemText}>{selectedHistoryRide.pickup}</Text>
                        </View>
                      </View>
                      <View style={styles.routeConnectorLine} />
                      <View style={styles.routeItemRow}>
                        <View style={styles.dropoffSquare} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.routeItemLabel}>Destination</Text>
                          <Text style={styles.routeItemText}>{selectedHistoryRide.destination}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.metaInfoRow}>
                      <Text style={styles.metaInfoLabel}>Logged:</Text>
                      <Text style={styles.metaInfoValue}>
                        {new Date(selectedHistoryRide.completedAt || selectedHistoryRide.cancelledAt || selectedHistoryRide.createdAt).toLocaleString()}
                      </Text>
                    </View>

                    <View style={styles.statusPillsRow}>
                      <View style={selectedHistoryRide.status === 'completed' ? styles.badgeSuccess : styles.badgeDanger}>
                        <Text style={selectedHistoryRide.status === 'completed' ? styles.badgeTextSuccess : styles.badgeTextDanger}>
                          {selectedHistoryRide.status.toUpperCase()}
                        </Text>
                      </View>
                      {selectedHistoryRide.trustStatus && (
                        <View style={selectedHistoryRide.trustStatus === 'VERIFIED' ? styles.badgeVerified : styles.badgeReview}>
                          <Text style={selectedHistoryRide.trustStatus === 'VERIFIED' ? styles.badgeTextVerified : styles.badgeTextReview}>
                            {selectedHistoryRide.trustStatus}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {selectedHistoryRide.status === 'cancelled' && (
                    <View style={styles.cancellationNoticeBox}>
                      <Text style={styles.cancellationNoticeTitle}>Cancellation Details</Text>
                      <Text style={styles.cancellationNoticeLine}>Party: {selectedHistoryRide.cancelledBy || 'N/A'}</Text>
                      <Text style={styles.cancellationNoticeLine}>Reason: {selectedHistoryRide.cancellationReason || 'No reason provided'}</Text>
                      {selectedHistoryRide.cancelledAfterStart && (
                        <Text style={styles.cancellationNoticeWarning}>
                          Post-start cancellation recorded
                        </Text>
                      )}
                    </View>
                  )}

                  <View style={styles.financialSummaryCard}>
                    <Text style={styles.financialSummaryTitle}>Financial Audit Trail</Text>
                    <View style={styles.financialSummaryRow}>
                      <Text style={styles.financialSummaryLabel}>Quoted Fare:</Text>
                      <Text style={styles.financialSummaryValue}>{formatINR(selectedHistoryRide.quotedFare)}</Text>
                    </View>
                    <View style={styles.financialSummaryRow}>
                      <Text style={styles.financialSummaryLabel}>Final Fare:</Text>
                      <Text style={styles.financialSummaryValue}>{formatINR(selectedHistoryRide.finalFare)}</Text>
                    </View>
                    <View style={styles.financialSummaryRow}>
                      <Text style={styles.financialSummaryLabel}>Fare Discrepancy:</Text>
                      <Text style={[styles.financialSummaryValue, selectedHistoryRide.fareDiscrepancy !== 0 && { color: '#dc2626' }]}>
                        {formatINR(selectedHistoryRide.fareDiscrepancy, { showSign: true, fallback: '₹0' })}
                      </Text>
                    </View>

                    {user?.role === 'driver' && (
                      <>
                        <View style={styles.divider} />
                        <View style={styles.financialSummaryRow}>
                          <Text style={styles.financialSummaryLabel}>Platform Fee (20%):</Text>
                          <Text style={styles.financialSummaryValue}>{formatINR(selectedHistoryRide.platformCommission)}</Text>
                        </View>
                        <View style={styles.financialSummaryRow}>
                          <Text style={styles.financialSummaryLabel}>Promised Net (80%):</Text>
                          <Text style={styles.financialSummaryValue}>{formatINR(selectedHistoryRide.promisedEarnings)}</Text>
                        </View>
                        <View style={styles.financialSummaryRow}>
                          <Text style={styles.financialSummaryLabelBold}>Actual Payout:</Text>
                          <Text style={styles.financialSummaryValueSuccess}>{formatINR(selectedHistoryRide.actualEarnings)}</Text>
                        </View>
                        <View style={styles.financialSummaryRow}>
                          <Text style={styles.financialSummaryLabel}>Difference:</Text>
                          <Text style={[styles.financialSummaryValue, selectedHistoryRide.earningsDifference !== 0 && { color: '#ea580c' }]}>
                            {formatINR(selectedHistoryRide.earningsDifference, { showSign: true, fallback: '₹0' })}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>

                  <View style={styles.diagnosticsIdBox}>
                    <Text style={styles.diagnosticsIdLabel} selectable={true}>Ride ID: {selectedHistoryRide.id}</Text>
                    {selectedHistoryRide.trustRecordId && (
                      <Text style={styles.diagnosticsIdLabel} selectable={true}>TrustRecord ID: {selectedHistoryRide.trustRecordId}</Text>
                    )}
                  </View>
                </View>
              ) : historyRides.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <Text style={styles.emptyStateTitle}>No trips on record</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Completed or cancelled trips will appear here in the immutable ledger.
                  </Text>
                </View>
              ) : (
                /* History List */
                historyRides.map((r) => (
                  <View key={r.id} style={styles.historyCard}>
                    <View style={styles.historyCardHeader}>
                      <View style={r.status === 'completed' ? styles.badgeSuccess : styles.badgeDanger}>
                        <Text style={r.status === 'completed' ? styles.badgeTextSuccess : styles.badgeTextDanger}>
                          {r.status.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.historyTimestamp}>
                        {new Date(r.completedAt || r.cancelledAt || r.createdAt).toLocaleDateString()}
                      </Text>
                    </View>

                    {/* Route */}
                    <View style={styles.historyRouteBox}>
                      <View style={styles.routeItemRow}>
                        <View style={styles.pickupDot} />
                        <Text style={styles.historyRouteText}>{r.pickup}</Text>
                      </View>
                      <View style={styles.routeConnectorLineShort} />
                      <View style={styles.routeItemRow}>
                        <View style={styles.dropoffSquare} />
                        <Text style={styles.historyRouteText}>{r.destination}</Text>
                      </View>
                    </View>

                    {r.status === 'cancelled' && r.cancellationReason && (
                      <Text style={styles.historyCancelReason}>
                        Reason: {r.cancellationReason}
                      </Text>
                    )}

                    <View style={styles.historyFinancialRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.historyGrossLabel}>Gross Fare</Text>
                        <Text style={styles.historyGrossValue}>
                          {formatINR(r.finalFare ?? r.quotedFare)}
                          {r.fareDiscrepancy ? ` (${formatINR(r.fareDiscrepancy, { showSign: true })})` : ''}
                        </Text>
                      </View>

                      {user?.role === 'driver' && r.actualEarnings !== null && (
                        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                          <Text style={styles.historyPayoutLabel}>Net Payout</Text>
                          <Text style={styles.historyPayoutValue}>
                            {formatINR(r.actualEarnings)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.historyBottomRow}>
                      {r.trustStatus ? (
                        <View style={r.trustStatus === 'VERIFIED' ? styles.badgeVerified : styles.badgeReview}>
                          <Text style={r.trustStatus === 'VERIFIED' ? styles.badgeTextVerified : styles.badgeTextReview}>
                            {r.trustStatus}
                          </Text>
                        </View>
                      ) : <View />}

                      <TouchableOpacity
                        style={styles.compactInspectBtn}
                        onPress={() => setSelectedHistoryRide(r)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.compactInspectBtnText}>Inspect Record →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

        {/* ================================================= */}
        {/* COMMON: TAB 3 - ACCESS PROFILE & SESSION MGMT     */}
        {/* ================================================= */}
        {activeTab === 'profile' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Card 1: Session Profile & Account Action */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Session Profile</Text>
                <Text style={styles.cardSubtitle}>Active identity and account controls</Text>
              </View>

              {/* User Identity Section */}
              <View style={styles.profileIdentityBox}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {user.name ? user.name.slice(0, 2).toUpperCase() : 'TR'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileName}>{user.name}</Text>
                  <Text style={styles.profileRoleText}>
                    {user.role === 'rider' ? 'Passenger / Rider' : 'Driver Partner'}
                  </Text>
                </View>
              </View>

              {/* Account Switching Action */}
              <TouchableOpacity
                style={styles.switchAccountBtn}
                onPress={logout}
                activeOpacity={0.85}
              >
                <Text style={styles.switchAccountBtnText}>Switch Account / Log Out</Text>
              </TouchableOpacity>
            </View>

            {/* Card 2: Dedicated System Diagnostics & Network Section */}
            <View style={[styles.card, { marginTop: 14 }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>System Diagnostics</Text>
                <Text style={styles.cardSubtitle}>Real-time connectivity and platform parameters</Text>
              </View>

              <View style={styles.diagnosticsContainer}>
                <View style={styles.diagnosticsRow}>
                  <Text style={styles.diagnosticsLabel}>Socket Connection</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.statusDot, isConnected ? styles.dotOnline : styles.dotOffline]} />
                    <Text style={[styles.diagnosticsValue, isConnected ? { color: '#059669' } : { color: '#dc2626' }]}>
                      {isConnected ? 'Connected (Real-time)' : 'Disconnected'}
                    </Text>
                  </View>
                </View>

                <View style={styles.diagnosticsRow}>
                  <Text style={styles.diagnosticsLabel}>User ID</Text>
                  <Text style={styles.diagnosticsValueMono} selectable={true}>{user.id}</Text>
                </View>

                {driverId && (
                  <View style={styles.diagnosticsRow}>
                    <Text style={styles.diagnosticsLabel}>Driver ID</Text>
                    <Text style={styles.diagnosticsValueMono} selectable={true}>{driverId}</Text>
                  </View>
                )}

                <View style={styles.diagnosticsRow}>
                  <Text style={styles.diagnosticsLabel}>Backend Endpoint</Text>
                  <Text style={styles.diagnosticsValueMono} selectable={true}>{API_URL}</Text>
                </View>

                <View style={[styles.diagnosticsRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.diagnosticsLabel}>Platform Currency</Text>
                  <Text style={styles.diagnosticsValue}>Indian Rupee (INR ₹)</Text>
                </View>
              </View>
            </View>

            <Text style={styles.prototypeNoticeText}>
              TrustRide Prototype Environment • P2P Verification Layer
            </Text>
          </ScrollView>
        )}
      </View>

      {/* ================================================= */}
      {/* ROLE-AWARE BOTTOM NAVIGATION TAB BAR              */}
      {/* ================================================= */}
      <View style={styles.bottomTabBar}>
        {user.role === 'rider' ? (
          <>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'book' && styles.tabItemActive]}
              onPress={() => setActiveTab('book')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, activeTab === 'book' && styles.tabIconActive]}>🚗</Text>
              <Text style={[styles.tabLabel, activeTab === 'book' && styles.tabLabelActive]}>
                Book Ride
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'ledger' && styles.tabItemActive]}
              onPress={() => setActiveTab('ledger')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, activeTab === 'ledger' && styles.tabIconActive]}>📋</Text>
              <Text style={[styles.tabLabel, activeTab === 'ledger' && styles.tabLabelActive]}>
                Ledger
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'profile' && styles.tabItemActive]}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, activeTab === 'profile' && styles.tabIconActive]}>👤</Text>
              <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>
                Profile
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'queue' && styles.tabItemActive]}
              onPress={() => setActiveTab('queue')}
              activeOpacity={0.7}
            >
              <View>
                <Text style={[styles.tabIcon, activeTab === 'queue' && styles.tabIconActive]}>📡</Text>
                {rides.length > 0 && !currentRide && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{rides.length}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, activeTab === 'queue' && styles.tabLabelActive]}>
                Requests
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'ledger' && styles.tabItemActive]}
              onPress={() => setActiveTab('ledger')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, activeTab === 'ledger' && styles.tabIconActive]}>💵</Text>
              <Text style={[styles.tabLabel, activeTab === 'ledger' && styles.tabLabelActive]}>
                Ledger
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'profile' && styles.tabItemActive]}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, activeTab === 'profile' && styles.tabIconActive]}>👤</Text>
              <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>
                Profile
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ================================================= */}
      {/* CANCELLATION REASON SELECTOR MODAL                */}
      {/* ================================================= */}
      <Modal
        visible={cancelModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!isCancelling) setCancelModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel Trip</Text>
            <Text style={styles.modalSubtitle}>
              Select a reason to record in the platform transparency audit log:
            </Text>

            {cancelModalError ? (
              <View style={styles.modalErrorContainer}>
                <Text style={styles.modalErrorText}>{cancelModalError}</Text>
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: 260, marginVertical: 8 }}>
              {(user?.role === 'driver' ? DRIVER_CANCELLATION_REASONS : RIDER_CANCELLATION_REASONS).map((item) => {
                const isSelected = selectedReason === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[styles.reasonItem, isSelected && styles.reasonItemSelected]}
                    onPress={() => {
                      setSelectedReason(item);
                      setCancelModalError('');
                    }}
                    disabled={isCancelling}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <Text style={[styles.reasonItemText, isSelected && styles.reasonItemTextSelected]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {selectedReason === 'Other' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.otherLabel}>Specific Explanation (Required):</Text>
                  <TextInput
                    style={styles.otherInput}
                    placeholder="Enter brief explanation..."
                    placeholderTextColor="#94a3b8"
                    value={customExplanation}
                    onChangeText={(val) => {
                      setCustomExplanation(val);
                      if (cancelModalError) setCancelModalError('');
                    }}
                    editable={!isCancelling}
                    multiline
                  />
                </View>
              )}
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalKeepBtn]}
                onPress={() => setCancelModalVisible(false)}
                disabled={isCancelling}
                activeOpacity={0.8}
              >
                <Text style={styles.modalKeepBtnText}>Keep Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn, isCancelling && { opacity: 0.6 }]}
                onPress={confirmCancelRide}
                disabled={isCancelling}
                activeOpacity={0.85}
              >
                {isCancelling ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Confirm Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  // Scroll content has clearance for the bottom navigation bar and gesture area
  scrollContent: {
    padding: 16,
    paddingBottom: 90 + BOTTOM_NAV_INSET
  },
  // Header with edge-to-edge status bar clearance
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: STATUSBAR_INSET + 10,
    paddingBottom: 14,
    backgroundColor: '#0a192f',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
    gap: 10
  },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  brandBadgeText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15
  },
  brandTextCol: {
    flex: 1,
    justifyContent: 'center'
  },
  brandName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 1
  },
  headerRightInfo: {
    flexShrink: 0
  },
  unifiedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: 6
  },
  unifiedStatusText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  dotOnline: {
    backgroundColor: '#10b981'
  },
  dotOffline: {
    backgroundColor: '#ef4444'
  },
  demoBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0d9488'
  },
  demoBadgeText: {
    color: '#2dd4bf',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  // Prototype Callout
  prototypeCallout: {
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#ccfbf1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4
  },
  calloutDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#0d9488'
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e'
  },
  calloutText: {
    fontSize: 12,
    color: '#134e4a',
    lineHeight: 16
  },
  // Persistent Active Ride Banner
  activeRideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#0d9488'
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2dd4bf'
  },
  activeRideBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2dd4bf',
    letterSpacing: 0.3
  },
  activeRideBannerSub: {
    fontSize: 12,
    color: '#e2e8f0',
    marginTop: 2
  },
  activeRideBannerAction: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#0d9488',
    borderRadius: 6,
    marginLeft: 8
  },
  activeRideBannerActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  // Card Foundation
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1
  },
  cardHeader: {
    marginBottom: 14
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.2
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  // Booking Form Inputs
  formSection: {
    gap: 12,
    marginBottom: 14
  },
  formGroup: {
    gap: 4
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  rupeePrefix: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0d9488'
  },
  cleanInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 44
  },
  inputHint: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  integrityNoticeBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginTop: 12
  },
  integrityNoticeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2
  },
  integrityNoticeText: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15
  },
  // Generic Inputs & Selectors (Login)
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 4,
    textTransform: 'uppercase'
  },
  roleSelectionContainer: {
    gap: 8,
    marginBottom: 16
  },
  roleCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12
  },
  roleCardActive: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488'
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2
  },
  roleRadioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  roleRadioCircleActive: {
    borderColor: '#0d9488'
  },
  roleRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0d9488'
  },
  roleCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b'
  },
  roleCardTitleActive: {
    color: '#0f766e'
  },
  roleCardDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
    marginLeft: 24
  },
  // Buttons
  primaryBtn: {
    backgroundColor: '#0d9488',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  primaryBtnSuccess: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46
  },
  primaryBtnSuccessText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  secondaryBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42
  },
  secondaryBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600'
  },
  compactOutlineBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center'
  },
  compactOutlineBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600'
  },
  compactSecondaryBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center'
  },
  compactSecondaryBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600'
  },
  // Status Banners
  statusBannerPending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#ccfbf1',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  statusBannerTextPending: {
    color: '#0f766e',
    fontWeight: '700',
    fontSize: 13
  },
  statusBannerSubTextPending: {
    color: '#134e4a',
    fontSize: 11,
    marginTop: 1
  },
  statusBannerSuccess: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  statusBannerTextSuccess: {
    color: '#065f46',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center'
  },
  statusBannerSubTextSuccess: {
    color: '#047857',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 1
  },
  statusBannerActive: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  statusBannerTextActive: {
    color: '#1e40af',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center'
  },
  statusBannerSubTextActive: {
    color: '#2563eb',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 1
  },
  statusBannerCompleted: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  statusBannerTextCompleted: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center'
  },
  statusBannerSubTextCompleted: {
    color: '#15803d',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 1
  },
  // Route Box
  compactRouteBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10
  },
  routeItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginTop: 4,
    flexShrink: 0
  },
  dropoffSquare: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#0d9488',
    marginTop: 4,
    flexShrink: 0
  },
  routeConnectorLine: {
    width: 1.5,
    height: 12,
    backgroundColor: '#cbd5e1',
    marginLeft: 3.5,
    marginVertical: 2
  },
  routeConnectorLineShort: {
    width: 1.5,
    height: 8,
    backgroundColor: '#cbd5e1',
    marginLeft: 3.5,
    marginVertical: 1
  },
  routeItemLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  routePointLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 1
  },
  routeItemText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    marginTop: 1,
    lineHeight: 17
  },
  fareHighlightStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 10
  },
  fareHighlightLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  fareHighlightValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0d9488'
  },
  completedFareCard: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12
  },
  completedFareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase'
  },
  completedFareValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8
  },
  metaRowLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600'
  },
  metaRowValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700'
  },
  cancelRideBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42
  },
  cancelRideBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13
  },
  // Driver Incoming Request Card
  driverRequestCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  requestCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  requestCardGrossFare: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a'
  },
  requestRouteBlock: {
    marginBottom: 8
  },
  requestRouteText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    lineHeight: 17,
    flex: 1
  },
  driverPayoutStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 8
  },
  driverPayoutStripLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600'
  },
  driverPayoutStripValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669'
  },
  acceptBtn: {
    backgroundColor: '#0d9488',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42
  },
  acceptBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13
  },
  emptyStateContainer: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569'
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 16
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10
  },
  errorBannerText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '500'
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6
  },
  loadingText: {
    color: '#64748b',
    fontSize: 12
  },
  // Ledger Detail View
  auditHeaderCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10
  },
  metaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  metaInfoLabel: {
    fontSize: 11,
    color: '#64748b'
  },
  metaInfoValue: {
    fontSize: 11,
    color: '#0f172a',
    fontWeight: '600'
  },
  statusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8
  },
  badgePending: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeTextPending: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700'
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeTextSuccess: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '700'
  },
  badgeDanger: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeTextDanger: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '700'
  },
  badgeVerified: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeTextVerified: {
    color: '#0369a1',
    fontSize: 10,
    fontWeight: '700'
  },
  badgeReview: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeTextReview: {
    color: '#b45309',
    fontSize: 10,
    fontWeight: '700'
  },
  cancellationNoticeBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    padding: 10
  },
  cancellationNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 2
  },
  cancellationNoticeLine: {
    fontSize: 11,
    color: '#78350f',
    marginTop: 1
  },
  cancellationNoticeWarning: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 2
  },
  financialSummaryCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10
  },
  financialSummaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6
  },
  financialSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3
  },
  financialSummaryLabel: {
    fontSize: 11,
    color: '#64748b'
  },
  financialSummaryLabelBold: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a'
  },
  financialSummaryValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a'
  },
  financialSummaryValueSuccess: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669'
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4
  },
  diagnosticsIdBox: {
    padding: 8,
    alignItems: 'center',
    gap: 2
  },
  diagnosticsIdLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  // Ledger List Cards
  historyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  historyTimestamp: {
    fontSize: 11,
    color: '#94a3b8'
  },
  historyRouteBox: {
    marginBottom: 6
  },
  historyRouteText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
    lineHeight: 16,
    flex: 1
  },
  historyCancelReason: {
    fontSize: 11,
    color: '#dc2626',
    marginVertical: 2
  },
  historyFinancialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 4
  },
  historyGrossLabel: {
    fontSize: 10,
    color: '#64748b'
  },
  historyGrossValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  historyPayoutLabel: {
    fontSize: 10,
    color: '#64748b'
  },
  historyPayoutValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669'
  },
  historyBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6
  },
  compactInspectBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#f1f5f9'
  },
  compactInspectBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a'
  },
  // Profile Section Styles
  profileIdentityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    marginBottom: 12
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0a192f',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileAvatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  profileRoleText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1
  },
  switchAccountBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 44
  },
  switchAccountBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13
  },
  diagnosticsContainer: {
    paddingTop: 2
  },
  diagnosticsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  diagnosticsLabel: {
    fontSize: 11,
    color: '#64748b'
  },
  diagnosticsValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600'
  },
  diagnosticsValueMono: {
    fontSize: 11,
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  prototypeNoticeText: {
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12
  },
  // Shared Bottom Tab Navigation Bar with Android gesture navigation inset
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    paddingBottom: BOTTOM_NAV_INSET,
    paddingHorizontal: 8,
    minHeight: 52 + BOTTOM_NAV_INSET,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 4
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    borderRadius: 6,
    minHeight: 44
  },
  tabItemActive: {
    backgroundColor: '#f0fdfa'
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
    opacity: 0.5
  },
  tabIconActive: {
    opacity: 1
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b'
  },
  tabLabelActive: {
    color: '#0d9488',
    fontWeight: '700'
  },
  tabBadge: {
    position: 'absolute',
    top: -3,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 7,
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800'
  },
  // Cancellation Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    elevation: 6
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8
  },
  modalErrorContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    padding: 6,
    borderRadius: 6,
    marginBottom: 6
  },
  modalErrorText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '600'
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
    backgroundColor: '#f8fafc',
    minHeight: 40
  },
  reasonItemSelected: {
    borderColor: '#0d9488',
    backgroundColor: '#f0fdfa'
  },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  radioOuterSelected: {
    borderColor: '#0d9488'
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0d9488'
  },
  reasonItemText: {
    fontSize: 13,
    color: '#334155'
  },
  reasonItemTextSelected: {
    color: '#0f766e',
    fontWeight: '700'
  },
  otherLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 3
  },
  otherInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 8,
    minHeight: 50,
    backgroundColor: '#ffffff',
    fontSize: 12,
    color: '#0f172a',
    textAlignVertical: 'top'
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42
  },
  modalKeepBtn: {
    backgroundColor: '#f1f5f9'
  },
  modalKeepBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13
  },
  modalConfirmBtn: {
    backgroundColor: '#dc2626'
  },
  modalConfirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13
  }
});
