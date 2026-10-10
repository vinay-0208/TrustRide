import { Router } from 'express';
import { demoLogin } from '../controllers/auth.controller.js';

const router = Router();
router.post('/demo-login', demoLogin);

export default router;
