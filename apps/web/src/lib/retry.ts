import { ApiError } from './api';

const MAX_RETRIES = 2;

/** Retry network failures (status 0) and 5xx; client errors (4xx) will not change. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}
