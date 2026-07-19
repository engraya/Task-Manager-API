// types/express.d.ts — MODULE AUGMENTATION: we reopen Express's own Request
// interface and add our field to it. TypeScript merges this declaration with
// the one from @types/express, so req.userId typechecks everywhere without
// casting.
//
// Optional (`?`) on purpose: the field only exists on requests that passed
// through requireAuth. A non-optional type would let unprotected routes read
// req.userId as if it were guaranteed — a lie the compiler couldn't catch.

declare global {
  namespace Express {
    interface Request {
      /** The authenticated user's id (JWT `sub`). Set by requireAuth. */
      userId?: string;
    }
  }
}

// A file with top-level import/export is a MODULE; without one it's a
// SCRIPT whose declarations pollute the global scope directly. The empty
// export forces module status so `declare global` means what it says.
export {};
