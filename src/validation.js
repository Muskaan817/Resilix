/**
 * Configuration validation and condition evaluation for Resilix
 */

const { ResilixConfigError } = require('./errors');

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

  const initialDelay = opts.initialDelay !== undefined ? opts.initialDelay : (opts.delay !== undefined ? opts.delay : 1000);
  if (typeof initialDelay !== 'number' || Number.isNaN(initialDelay) || initialDelay < 0) {
    throw new ResilixConfigError(`initialDelay/delay must be a non-negative number, received: ${initialDelay}`);
  }

  // Support both 'strategy' and 'backoff' property names
  const backoff = opts.strategy !== undefined ? opts.strategy : (opts.backoff !== undefined ? opts.backoff : 'fixed');
  if (typeof backoff !== 'string' && typeof backoff !== 'function') {
    throw new ResilixConfigError(`strategy/backoff must be 'fixed', 'exponential', or a function, received: ${typeof backoff}`);
  }
  if (typeof backoff === 'string' && backoff !== 'fixed' && backoff !== 'exponential') {
    throw new ResilixConfigError(`strategy/backoff string must be either 'fixed' or 'exponential', received: '${backoff}'`);
  }

  const factor = opts.factor !== undefined ? opts.factor : (opts.multiplier !== undefined ? opts.multiplier : 2);
  if (typeof factor !== 'number' || Number.isNaN(factor) || factor < 1) {
    throw new ResilixConfigError(`factor/multiplier must be a number >= 1, received: ${factor}`);
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

  if (opts.onSuccess !== undefined && typeof opts.onSuccess !== 'function') {
    throw new ResilixConfigError(`onSuccess must be a function, received: ${typeof opts.onSuccess}`);
  }

  if (opts.onFailure !== undefined && typeof opts.onFailure !== 'function') {
    throw new ResilixConfigError(`onFailure must be a function, received: ${typeof opts.onFailure}`);
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
    initialDelay,
    delay: initialDelay,
    strategy: backoff,
    backoff,
    factor,
    maxDelay,
    jitter: opts.jitter === 'half' ? 'half' : Boolean(opts.jitter),
    name: opts.name || opts.operationName || null,
  };
}

module.exports = {
  shouldRetry,
  validateAndNormalizeOptions,
};
