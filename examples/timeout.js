/**
 * Timeout Handling Example
 * Demonstrates withTimeout standalone and per-attempt timeout in retry().
 */

const { retry, withTimeout, ResilixTimeoutError } = require('../index');

async function slowNetworkCall(delayMs) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ status: 'ok', data: 'Payload arrived' });
    }, delayMs);
  });
}

async function main() {
  console.log('--- 1. Standalone withTimeout() ---');
  try {
    console.log('Invoking 200ms task with 100ms timeout...');
    await withTimeout(slowNetworkCall(200), 100, { operationName: 'fetchRemoteConfig' });
  } catch (err) {
    if (err instanceof ResilixTimeoutError) {
      console.log('Caught ResilixTimeoutError:', err.message);
      console.log('Timeout limit was:', err.timeoutMs, 'ms');
    } else {
      console.error('Other error:', err);
    }
  }

  console.log('\n--- 2. Per-Attempt Timeout within retry() ---');
  let attempt = 0;

  try {
    const result = await retry(
      async () => {
        attempt++;
        console.log(`[Attempt #${attempt}] Calling service...`);
        // Attempt 1 takes 300ms (will timeout)
        // Attempt 2 takes 50ms (will succeed)
        const delay = attempt === 1 ? 300 : 50;
        return await slowNetworkCall(delay);
      },
      {
        maxRetries: 2,
        delay: 200,
        timeout: 100, // 100ms timeout per attempt
        name: 'unreliableMicroservice',
        onRetry: (err, meta) => {
          console.log(`  -> Warning: Attempt timed out (${err.message}). Retrying in ${meta.delay}ms...`);
        },
      }
    );

    console.log('Successfully recovered after timeout retry:', result);
  } catch (err) {
    console.error('Retry failed:', err.message);
  }
}

if (require.main === module) {
  main();
}

