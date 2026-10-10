import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000/api';

async function runTests() {
    console.log('--- TEST 1: Validation of Query Parameters ---');
    try {
        await axios.get(`${API_URL}/rides/history`);
        console.error('FAIL: Missing params should return 400');
        process.exit(1);
    } catch (e) {
        if (e.response?.status === 400) {
            console.log('PASS: Missing parameters returns HTTP 400');
        } else {
            console.error('FAIL: Expected 400, got', e.response?.status);
            process.exit(1);
        }
    }

    try {
        await axios.get(`${API_URL}/rides/history?role=admin&userId=123`);
        console.error('FAIL: Invalid role should return 400');
        process.exit(1);
    } catch (e) {
        if (e.response?.status === 400) {
            console.log('PASS: Invalid role returns HTTP 400');
        } else {
            console.error('FAIL: Expected 400, got', e.response?.status);
            process.exit(1);
        }
    }

    console.log('\n--- TEST 2: Empty History Handling ---');
    const emptyRider = await axios.post(`${API_URL}/auth/demo-login`, { name: 'EmptyRider_' + Date.now(), role: 'rider' });
    const emptyRes = await axios.get(`${API_URL}/rides/history?role=rider&userId=${emptyRider.data.user.id}`);
    if (Array.isArray(emptyRes.data.rides) && emptyRes.data.rides.length === 0) {
        console.log('PASS: New rider returns { rides: [] }');
    } else {
        console.error('FAIL: Expected empty array, got', emptyRes.data);
        process.exit(1);
    }

    console.log('\n--- TEST 3: Rider Completed Rides & Trust Data ---');
    // Query for John who has completed rides
    const johnLogin = await axios.post(`${API_URL}/auth/demo-login`, { name: 'John', role: 'rider' });
    const johnRes = await axios.get(`${API_URL}/rides/history?role=rider&userId=${johnLogin.data.user.id}`);
    console.log(`John has ${johnRes.data.rides.length} history rides`);
    if (johnRes.data.rides.length < 2) {
        console.error('FAIL: Expected at least 2 completed rides for John');
        process.exit(1);
    }

    // Verify ordering newest first
    const dates = johnRes.data.rides.map(r => new Date(r.completedAt || r.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
        if (dates[i] < dates[i + 1]) {
            console.error('FAIL: Rides are not sorted newest first');
            process.exit(1);
        }
    }
    console.log('PASS: Rides are correctly ordered newest first');

    // Verify no active rides exist in history
    const nonHistoryStatus = johnRes.data.rides.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
    if (nonHistoryStatus.length > 0) {
        console.error('FAIL: Active rides found in history:', nonHistoryStatus);
        process.exit(1);
    }
    console.log('PASS: All rides in history have status completed or cancelled');

    const topRide = johnRes.data.rides[0];
    console.log('Sample Ride:', {
        id: topRide.id,
        status: topRide.status,
        finalFare: topRide.finalFare,
        trustStatus: topRide.trustStatus,
        platformCommission: topRide.platformCommission,
        actualEarnings: topRide.actualEarnings
    });

    if (topRide.trustStatus === 'VERIFIED' && topRide.platformCommission !== null && topRide.actualEarnings !== null) {
        console.log('PASS: TripTrustRecord financial fields successfully mapped to ride history');
    } else {
        console.error('FAIL: Trust record financial fields missing or unmapped');
        process.exit(1);
    }

    console.log('\n--- TEST 4: Driver History Resolution ---');
    // Query history for driver
    const driverRes = await axios.get(`${API_URL}/rides/history?role=driver&driverId=3aafaae4-3140-4880-a9e5-66be20217071`);
    console.log(`Driver has ${driverRes.data.rides.length} history rides`);
    if (driverRes.data.rides.length > 0) {
        const dRide = driverRes.data.rides[0];
        if (dRide.driverId === '3aafaae4-3140-4880-a9e5-66be20217071' && dRide.actualEarnings === 20 && dRide.platformCommission === 5) {
            console.log('PASS: Driver history correctly resolves driverId and displays earnings (₹20) and commission (₹5)');
        } else {
            console.error('FAIL: Driver earnings mismatch:', dRide);
            process.exit(1);
        }
    }

    console.log('\nALL RIDE HISTORY BACKEND TESTS PASSED!');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
