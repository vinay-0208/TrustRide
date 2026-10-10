import { Router } from 'express';
import { createRide, getRide, getActiveRide, getPendingRides, getLastCompletedRide, getRideHistory } from '../controllers/ride.controller.js';

const router = Router();
router.post('/', createRide);
router.get('/active', getActiveRide);
router.get('/requests', getPendingRides);
router.get('/last-completed', getLastCompletedRide);
router.get('/history', getRideHistory);
router.get('/:rideId', getRide);

export default router;
