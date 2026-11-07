/**
 * Timeout handling for Resilix operations
 */

const { ResilixTimeoutError, ResilixConfigError } = require('./errors');

/**
 * Executes an asynchronous operation with a maximum time limit.
 *
 * IMPORTANT NOTE ON CANCELLATION:
 * Standard JavaScript Promises are run-to-completion and cannot be forcibly cancelled from the outside.
 * When a timeout occurs, this function rejects immediately with a ResilixTimeoutError, but the underlying
 * asynchronous operation may continue running in the background unless it cooperatively checks an AbortSignal.
 * To enable true cancellation, pass a callback that accepts `{ signal }` and wire it to your fetch/database calls.
 *
 * @template T
 * @param {(() => Promise<T>) | ((context: { signal: AbortSignal }) => Promise<T>) | Promise<T>} callback - Async function or Promise to execute
 * @param {number} timeoutMs - Timeout limit in milliseconds
 * @param {object} [options={}] - Timeout options
 * @param {string} [options.operationName] - Optional name of operation for error messages
 * @param {AbortSignal} [options.signal] - Optional external AbortSignal to observe
 * @returns {Promise<T>} Resolves with the result of the operation or rejects with ResilixTimeoutError
 */
function withTimeout(callback, timeoutMs, options = {}) {
  if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    throw new ResilixConfigError(`timeout must be a positive number greater than 0, received: ${timeoutMs}`);
  }

  const isFunction = typeof callback === 'function';
  const isPromise = callback && typeof callback.then === 'function';

  if (!isFunction && !isPromise) {
    throw new ResilixConfigError('callback must be a function returning a Promise, an async function, or a Promise');
  }

  const operationName = options.operationName || null;
  const externalSignal = options.signal || null;

  if (externalSignal && externalSignal.aborted) {
    return Promise.reject(externalSignal.reason || new Error('Operation aborted prior to execution'));
  }

  return new Promise((resolve, reject) => {
    let timerId = null;
    let settled = false;

    // Internal abort controller to cooperatively cancel if supported
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    const cleanup = () => {
      settled = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    };

    const onExternalAbort = () => {
      if (settled) return;
      cleanup();
      if (abortController) {
        abortController.abort();
      }
      reject(externalSignal.reason || new Error('Operation aborted by external signal'));
    };

    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    timerId = setTimeout(() => {
      if (settled) return;
      cleanup();
      if (abortController) {
        abortController.abort();
      }
      reject(new ResilixTimeoutError(timeoutMs, operationName));
    }, timeoutMs);

    let promise;
    try {
      if (isFunction) {
        promise = callback({ signal: abortController ? abortController.signal : undefined });
      } else {
        promise = callback;
      }

      if (!promise || typeof promise.then !== 'function') {
        cleanup();
        resolve(promise);
        return;
      }
    } catch (syncError) {
      cleanup();
      reject(syncError);
      return;
    }

    promise
      .then((result) => {
        if (settled) return;
        cleanup();
        resolve(result);
      })
      .catch((error) => {
        if (settled) return;
        cleanup();
        reject(error);
      });
  });
}

module.exports = {
  withTimeout,
};
