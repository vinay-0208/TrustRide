import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { Server } from 'socket.io';
import http from 'http';

const app = express();
app.use(morgan('dev'));

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'], credentials: true }
});

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ limit: '50kb', extended: true }));
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

app.get('/api/trust/health', (req, res) => res.status(200).json({ status: 'ok', message: 'TrustRide Clean Foundation Backend' }));

import trustRoutes from './routes/trust.routes.js';
import authRoutes from './routes/auth.routes.js';
import rideRoutes from './routes/ride.routes.js';

app.use('/api/trust', trustRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);

export { app, io, server };
