import axios from 'axios';
const API = 'http://localhost:8000/api';

async function run() {
    try {
        console.log('1. Login Rider');
        let res = await axios.post(API + '/auth/demo-login', { name: 'Alice', role: 'rider' });
        const rider = res.data.user;
        
        console.log('2. Login Driver');
        res = await axios.post(API + '/auth/demo-login', { name: 'Bob', role: 'driver' });
        const driver = res.data.user;
        const driverId = res.data.driverId;
        
        console.log('3. Request Ride');
        res = await axios.post(API + '/rides', { riderId: rider.id, pickup: 'A', destination: 'B', quotedFare: 20 });
        const ride = res.data;
        
        console.log('4. Place Bid');
        res = await axios.post(API + '/rides/' + ride.id + '/bids', { driverId, amount: 25 });
        const bid = res.data;
        
        console.log('5. Accept Bid');
        res = await axios.post(API + '/rides/' + ride.id + '/accept', { riderId: rider.id, bidId: bid.id });
        const acceptedRide = res.data;
        
        console.log('Final Ride State:', acceptedRide.status, acceptedRide.acceptedFare);
        console.log('E2E BACKEND PASS');
    } catch(e) {
        console.error('FAIL', e.response?.data || e.message);
    }
}
run();
