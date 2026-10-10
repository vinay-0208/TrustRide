import express from 'express';
import { 
  getHealth, getOverview, getTrips, getTripDetails, getTripEvents, 
  getFareSummary, getFareDiscrepancies, 
  getCancellationsSummary, getCancellationsReasons, getCancellationsPatterns, 
  getEarningsSummary, getEarningsDiscrepancies 
} from '../controllers/trust.controller.js';

const router = express.Router();

router.get('/health', getHealth);
router.get('/dashboard/overview', getOverview);
router.get('/trips', getTrips);
router.get('/trips/:tripId', getTripDetails);
router.get('/trips/:tripId/events', getTripEvents);

router.get('/fare/summary', getFareSummary);
router.get('/fare/discrepancies', getFareDiscrepancies);

router.get('/cancellations/summary', getCancellationsSummary);
router.get('/cancellations/reasons', getCancellationsReasons);
router.get('/cancellations/patterns', getCancellationsPatterns);

router.get('/earnings/summary', getEarningsSummary);
router.get('/earnings/discrepancies', getEarningsDiscrepancies);

export default router;
