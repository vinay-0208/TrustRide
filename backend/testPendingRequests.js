import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000/api';

async function testPendingRequests() {
    try {
        console.log('1. Log in rider');
        const riderRes = await axios.post(`${API_URL}/auth/demo-login`, { name: 'PreLoginRider', role: 'rider' });
        const riderId = riderRes.data.user.id;

        console.log('2. Create ride BEFORE any driver logs in');
        const rideRes = await axios.post(`${API_URL}/rides`, {
            riderId,
            pickup: 'FocusPickup',
            destination: 'FocusDrop',
            quotedFare: 120
        });
        const createdRideId = rideRes.data.id;
        console.log('Created ride ID:', createdRideId);

        console.log('3. Query GET /api/rides/requests (simulating driver opening DriverHome)');
        const reqRes = await axios.get(`${API_URL}/rides/requests`);
        const rides = reqRes.data.rides;

        const found = rides.find(r => r.id === createdRideId);
        if (!found) {
            throw new Error(`Ride ${createdRideId} not found in pending requests`);
        }
        console.log('SUCCESS: Pending ride found in requests list:', found.pickup, '->', found.destination, 'Fare:', found.quotedFare);

        if (found.status !== 'requested') {
            throw new Error(`Unexpected status: ${found.status}`);
        }
        console.log('SUCCESS: Status is requested as required.');
        process.exit(0);
    } catch (e) {
        console.error('FAIL:', e.response?.data || e.message);
        process.exit(1);
    }
}

testPendingRequests();
