/**
 * Fixed Delay Example for Resilix
 * Demonstrates retrying with a constant interval, jitter, and success/failure hooks.
 */

const { retry, fixedDelay } = require('../index');

async function processBatchJob(jobId) {
  let attemptCount = 0;

  console.log(`[Batch Processor] Starting Job #${jobId}...`);

  return await retry(
    async (ctx) => {
      attemptCount++;
      console.log(`  -> Processing batch items (Attempt #${ctx.attempt}, retriesLeft: ${ctx.retriesLeft})`);

      if (attemptCount < 3) {
        throw new Error('Worker queue busy');
      }

      return { jobId, status: 'COMPLETED', itemsProcessed: 500 };
    },
    {
      maxRetries: 3,
      delay: 200,
      strategy: 'fixed',
      jitter: true,
      onRetry: (err, meta) => {
        console.log(`  [onRetry] ${err.message}. Retrying in ${meta.delay}ms...`);
      },
      onSuccess: (result, meta) => {
        console.log(`  [onSuccess] Job completed successfully in ${meta.elapsedMs}ms after ${meta.attempts} attempt(s)!`);
      },
      onFailure: (err, meta) => {
        console.error(`  [onFailure] Job failed permanently after ${meta.attempts} attempts: ${err.message}`);
      },
    }
  );
}

async function main() {
  console.log('--- 1. Fixed Delay Calculation Preview ---');
  for (let i = 1; i <= 3; i++) {
    const delay = fixedDelay(i, { delay: 300, maxDelay: 500 });
    console.log(`  Attempt ${i}: ${delay}ms`);
  }

  console.log('\n--- 2. Executing Operation with Fixed Delay ---');
  try {
    const outcome = await processBatchJob('batch_8841');
    console.log('Final Result:', outcome);
  } catch (err) {
    console.error('Job error:', err.message);
  }
}

if (require.main === module) {
  main();
}
