/**
 * Type declarations for Resilix
 */

export interface RetryContext {
  attempt: number;
  retryCount: number;
  retriesLeft: number;
  signal?: AbortSignal;
}

export interface RetryMetadata {
  attempt: number;
  retryCount: number;
  maxRetries: number;
  retriesLeft: number;
  delay: number;
  totalDelay: number;
  elapsedMs: number;
  error: unknown;
}

export interface ExponentialBackoffOptions {
  initialDelay?: number;
  delay?: number;
  factor?: number;
  multiplier?: number;
  maxDelay?: number;
  jitter?: boolean | 'full' | 'half';
}

export interface FixedDelayOptions {
  delay?: number;
  initialDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
}

export interface ShouldRetryOptions {
  retryableErrors?: Array<new (...args: any[]) => Error | string>;
  nonRetryableErrors?: Array<new (...args: any[]) => Error | string>;
  shouldRetry?: (error: unknown) => boolean;
}

export interface RetryOptions {
  maxRetries?: number;
  delay?: number;
  initialDelay?: number;
  backoff?: 'fixed' | 'exponential' | ((attempt: number, options: RetryOptions) => number);
  factor?: number;
  multiplier?: number;
  maxDelay?: number;
  jitter?: boolean | 'full' | 'half';
  timeout?: number;
  shouldRetry?: ((error: unknown, metadata: { attempt: number; retryCount: number; retriesLeft: number; elapsedMs: number }) => boolean) | ShouldRetryOptions;
  onRetry?: (error: unknown, metadata: RetryMetadata) => void | Promise<void>;
  beforeRetry?: (metadata: RetryMetadata) => void | Promise<void>;
  afterRetry?: (metadata: RetryMetadata) => void | Promise<void>;
  signal?: AbortSignal;
  name?: string;
  operationName?: string;
}

export interface TimeoutOptions {
  operationName?: string;
  signal?: AbortSignal;
}

export class ResilixError extends Error {
  originalError: unknown;
  lastError: unknown;
  errors: unknown[];
  attempts: number;
  retries: number;
  totalDelay: number;
  operationName: string | null;
  cause?: unknown;
  constructor(message: string, metadata?: {
    originalError?: unknown;
    lastError?: unknown;
    errors?: unknown[];
    attempts?: number;
    retries?: number;
    totalDelay?: number;
    operationName?: string;
  });
}

export class ResilixTimeoutError extends ResilixError {
  timeoutMs: number;
  constructor(timeoutMs: number, operationName?: string | null, metadata?: Record<string, unknown>);
}

export class ResilixConfigError extends TypeError {
  constructor(message: string);
}

export function retry<T>(
  callback: (context: RetryContext) => Promise<T>,
  options?: RetryOptions
): Promise<T>;

export function retrySync<T>(
  callback: (context: Omit<RetryContext, 'signal'>) => T,
  options?: RetryOptions
): T;

export function withTimeout<T>(
  callback: ((context: { signal?: AbortSignal }) => Promise<T>) | Promise<T>,
  timeoutMs: number,
  options?: TimeoutOptions
): Promise<T>;

export function exponentialBackoff(
  attempt: number,
  options?: ExponentialBackoffOptions
): number;

export function fixedDelay(
  attempt: number,
  options?: FixedDelayOptions
): number;

export function shouldRetry(
  error: unknown,
  options?: ShouldRetryOptions | ((error: unknown) => boolean)
): boolean;

declare const resilix: {
  retry: typeof retry;
  retrySync: typeof retrySync;
  withTimeout: typeof withTimeout;
  exponentialBackoff: typeof exponentialBackoff;
  fixedDelay: typeof fixedDelay;
  shouldRetry: typeof shouldRetry;
  ResilixError: typeof ResilixError;
  ResilixTimeoutError: typeof ResilixTimeoutError;
  ResilixConfigError: typeof ResilixConfigError;
};

export default resilix;
