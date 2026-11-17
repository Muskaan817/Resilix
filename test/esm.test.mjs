import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import resilixDefault, {
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
} from '../index.mjs';

describe('Native ESM Exports', () => {
  it('exports all expected functions and classes via named ESM imports', () => {
    assert.equal(typeof retry, 'function');
    assert.equal(typeof retrySync, 'function');
    assert.equal(typeof withTimeout, 'function');
    assert.equal(typeof exponentialBackoff, 'function');
    assert.equal(typeof fixedDelay, 'function');
    assert.equal(typeof shouldRetry, 'function');
    assert.equal(typeof validateAndNormalizeOptions, 'function');
    assert.equal(typeof ResilixError, 'function');
    assert.equal(typeof ResilixTimeoutError, 'function');
    assert.equal(typeof ResilixConfigError, 'function');
  });

  it('exports default object matching named exports in ESM', () => {
    assert.ok(resilixDefault);
    assert.equal(resilixDefault.retry, retry);
    assert.equal(resilixDefault.retrySync, retrySync);
    assert.equal(resilixDefault.withTimeout, withTimeout);
    assert.equal(resilixDefault.ResilixError, ResilixError);
  });

  it('executes retry and retrySync properly in ESM context', async () => {
    const asyncRes = await retry(async () => 'esm-async-ok', { delay: 1 });
    assert.equal(asyncRes, 'esm-async-ok');

    const syncRes = retrySync(() => 'esm-sync-ok', { delay: 0 });
    assert.equal(syncRes, 'esm-sync-ok');
  });
});
