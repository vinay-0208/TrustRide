import io from 'socket.io-client';
import axios from 'axios';

const SOCKET_URL = 'http://127.0.0.1:8000';
const API_URL = 'http://127.0.0.1:8000/api';

function waitForConnect(socket) {
    if (socket.connected) return Promise.resolve();
    return new Promise(resolve => socket.once('connect', resolve));
}

async function runTest() {
    console.log('--- TEST: Real-Time Dashboard Synchronization (trust:updated event) ---');

    // 1. Dashboard socket client (mimicking dashboard/src/App.jsx)
    const dashboardSocket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    await waitForConnect(dashboardSocket);
    console.log('Dashboard socket connected');

    const receivedEvents = [];
    dashboardSocket.on('trust:updated', (payload) => {
        console.log('Dashboard received trust:updated event:', payload);
        receivedEvents.push(payload);
    });

    // 2. Setup rider and driver
    const riderRes = await axios.post(API_URL + '/auth/demo-login', { name: 'SyncTestRider', role: 'rider' });
    const driverRes = await axios.post(API_URL + '/auth/demo-login', { name: 'SyncTestDriver', role: 'driver' });
    const rider = riderRes.data.user;
    const driver = driverRes.data.user;
    const driverId = driverRes.data.driverId;

    const riderSocket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    const driverSocket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    await waitForConnect(riderSocket);
    await waitForConnect(driverSocket);
    console.log('Rider & Driver sockets connected');

    riderSocket.emit('join:rider', { riderId: rider.id });
    driverSocket.emit('join:driver', { driverId, userId: driver.id });

    // --- Scenario A: Ride Completion emits trust:updated ---
    console.log('\nTesting Scenario A: Ride Completion');
    const rideA = await new Promise((resolve, reject) => {
        riderSocket.emit('ride:create', {
            riderId: rider.id,
            pickup: 'SyncPickupA',
            destination: 'SyncDestA',
            quotedFare: 150
        }, res => res?.success ? resolve(res.ride) : reject(new Error(res?.error || 'Create failed')));
    });

    await new Promise((resolve, reject) => {
        driverSocket.emit('ride:accept', { rideId: rideA.id, driverId }, res => res?.success ? resolve(res.ride) : reject(new Error(res?.error || 'Accept failed')));
    });

    await new Promise((resolve, reject) => {
        driverSocket.emit('ride:start', { rideId: rideA.id, driverId }, res => res?.success ? resolve(res.ride) : reject(new Error(res?.error || 'Start failed')));
    });

    await new Promise((resolve, reject) => {
        driverSocket.emit('ride:complete', { rideId: rideA.id, driverId }, res => res?.success ? resolve(res.ride) : reject(new Error(res?.error || 'Complete failed')));
    });

    // Wait briefly for socket broadcast
    await new Promise(r => setTimeout(r, 600));

    const completeEvent = receivedEvents.find(e => e.rideId === rideA.id);
    if (!completeEvent) {
        throw new Error(`FAIL: trust:updated was not received for completed ride ${rideA.id}`);
    }
    if (completeEvent.status !== 'completed') {
        throw new Error(`FAIL: Expected status 'completed', got '${completeEvent.status}'`);
    }
    console.log('PASS: Scenario A - Completed ride triggered trust:updated with payload:', completeEvent);

    // --- Scenario B: Ride Cancellation emits trust:updated ---
    console.log('\nTesting Scenario B: Ride Cancellation');
    const rideB = await new Promise((resolve, reject) => {
        riderSocket.emit('ride:create', {
            riderId: rider.id,
            pickup: 'SyncPickupB',
            destination: 'SyncDestB',
            quotedFare: 120
        }, res => res?.success ? resolve(res.ride) : reject(new Error(res?.error || 'Create failed')));
    });

    await new Promise((resolve, reject) => {
        driverSocket.emit('ride:accept', { rideId: rideB.id, driverId }, res => res?.success ? resolve(res.ride) : reject(new Error(res?.error || 'Accept failed')));
    });

    await new Promise((resolve, reject) => {
        riderSocket.emit('ride:cancel', {
            rideId: rideB.id,
            cancelledBy: 'RIDER',
            userId: rider.id,
            reason: 'Change of plans'
        }, res => res?.success ? resolve(res.ride) : reject(new Error(res?.error || 'Cancel failed')));
    });

    // Wait briefly for socket broadcast
    await new Promise(r => setTimeout(r, 600));

    const cancelEvent = receivedEvents.find(e => e.rideId === rideB.id);
    if (!cancelEvent) {
        throw new Error(`FAIL: trust:updated was not received for cancelled ride ${rideB.id}`);
    }
    if (cancelEvent.status !== 'cancelled') {
        throw new Error(`FAIL: Expected status 'cancelled', got '${cancelEvent.status}'`);
    }
    console.log('PASS: Scenario B - Cancelled ride triggered trust:updated with payload:', cancelEvent);

    // Clean disconnect
    dashboardSocket.disconnect();
    riderSocket.disconnect();
    driverSocket.disconnect();

    console.log('\nALL REAL-TIME SYNCHRONIZATION CHECKS PASSED SUCCESSFULLY!');
    process.exit(0);
}

runTest().catch(err => {
    console.error('TEST ERROR:', err.message);
    process.exit(1);
});
