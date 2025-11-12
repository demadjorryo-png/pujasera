
'use client';

import * as React from 'react';
import { errorEmitter } from '@/lib/error-emitter';

/**
 * A client component that listens for globally emitted 'permission-error' events.
 * When an event is received, it throws the error. In a Next.js development
 * environment, this will trigger the Next.js error overlay, providing a rich,
 * contextual debugging experience for Firestore security rule violations.
 * This component renders nothing and has no visual output.
 */
export function FirebaseErrorListener() {
  React.useEffect(() => {
    const handleError = (error: Error) => {
      // Throw the error to trigger the Next.js overlay
      throw error;
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  return null;
}
