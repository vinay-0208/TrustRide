import { v4 as uuidv4 } from 'uuid';
import { io } from '../app.js';

export const createRide = async (req, res) => {
    try {
        const { riderId, pickup, destination, quotedFare } = req.body;
        const db = global.firebaseDb;
        const ride = {
            id: uuidv4(),
            riderId,
            driverId: null,
            pickup,
            destination,
            quotedFare: Number(quotedFare),
            acceptedFare: null,
            status: 'requested',
            createdAt: new Date().toISOString(),
            acceptedAt: null
        };
        await db.collection('rides').doc(ride.id).set(ride);
        
        io.to('drivers').emit('ride:new', ride);
        res.status(201).json(ride);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

export const getRide = async (req, res) => {
    try {
        const doc = await global.firebaseDb.collection('rides').doc(req.params.rideId).get();
        if (!doc.exists) return res.status(404).json({ error: 'Not found' });
        res.status(200).json(doc.data());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

export const getActiveRide = async (req, res) => {
    try {
        const { role, userId, driverId } = req.query;
        if (!role || (!userId && !driverId)) {
            return res.status(400).json({ error: 'Missing role or userId' });
        }
        
        const db = global.firebaseDb;
        let snapshot;
        
        if (role === 'rider') {
            snapshot = await db.collection('rides')
                .where('riderId', '==', userId)
                .where('status', 'in', ['requested', 'accepted', 'in_progress'])
                .get();
        } else if (role === 'driver') {
            const possibleDriverIds = [];
            if (userId) possibleDriverIds.push(userId);
            if (driverId) possibleDriverIds.push(driverId);

            const targetLookup = driverId || userId;
            const driverSnap = await db.collection('drivers')
                .where('userId', '==', targetLookup)
                .limit(1)
                .get();
            if (!driverSnap.empty) {
                possibleDriverIds.push(driverSnap.docs[0].id);
                possibleDriverIds.push(driverSnap.docs[0].data().id);
            }

            const uniqueDriverIds = [...new Set(possibleDriverIds.filter(Boolean))];

            snapshot = await db.collection('rides')
                .where('driverId', 'in', uniqueDriverIds)
                .where('status', 'in', ['accepted', 'in_progress'])
                .get();
        } else {
            return res.status(400).json({ error: 'Invalid role' });
        }
        
        if (snapshot.empty) {
            return res.status(200).json({ ride: null });
        }
        
        const activeRides = snapshot.docs.map(doc => doc.data());
        activeRides.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        res.status(200).json({ ride: activeRides[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

export const getPendingRides = async (req, res) => {
    try {
        const db = global.firebaseDb;
        const snapshot = await db.collection('rides')
            .where('status', '==', 'requested')
            .get();
        
        const rides = snapshot.docs.map(doc => doc.data());
        rides.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.status(200).json({ rides });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

export const getLastCompletedRide = async (req, res) => {
    try {
        const { riderId } = req.query;
        if (!riderId) {
            return res.status(400).json({ error: 'Missing riderId' });
        }
        
        const db = global.firebaseDb;
        const snapshot = await db.collection('rides')
            .where('riderId', '==', riderId)
            .where('status', '==', 'completed')
            .get();
        
        if (snapshot.empty) {
            return res.status(200).json({ ride: null });
        }
        
        const rides = snapshot.docs.map(doc => doc.data());
        rides.sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());
        
        res.status(200).json({ ride: rides[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

export const getRideHistory = async (req, res) => {
    try {
        const { role, userId, driverId } = req.query;
        if (!role || (!userId && !driverId)) {
            return res.status(400).json({ error: 'Missing required parameters: role and userId (or driverId)' });
        }

        if (role !== 'rider' && role !== 'driver') {
            return res.status(400).json({ error: 'Invalid role. Must be rider or driver' });
        }

        const db = global.firebaseDb;
        let snapshot;

        if (role === 'rider') {
            snapshot = await db.collection('rides')
                .where('riderId', '==', userId)
                .get();
        } else {
            let targetDriverId = driverId || userId;
            const driverSnap = await db.collection('drivers')
                .where('userId', '==', targetDriverId)
                .limit(1)
                .get();
            if (!driverSnap.empty) {
                targetDriverId = driverSnap.docs[0].data().id;
            }

            snapshot = await db.collection('rides')
                .where('driverId', '==', targetDriverId)
                .get();
        }

        const rawRides = snapshot.docs.map(doc => doc.data());
        const historyRides = rawRides.filter(r => r.status === 'completed' || r.status === 'cancelled');

        historyRides.sort((a, b) => new Date(b.completedAt || b.cancelledAt || b.createdAt).getTime() - new Date(a.completedAt || a.cancelledAt || a.createdAt).getTime());

        const enrichedRides = await Promise.all(historyRides.map(async (ride) => {
            let trustData = null;
            const trustSnap = await db.collection('TripTrustRecords')
                .where('rideId', '==', ride.id)
                .limit(1)
                .get();
            
            if (!trustSnap.empty) {
                trustData = trustSnap.docs[0].data();
            } else {
                const legacySnap = await db.collection('TripTrustRecords')
                    .where('rideRequestId', '==', ride.id)
                    .limit(1)
                    .get();
                if (!legacySnap.empty) {
                    trustData = legacySnap.docs[0].data();
                }
            }

            return {
                id: ride.id,
                riderId: ride.riderId ?? null,
                driverId: ride.driverId ?? null,
                pickup: ride.pickup ?? null,
                destination: ride.destination ?? null,
                status: ride.status ?? null,
                quotedFare: ride.quotedFare ?? null,
                finalFare: ride.finalFare ?? null,
                acceptedFare: ride.acceptedFare ?? null,
                createdAt: ride.createdAt ?? null,
                acceptedAt: ride.acceptedAt ?? null,
                startedAt: ride.startedAt ?? null,
                completedAt: ride.completedAt ?? null,
                cancelledAt: ride.cancelledAt ?? null,
                cancelledBy: ride.cancelledBy ?? null,
                cancellationReason: ride.cancellationReason ?? null,
                cancellationStage: ride.cancellationStage ?? null,
                cancelledAfterStart: ride.cancelledAfterStart ?? (ride.startedAt && ride.status === 'cancelled' ? true : false),
                trustRecordId: trustData?.id ?? null,
                trustStatus: trustData?.trustStatus ?? null,
                platformCommission: trustData?.after?.earnings?.platformCommission ?? null,
                promisedEarnings: trustData?.after?.earnings?.promisedAmount ?? trustData?.before?.promisedEarnings ?? null,
                actualEarnings: trustData?.after?.earnings?.actualAmount ?? null,
                earningsDifference: trustData?.after?.earnings?.difference ?? trustData?.earningsDiscrepancy ?? null,
                fareDiscrepancy: trustData?.fareDiscrepancy ?? null
            };
        }));

        res.status(200).json({ rides: enrichedRides });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
