

import { FirestoreTrustRepository } from "../repositories/firestore.trust.repository.js";

const getTrustRepo = () => {
    
    return new FirestoreTrustRepository();
};

export const getHealth = async (req, res) => {
  res.json({
    success: true,
    service: "TrustRide",
    status: "operational"
  });
};

export const getOverview = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    
    const totalTrips = records.length;
    const completedTrips = records.filter(r => r.after?.cancellation?.cancelled === false).length;
    const cancelledTrips = records.filter(r => r.after?.cancellation?.cancelled === true).length;
    const flaggedTrips = records.filter(r => r.trustStatus === "FLAGGED").length;
    const verifiedTrips = records.filter(r => r.trustStatus === "VERIFIED").length;
    const normalTrips = records.filter(r => r.trustStatus === "NORMAL").length;
    const reviewTrips = records.filter(r => r.trustStatus === "REVIEW").length;

    let totalQuoted = 0, totalFinal = 0, fareDiscrepancyCount = 0, fareDiscrepancyAmount = 0;
    let promised = 0, actual = 0, difference = 0, earningsMismatchCount = 0, totalCommission = 0;
    let riderCancellations = 0, driverCancellations = 0;
    const reasonsMap = {};

    for (const r of records) {
        const isCancelled = r.after?.cancellation?.cancelled === true;

        // Cancellations intelligence
        if (isCancelled) {
            if (r.after?.cancellation?.cancelledBy === "RIDER") riderCancellations++;
            if (r.after?.cancellation?.cancelledBy === "DRIVER") driverCancellations++;
            const reason = r.after?.cancellation?.reason || "Unknown";
            reasonsMap[reason] = (reasonsMap[reason] || 0) + 1;

            // Only track discrepancy if a genuine non-zero discrepancy exists on the cancellation
            if (typeof r.fareDiscrepancy === 'number' && !Number.isNaN(r.fareDiscrepancy) && r.fareDiscrepancy !== 0) {
                fareDiscrepancyCount++;
                fareDiscrepancyAmount += Math.abs(r.fareDiscrepancy);
            }
            if (typeof r.earningsDiscrepancy === 'number' && !Number.isNaN(r.earningsDiscrepancy) && r.earningsDiscrepancy !== 0) {
                earningsMismatchCount++;
                difference += r.earningsDiscrepancy;
            }
            continue;
        }

        // Fare Integrity (completed rides)
        if (typeof r.before?.quotedFare === 'number' && !Number.isNaN(r.before.quotedFare)) {
            totalQuoted += r.before.quotedFare;
        }
        if (typeof r.after?.finalFare === 'number' && !Number.isNaN(r.after.finalFare)) {
            totalFinal += r.after.finalFare;
        }
        if (typeof r.fareDiscrepancy === 'number' && !Number.isNaN(r.fareDiscrepancy) && r.fareDiscrepancy !== 0) {
            fareDiscrepancyCount++;
            fareDiscrepancyAmount += Math.abs(r.fareDiscrepancy);
        }
        
        // Earnings Transparency (completed rides)
        if (typeof r.before?.promisedEarnings === 'number' && !Number.isNaN(r.before.promisedEarnings)) {
            promised += r.before.promisedEarnings;
        }
        if (typeof r.after?.earnings?.actualAmount === 'number' && !Number.isNaN(r.after.earnings.actualAmount)) {
            actual += r.after.earnings.actualAmount;
        }
        if (typeof r.after?.earnings?.platformCommission === 'number' && !Number.isNaN(r.after.earnings.platformCommission)) {
            totalCommission += r.after.earnings.platformCommission;
        }
        if (typeof r.earningsDiscrepancy === 'number' && !Number.isNaN(r.earningsDiscrepancy)) {
            difference += r.earningsDiscrepancy;
            if (r.earningsDiscrepancy !== 0) {
                earningsMismatchCount++;
            }
        }
    }

    const reasons = Object.keys(reasonsMap).map(k => ({ reason: k, count: reasonsMap[k] }));
    const recentTrips = records.slice(0, 5);

    res.json({
      success: true,
      data: {
        overview: { totalTrips, completedTrips, cancelledTrips, flaggedTrips },
        fareIntegrity: { totalQuoted, totalFinal, discrepancyCount: fareDiscrepancyCount, discrepancyAmount: Math.round(fareDiscrepancyAmount * 100) / 100 },
        cancellations: { total: cancelledTrips, rider: riderCancellations, driver: driverCancellations, reasons },
        earnings: { promised: Math.round(promised * 100) / 100, actual: Math.round(actual * 100) / 100, difference: Math.round(difference * 100) / 100, commission: Math.round(totalCommission * 100) / 100, mismatchCount: earningsMismatchCount },
        trustStatus: { verified: verifiedTrips, normal: normalTrips, review: reviewTrips, flagged: flaggedTrips },
        recentTrips
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTrips = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const trips = await trustRepo.getAllTripTrustRecords();
    res.json({ success: true, data: trips });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTripDetails = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const trip = await trustRepo.getTripTrustRecordById(req.params.tripId);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
    res.json({ success: true, data: trip });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTripEvents = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const trip = await trustRepo.getTripTrustRecordById(req.params.tripId);
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
    res.json({ success: true, data: trip.events || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getFareSummary = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    
    let totalQuoted = 0, totalFinal = 0, discrepancyCount = 0, discrepancyAmount = 0;
    let completedCount = 0;
    for (const r of records) {
        const isCancelled = r.after?.cancellation?.cancelled === true;
        if (isCancelled) {
            if (typeof r.fareDiscrepancy === 'number' && !Number.isNaN(r.fareDiscrepancy) && r.fareDiscrepancy !== 0) {
                discrepancyCount++;
                discrepancyAmount += Math.abs(r.fareDiscrepancy);
            }
            continue;
        }

        if (r.after?.cancellation?.cancelled === false) {
            completedCount++;
            if (typeof r.before?.quotedFare === 'number' && !Number.isNaN(r.before.quotedFare)) {
                totalQuoted += r.before.quotedFare;
            }
            if (typeof r.after?.finalFare === 'number' && !Number.isNaN(r.after.finalFare)) {
                totalFinal += r.after.finalFare;
            }
            if (typeof r.fareDiscrepancy === 'number' && !Number.isNaN(r.fareDiscrepancy) && r.fareDiscrepancy !== 0) {
                discrepancyCount++;
                discrepancyAmount += Math.abs(r.fareDiscrepancy);
            }
        }
    }
    const avgQuoted = completedCount > 0 ? totalQuoted / completedCount : 0;
    const avgFinal = completedCount > 0 ? totalFinal / completedCount : 0;

    res.json({ success: true, data: { totalRides: completedCount, totalQuoted, totalFinal, avgQuoted, avgFinal, discrepancyCount, discrepancyAmount: Math.round(discrepancyAmount * 100) / 100 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getFareDiscrepancies = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    const discrepancies = records.filter(r => typeof r.fareDiscrepancy === 'number' && !Number.isNaN(r.fareDiscrepancy) && r.fareDiscrepancy !== 0);
    res.json({ success: true, data: discrepancies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCancellationsSummary = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    
    const total = records.length;
    const totalCancellations = records.filter(r => r.after?.cancellation?.cancelled === true).length;
    const riderCancellations = records.filter(r => r.after?.cancellation?.cancelledBy === "RIDER").length;
    const driverCancellations = records.filter(r => r.after?.cancellation?.cancelledBy === "DRIVER").length;
    const otherCancellations = totalCancellations - riderCancellations - driverCancellations;
    const cancellationRate = total > 0 ? (totalCancellations / total) * 100 : 0;

    res.json({ success: true, data: { totalCancellations, riderCancellations, driverCancellations, otherCancellations, cancellationRate } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCancellationsReasons = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    const reasonsMap = {};
    for (const r of records) {
        if (r.after?.cancellation?.cancelled === true) {
            const reason = r.after?.cancellation?.reason || "Unknown";
            reasonsMap[reason] = (reasonsMap[reason] || 0) + 1;
        }
    }
    const reasons = Object.keys(reasonsMap).map(k => ({ reason: k, count: reasonsMap[k] }));
    res.json({ success: true, data: reasons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCancellationsPatterns = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    const patternsMap = {};
    for (const r of records) {
        if (r.after?.cancellation?.cancelled === true && r.driverId) {
            patternsMap[r.driverId] = (patternsMap[r.driverId] || 0) + 1;
        }
    }
    const patterns = Object.keys(patternsMap).map(k => ({ _id: k, count: patternsMap[k] }));
    res.json({ success: true, data: patterns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEarningsSummary = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    
    let totalPromised = 0, totalActual = 0, totalDifference = 0, mismatchCount = 0, totalCommission = 0;
    let completedCount = 0;
    for (const r of records) {
        const isCancelled = r.after?.cancellation?.cancelled === true;
        if (isCancelled) {
            if (typeof r.earningsDiscrepancy === 'number' && !Number.isNaN(r.earningsDiscrepancy) && r.earningsDiscrepancy !== 0) {
                mismatchCount++;
                totalDifference += r.earningsDiscrepancy;
            }
            continue;
        }

        if (r.after?.cancellation?.cancelled === false) {
            completedCount++;
            if (typeof r.before?.promisedEarnings === 'number' && !Number.isNaN(r.before.promisedEarnings)) {
                totalPromised += r.before.promisedEarnings;
            }
            if (typeof r.after?.earnings?.actualAmount === 'number' && !Number.isNaN(r.after.earnings.actualAmount)) {
                totalActual += r.after.earnings.actualAmount;
            }
            if (typeof r.after?.earnings?.platformCommission === 'number' && !Number.isNaN(r.after.earnings.platformCommission)) {
                totalCommission += r.after.earnings.platformCommission;
            }
            if (typeof r.earningsDiscrepancy === 'number' && !Number.isNaN(r.earningsDiscrepancy)) {
                totalDifference += r.earningsDiscrepancy;
                if (r.earningsDiscrepancy !== 0) {
                    mismatchCount++;
                }
            }
        }
    }
    const avgPromised = completedCount > 0 ? totalPromised / completedCount : 0;
    const avgActual = completedCount > 0 ? totalActual / completedCount : 0;

    res.json({ success: true, data: { totalPromised: Math.round(totalPromised * 100) / 100, totalActual: Math.round(totalActual * 100) / 100, totalDifference: Math.round(totalDifference * 100) / 100, totalCommission: Math.round(totalCommission * 100) / 100, avgPromised, avgActual, mismatchCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEarningsDiscrepancies = async (req, res) => {
  try {
    const trustRepo = getTrustRepo();
    const records = await trustRepo.getAllTripTrustRecords();
    const discrepancies = records.filter(r => typeof r.earningsDiscrepancy === 'number' && !Number.isNaN(r.earningsDiscrepancy) && r.earningsDiscrepancy !== 0);
    res.json({ success: true, data: discrepancies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

