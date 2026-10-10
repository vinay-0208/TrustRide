import { initializeFirebase } from './config/firebase.js';
initializeFirebase();

import { config } from './config/index.js';
import { app, server, io } from './app.js';
import { v4 as uuidv4 } from 'uuid';

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('join', (data) => {
        if (!data) return;
        if (data.role === 'rider') {
            const rId = data.userId || data.riderId;
            if (rId) socket.join("rider:" + rId);
        } else if (data.role === 'driver') {
            if (data.driverId) socket.join("driver:" + data.driverId);
            if (data.userId) socket.join("driver:" + data.userId);
            socket.join('drivers');
        }
    });

    socket.on('join:rider', (data) => {
        const rId = data?.riderId || data?.userId;
        if (rId) socket.join("rider:" + rId);
    });

    socket.on('join:driver', (data) => {
        if (data?.driverId) socket.join("driver:" + data.driverId);
        if (data?.userId) socket.join("driver:" + data.userId);
        socket.join('drivers');
    });

    socket.on('ride:create', async (data, callback) => {
        try {
            const { riderId, pickup, destination, quotedFare } = data;
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
            if (typeof callback === 'function') callback({ success: true, ride });
        } catch (e) {
            if (typeof callback === 'function') callback({ error: e.message });
        }
    });

    socket.on('ride:accept', async (data, callback) => {
        try {
            const { rideId, driverId } = data;
            const db = global.firebaseDb;
            
            const rideRef = db.collection('rides').doc(rideId);
            const rideDoc = await rideRef.get();
            if (!rideDoc.exists) throw new Error('Ride not found');
            
            const ride = rideDoc.data();
            if (ride.status !== 'requested') throw new Error('Ride not available');
            
            await rideRef.update({
                driverId,
                acceptedFare: ride.quotedFare,
                status: 'accepted',
                acceptedAt: new Date().toISOString()
            });
            
            const updatedRide = (await rideRef.get()).data();
            io.to("rider:" + ride.riderId).emit('ride:accepted', updatedRide);
            io.to("driver:" + driverId).emit('ride:accepted', updatedRide);
            io.to('drivers').emit('ride:accepted', updatedRide);
            
            if (typeof callback === 'function') callback({ success: true, ride: updatedRide });
        } catch (e) {
            if (typeof callback === 'function') callback({ error: e.message });
        }
    });

    socket.on('ride:start', async (data, callback) => {
        try {
            const { rideId, driverId } = data;
            const db = global.firebaseDb;
            const rideRef = db.collection('rides').doc(rideId);
            const rideDoc = await rideRef.get();
            if (!rideDoc.exists) throw new Error('Ride not found');
            if (rideDoc.data().driverId !== driverId) throw new Error('Unauthorized');
            
            await rideRef.update({
                status: 'in_progress',
                startedAt: new Date().toISOString()
            });
            
            const updatedRide = (await rideRef.get()).data();
            io.to("rider:" + updatedRide.riderId).emit('ride:started', updatedRide);
            io.to("driver:" + driverId).emit('ride:started', updatedRide);
            
            if (typeof callback === 'function') callback({ success: true, ride: updatedRide });
        } catch (e) {
            if (typeof callback === 'function') callback({ error: e.message });
        }
    });

    socket.on('ride:complete', async (data, callback) => {
        try {
            const { rideId, driverId } = data;
            const db = global.firebaseDb;
            const rideRef = db.collection('rides').doc(rideId);
            const rideDoc = await rideRef.get();
            if (!rideDoc.exists) throw new Error('Ride not found');
            
            const ride = rideDoc.data();
            if (ride.driverId !== driverId) throw new Error('Unauthorized');

            // Idempotency: if already completed, do not duplicate TripTrustRecord
            if (ride.status === 'completed') {
                const existingSnap = await db.collection('TripTrustRecords')
                    .where('rideId', '==', ride.id)
                    .limit(1)
                    .get();
                let existingRecord = null;
                if (!existingSnap.empty) {
                    existingRecord = existingSnap.docs[0].data();
                }
                if (typeof callback === 'function') callback({ success: true, ride, trustRecord: existingRecord });
                return;
            }

            const now = new Date().toISOString();
            const finalFare = ride.quotedFare;
            const commissionRate = 0.20;
            const platformCommission = Math.round(finalFare * commissionRate * 100) / 100;
            const driverEarnings = Math.round((finalFare - platformCommission) * 100) / 100;
            const promisedDriverEarnings = Math.round((ride.quotedFare * (1 - commissionRate)) * 100) / 100;
            const earningsDiscrepancy = Math.round((driverEarnings - promisedDriverEarnings) * 100) / 100;
            const fareDiscrepancy = Math.round((finalFare - ride.quotedFare) * 100) / 100;
            
            await rideRef.update({
                status: 'completed',
                completedAt: now,
                updatedAt: now,
                finalFare
            });

            const recordId = uuidv4();
            let trustStatus = 'VERIFIED';
            if (Math.abs(fareDiscrepancy) > 0.01) {
                trustStatus = 'FLAGGED';
            }
            
            const trustRecord = {
                id: recordId,
                trustRecordId: recordId,
                rideId: ride.id,
                tripId: ride.id,
                rideRequestId: ride.id, // For legacy dashboard mapping
                riderId: ride.riderId,
                driverId: ride.driverId,
                lifecycleStatus: 'completed',
                pickup: ride.pickup,
                destination: ride.destination,
                before: {
                    quotedFare: ride.quotedFare,
                    plannedRoute: ride.pickup + ' to ' + ride.destination,
                    estimatedDistance: 0,
                    estimatedDuration: 0,
                    promisedEarnings: promisedDriverEarnings
                },
                during: {
                    routeEvents: [],
                    fareEvents: [],
                    safetyEvents: []
                },
                after: {
                    finalFare,
                    cancellation: { cancelled: false },
                    earnings: {
                        promisedAmount: promisedDriverEarnings,
                        actualAmount: driverEarnings,
                        platformCommission,
                        difference: earningsDiscrepancy
                    }
                },
                events: [
                    {
                        type: 'RIDE_REQUESTED',
                        timestamp: ride.createdAt || now,
                        description: `Ride requested from ${ride.pickup} to ${ride.destination} for ₹${ride.quotedFare}`,
                        severity: 'INFO'
                    },
                    {
                        type: 'DRIVER_ACCEPTED',
                        timestamp: ride.acceptedAt || now,
                        description: `Driver ${ride.driverId} accepted ride`,
                        severity: 'INFO'
                    },
                    {
                        type: 'TRIP_STARTED',
                        timestamp: ride.startedAt || now,
                        description: 'Trip started',
                        severity: 'INFO'
                    },
                    {
                        type: 'TRIP_COMPLETED',
                        timestamp: now,
                        description: `Trip completed with final fare ₹${finalFare}`,
                        severity: 'INFO'
                    }
                ],
                fareDiscrepancy,
                routeDeviation: false,
                earningsDiscrepancy,
                trustStatus,
                createdAt: now,
                updatedAt: now
            };
            
            await db.collection('TripTrustRecords').doc(trustRecord.id).set(trustRecord);
            
            const updatedRide = (await rideRef.get()).data();
            io.to("rider:" + ride.riderId).emit('ride:completed', updatedRide);
            io.to("driver:" + ride.driverId).emit('ride:completed', updatedRide);
            io.emit('trust:updated', { rideId: ride.id, status: 'completed' });
            
            if (typeof callback === 'function') callback({ success: true, ride: updatedRide, trustRecord });
        } catch (e) {
            if (typeof callback === 'function') callback({ error: e.message });
        }
    });

    socket.on('ride:cancel', async (data, callback) => {
        try {
            const { rideId, cancelledBy, reason, userId, driverId } = data;
            if (!rideId) throw new Error('rideId is required');

            const normalizedCancelledBy = (cancelledBy || '').toUpperCase();
            if (normalizedCancelledBy !== 'RIDER' && normalizedCancelledBy !== 'DRIVER') {
                throw new Error('Invalid actor. Must be RIDER or DRIVER');
            }

            if (!reason || typeof reason !== 'string' || !reason.trim()) {
                throw new Error('Cancellation reason is required');
            }
            const cancelReason = reason.trim();

            const db = global.firebaseDb;
            const rideRef = db.collection('rides').doc(rideId);
            const rideDoc = await rideRef.get();
            if (!rideDoc.exists) throw new Error('Ride not found');

            const ride = rideDoc.data();
            if (ride.status === 'completed') {
                throw new Error('Cannot cancel a completed ride');
            }
            if (ride.status === 'cancelled') {
                throw new Error('Ride is already cancelled');
            }
            if (ride.status !== 'requested' && ride.status !== 'accepted' && ride.status !== 'in_progress') {
                throw new Error(`Ride cannot be cancelled from status '${ride.status}'`);
            }

            // Actor authorization
            if (normalizedCancelledBy === 'DRIVER') {
                const cancellingDriverId = driverId || userId;
                if (cancellingDriverId && ride.driverId) {
                    let isAssigned = (ride.driverId === cancellingDriverId);
                    if (!isAssigned) {
                        const driverDoc = await db.collection('drivers').doc(ride.driverId).get();
                        if (driverDoc.exists && driverDoc.data().userId === cancellingDriverId) {
                            isAssigned = true;
                        }
                    }
                    if (!isAssigned) {
                        throw new Error('Unauthorized: Driver is not assigned to this ride');
                    }
                }
            } else if (normalizedCancelledBy === 'RIDER') {
                if (userId && ride.riderId && ride.riderId !== userId) {
                    throw new Error('Unauthorized: Rider did not request this ride');
                }
            }

            const now = new Date().toISOString();

            const cancelledAfterStart = (ride.status === 'in_progress');
            await rideRef.update({
                status: 'cancelled',
                cancelledBy: normalizedCancelledBy,
                cancellationReason: cancelReason,
                cancellationStage: ride.status,
                cancelledAfterStart,
                cancelledAt: now,
                updatedAt: now
            });

            // Idempotent TripTrustRecord resolution
            const existingTrustSnap = await db.collection('TripTrustRecords')
                .where('rideId', '==', ride.id)
                .limit(1)
                .get();

            const recordId = !existingTrustSnap.empty ? existingTrustSnap.docs[0].id : uuidv4();
            const promisedDriverEarnings = Math.round((ride.quotedFare * 0.8) * 100) / 100;

            const trustRecord = {
                id: recordId,
                trustRecordId: recordId,
                rideId: ride.id,
                tripId: ride.id,
                rideRequestId: ride.id,
                riderId: ride.riderId,
                driverId: ride.driverId || null,
                lifecycleStatus: 'cancelled',
                pickup: ride.pickup,
                destination: ride.destination,
                before: {
                    quotedFare: ride.quotedFare,
                    plannedRoute: ride.pickup + ' to ' + ride.destination,
                    estimatedDistance: 0,
                    estimatedDuration: 0,
                    promisedEarnings: promisedDriverEarnings
                },
                during: {
                    routeEvents: [],
                    fareEvents: [],
                    safetyEvents: []
                },
                after: {
                    finalFare: 0,
                    cancellation: {
                        cancelled: true,
                        cancelledBy: normalizedCancelledBy,
                        reason: cancelReason,
                        stage: ride.status,
                        cancelledAfterStart,
                        timestamp: now
                    },
                    earnings: {
                        promisedAmount: promisedDriverEarnings,
                        actualAmount: 0,
                        platformCommission: 0,
                        difference: promisedDriverEarnings
                    }
                },
                events: [
                    {
                        type: 'RIDE_REQUESTED',
                        timestamp: ride.createdAt || now,
                        description: `Ride requested from ${ride.pickup} to ${ride.destination}`,
                        severity: 'INFO'
                    },
                    ...(ride.acceptedAt ? [{
                        type: 'DRIVER_ACCEPTED',
                        timestamp: ride.acceptedAt,
                        description: `Driver ${ride.driverId} accepted ride`,
                        severity: 'INFO'
                    }] : []),
                    ...(ride.startedAt ? [{
                        type: 'TRIP_STARTED',
                        timestamp: ride.startedAt,
                        description: 'Trip started',
                        severity: 'INFO'
                    }] : []),
                    {
                        type: 'RIDE_CANCELLED',
                        timestamp: now,
                        description: `Ride cancelled by ${normalizedCancelledBy}${cancelledAfterStart ? ' after trip started' : ''}: ${cancelReason}`,
                        severity: 'WARN'
                    }
                ],
                fareDiscrepancy: 0,
                routeDeviation: false,
                earningsDiscrepancy: 0,
                trustStatus: 'REVIEW',
                createdAt: !existingTrustSnap.empty ? (existingTrustSnap.docs[0].data().createdAt || now) : now,
                updatedAt: now
            };

            await db.collection('TripTrustRecords').doc(recordId).set(trustRecord);

            const updatedRide = (await rideRef.get()).data();
            io.to("rider:" + ride.riderId).emit('ride:cancelled', updatedRide);
            if (ride.driverId) {
                let driverTarget = io.to("driver:" + ride.driverId);
                try {
                    const driverDoc = await db.collection('drivers').doc(ride.driverId).get();
                    if (driverDoc.exists && driverDoc.data().userId) {
                        driverTarget = driverTarget.to("driver:" + driverDoc.data().userId);
                    } else {
                        const driverSnap = await db.collection('drivers').where('userId', '==', ride.driverId).limit(1).get();
                        if (!driverSnap.empty) {
                            driverTarget = driverTarget.to("driver:" + driverSnap.docs[0].id);
                        }
                    }
                } catch (err) {
                    // Fall back to driver:ride.driverId
                }
                driverTarget.emit('ride:cancelled', updatedRide);
            } else {
                io.to("drivers").emit('ride:cancelled', updatedRide);
            }
            io.emit('trust:updated', { rideId: ride.id, status: 'cancelled' });

            if (typeof callback === 'function') callback({ success: true, ride: updatedRide, trustRecord });
        } catch (e) {
            if (typeof callback === 'function') callback({ error: e.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

server.listen(config.server.port || 8000, () => {
    console.log("Server is running on port " + (config.server.port || 8000));
    console.log("Environment: " + config.server.nodeEnv);
    console.log("TrustRide Clean Foundation - FIRESTORE ONLY");
});
