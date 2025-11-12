
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  context: SecurityRuleContext;
  baseError?: Error;

  constructor(context: SecurityRuleContext, baseError?: Error) {
    const message = `Firestore Permission Denied: The following request was denied by security rules.\n\n${JSON.stringify(context, null, 2)}`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;
    this.baseError = baseError;
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
