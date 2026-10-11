import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import io from 'socket.io-client';

const API_URL = 'http://127.0.0.1:8000/api';
const SOCKET_URL = 'http://127.0.0.1:8000';

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
  const [user, setUser] = useState<any>(null);
  const [driverId, setDriverId] = useState<any>(null);
  const [currentScreen, setCurrentScreen] = useState('Login');
  const [rides, setRides] = useState<any[]>([]);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [requestError, setRequestError] = useState('');

  const currentRideRef = useRef<any>(null);
  currentRideRef.current = currentRide;

  // Cancellation Modal state
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [customExplanation, setCustomExplanation] = useState('');
  const [cancelModalError, setCancelModalError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // History state
  const [historyRides, setHistoryRides] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistoryRide, setSelectedHistoryRide] = useState<any>(null);
  const [previousScreen, setPreviousScreen] = useState('RiderHome');

  const [name, setName] = useState('');
  const [role, setRole] = useState('rider');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [quotedFare, setQuotedFare] = useState('');

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

  const openHistory = () => {
    setPreviousScreen(currentScreen);
    setSelectedHistoryRide(null);
    setCurrentScreen('RideHistory');
    fetchHistory();
  };

  const closeHistory = () => {
    setSelectedHistoryRide(null);
    setCurrentScreen(previousScreen || (user?.role === 'rider' ? 'RiderHome' : 'DriverHome'));
  };

  useEffect(() => {
    if (user) {
      if (!socket) socket = io(SOCKET_URL);
      
      const onConnect = () => {
        const activeDriverId = driverId || user?.driverId || (user?.role === 'driver' ? user?.id : undefined);
        socket.emit('join', { userId: user.id, role: user.role, driverId: activeDriverId });
        if (user.role === 'driver') {
          fetchPendingRequests();
        }
      };
      socket.on('connect', onConnect);

      if (socket.connected) {
        onConnect();
      }

      if (user.role === 'rider') {
        const onAccept = (ride: any) => {
          setCurrentRide(ride);
          setCurrentScreen('RiderAccepted');
        };
        const onStart = (ride: any) => {
          setCurrentRide(ride);
          setCurrentScreen('RiderStarted');
        };
        const onComplete = (ride: any) => {
          setCurrentRide(ride);
          setCurrentScreen('RiderCompleted');
        };
        const onCancel = (data: any) => {
          const ride = data?.ride || data;
          setCancelModalVisible(false);
          if (currentRideRef.current && currentRideRef.current.id === ride?.id) {
            setCurrentRide(null);
            setCurrentScreen('RiderHome');
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
            setCurrentScreen('DriverAccepted');
          }
        };
        const onCancel = (data: any) => {
          const ride = data?.ride || data;
          setRides((prev) => prev.filter((r) => r.id !== ride?.id));
          setCancelModalVisible(false);
          if (currentRideRef.current && currentRideRef.current.id === ride?.id) {
            setCurrentRide(null);
            setCurrentScreen('DriverHome');
            Alert.alert('Ride Cancelled', `The ride was cancelled: ${ride?.cancellationReason || 'No reason provided'}`);
          }
        };
        const onStart = (ride: any) => {
          setRides((prev) => prev.filter((r) => r.id !== ride.id));
          const activeDriverId = driverId || user?.driverId || user?.id;
          if (ride.driverId === activeDriverId || (driverId && ride.driverId === driverId)) {
            setCurrentRide(ride);
            setCurrentScreen('DriverStarted');
          }
        };
        const onComplete = (ride: any) => {
          setRides((prev) => prev.filter((r) => r.id !== ride.id));
          const activeDriverId = driverId || user?.driverId || user?.id;
          if (ride.driverId === activeDriverId || (driverId && ride.driverId === driverId)) {
            setCurrentRide(ride);
            setCurrentScreen('DriverCompleted');
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

  const login = async () => {
    try {
      const res = await fetch(API_URL + '/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role })
      });
      const data = await res.json();
      setUser(data.user);
      if (data.driverId) setDriverId(data.driverId);
      
      const activeRideRes = await fetch(`${API_URL}/rides/active?role=${data.user.role}&userId=${data.user.id}${data.driverId ? `&driverId=${data.driverId}` : ''}`);
      const activeData = await activeRideRes.json();
      
      if (activeData.ride) {
        setCurrentRide(activeData.ride);
        const st = activeData.ride.status;
        if (data.user.role === 'rider') {
           if (st === 'requested') setCurrentScreen('RiderWaiting');
           else if (st === 'accepted') setCurrentScreen('RiderAccepted');
           else if (st === 'in_progress') setCurrentScreen('RiderStarted');
           else setCurrentScreen('RiderHome');
        } else {
           if (st === 'accepted') setCurrentScreen('DriverAccepted');
           else if (st === 'in_progress') setCurrentScreen('DriverStarted');
           else setCurrentScreen('DriverHome');
        }
      } else {
        if (data.user.role === 'rider') {
          const lastRes = await fetch(`${API_URL}/rides/last-completed?riderId=${data.user.id}`);
          const lastData = await lastRes.json();
          if (lastData.ride) {
            setCurrentRide(lastData.ride);
            setCurrentScreen('RiderCompleted');
          } else {
            setCurrentScreen('RiderHome');
          }
        } else {
          setCurrentScreen('DriverHome');
        }
      }
    } catch(e: any) { alert(e.message); }
  };

  const requestRide = () => {
    if (!socket) return;
    socket.emit('ride:create', { riderId: user.id, pickup, destination, quotedFare }, (res: any) => {
      if (res.success) {
        setCurrentRide(res.ride);
        setCurrentScreen('RiderWaiting');
      } else {
        alert(res.error);
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
        setCurrentScreen('DriverAccepted');
      } else {
        alert(res.error || 'Failed to accept ride');
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
        setCurrentScreen('DriverStarted');
      } else {
        alert(res.error);
      }
    });
  };

  const completeTrip = () => {
    if (!socket || !currentRide) return;
    const activeDriverId = driverId || user?.id;
    socket.emit('ride:complete', { rideId: currentRide.id, driverId: activeDriverId }, (res: any) => {
      if (res.success) {
        setCurrentRide(res.ride);
        setCurrentScreen('DriverCompleted');
      } else {
        alert(res.error);
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
        setCurrentScreen(isDriver ? 'DriverHome' : 'RiderHome');
      } else {
        setCancelModalError(res?.error || 'Failed to cancel ride');
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
    setCancelModalVisible(false);
    setSelectedReason('');
    setCustomExplanation('');
    setCancelModalError('');
    setIsCancelling(false);
    setCurrentScreen('Login');
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>TrustRide: {currentScreen === 'RideHistory' ? 'History' : currentScreen}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {currentScreen !== 'Login' && currentScreen !== 'RideHistory' && (
            <Button title="History" onPress={openHistory} color="#007AFF" />
          )}
          {currentScreen !== 'Login' && (
            <Button title="Switch Account" onPress={logout} color="#ff3b30" />
          )}
        </View>
      </View>
      
      {currentScreen === 'Login' && (
        <View style={styles.card}>
          <Text style={styles.label}>Enter your name</Text>
          <TextInput style={styles.input} placeholder="e.g. John Doe" value={name} onChangeText={setName} />
          
          <Text style={styles.label}>Select your role</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 }}>
            <Button title="I am a Rider" onPress={() => setRole('rider')} color={role === 'rider' ? '#007AFF' : '#ccc'} />
            <Button title="I am a Driver" onPress={() => setRole('driver')} color={role === 'driver' ? '#007AFF' : '#ccc'} />
          </View>

          <Button title="Login" onPress={login} />
        </View>
      )}

      {currentScreen === 'RiderHome' && (
        <View style={styles.card}>
          <Text style={styles.label}>Enter pickup location</Text>
          <TextInput style={styles.input} placeholder="e.g. 123 Main St" value={pickup} onChangeText={setPickup} />
          
          <Text style={styles.label}>Enter destination</Text>
          <TextInput style={styles.input} placeholder="e.g. Airport" value={destination} onChangeText={setDestination} />
          
          <Text style={styles.label}>Enter quoted fare (₹)</Text>
          <TextInput style={styles.input} placeholder="e.g. 100" value={quotedFare} onChangeText={setQuotedFare} keyboardType="numeric" />
          
          <Button title="Request Ride" onPress={requestRide} />
          <View style={{ marginTop: 12 }}>
            <Button title="View Ride History" onPress={openHistory} color="#5856d6" />
          </View>
        </View>
      )}

      {currentScreen === 'RiderWaiting' && (
        <View style={styles.card}>
          <Text style={styles.label}>Waiting for driver to accept...</Text>
          <Text>Pickup: {currentRide?.pickup}</Text>
          <Text>Destination: {currentRide?.destination}</Text>
          <Text style={{ marginBottom: 15 }}>Quoted Fare: {formatINR(currentRide?.quotedFare)}</Text>
          <TouchableOpacity
            style={styles.cancelRideBtn}
            onPress={openCancelModal}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentScreen === 'RiderAccepted' && (
        <View style={styles.card}>
          <Text style={[styles.label, { color: 'green', fontSize: 18 }]}>Driver is on the way!</Text>
          <Text>Accepted Fare: {formatINR(currentRide?.acceptedFare)}</Text>
          <Text style={{ marginBottom: 15 }}>Driver ID: {currentRide?.driverId}</Text>
          <TouchableOpacity
            style={styles.cancelRideBtn}
            onPress={openCancelModal}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentScreen === 'RiderStarted' && (
        <View style={styles.card}>
          <Text style={[styles.label, { color: 'blue', fontSize: 18 }]}>Trip in progress...</Text>
          <Text>Heading to: {currentRide?.destination}</Text>
          <View style={{ marginTop: 15 }}>
            <TouchableOpacity
              style={styles.cancelRideBtn}
              onPress={openCancelModal}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {currentScreen === 'RiderCompleted' && (
        <View style={styles.card}>
          <Text style={[styles.label, { color: 'green', fontSize: 18 }]}>Trip Completed!</Text>
          <Text>Pickup: {currentRide?.pickup}</Text>
          <Text>Destination: {currentRide?.destination}</Text>
          <Text style={{ marginBottom: 15 }}>Final Fare: {formatINR(currentRide?.finalFare)}</Text>
          <Button
            title="Book Another Ride"
            onPress={() => {
              setCurrentRide(null);
              setCurrentScreen('RiderHome');
            }}
          />
          <View style={{ marginTop: 10 }}>
            <Button title="View Ride History" onPress={openHistory} color="#5856d6" />
          </View>
        </View>
      )}

      {currentScreen === 'DriverHome' && (
        <ScrollView style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={styles.label}>Incoming Ride Requests:</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Button title="Refresh" onPress={fetchPendingRequests} />
              <Button title="History" onPress={openHistory} color="#5856d6" />
            </View>
          </View>
          {requestError ? (
            <Text style={{ color: 'red', marginBottom: 10 }}>{requestError}</Text>
          ) : null}
          {rides.length === 0 ? (
            <Text style={{ color: '#666', marginVertical: 10 }}>No pending ride requests available.</Text>
          ) : (
            rides.map(r => (
              <View key={r.id} style={styles.rideCard}>
                <Text>{r.pickup} -{">"} {r.destination}</Text>
                <Text style={{ marginBottom: 10 }}>Quoted Fare: {formatINR(r.quotedFare)}</Text>
                <Button title="Accept Ride" onPress={() => acceptRide(r)} />
              </View>
            ))
          )}
        </ScrollView>
      )}

      {currentScreen === 'DriverAccepted' && (
        <View style={styles.card}>
          <Text style={[styles.label, { color: 'green', fontSize: 18 }]}>You accepted the ride!</Text>
          <Text>Pickup: {currentRide?.pickup}</Text>
          <Text>Dest: {currentRide?.destination}</Text>
          <Text style={{ marginBottom: 15 }}>Accepted Fare: {formatINR(currentRide?.acceptedFare)}</Text>
          <Button title="Start Trip" onPress={startTrip} color="#28a745" />
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              style={styles.cancelRideBtn}
              onPress={openCancelModal}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {currentScreen === 'DriverStarted' && (
        <View style={styles.card}>
          <Text style={[styles.label, { color: 'blue', fontSize: 18 }]}>Trip in progress...</Text>
          <Text>Dest: {currentRide?.destination}</Text>
          <View style={{ marginTop: 10 }}>
            <Button title="Complete Trip" onPress={completeTrip} />
          </View>
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              style={styles.cancelRideBtn}
              onPress={openCancelModal}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelRideBtnText}>Cancel Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {currentScreen === 'DriverCompleted' && (
        <View style={styles.card}>
          <Text style={[styles.label, { color: 'green', fontSize: 18 }]}>Trip Completed!</Text>
          <Text style={{ marginBottom: 15 }}>Final Fare: {formatINR(currentRide?.finalFare)}</Text>
          <View style={{ gap: 10 }}>
            <Button title="View Ride History" onPress={openHistory} color="#5856d6" />
            <Button
              title="Back to Driver Home"
              onPress={() => {
                setCurrentRide(null);
                setCurrentScreen('DriverHome');
              }}
            />
          </View>
        </View>
      )}

      {currentScreen === 'RideHistory' && (
        <ScrollView style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={[styles.label, { fontSize: 18, flex: 1 }]}>
              {selectedHistoryRide ? 'Trip Details & Trust Record' : `${user?.role === 'rider' ? 'Rider' : 'Driver'} Ride History`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {!selectedHistoryRide && <Button title="Refresh" onPress={fetchHistory} />}
              <Button
                title={selectedHistoryRide ? 'Back to List' : 'Back'}
                onPress={selectedHistoryRide ? () => setSelectedHistoryRide(null) : closeHistory}
                color="#6c757d"
              />
            </View>
          </View>

          {historyLoading ? (
            <Text style={{ textAlign: 'center', padding: 20, color: '#555' }}>Loading ride history...</Text>
          ) : historyError ? (
            <View style={{ padding: 10 }}>
              <Text style={{ color: 'red', marginBottom: 10 }}>{historyError}</Text>
              <Button title="Retry" onPress={fetchHistory} />
            </View>
          ) : selectedHistoryRide ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{selectedHistoryRide.pickup} → {selectedHistoryRide.destination}</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>Ride ID: {selectedHistoryRide.id}</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>
                Date: {new Date(selectedHistoryRide.completedAt || selectedHistoryRide.cancelledAt || selectedHistoryRide.createdAt).toLocaleString()}
              </Text>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
                <Text style={{ fontWeight: '600' }}>Status: </Text>
                <Text style={{ fontWeight: 'bold', color: selectedHistoryRide.status === 'completed' ? '#28a745' : '#dc3545' }}>
                  {selectedHistoryRide.status.toUpperCase()}
                </Text>
                {selectedHistoryRide.trustStatus && (
                  <Text style={{ marginLeft: 10, fontWeight: 'bold', color: selectedHistoryRide.trustStatus === 'VERIFIED' ? '#007AFF' : '#e0a800' }}>
                    [{selectedHistoryRide.trustStatus}]
                  </Text>
                )}
              </View>

              {selectedHistoryRide.status === 'cancelled' && (
                <View style={{ backgroundColor: '#fff3cd', padding: 10, borderRadius: 6, marginVertical: 4 }}>
                  <Text style={{ fontWeight: 'bold', color: '#856404' }}>Cancellation Details:</Text>
                  <Text style={{ color: '#856404' }}>Cancelled By: {selectedHistoryRide.cancelledBy || 'N/A'}</Text>
                  <Text style={{ color: '#856404' }}>Reason: {selectedHistoryRide.cancellationReason || 'No reason provided'}</Text>
                  {selectedHistoryRide.cancelledAfterStart && (
                    <Text style={{ color: '#d9534f', fontWeight: 'bold', marginTop: 2 }}>
                      ⚠️ Cancelled after trip started (in progress)
                    </Text>
                  )}
                  {selectedHistoryRide.cancellationStage && (
                    <Text style={{ color: '#856404', fontSize: 12 }}>
                      Stage at Cancel: {selectedHistoryRide.cancellationStage}
                    </Text>
                  )}
                </View>
              )}

              <View style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 6, marginVertical: 8, gap: 4 }}>
                <Text style={{ fontWeight: 'bold', marginBottom: 4, color: '#333' }}>Financial Summary:</Text>
                <Text>Quoted Fare: {formatINR(selectedHistoryRide.quotedFare)}</Text>
                <Text>Final Fare: {formatINR(selectedHistoryRide.finalFare)}</Text>
                <Text>Fare Discrepancy: {formatINR(selectedHistoryRide.fareDiscrepancy, { fallback: '₹0' })}</Text>
                {user?.role === 'driver' && (
                  <>
                    <Text>Platform Commission: {formatINR(selectedHistoryRide.platformCommission)}</Text>
                    <Text>Promised Earnings: {formatINR(selectedHistoryRide.promisedEarnings)}</Text>
                    <Text style={{ fontWeight: 'bold', color: '#28a745' }}>Actual Driver Earnings: {formatINR(selectedHistoryRide.actualEarnings)}</Text>
                    <Text>Earnings Difference: {formatINR(selectedHistoryRide.earningsDifference, { fallback: '₹0' })}</Text>
                  </>
                )}
              </View>

              {selectedHistoryRide.trustRecordId && (
                <Text style={{ color: '#888', fontSize: 11 }}>TrustRecord ID: {selectedHistoryRide.trustRecordId}</Text>
              )}
            </View>
          ) : historyRides.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#666', padding: 20 }}>No completed or cancelled rides found.</Text>
          ) : (
            historyRides.map((r) => (
              <View key={r.id} style={styles.rideCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 15, flex: 1 }}>{r.pickup} → {r.destination}</Text>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: r.status === 'completed' ? '#28a745' : '#dc3545' }}>
                    {r.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  {new Date(r.completedAt || r.cancelledAt || r.createdAt).toLocaleString()}
                </Text>
                {r.status === 'cancelled' && r.cancellationReason && (
                  <Text style={{ fontSize: 12, color: '#dc3545', marginVertical: 2 }}>
                    Reason: {r.cancellationReason}
                  </Text>
                )}
                <View style={{ marginVertical: 6 }}>
                  <Text style={{ fontWeight: '500' }}>
                    Fare: {formatINR(r.finalFare ?? r.quotedFare)}
                    {r.fareDiscrepancy ? ` (Diff: ${formatINR(r.fareDiscrepancy)})` : ''}
                  </Text>
                  {user?.role === 'driver' && r.actualEarnings !== null && (
                    <Text style={{ color: '#28a745', fontWeight: 'bold' }}>
                      Driver Earnings: {formatINR(r.actualEarnings)} (Comm: {formatINR(r.platformCommission, { fallback: '₹0' })})
                    </Text>
                  )}
                  {r.trustStatus && (
                    <Text style={{ fontSize: 12, color: r.trustStatus === 'VERIFIED' ? '#007AFF' : '#e0a800', fontWeight: 'bold' }}>
                      Trust: {r.trustStatus}
                    </Text>
                  )}
                </View>
                <Button title="View Trust Details" onPress={() => setSelectedHistoryRide(r)} color="#007AFF" />
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Cancellation Reason Selector Modal */}
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
            <Text style={styles.modalTitle}>Cancel Ride</Text>
            <Text style={styles.modalSubtitle}>
              Please select a reason before confirming cancellation:
            </Text>

            {cancelModalError ? (
              <View style={styles.modalErrorContainer}>
                <Text style={styles.modalErrorText}>{cancelModalError}</Text>
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: 250, marginVertical: 10 }}>
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
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.otherLabel}>Explanation (Required):</Text>
                  <TextInput
                    style={styles.otherInput}
                    placeholder="Enter short explanation..."
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
              >
                <Text style={styles.modalKeepBtnText}>Keep Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn, isCancelling && { opacity: 0.6 }]}
                onPress={confirmCancelRide}
                disabled={isCancelling}
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f0f0f0' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 6 },
  header: { fontSize: 20, fontWeight: 'bold', flexShrink: 1 },
  card: { padding: 20, backgroundColor: 'white', borderRadius: 8, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10, borderRadius: 4 },
  rideCard: { borderWidth: 1, borderColor: '#eee', padding: 10, marginVertical: 5, borderRadius: 4 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 5, color: '#333' },
  cancelRideBtn: {
    backgroundColor: '#ff3b30',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5
  },
  cancelRideBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 6
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10
  },
  modalErrorContainer: {
    backgroundColor: '#ffebe8',
    borderColor: '#ff3b30',
    borderWidth: 1,
    padding: 8,
    borderRadius: 6,
    marginBottom: 10
  },
  modalErrorText: {
    color: '#d32f2f',
    fontSize: 13,
    fontWeight: '600'
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
    backgroundColor: '#fafafa'
  },
  reasonItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f7ff'
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  radioOuterSelected: {
    borderColor: '#007AFF'
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF'
  },
  reasonItemText: {
    fontSize: 15,
    color: '#333'
  },
  reasonItemTextSelected: {
    color: '#007AFF',
    fontWeight: 'bold'
  },
  otherLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginBottom: 4
  },
  otherInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    minHeight: 50,
    backgroundColor: '#fff',
    fontSize: 14,
    textAlignVertical: 'top'
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 15
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalKeepBtn: {
    backgroundColor: '#e0e0e0'
  },
  modalKeepBtnText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 15
  },
  modalConfirmBtn: {
    backgroundColor: '#ff3b30'
  },
  modalConfirmBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15
  }
});
