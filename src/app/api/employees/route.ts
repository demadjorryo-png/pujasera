
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/server/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { auth, db } = getFirebaseAdmin();
    // 1. Verify the authorization token from the client
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const callerUid = decodedToken.uid;

    // 2. Validate Input Data from the request body
    const { email, password, name, role, storeId } = await req.json();
    if (!email || !password || !name || !role || !storeId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 3. Verify Caller Permissions
    const callerDocRef = db.collection('users').doc(callerUid);
    const callerDoc = await callerDocRef.get();
    
    if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Permission denied: Caller is not an admin' }, { status: 403 });
    }

    // 4. Create User in Firebase Authentication using Admin SDK
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });
    const newUserId = userRecord.uid;

    // 5. Set Custom Claims for Role-Based Access Control
    await auth.setCustomUserClaims(newUserId, { role });
    
    // 6. Create User Document and update store in a Firestore batch
    const batch = db.batch();

    const userDocRef = db.collection('users').doc(newUserId);
    batch.set(userDocRef, {
      name,
      email,
      role,
      status: 'active',
      storeId,
    });

    if (role === 'admin') {
      const storeRef = db.collection('stores').doc(storeId);
      const storeSnap = await storeRef.get();
      if(storeSnap.exists()) {
        const storeData = storeSnap.data();
        const adminUids = storeData.adminUids || [];
        if (!adminUids.includes(newUserId)) {
            adminUids.push(newUserId);
        }
        batch.update(storeRef, { adminUids });
      }
    }

    await batch.commit();

    return NextResponse.json({ success: true, userId: newUserId }, { status: 201 });

  } catch (error) {
    console.error('Error creating employee via API route:', error);
    let errorMessage = 'An internal server error occurred.';
    let statusCode = 500;
    
    // ... (error handling remains the same)

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}
