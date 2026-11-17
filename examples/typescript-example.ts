/**
 * TypeScript Example for Resilix
 * Demonstrates type-safe asynchronous and synchronous retry operations with generic return types.
 */

import {
  retry,
  retrySync,
  withTimeout,
  exponentialBackoff,
  shouldRetry,
  ResilixError,
  ResilixTimeoutError,
  RetryContext,
  RetryOptions,
  RetryMetadata,
  SuccessMetadata,
} from '../index';

interface UserProfile {
  id: string;
  name: string;
  role: string;
}

// 1. Generic type-safe asynchronous retry
async function fetchUserProfile(userId: string): Promise<UserProfile> {
  const options: RetryOptions<UserProfile> = {
    maxRetries: 3,
    initialDelay: 200,
    strategy: 'exponential',
    factor: 2,
    maxDelay: 2000,
    jitter: true,
    timeout: 1500,
    shouldRetry: (error: unknown) => shouldRetry(error),
    onRetry: (error: unknown, meta: RetryMetadata) => {
      console.log(`[TypeScript Demo] Retry attempt ${meta.attempt} in ${meta.delay}ms`);
    },
    onSuccess: (result: UserProfile, meta: SuccessMetadata<UserProfile>) => {
      console.log(`[TypeScript Demo] User ${result.name} fetched in ${meta.elapsedMs}ms`);
    },
  };

  return await retry<UserProfile>(async (ctx: RetryContext) => {
    if (ctx.attempt < 2) {
      throw new Error('Transient network glitch');
    }
    return {
      id: userId,
      name: 'Elena Rostova',
      role: 'DevOps Architect',
    };
  }, options);
}

// 2. Generic synchronous retry
function parseNumericConfig(raw: string): number {
  return retrySync<number>(() => {
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) throw new Error('Invalid number string');
    return parsed;
  }, { maxRetries: 1 });
}

// 3. Standalone withTimeout
async function runWithTimeout(): Promise<string> {
  return await withTimeout(async ({ signal }) => {
    return 'Operation finished within timeout limit';
  }, 1000);
}

async function main() {
  try {
    const user = await fetchUserProfile('usr_42');
    console.log('Fetched User Profile:', user);

    const num = parseNumericConfig('1024');
    console.log('Parsed Number:', num);

    const timeoutRes = await runWithTimeout();
    console.log('Timeout Result:', timeoutRes);
  } catch (error) {
    if (error instanceof ResilixError) {
      console.error('Operation failed after attempts:', error.attempts, error.message);
    }
  }
}

main();
