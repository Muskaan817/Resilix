/**
 * Asynchronous retry execution for Resilix
 */

const { ResilixError } = require('./errors');
const { exponentialBackoff, fixedDelay } = require('./backoff');
const { withTimeout } = require('./timeout');
const { validateAndNormalizeOptions, shouldRetry } = require('./validation');
const { retrySync } = require('./retrySync');

/**
 * Calculates the delay for a given retry attempt based on options.
 *
 * @param {number} retryCount - 1-indexed retry number (1 for first retry)
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
 * Asynchronously sleeps for a specified duration, supporting cancellation via AbortSignal.
 *
 * @param {number} ms - Milliseconds to sleep
 * @param {AbortSignal} [signal] - Optional AbortSignal
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      return reject(signal.reason || new Error('Operation aborted during backoff delay'));
    }

    let timerId = null;

    const onAbort = () => {
      if (timerId !== null) clearTimeout(timerId);
      reject(signal.reason || new Error('Operation aborted during backoff delay'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timerId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
  });
}

/**
 * Safely invokes a callback hook without breaking the retry flow.
 *
 * @param {Function} [fn] - Callback function
 * @param {...any} args - Arguments to pass
 * @returns {Promise<void>|void}
 */
async function safeInvokeAsync(fn, ...args) {
  if (typeof fn !== 'function') return;
  try {
    const res = fn(...args);
    if (res && typeof res.then === 'function') {
      await res;
    }
  } catch (hookErr) {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'resilix') {
      console.warn('[Resilix] Error in retry hook:', hookErr);
    }
  }
}

/**
 * Retries an asynchronous operation with configurable backoff, retry limits, and hooks.
 *
 * @template T
 * @param {(context: { attempt: number, retryCount: number, retriesLeft: number, signal?: AbortSignal }) => Promise<T>} callback - Async function to execute
 * @param {object} [options={}] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts after the first failure
 * @param {number} [options.initialDelay=1000] - Base delay in milliseconds (alias: delay)
 * @param {number} [options.delay] - Alias for initialDelay
 * @param {string|Function} [options.strategy='fixed'] - 'fixed', 'exponential', or custom delay function (alias: backoff)
 * @param {string|Function} [options.backoff] - Alias for strategy
 * @param {number} [options.factor=2] - Exponential backoff multiplier (alias: multiplier)
 * @param {number} [options.maxDelay=30000] - Maximum delay ceiling in milliseconds
 * @param {boolean|string} [options.jitter=false] - Whether to randomize delay with jitter (true, 'full', 'half')
 * @param {number} [options.timeout] - Timeout per attempt in milliseconds
 * @param {Function|object} [options.shouldRetry] - Condition determining if error should trigger retry
 * @param {Function} [options.onRetry] - Called on retry: (error, metadata) => void
 * @param {Function} [options.onSuccess] - Called on success: (result, metadata) => void
 * @param {Function} [options.onFailure] - Called on failure: (error, metadata) => void
 * @param {Function} [options.beforeRetry] - Called before delay: (metadata) => void
 * @param {Function} [options.afterRetry] - Called after delay before next try: (metadata) => void
 * @param {AbortSignal} [options.signal] - External AbortSignal to cancel retry sequence
 * @param {string} [options.name] - Descriptive name for operation (alias: operationName)
 * @returns {Promise<T>} Result of successful execution
 * @throws {ResilixError} When all retry attempts are exhausted
 */
async function retry(callback, options = {}) {
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
      signal: opts.signal,
    };

    try {
      if (opts.signal && opts.signal.aborted) {
        throw opts.signal.reason || new Error('Operation aborted');
      }

      let result;
      if (opts.timeout) {
        result = await withTimeout(() => callback(context), opts.timeout, {
          operationName: opts.name,
          signal: opts.signal,
        });
      } else {
        result = await callback(context);
      }

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
      await safeInvokeAsync(opts.onSuccess, result, successMetadata);

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
        await safeInvokeAsync(opts.onFailure, finalError, failureMetadata);

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
        await safeInvokeAsync(opts.onFailure, error, failureMetadata);

        throw error;
      }

      // Next retry attempt
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

      // Execute onRetry and beforeRetry hooks
      await safeInvokeAsync(opts.onRetry, error, metadata);
      await safeInvokeAsync(opts.beforeRetry, metadata);

      // Sleep backoff delay
      await sleep(calculatedDelay, opts.signal);

      // Execute afterRetry hook
      await safeInvokeAsync(opts.afterRetry, metadata);
    }
  }
}

module.exports = {
  retry,
  retrySync,
  shouldRetry,
};
