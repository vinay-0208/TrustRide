import { initializeFirebase } from './config/firebase.js';
initializeFirebase();

async function test() {
    try {
        const db = global.firebaseDb;
        const testDocRef = db.collection('verify_runtime_temp').doc('test_doc');
        
        // WRITE
        await testDocRef.set({ message: 'hello firestore', timestamp: Date.now() });
        console.log('WRITE: PASS');
        
        // READ
        const doc = await testDocRef.get();
        if (doc.exists && doc.data().message === 'hello firestore') {
            console.log('READ: PASS');
        } else {
            console.log('READ: FAIL');
        }
        
        // DELETE
        await testDocRef.delete();
        console.log('DELETE: PASS');
    } catch (e) {
        console.error('ERROR:', e.message);
    }
    process.exit(0);
}
test();
