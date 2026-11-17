/**
 * Resilix - A lightweight, dependency-free retry and resilience library for JavaScript and Node.js
 */

const { retry } = require('./retry');
const { retrySync } = require('./retrySync');
const { exponentialBackoff, fixedDelay } = require('./backoff');
const { withTimeout } = require('./timeout');
const { shouldRetry, validateAndNormalizeOptions } = require('./validation');
const { ResilixError, ResilixTimeoutError, ResilixConfigError } = require('./errors');

module.exports = {
  // Core resilience functions
  retry,
  retrySync,
  withTimeout,

  // Backoff strategies
  exponentialBackoff,
  fixedDelay,

  // Conditions & validation
  shouldRetry,
  validateAndNormalizeOptions,

  // Custom errors
  ResilixError,
  ResilixTimeoutError,
  ResilixConfigError,

  // Default export alias for interop
  default: {
    retry,
    retrySync,
    withTimeout,
    exponentialBackoff,
    fixedDelay,
    shouldRetry,
    validateAndNormalizeOptions,
    ResilixError,
    ResilixTimeoutError,
    ResilixConfigError,
  },
};
