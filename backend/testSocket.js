import { io } from 'socket.io-client';
import axios from 'axios';

const SOCKET_URL = 'http://127.0.0.1:8000';
const API_URL = 'http://127.0.0.1:8000/api';

async function runTest() {
    try {
        console.log('1. Login Rider');
        let res = await axios.post(API_URL + '/auth/demo-login', { name: 'AutomatedRider', role: 'rider' });
        const rider = res.data.user;
        
        console.log('2. Login Driver');
        res = await axios.post(API_URL + '/auth/demo-login', { name: 'AutomatedDriver', role: 'driver' });
        const driver = res.data.user;
        const driverId = res.data.driverId;

        const riderSocket = io(SOCKET_URL);
        const driverSocket = io(SOCKET_URL);

        let rideId = null;

        await new Promise(r => setTimeout(r, 1000));

        riderSocket.emit('join', { userId: rider.id, role: 'rider' });
        driverSocket.emit('join', { userId: driver.id, role: 'driver', driverId });

        await new Promise(r => setTimeout(r, 1000));

        console.log('3. Rider requests ride via Socket');
        driverSocket.on('ride:new', (ride) => {
            console.log('Driver received ride:new', ride.id);
            rideId = ride.id;
            
            console.log('4. Driver accepts ride via Socket');
            driverSocket.emit('ride:accept', { rideId, driverId }, (res) => {
                if(res.error) console.error('Driver accept error:', res.error);
            });
        });

        riderSocket.on('ride:accepted', (ride) => {
            console.log('Rider received ride:accepted. Fare:', ride.acceptedFare);
            
            console.log('5. Driver starts ride');
            driverSocket.emit('ride:start', { rideId, driverId }, (res) => {
                if(res.error) console.error('Driver start error:', res.error);
            });
        });

        riderSocket.on('ride:started', (ride) => {
            console.log('Rider received ride:started');
            
            console.log('6. Driver completes ride');
            driverSocket.emit('ride:complete', { rideId, driverId }, (res) => {
                if(res.error) console.error('Driver complete error:', res.error);
                else {
                    console.log('Driver received TripTrustRecord from callback!', res.trustRecord.id);
                }
            });
        });

        riderSocket.on('ride:completed', async (ride) => {
            console.log('Rider received ride:completed. Final Fare:', ride.finalFare);
            
            console.log('7. Verifying TripTrustRecord via Dashboard API');
            try {
                const trRes = await axios.get(API_URL + '/trust/trips');
                const records = trRes.data.data;
                const found = records.find(r => r.rideId === rideId);
                
                if (found) {
                    console.log('SUCCESS! TrustRecord retrieved from API:', found.id);
                    console.log('Platform Commission:', found.after.earnings.platformCommission);
                    console.log('Driver Earnings:', found.after.earnings.actualAmount);
                    console.log('E2E SOCKET PASS');
                    process.exit(0);
                } else {
                    console.error('FAIL: TrustRecord not found in API response');
                    process.exit(1);
                }
            } catch (err) {
                console.error('API Error:', err.message);
                process.exit(1);
            }
        });

        riderSocket.emit('ride:create', { riderId: rider.id, pickup: 'TestA', destination: 'TestB', quotedFare: 100 }, (res) => {
            if(res.error) console.error('Rider create error:', res.error);
            else console.log('Rider created ride:', res.ride.id);
        });

        // Timeout fallback
        setTimeout(() => {
            console.error('Socket test timeout');
            process.exit(1);
        }, 10000);

    } catch(e) {
        console.error('FAIL', e.response?.data || e.message);
        process.exit(1);
    }
}
runTest();
