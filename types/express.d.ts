import { SignedInAuthObject, SignedOutAuthObject } from '@clerk/backend/internal';

declare global {
  namespace Express {
    interface Request {
      auth: SignedInAuthObject | SignedOutAuthObject;
    }
  }
}
