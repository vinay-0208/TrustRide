import { initializeFirebase } from './config/firebase.js';
initializeFirebase();

async function check() {
    const db = global.firebaseDb;
    const rides = await db.collection('rides').where('status', '==', 'accepted').limit(1).get();
    if(rides.empty) {
        console.log('FAIL: No accepted rides found.');
        process.exit(1);
    }
    const ride = rides.docs[0].data();
    if(ride.status === 'accepted' && ride.driverId && ride.acceptedFare) {
        console.log('PASS: Ride successfully persisted to Firestore with accepted status and fare.');
    } else {
        console.log('FAIL: Ride data invalid', ride);
        process.exit(1);
    }

    const bids = await db.collection('bids').where('rideId', '==', ride.id).where('status', '==', 'accepted').get();
    if(bids.empty) {
        console.log('FAIL: No accepted bids found.');
        process.exit(1);
    }
    console.log('PASS: Bid successfully persisted to Firestore with accepted status.');
    process.exit(0);
}
check();
