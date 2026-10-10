
import { FirestoreTrustRepository } from '../repositories/firestore.trust.repository.js';

// Factory pattern for repository selection based on environment

const trustRepo = new FirestoreTrustRepository();

export class TrustRideService {
  
  static async getOrCreateTrustRecord(rideRequestId, userId, session) {
    let record = await trustRepo.getTripTrustRecord(rideRequestId, session);
    if (!record) {
      const newRecord = {
        trustRecordId: 'TR-' + rideRequestId.substring(0, 8) + Date.now(),
        rideRequestId,
        userId,
        events: []
      };
      record = await trustRepo.createTripTrustRecord(newRecord, session);
    }
    return record;
  }
  
  static async handleRideCreated(rideRequest, session) {
    let record = await this.getOrCreateTrustRecord(rideRequest._id.toString(), rideRequest.userId, session);
    if (record.events.some(e => e.eventType === 'RIDE_CREATED')) return record;
    
    // Properties assignment:
    record.before = {
      quotedFare: null,
      estimatedDistance: rideRequest.estimatedDistance || null,
      estimatedDuration: rideRequest.estimatedDuration || null,
      promisedEarnings: null
    };
    
    const event = {
      eventId: rideRequest._id.toString() + '-CREATED',
      trustRecordId: record.trustRecordId,
      rideRequestId: record.rideRequestId,
      eventType: 'RIDE_CREATED',
      actorType: 'RIDER',
      timestamp: new Date(),
      severity: 'INFO',
      data: { rideType: rideRequest.rideType }
    };
    
    record = await trustRepo.updateTripTrustRecord(record.rideRequestId, { before: record.before }, session);
    record = await trustRepo.appendTrustEvent(record.rideRequestId, event, session);
    return record;
  }
  
  static async handleBidAccepted(rideRequest, driverId, fareAmount, session) {
    let record = await this.getOrCreateTrustRecord(rideRequest._id.toString(), rideRequest.userId, session);
    if (record.events.some(e => e.eventType === 'DRIVER_ASSIGNED')) return record;
    
    record.driverId = driverId;
    if(!record.before) record.before = {};
    record.before.quotedFare = fareAmount;
    record.before.promisedEarnings = null;
    
    const event = {
      eventId: rideRequest._id.toString() + '-ASSIGNED',
      trustRecordId: record.trustRecordId,
      rideRequestId: record.rideRequestId,
      eventType: 'DRIVER_ASSIGNED',
      actorType: 'RIDER',
      actorId: rideRequest.userId,
      timestamp: new Date(),
      severity: 'INFO',
      data: { driverId, fareAmount }
    };
    
    record = await trustRepo.updateTripTrustRecord(record.rideRequestId, { driverId, before: record.before }, session);
    record = await trustRepo.appendTrustEvent(record.rideRequestId, event, session);
    return record;
  }
  
  static async handleRideCancelled(rideRequest, reason, cancelledBy, session) {
    let record = await this.getOrCreateTrustRecord(rideRequest._id.toString(), rideRequest.userId, session);
    if (record.events.some(e => e.eventType === 'RIDE_CANCELLED')) return record;
    
    record.after = {
      ...record.after,
      cancellation: {
        cancelled: true,
        cancelledBy: cancelledBy,
        reason: reason,
        timestamp: new Date()
      }
    };
    
    const event = {
      eventId: rideRequest._id.toString() + '-CANCELLED',
      trustRecordId: record.trustRecordId,
      rideRequestId: record.rideRequestId,
      eventType: 'RIDE_CANCELLED',
      actorType: cancelledBy || 'SYSTEM',
      timestamp: new Date(),
      severity: 'WARNING',
      data: { reason }
    };
    
    record = await trustRepo.updateTripTrustRecord(record.rideRequestId, { after: record.after }, session);
    record = await trustRepo.appendTrustEvent(record.rideRequestId, event, session);
    return record;
  }
  
  static async handleRideCompleted(rideRequest, finalFare, session) {
    let record = await this.getOrCreateTrustRecord(rideRequest._id.toString(), rideRequest.userId, session);
    if (record.events.some(e => e.eventType === 'RIDE_COMPLETED')) return record;
    
    record.after = {
      ...record.after,
      finalFare: finalFare,
      cancellation: { cancelled: false, cancelledBy: null },
      earnings: {
        promisedAmount: record.before?.promisedEarnings || null,
        actualAmount: null,
        difference: 0
      }
    };
    
    record.fareDiscrepancy = finalFare - (record.before?.quotedFare || finalFare);
    record.earningsDiscrepancy = 0;
    record.trustStatus = record.fareDiscrepancy === 0 ? 'VERIFIED' : 'DISCREPANCY';
    
    const event = {
      eventId: rideRequest._id.toString() + '-COMPLETED',
      trustRecordId: record.trustRecordId,
      rideRequestId: record.rideRequestId,
      eventType: 'RIDE_COMPLETED',
      actorType: 'DRIVER',
      timestamp: new Date(),
      severity: 'INFO',
      data: { finalFare }
    };
    
    record = await trustRepo.updateTripTrustRecord(record.rideRequestId, {
      after: record.after,
      fareDiscrepancy: record.fareDiscrepancy,
      earningsDiscrepancy: record.earningsDiscrepancy,
      trustStatus: record.trustStatus
    }, session);
    record = await trustRepo.appendTrustEvent(record.rideRequestId, event, session);
    return record;
  }
}
