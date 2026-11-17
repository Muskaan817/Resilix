/**
 * Custom Retry Conditions Example
 * Demonstrates how to selectively retry transient errors while failing fast on permanent errors.
 */

const { retry, shouldRetry } = require('../index');

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
  }
}

class InvalidCredentialsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidCredentialsError';
    this.status = 401;
  }
}

async function runSelectiveRetry(errorToThrow) {
  return retry(
    async (ctx) => {
      console.log(`[API Request] Attempt #${ctx.attempt}`);
      if (ctx.attempt < 3) {
        throw errorToThrow;
      }
      return { success: true, message: 'Authenticated and processed' };
    },
    {
      maxRetries: 3,
      delay: 300,
      shouldRetry: (err) => {
        // Never retry authentication errors
        if (err instanceof InvalidCredentialsError || err.status === 401) {
          console.log(`  -> Detected permanent error (${err.name}). Bypassing retries.`);
          return false;
        }
        // Retry rate limits and network errors
        return shouldRetry(err);
      },
      onRetry: (err, meta) => {
        console.log(`  -> Retrying after ${err.name} (Attempt ${meta.attempt}, delay: ${meta.delay}ms)`);
      },
    }
  );
}

async function main() {
  console.log('--- 1. Testing Transient Rate Limit Error (Should Retry) ---');
  try {
    const res = await runSelectiveRetry(new RateLimitError('Too Many Requests'));
    console.log('Outcome:', res);
  } catch (err) {
    console.error('Failed:', err.message);
  }

  console.log('\n--- 2. Testing Permanent Auth Error (Should Fail Fast) ---');
  try {
    await runSelectiveRetry(new InvalidCredentialsError('Bad API Token'));
  } catch (err) {
    console.log('Successfully failed fast on permanent error:', err.message);
  }
}

if (require.main === module) {
  main();
}

