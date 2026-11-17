/**
 * Resilix native ECMAScript Module (ESM) entry point
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const resilix = require('./src/index.js');

export const retry = resilix.retry;
export const retrySync = resilix.retrySync;
export const withTimeout = resilix.withTimeout;
export const exponentialBackoff = resilix.exponentialBackoff;
export const fixedDelay = resilix.fixedDelay;
export const shouldRetry = resilix.shouldRetry;
export const validateAndNormalizeOptions = resilix.validateAndNormalizeOptions;
export const ResilixError = resilix.ResilixError;
export const ResilixTimeoutError = resilix.ResilixTimeoutError;
export const ResilixConfigError = resilix.ResilixConfigError;

export default resilix;
