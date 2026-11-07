/**
 * Exponential Backoff Example
 * Demonstrates exponential backoff with jitter and max delay cap.
 */

const { retry, exponentialBackoff } = require('../index');

async function main() {
  console.log('--- Resilix Exponential Backoff Demo ---');

  // Preview the calculated delays:
  console.log('Delays for attempts 1 through 5 with initialDelay=1000, factor=2, maxDelay=10000:');
  for (let attempt = 1; attempt <= 5; attempt++) {
    const delay = exponentialBackoff(attempt, {
      initialDelay: 1000,
      factor: 2,
      maxDelay: 10000,
    });
    console.log(`  Attempt ${attempt} -> ${delay}ms`);
  }

  console.log('\nExecuting retry with exponential backoff and jitter:');
  let attemptCount = 0;

  try {
    const data = await retry(
      async (ctx) => {
        attemptCount++;
        console.log(`[Worker] Attempt #${ctx.attempt} connecting to external service...`);
        if (attemptCount < 4) {
          throw new Error('Connection timeout');
        }
        return { success: true, processedItems: 120 };
      },
      {
        maxRetries: 4,
        delay: 200,
        backoff: 'exponential',
        factor: 2,
        maxDelay: 5000,
        jitter: true,
        beforeRetry: (meta) => {
          console.log(`  [Before Retry] Backing off for ${meta.delay}ms before attempt ${meta.attempt}...`);
        },
        afterRetry: (meta) => {
          console.log(`  [After Retry] Wait finished. Launching attempt ${meta.attempt}.`);
        },
      }
    );

    console.log('Successful response:', data);
  } catch (error) {
    console.error('Final failure:', error);
  }
}

if (require.main === module) {
  main();
}
