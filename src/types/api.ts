// types/api.ts — API-wide response shapes from docs/API-Contract.md.

export interface ApiErrorDetail {
  field: string; // e.g. "title"
  message: string; // e.g. "must be 1-200 characters"
}

// The uniform error envelope: every non-2xx response body has this shape.
export interface ApiError {
  error: {
    message: string;
    details?: ApiErrorDetail[];
  };
}
