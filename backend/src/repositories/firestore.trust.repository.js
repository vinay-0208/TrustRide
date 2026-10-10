
import { TrustRepository } from "./trust.repository.js";

export class FirestoreTrustRepository extends TrustRepository {
    getDb() {
        if (!global.firebaseDb) throw new Error("Firestore not initialized");
        return global.firebaseDb;
    }

    async getTripTrustRecord(rideRequestId, tx) {
        const db = this.getDb();
        const ref = db.collection("TripTrustRecords").where("rideRequestId", "==", rideRequestId).limit(1);
        const snapshot = tx ? await tx.get(ref) : await ref.get();
        if (snapshot.empty) return null;
        return { ...snapshot.docs[0].data(), _ref: snapshot.docs[0].ref };
    }
    
    async getTripTrustRecordById(trustRecordId) {
        const db = this.getDb();
        const doc = await db.collection("TripTrustRecords").doc(trustRecordId).get();
        return doc.exists ? doc.data() : null;
    }
    
    async getAllTripTrustRecords() {
        const db = this.getDb();
        const snapshot = await db.collection("TripTrustRecords").get();
        let records = snapshot.docs.map(doc => doc.data());
        records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return records;
    }
    
    async createTripTrustRecord(recordData, tx) {
        const db = this.getDb();
        const ref = db.collection("TripTrustRecords").doc(recordData.trustRecordId);
        if (tx) {
            tx.set(ref, recordData);
        } else {
            await ref.set(recordData);
        }
        return recordData;
    }
    
    async updateTripTrustRecord(rideRequestId, updateData, tx) {
        const record = await this.getTripTrustRecord(rideRequestId, tx);
        if (!record) return null;
        if (tx) {
            tx.update(record._ref, updateData);
        } else {
            await record._ref.update(updateData);
        }
        return { ...record, ...updateData };
    }
    
    async appendTrustEvent(rideRequestId, eventData, tx) {
        const record = await this.getTripTrustRecord(rideRequestId, tx);
        if (!record) return null;
        const newEvents = [...(record.events || []), eventData];
        if (tx) {
            tx.update(record._ref, { events: newEvents });
        } else {
            await record._ref.update({ events: newEvents });
        }
        return { ...record, events: newEvents };
    }
}

