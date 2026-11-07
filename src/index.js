/**
 * Resilix - A lightweight, dependency-free retry and resilience library for JavaScript and Node.js
 */

const { retry, retrySync, shouldRetry } = require('./retry');
const { exponentialBackoff, fixedDelay } = require('./backoff');
const { withTimeout } = require('./timeout');
const { ResilixError, ResilixTimeoutError, ResilixConfigError } = require('./errors');

module.exports = {
  // Core resilience functions
  retry,
  retrySync,
  withTimeout,

  // Backoff strategies
  exponentialBackoff,
  fixedDelay,

  // Conditions
  shouldRetry,

  // Custom errors
  ResilixError,
  ResilixTimeoutError,
  ResilixConfigError,

  // Default export alias for ESM / TS interoperability
  default: {
    retry,
    retrySync,
    withTimeout,
    exponentialBackoff,
    fixedDelay,
    shouldRetry,
    ResilixError,
    ResilixTimeoutError,
    ResilixConfigError,
  },
};
