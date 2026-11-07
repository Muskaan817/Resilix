/**
 * Basic Resilix Example
 * Demonstrates basic retry of an asynchronous operation that fails intermittently.
 */

const { retry, retrySync } = require('../index');

async function simulateUnreliableApi(context) {
  console.log(`[API Call] Attempt #${context.attempt} (retryCount: ${context.retryCount})`);
  if (context.attempt < 3) {
    throw new Error(`503 Service Unavailable (attempt ${context.attempt})`);
  }
  return { status: 200, data: { userId: 42, name: 'Alice Developer' } };
}

async function runAsyncDemo() {
  console.log('--- 1. Asynchronous Retry Demo ---');
  try {
    const result = await retry(simulateUnreliableApi, {
      maxRetries: 3,
      delay: 500,
      onRetry: (err, meta) => {
        console.log(`  -> Warning: ${err.message}. Retrying in ${meta.delay}ms (${meta.retriesLeft} retries left)...`);
      },
    });
    console.log('Result:', result);
  } catch (err) {
    console.error('Operation failed permanently:', err.message);
  }
}

function runSyncDemo() {
  console.log('\n--- 2. Synchronous Retry Demo ---');
  let syncAttempts = 0;

  try {
    const result = retrySync(() => {
      syncAttempts++;
      console.log(`[Sync Operation] Attempt #${syncAttempts}`);
      if (syncAttempts < 2) {
        throw new Error('Lock acquisition failed');
      }
      return 'Lock Acquired Successfully';
    }, {
      maxRetries: 2,
      delay: 200,
    });
    console.log('Sync Result:', result);
  } catch (err) {
    console.error('Sync failed permanently:', err.message);
  }
}

async function main() {
  await runAsyncDemo();
  runSyncDemo();
}

if (require.main === module) {
  main();
}
