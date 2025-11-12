import admin from 'firebase-admin';

/**
 * Initializes the Firebase Admin SDK if not already initialized.
 * This is the single source of truth for the Admin SDK instance for the Next.js server environment.
 * It reads configuration from environment variables.
 */
function initializeFirebaseAdmin() {
  if (admin.apps.length === 0) {
    // Check if the required environment variables are available.
    const hasEnvVars = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;

    if (hasEnvVars) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
        console.log("Firebase Admin SDK initialized successfully for Next.js server environment.");
      } catch (error) {
        console.error("Firebase admin initialization error from environment variables", error);
        throw new Error("Could not initialize Firebase Admin SDK. Check server environment variables.");
      }
    } else {
      // This will prevent the app from crashing in environments where env vars aren't set,
      // but will cause API routes that need admin to fail.
      console.warn("Firebase Admin SDK not initialized. Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY environment variables.");
    }
  }
}

/**
 * A getter function to safely retrieve initialized Firebase Admin services for API Routes.
 * This should be called at the beginning of any server-side function needing admin access.
 * @returns An object containing the initialized `auth` and `db` services.
 */
export function getFirebaseAdmin() {
    initializeFirebaseAdmin();
    // Throw an error if initialization failed and the app continues.
    if (admin.apps.length === 0) {
        throw new Error("Firebase Admin SDK is not initialized. API Route cannot function.");
    }
    return {
        auth: admin.auth(),
        db: admin.firestore(),
    };
}
