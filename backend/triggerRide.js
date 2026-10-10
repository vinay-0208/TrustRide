import { io } from 'socket.io-client';
import axios from 'axios';
async function run() {
  const SOCKET_URL = 'http://127.0.0.1:8000';
  const API_URL = 'http://127.0.0.1:8000/api';
  const res = await axios.post(API_URL + '/auth/demo-login', { name: 'DiagRider', role: 'rider' });
  const rider = res.data.user;
  const socket = io(SOCKET_URL);
  socket.on('connect', () => {
    socket.emit('join', { userId: rider.id, role: 'rider' });
    setTimeout(() => {
      socket.emit('ride:create', { riderId: rider.id, pickup: 'DiagA', destination: 'DiagB', quotedFare: 50 }, (ack) => {
        console.log('RIDER ACK:', ack);
        process.exit(0);
      });
    }, 500);
  });
}
run();
