import { v4 as uuidv4 } from 'uuid';

export const demoLogin = async (req, res) => {
    try {
        const { name, role } = req.body;
        if (!name || !role) return res.status(400).json({ error: 'Name and role required' });

        const db = global.firebaseDb;
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('name', '==', name).where('role', '==', role).limit(1).get();

        let user;
        if (snapshot.empty) {
            user = { id: uuidv4(), name, role, phone: '555-0000', email: 'test@demo.com', createdAt: new Date().toISOString() };
            await usersRef.doc(user.id).set(user);
        } else {
            user = snapshot.docs[0].data();
        }

        let driverId = null;
        if (role === 'driver') {
            const driversRef = db.collection('drivers');
            const driverSnap = await driversRef.where('userId', '==', user.id).limit(1).get();
            if (driverSnap.empty) {
                driverId = uuidv4();
                const driverData = { id: driverId, userId: user.id, name, phone: user.phone, vehicle: 'Demo Car', rating: 5, available: true, createdAt: new Date().toISOString() };
                await driversRef.doc(driverId).set(driverData);
            } else {
                driverId = driverSnap.docs[0].data().id;
            }
        }

        res.status(200).json({ user, driverId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
