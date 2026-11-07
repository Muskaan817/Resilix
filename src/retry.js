/**
 * Core retry functionality for Resilix
 */

const { ResilixError, ResilixConfigError } = require('./errors');
const { exponentialBackoff, fixedDelay } = require('./backoff');
const { withTimeout } = require('./timeout');

/**
 * Checks whether an error is eligible for retry.
 *
 * @param {Error|unknown} error - Error that occurred
 * @param {object|Function} [options={}] - Retry condition options or predicate function
 * @param {Array<Function|string>} [options.retryableErrors] - List of Error classes or code strings to retry
 * @param {Array<Function|string>} [options.nonRetryableErrors] - List of Error classes or code strings to NOT retry
 * @param {Function} [options.shouldRetry] - Custom predicate function
 * @returns {boolean} Whether the operation should be retried
 */
function shouldRetry(error, options = {}) {
  if (!error) return false;

  // Direct predicate function
  if (typeof options === 'function') {
    return Boolean(options(error));
  }
  if (typeof options.shouldRetry === 'function') {
    return Boolean(options.shouldRetry(error));
  }

  // Check non-retryable blacklist first
  if (Array.isArray(options.nonRetryableErrors) && options.nonRetryableErrors.length > 0) {
    for (const nonRetryable of options.nonRetryableErrors) {
      if (typeof nonRetryable === 'function' && error instanceof nonRetryable) {
        return false;
      }
      if (typeof nonRetryable === 'string') {
        if (error.code === nonRetryable || error.name === nonRetryable || (typeof error.message === 'string' && error.message.includes(nonRetryable))) {
          return false;
        }
      }
    }
  }

  // Check HTTP status code defaults (4xx client errors are non-retryable except 408 Request Timeout and 429 Too Many Requests)
  const status = error.status || error.statusCode;
  if (typeof status === 'number') {
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return false;
    }
  }

  // Check retryable whitelist if provided
  if (Array.isArray(options.retryableErrors) && options.retryableErrors.length > 0) {
    for (const retryable of options.retryableErrors) {
      if (typeof retryable === 'function' && error instanceof retryable) {
        return true;
      }
      if (typeof retryable === 'string') {
        if (error.code === retryable || error.name === retryable || (typeof error.message === 'string' && error.message.includes(retryable))) {
          return true;
        }
      }
    }
    return false;
  }

  return true;
}

/**
 * Validates and normalizes retry configuration options.
 *
 * @param {Function} callback - Target callback function
 * @param {object} [options={}] - Options object
 * @returns {object} Normalized options
 */
function validateAndNormalizeOptions(callback, options = {}) {
  if (typeof callback !== 'function') {
    throw new ResilixConfigError(`callback must be a function, received: ${typeof callback}`);
  }

  if (options !== null && typeof options !== 'object') {
    throw new ResilixConfigError(`options must be an object if provided, received: ${typeof options}`);
  }

  const opts = { ...options };

  // Definition: maxRetries is the number of ADDITIONAL attempts after the first failure.
  // E.g., maxRetries = 3 means 1 initial attempt + up to 3 retries = up to 4 total attempts.
  const maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : 3;
  if (typeof maxRetries !== 'number' || Number.isNaN(maxRetries) || maxRetries < 0 || !Number.isInteger(maxRetries)) {
    throw new ResilixConfigError(`maxRetries must be a non-negative integer, received: ${maxRetries}`);
  }

  const delay = opts.delay !== undefined ? opts.delay : (opts.initialDelay !== undefined ? opts.initialDelay : 1000);
  if (typeof delay !== 'number' || Number.isNaN(delay) || delay < 0) {
    throw new ResilixConfigError(`delay must be a non-negative number, received: ${delay}`);
  }

  const backoff = opts.backoff !== undefined ? opts.backoff : 'fixed';
  if (typeof backoff !== 'string' && typeof backoff !== 'function') {
    throw new ResilixConfigError(`backoff must be 'fixed', 'exponential', or a function, received: ${typeof backoff}`);
  }
  if (typeof backoff === 'string' && backoff !== 'fixed' && backoff !== 'exponential') {
    throw new ResilixConfigError(`backoff string must be either 'fixed' or 'exponential', received: '${backoff}'`);
  }

  const factor = opts.factor !== undefined ? opts.factor : (opts.multiplier !== undefined ? opts.multiplier : 2);
  if (typeof factor !== 'number' || Number.isNaN(factor) || factor < 1) {
    throw new ResilixConfigError(`factor must be a number >= 1, received: ${factor}`);
  }

  const maxDelay = opts.maxDelay !== undefined ? opts.maxDelay : 30000;
  if (typeof maxDelay !== 'number' || Number.isNaN(maxDelay) || maxDelay < 0) {
    throw new ResilixConfigError(`maxDelay must be a non-negative number, received: ${maxDelay}`);
  }

  if (opts.timeout !== undefined) {
    if (typeof opts.timeout !== 'number' || Number.isNaN(opts.timeout) || opts.timeout <= 0) {
      throw new ResilixConfigError(`timeout must be a positive number > 0, received: ${opts.timeout}`);
    }
  }

  if (opts.shouldRetry !== undefined && typeof opts.shouldRetry !== 'function' && typeof opts.shouldRetry !== 'object') {
    throw new ResilixConfigError(`shouldRetry must be a function or an options object, received: ${typeof opts.shouldRetry}`);
  }

  if (opts.onRetry !== undefined && typeof opts.onRetry !== 'function') {
    throw new ResilixConfigError(`onRetry must be a function, received: ${typeof opts.onRetry}`);
  }

  if (opts.beforeRetry !== undefined && typeof opts.beforeRetry !== 'function') {
    throw new ResilixConfigError(`beforeRetry must be a function, received: ${typeof opts.beforeRetry}`);
  }

  if (opts.afterRetry !== undefined && typeof opts.afterRetry !== 'function') {
    throw new ResilixConfigError(`afterRetry must be a function, received: ${typeof opts.afterRetry}`);
  }

  return {
    ...opts,
    maxRetries,
    delay,
    backoff,
    factor,
    maxDelay,
    jitter: Boolean(opts.jitter),
  };
}

/**
 * Calculates the delay for a given retry attempt based on options.
 *
 * @param {number} retryCount - 1-indexed retry number (1 for first retry)
 * @param {object} options - Normalized options
 * @returns {number} Calculated delay in ms
 */
function calculateDelay(retryCount, options) {
  if (typeof options.backoff === 'function') {
    const customDelay = options.backoff(retryCount, options);
    if (typeof customDelay !== 'number' || Number.isNaN(customDelay) || customDelay < 0) {
      return 0;
    }
    return Math.min(Math.round(customDelay), options.maxDelay);
  }

  if (options.backoff === 'exponential') {
    return exponentialBackoff(retryCount, {
      initialDelay: options.delay,
      factor: options.factor,
      maxDelay: options.maxDelay,
      jitter: options.jitter,
    });
  }

  return fixedDelay(retryCount, {
    delay: options.delay,
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
 * Synchronously sleeps for a specified duration.
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
      // Fallback spin wait if Atomics is unavailable
    }
  }
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
    // Hook errors are safely suppressed so user monitoring does not abort resilience logic
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'resilix') {
      console.warn('[Resilix] Error in retry hook:', hookErr);
    }
  }
}

/**
 * Safely invokes a synchronous callback hook.
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
 * Retries an asynchronous operation with configurable backoff, retry limits, and hooks.
 *
 * @template T
 * @param {(context: { attempt: number, retryCount: number, retriesLeft: number, signal?: AbortSignal }) => Promise<T>} callback - Async function to execute
 * @param {object} [options={}] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts after the first failure
 * @param {number} [options.delay=1000] - Base delay in milliseconds
 * @param {string|Function} [options.backoff='fixed'] - 'fixed', 'exponential', or custom delay function
 * @param {number} [options.factor=2] - Exponential backoff multiplier
 * @param {number} [options.maxDelay=30000] - Maximum delay ceiling in milliseconds
 * @param {boolean} [options.jitter=false] - Whether to randomize delay with jitter
 * @param {number} [options.timeout] - Timeout per attempt in milliseconds
 * @param {Function|object} [options.shouldRetry] - Condition determining if error should trigger retry
 * @param {Function} [options.onRetry] - Called on retry: (error, metadata) => void
 * @param {Function} [options.beforeRetry] - Called before delay: (metadata) => void
 * @param {Function} [options.afterRetry] - Called after delay before next try: (metadata) => void
 * @param {AbortSignal} [options.signal] - External AbortSignal to cancel retry sequence
 * @param {string} [options.name] - Descriptive name for operation
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

      return result;
    } catch (error) {
      errors.push(error);

      // Check if retries are exhausted
      if (retryCount >= opts.maxRetries) {
        const opName = opts.name ? `Operation "${opts.name}"` : 'Operation';
        const errorMsg = `${opName} failed after ${attemptNumber} attempt${attemptNumber === 1 ? '' : 's'} (${opts.maxRetries} retries exhausted): ${error && error.message ? error.message : String(error)}`;
        throw new ResilixError(errorMsg, {
          originalError: error,
          errors,
          attempts: attemptNumber,
          retries: retryCount,
          totalDelay,
          operationName: opts.name,
        });
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
        // Non-retryable error: propagate immediately
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
      return callback(context);
    } catch (error) {
      errors.push(error);

      if (retryCount >= opts.maxRetries) {
        const opName = opts.name ? `Operation "${opts.name}"` : 'Operation';
        const errorMsg = `${opName} failed after ${attemptNumber} attempt${attemptNumber === 1 ? '' : 's'} (${opts.maxRetries} retries exhausted): ${error && error.message ? error.message : String(error)}`;
        throw new ResilixError(errorMsg, {
          originalError: error,
          errors,
          attempts: attemptNumber,
          retries: retryCount,
          totalDelay,
          operationName: opts.name,
        });
      }

      const retryConditionMet = typeof opts.shouldRetry === 'function'
        ? opts.shouldRetry(error, {
            attempt: attemptNumber,
            retryCount,
            retriesLeft: opts.maxRetries - retryCount,
            elapsedMs: Date.now() - startTime,
          })
        : shouldRetry(error, opts.shouldRetry || opts);

      if (!retryConditionMet) {
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
  retry,
  retrySync,
  shouldRetry,
};
