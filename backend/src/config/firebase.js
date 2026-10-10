import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export const initializeFirebase = () => {
    try {
        const credentialPath = path.resolve(process.cwd(), 'firebase-credentials.json');
        
        if (existsSync(credentialPath)) {
            const serviceAccount = JSON.parse(readFileSync(credentialPath, 'utf8'));
            initializeApp({
                credential: cert(serviceAccount)
            });
            
            global.firebaseDb = getFirestore();
            console.log('Firebase Admin initialized. Firestore is active.');
        } else {
            console.warn('firebase-credentials.json not found. Firestore will not connect automatically.');
        }
    } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK:', error.message);
        process.exit(1);
    }
};
