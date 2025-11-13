import admin from 'firebase-admin';

/**
 * Initializes the Firebase Admin SDK if not already initialized.
 * This is the single source of truth for the Admin SDK instance for the Next.js server environment.
 * It reads configuration from environment variables.
 */
function initializeFirebaseAdmin() {
  // Check if the required environment variables are available.
  const hasEnvVars =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

  if (admin.apps.length === 0) {
    if (hasEnvVars) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(
              /\\n/g,
              '\n'
            ),
          }),
        });
        console.log(
          'Firebase Admin SDK initialized successfully for Next.js server environment.'
        );
      } catch (error) {
        console.error(
          'Firebase admin initialization error from environment variables',
          error
        );
        // We throw here because if this fails, no admin operation will succeed.
        throw new Error(
          'Could not initialize Firebase Admin SDK. Check server environment variables.'
        );
      }
    } else {
      // In a production environment or any environment that relies on server-side
      // Firebase Admin calls, this should be a critical failure.
      throw new Error(
        'Firebase Admin SDK could not be initialized. Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY environment variables.'
      );
    }
  }
}

/**
 * A getter function to safely retrieve initialized Firebase Admin services for API Routes.
 * This should be called at the beginning of any server-side function needing admin access.
 * It now actively ensures initialization before returning services.
 * @returns An object containing the initialized `auth` and `db` services.
 */
export function getFirebaseAdmin() {
  initializeFirebaseAdmin(); // Ensure SDK is initialized on every call

  // After ensuring initialization, we can safely return the services.
  return {
    auth: admin.auth(),
    db: admin.firestore(),
  };
}
