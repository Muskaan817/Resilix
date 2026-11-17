/**
 * Custom error classes for Resilix
 */

/**
 * Custom error thrown when retries are exhausted or an unrecoverable failure occurs.
 */
class ResilixError extends Error {
  /**
   * @param {string} message - Descriptive error message
   * @param {object} [metadata] - Retry execution metadata
   * @param {Error|unknown} [metadata.originalError] - The underlying error that caused failure
   * @param {Array<Error|unknown>} [metadata.errors] - All errors encountered across attempts
   * @param {number} [metadata.attempts=1] - Total attempts made (initial + retries)
   * @param {number} [metadata.retries=0] - Number of retries executed
   * @param {number} [metadata.totalDelay=0] - Total time (ms) spent waiting between retries
   * @param {string} [metadata.operationName] - Optional name of the operation
   */
  constructor(message, metadata = {}) {
    super(message);
    this.name = 'ResilixError';

    const originalError = metadata.originalError || metadata.lastError || null;
    this.originalError = originalError;
    this.lastError = originalError;
    this.errors = Array.isArray(metadata.errors) ? metadata.errors : (originalError ? [originalError] : []);
    this.attempts = typeof metadata.attempts === 'number' ? metadata.attempts : 1;
    this.retries = typeof metadata.retries === 'number' ? metadata.retries : Math.max(0, this.attempts - 1);
    this.totalDelay = typeof metadata.totalDelay === 'number' ? metadata.totalDelay : 0;
    this.operationName = metadata.operationName || null;

    if (originalError && originalError instanceof Error) {
      this.cause = originalError;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when an operation exceeds its configured timeout.
 * Note: Promises in JavaScript cannot be cancelled without an explicit cancellation mechanism
 * such as AbortSignal. The underlying operation may continue running in the background.
 */
class ResilixTimeoutError extends ResilixError {
  /**
   * @param {number} timeoutMs - Timeout limit in milliseconds
   * @param {string} [operationName] - Optional name of the operation
   * @param {object} [metadata] - Additional metadata
   */
  constructor(timeoutMs, operationName = null, metadata = {}) {
    const opMsg = operationName ? `Operation "${operationName}"` : 'Operation';
    const message = `${opMsg} timed out after ${timeoutMs}ms. Note: underlying async task may continue in background unless cancelled via AbortSignal.`;
    super(message, {
      ...metadata,
      operationName,
    });
    this.name = 'ResilixTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when invalid configuration options or arguments are provided.
 */
class ResilixConfigError extends TypeError {
  /**
   * @param {string} message - Validation error message
   */
  constructor(message) {
    super(message);
    this.name = 'ResilixConfigError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = {
  ResilixError,
  ResilixTimeoutError,
  ResilixConfigError,
};

