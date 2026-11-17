/**
 * Synchronous retry execution for Resilix
 */

const { ResilixError } = require('./errors');
const { exponentialBackoff, fixedDelay } = require('./backoff');
const { validateAndNormalizeOptions, shouldRetry } = require('./validation');

/**
 * Calculates delay for a synchronous retry attempt.
 *
 * @param {number} retryCount - 1-indexed retry number
 * @param {object} options - Normalized options
 * @returns {number} Calculated delay in ms
 */
function calculateDelay(retryCount, options) {
  if (typeof options.strategy === 'function') {
    const customDelay = options.strategy(retryCount, options);
    if (typeof customDelay !== 'number' || Number.isNaN(customDelay) || customDelay < 0) {
      return 0;
    }
    return Math.min(Math.round(customDelay), options.maxDelay);
  }

  if (options.strategy === 'exponential') {
    return exponentialBackoff(retryCount, {
      initialDelay: options.initialDelay,
      factor: options.factor,
      maxDelay: options.maxDelay,
      jitter: options.jitter,
    });
  }

  return fixedDelay(retryCount, {
    delay: options.initialDelay,
    maxDelay: options.maxDelay,
    jitter: options.jitter,
  });
}

/**
 * Synchronously sleeps for a specified duration using Atomics.wait.
 *
 * @param {number} ms - Milliseconds to sleep
 */
function sleepSync(ms) {
  if (ms <= 0) return;
  try {
    const sab = new SharedArrayBuffer(4);
    const int32 = new Int32Array(sab);
    Atomics.wait(int32, 0, 0, ms);
  } catch {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Fallback spin wait if Atomics is restricted
    }
  }
}

/**
 * Safely invokes a synchronous callback hook without breaking execution flow.
 *
 * @param {Function} [fn] - Callback function
 * @param {...any} args - Arguments to pass
 */
function safeInvokeSync(fn, ...args) {
  if (typeof fn !== 'function') return;
  try {
    fn(...args);
  } catch (hookErr) {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'resilix') {
      console.warn('[Resilix] Error in retrySync hook:', hookErr);
    }
  }
}

/**
 * Retries a synchronous operation with configurable backoff and limits.
 *
 * @template T
 * @param {(context: { attempt: number, retryCount: number, retriesLeft: number }) => T} callback - Synchronous function to execute
 * @param {object} [options={}] - Retry options
 * @returns {T} Result of successful execution
 * @throws {ResilixError} When all retry attempts are exhausted
 */
function retrySync(callback, options = {}) {
  const opts = validateAndNormalizeOptions(callback, options);
  const startTime = Date.now();
  const errors = [];
  let retryCount = 0;
  let totalDelay = 0;

  while (true) {
    const attemptNumber = retryCount + 1;
    const context = {
      attempt: attemptNumber,
      retryCount,
      retriesLeft: Math.max(0, opts.maxRetries - retryCount),
    };

    try {
      const result = callback(context);

      // Execute onSuccess hook if configured
      const successMetadata = {
        attempt: attemptNumber,
        attempts: attemptNumber,
        retryCount,
        retries: retryCount,
        totalDelay,
        elapsedMs: Date.now() - startTime,
        result,
      };
      safeInvokeSync(opts.onSuccess, result, successMetadata);

      return result;
    } catch (error) {
      errors.push(error);

      // Check if retries are exhausted
      if (retryCount >= opts.maxRetries) {
        const opName = opts.name ? `Operation "${opts.name}"` : 'Operation';
        const errorMsg = `${opName} failed after ${attemptNumber} attempt${attemptNumber === 1 ? '' : 's'} (${opts.maxRetries} retries exhausted): ${error && error.message ? error.message : String(error)}`;
        const finalError = new ResilixError(errorMsg, {
          originalError: error,
          errors,
          attempts: attemptNumber,
          retries: retryCount,
          totalDelay,
          operationName: opts.name,
        });

        const failureMetadata = {
          attempt: attemptNumber,
          attempts: attemptNumber,
          retryCount,
          retries: retryCount,
          totalDelay,
          elapsedMs: Date.now() - startTime,
          error: finalError,
          errors,
        };
        safeInvokeSync(opts.onFailure, finalError, failureMetadata);

        throw finalError;
      }

      // Check if error is retryable
      const retryConditionMet = typeof opts.shouldRetry === 'function'
        ? opts.shouldRetry(error, {
            attempt: attemptNumber,
            retryCount,
            retriesLeft: opts.maxRetries - retryCount,
            elapsedMs: Date.now() - startTime,
          })
        : shouldRetry(error, opts.shouldRetry || opts);

      if (!retryConditionMet) {
        const failureMetadata = {
          attempt: attemptNumber,
          attempts: attemptNumber,
          retryCount,
          retries: retryCount,
          totalDelay,
          elapsedMs: Date.now() - startTime,
          error,
          errors,
        };
        safeInvokeSync(opts.onFailure, error, failureMetadata);

        throw error;
      }

      retryCount += 1;
      const calculatedDelay = calculateDelay(retryCount, opts);
      totalDelay += calculatedDelay;

      const metadata = {
        attempt: attemptNumber + 1,
        retryCount,
        maxRetries: opts.maxRetries,
        retriesLeft: opts.maxRetries - retryCount,
        delay: calculatedDelay,
        totalDelay,
        elapsedMs: Date.now() - startTime,
        error,
      };

      safeInvokeSync(opts.onRetry, error, metadata);
      safeInvokeSync(opts.beforeRetry, metadata);

      if (calculatedDelay > 0) {
        sleepSync(calculatedDelay);
      }

      safeInvokeSync(opts.afterRetry, metadata);
    }
  }
}

module.exports = {
  retrySync,
};
