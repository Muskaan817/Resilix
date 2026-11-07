/**
 * Backoff calculation utilities for Resilix
 */

const { ResilixConfigError } = require('./errors');

/**
 * Calculates exponential backoff delay based on the retry attempt number.
 *
 * @param {number} attempt - 1-indexed attempt number (1 for first retry, 2 for second, etc.)
 * @param {object} [options={}] - Backoff configuration options
 * @param {number} [options.initialDelay=1000] - Initial delay in milliseconds (alias: delay)
 * @param {number} [options.delay] - Alias for initialDelay
 * @param {number} [options.factor=2] - Exponential multiplier (must be >= 1)
 * @param {number} [options.multiplier] - Alias for factor
 * @param {number} [options.maxDelay=30000] - Maximum allowed delay cap in milliseconds
 * @param {boolean|string} [options.jitter=false] - Jitter mode: true/'full' for full random jitter, 'half' for 50-100% jitter
 * @returns {number} Calculated delay in milliseconds
 */
function exponentialBackoff(attempt, options = {}) {
  if (typeof attempt !== 'number' || Number.isNaN(attempt) || attempt < 1) {
    throw new ResilixConfigError(`Attempt must be a positive integer greater than or equal to 1, received: ${attempt}`);
  }

  const initialDelay = options.initialDelay !== undefined ? options.initialDelay : (options.delay !== undefined ? options.delay : 1000);
  if (typeof initialDelay !== 'number' || Number.isNaN(initialDelay) || initialDelay < 0) {
    throw new ResilixConfigError(`initialDelay must be a non-negative number, received: ${initialDelay}`);
  }

  const factor = options.factor !== undefined ? options.factor : (options.multiplier !== undefined ? options.multiplier : 2);
  if (typeof factor !== 'number' || Number.isNaN(factor) || factor < 1) {
    throw new ResilixConfigError(`factor must be a number >= 1, received: ${factor}`);
  }

  const maxDelay = options.maxDelay !== undefined ? options.maxDelay : 30000;
  if (typeof maxDelay !== 'number' || Number.isNaN(maxDelay) || maxDelay < 0) {
    throw new ResilixConfigError(`maxDelay must be a non-negative number, received: ${maxDelay}`);
  }

  // Calculate exponential delay: initialDelay * factor^(attempt - 1)
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const calculatedDelay = initialDelay * Math.pow(factor, exponent);

  // Apply maximum delay clamp
  const clampedDelay = Math.min(calculatedDelay, maxDelay);

  // Apply jitter if configured
  let finalDelay = clampedDelay;
  if (options.jitter === true || options.jitter === 'full') {
    finalDelay = Math.round(Math.random() * clampedDelay);
  } else if (options.jitter === 'half') {
    finalDelay = Math.round((clampedDelay / 2) + (Math.random() * (clampedDelay / 2)));
  }

  return Math.max(0, Math.round(finalDelay));
}

/**
 * Calculates a fixed delay between retry attempts.
 *
 * @param {number} attempt - 1-indexed attempt number
 * @param {object} [options={}] - Delay configuration options
 * @param {number} [options.delay=1000] - Fixed delay in milliseconds (alias: initialDelay)
 * @param {number} [options.initialDelay] - Alias for delay
 * @param {number} [options.maxDelay=Infinity] - Maximum allowed delay cap in milliseconds
 * @param {boolean} [options.jitter=false] - Whether to apply full random jitter
 * @returns {number} Calculated delay in milliseconds
 */
function fixedDelay(attempt, options = {}) {
  if (typeof attempt !== 'number' || Number.isNaN(attempt) || attempt < 1) {
    throw new ResilixConfigError(`Attempt must be a positive integer greater than or equal to 1, received: ${attempt}`);
  }

  const delay = options.delay !== undefined ? options.delay : (options.initialDelay !== undefined ? options.initialDelay : 1000);
  if (typeof delay !== 'number' || Number.isNaN(delay) || delay < 0) {
    throw new ResilixConfigError(`delay must be a non-negative number, received: ${delay}`);
  }

  const maxDelay = options.maxDelay !== undefined ? options.maxDelay : Infinity;
  if (typeof maxDelay !== 'number' || Number.isNaN(maxDelay) || maxDelay < 0) {
    throw new ResilixConfigError(`maxDelay must be a non-negative number, received: ${maxDelay}`);
  }

  const clampedDelay = Math.min(delay, maxDelay);

  let finalDelay = clampedDelay;
  if (options.jitter === true) {
    finalDelay = Math.round(Math.random() * clampedDelay);
  }

  return Math.max(0, Math.round(finalDelay));
}

module.exports = {
  exponentialBackoff,
  fixedDelay,
};
