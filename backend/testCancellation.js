import io from 'socket.io-client';

const API_URL = 'http://127.0.0.1:8000/api';
const SOCKET_URL = 'http://127.0.0.1:8000';

async function run() {
  console.log('--- TEST 1: Reason and Actor Validation ---');
  const riderRes = await fetch(`${API_URL}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ValidationRider', role: 'rider' })
  });
  const { user: rider } = await riderRes.json();

  const riderSocket = io(SOCKET_URL);
  await new Promise(r => riderSocket.on('connect', r));
  riderSocket.emit('join:rider', { riderId: rider.id });

  // Create ride
  const createPromise = new Promise((resolve, reject) => {
    riderSocket.emit('ride:create', {
      riderId: rider.id,
      pickup: 'ValOrigin',
      destination: 'ValDest',
      fare: 50
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });
  const valRide = await createPromise;

  // Test missing reason
  const failReason = await new Promise(resolve => {
    riderSocket.emit('ride:cancel', {
      rideId: valRide.id,
      cancelledBy: 'RIDER',
      reason: ''
    }, resolve);
  });
  if (!failReason.error || !failReason.error.includes('reason')) {
    throw new Error(`Expected missing reason error, got: ${JSON.stringify(failReason)}`);
  }
  console.log('PASS: Empty reason correctly rejected');

  // Test invalid actor
  const failActor = await new Promise(resolve => {
    riderSocket.emit('ride:cancel', {
      rideId: valRide.id,
      cancelledBy: 'HACKER',
      reason: 'Valid reason'
    }, resolve);
  });
  if (!failActor.error || !failActor.error.includes('actor')) {
    throw new Error(`Expected invalid actor error, got: ${JSON.stringify(failActor)}`);
  }
  console.log('PASS: Invalid actor correctly rejected');

  console.log('--- TEST 2: Rider Cancellation While Waiting (with "Other" reason) ---');
  const cancelWaiting = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:cancel', {
      rideId: valRide.id,
      cancelledBy: 'RIDER',
      reason: 'Other: Had an emergency meeting come up'
    }, res => res.success ? resolve(res) : reject(new Error(res.error)));
  });
  if (cancelWaiting.ride.status !== 'cancelled') throw new Error('Expected status cancelled');
  if (cancelWaiting.ride.cancellationReason !== 'Other: Had an emergency meeting come up') {
    throw new Error(`Unexpected cancellationReason: ${cancelWaiting.ride.cancellationReason}`);
  }
  if (cancelWaiting.trustRecord.trustStatus !== 'REVIEW') {
    throw new Error(`Expected trustStatus REVIEW, got ${cancelWaiting.trustRecord.trustStatus}`);
  }
  console.log('PASS: Rider cancellation while waiting succeeded with custom explanation');

  // Test repeat cancellation rejection
  const repeatCancel = await new Promise(resolve => {
    riderSocket.emit('ride:cancel', {
      rideId: valRide.id,
      cancelledBy: 'RIDER',
      reason: 'Trying again'
    }, resolve);
  });
  if (!repeatCancel.error) {
    throw new Error('Expected duplicate cancellation to be rejected');
  }
  console.log('PASS: Repeat cancellation correctly prevented');

  console.log('--- TEST 3: Rider Cancellation After Driver Acceptance ---');
  const driverRes = await fetch(`${API_URL}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ValidationDriver', role: 'driver' })
  });
  const driverData = await driverRes.json();
  const driverId = driverData.driverId;

  const driverSocket = io(SOCKET_URL);
  await new Promise(r => driverSocket.on('connect', r));
  driverSocket.emit('join:driver', { driverId });

  // Rider creates ride 2
  const ride2 = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:create', {
      riderId: rider.id,
      pickup: 'Origin2',
      destination: 'Dest2',
      fare: 60
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  // Driver accepts
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:accept', {
      rideId: ride2.id,
      driverId
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  // Driver listens for ride:cancelled notification
  let driverReceivedCancelledCount = 0;
  let driverReceivedCancelledRide = null;
  const onDriverCancelled3 = (ride) => {
    if (ride.id === ride2.id) {
      driverReceivedCancelledCount++;
      driverReceivedCancelledRide = ride;
    }
  };
  driverSocket.on('ride:cancelled', onDriverCancelled3);

  // Rider cancels after driver accepted
  const riderCancelAccepted = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:cancel', {
      rideId: ride2.id,
      cancelledBy: 'RIDER',
      reason: 'Driver taking too long'
    }, res => res.success ? resolve(res) : reject(new Error(res.error)));
  });
  if (riderCancelAccepted.ride.status !== 'cancelled') throw new Error('Expected cancelled status');
  if (riderCancelAccepted.ride.cancelledBy !== 'RIDER') throw new Error('Expected cancelledBy RIDER');

  await new Promise(r => setTimeout(r, 400));
  driverSocket.off('ride:cancelled', onDriverCancelled3);
  if (driverReceivedCancelledCount !== 1) {
    throw new Error(`Expected driver to receive ride:cancelled exactly 1 time, got ${driverReceivedCancelledCount}`);
  }
  if (driverReceivedCancelledRide?.cancelledBy !== 'RIDER') {
    throw new Error(`Expected driver notification cancelledBy RIDER, got ${driverReceivedCancelledRide?.cancelledBy}`);
  }
  console.log('PASS: Rider cancellation after driver acceptance verified; Driver received notification exactly once');

  console.log('--- TEST 4: Driver Cancellation After Acceptance ---');
  // Rider creates ride 3
  const ride3 = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:create', {
      riderId: rider.id,
      pickup: 'Origin3',
      destination: 'Dest3',
      fare: 70
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  // Driver accepts
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:accept', {
      rideId: ride3.id,
      driverId
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  // Rider listens for ride:cancelled notification
  let riderReceivedCancelledCount = 0;
  let riderReceivedCancelledRide = null;
  const onRiderCancelled4 = (ride) => {
    if (ride.id === ride3.id) {
      riderReceivedCancelledCount++;
      riderReceivedCancelledRide = ride;
    }
  };
  riderSocket.on('ride:cancelled', onRiderCancelled4);

  // Driver cancels
  const driverCancel = await new Promise((resolve, reject) => {
    driverSocket.emit('ride:cancel', {
      rideId: ride3.id,
      cancelledBy: 'DRIVER',
      reason: 'Vehicle breakdown',
      driverId
    }, res => res.success ? resolve(res) : reject(new Error(res.error)));
  });
  if (driverCancel.ride.status !== 'cancelled') throw new Error('Expected cancelled status');
  if (driverCancel.ride.cancelledBy !== 'DRIVER') throw new Error('Expected cancelledBy DRIVER');

  await new Promise(r => setTimeout(r, 400));
  riderSocket.off('ride:cancelled', onRiderCancelled4);
  if (riderReceivedCancelledCount !== 1) {
    throw new Error(`Expected rider to receive ride:cancelled exactly 1 time, got ${riderReceivedCancelledCount}`);
  }
  if (riderReceivedCancelledRide?.cancelledBy !== 'DRIVER') {
    throw new Error(`Expected rider notification cancelledBy DRIVER, got ${riderReceivedCancelledRide?.cancelledBy}`);
  }
  console.log('PASS: Driver cancellation verified; Rider received notification exactly once');

  console.log('--- TEST 5: Rider and Driver Cancellation While in_progress (Started Trip) ---');
  // Rider creates ride 4
  const ride4 = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:create', {
      riderId: rider.id,
      pickup: 'Origin4',
      destination: 'Dest4',
      fare: 80
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  // Driver accepts and starts
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:accept', { rideId: ride4.id, driverId }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:start', { rideId: ride4.id, driverId }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  // Unrelated actor cannot cancel
  const failUnrelated = await new Promise(resolve => {
    driverSocket.emit('ride:cancel', {
      rideId: ride4.id,
      cancelledBy: 'DRIVER',
      reason: 'Wrong driver',
      driverId: 'unrelated-driver-id'
    }, resolve);
  });
  if (!failUnrelated.error || !failUnrelated.error.includes('Unauthorized')) {
    throw new Error(`Expected Unauthorized for unrelated driver, got: ${JSON.stringify(failUnrelated)}`);
  }
  console.log('PASS: Unrelated driver cancellation rejected');

  // Driver listens for in_progress cancellation notification from Rider
  let driverReceivedStartedCancel = null;
  const onDriverStartedCancel = (ride) => {
    if (ride.id === ride4.id) driverReceivedStartedCancel = ride;
  };
  driverSocket.on('ride:cancelled', onDriverStartedCancel);

  // Rider cancels in_progress ride
  const riderCancelStarted = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:cancel', {
      rideId: ride4.id,
      cancelledBy: 'RIDER',
      reason: 'Safety concern: erratic driving',
      userId: rider.id
    }, res => res.success ? resolve(res) : reject(new Error(res.error)));
  });
  if (riderCancelStarted.ride.status !== 'cancelled') throw new Error('Expected status cancelled');
  if (riderCancelStarted.ride.cancelledAfterStart !== true) throw new Error('Expected cancelledAfterStart === true');
  if (riderCancelStarted.ride.cancellationStage !== 'in_progress') throw new Error('Expected cancellationStage in_progress');
  if (!riderCancelStarted.trustRecord.after.cancellation.cancelledAfterStart) {
    throw new Error('Expected trustRecord cancellation.cancelledAfterStart to be true');
  }

  await new Promise(r => setTimeout(r, 400));
  driverSocket.off('ride:cancelled', onDriverStartedCancel);
  if (!driverReceivedStartedCancel || driverReceivedStartedCancel.cancelledAfterStart !== true) {
    throw new Error('Expected driver to receive in_progress cancelled notification');
  }
  console.log('PASS: Rider successfully cancelled in_progress trip; Driver received notification with post-start tracking');

  // Test Driver cancellation while in_progress
  const ride5 = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:create', {
      riderId: rider.id,
      pickup: 'Origin5',
      destination: 'Dest5',
      fare: 90
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:accept', { rideId: ride5.id, driverId }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:start', { rideId: ride5.id, driverId }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  // Rider listens for in_progress cancellation notification from Driver
  let riderReceivedStartedCancel = null;
  const onRiderStartedCancel = (ride) => {
    if (ride.id === ride5.id) riderReceivedStartedCancel = ride;
  };
  riderSocket.on('ride:cancelled', onRiderStartedCancel);

  const driverCancelStarted = await new Promise((resolve, reject) => {
    driverSocket.emit('ride:cancel', {
      rideId: ride5.id,
      cancelledBy: 'DRIVER',
      reason: 'Emergency: flat tire on highway',
      driverId
    }, res => res.success ? resolve(res) : reject(new Error(res.error)));
  });
  if (driverCancelStarted.ride.status !== 'cancelled') throw new Error('Expected status cancelled');
  if (driverCancelStarted.ride.cancelledAfterStart !== true) throw new Error('Expected cancelledAfterStart === true');

  await new Promise(r => setTimeout(r, 400));
  riderSocket.off('ride:cancelled', onRiderStartedCancel);
  if (!riderReceivedStartedCancel || riderReceivedStartedCancel.cancelledAfterStart !== true) {
    throw new Error('Expected rider to receive in_progress cancelled notification');
  }
  console.log('PASS: Driver successfully cancelled in_progress trip; Rider received notification with post-start tracking');

  // Test cannot cancel a completed ride
  const ride6 = await new Promise((resolve, reject) => {
    riderSocket.emit('ride:create', {
      riderId: rider.id,
      pickup: 'Origin6',
      destination: 'Dest6',
      fare: 100
    }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:accept', { rideId: ride6.id, driverId }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:start', { rideId: ride6.id, driverId }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });
  await new Promise((resolve, reject) => {
    driverSocket.emit('ride:complete', { rideId: ride6.id, driverId }, res => res.success ? resolve(res.ride) : reject(new Error(res.error)));
  });

  const cancelCompleted = await new Promise(resolve => {
    riderSocket.emit('ride:cancel', {
      rideId: ride6.id,
      cancelledBy: 'RIDER',
      reason: 'Should fail',
      userId: rider.id
    }, resolve);
  });
  if (!cancelCompleted.error || !cancelCompleted.error.includes('completed')) {
    throw new Error(`Expected error cancelling completed ride, got: ${JSON.stringify(cancelCompleted)}`);
  }
  console.log('PASS: Cancellation of completed ride correctly prevented');

  // Verify Ride History API includes post-start cancellation data
  const histRes = await fetch(`${API_URL}/rides/history?role=rider&userId=${rider.id}`);
  const histData = await histRes.json();
  const histRide4 = histData.rides.find(r => r.id === ride4.id);
  if (!histRide4 || !histRide4.cancelledAfterStart) {
    throw new Error('Expected history ride to include cancelledAfterStart: true');
  }
  console.log('PASS: Ride history accurately reflects post-trip-start cancellation');

  // Verify dashboard cancellations API
  const dashRes = await fetch(`${API_URL}/trust/cancellations/summary`);
  const dashData = await dashRes.json();
  console.log('Dashboard summary metrics:', dashData.data);

  riderSocket.disconnect();
  driverSocket.disconnect();
  console.log('\nALL CANCELLATION AND POST-START TESTS PASSED CLEANLY!');
  process.exit(0);
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
