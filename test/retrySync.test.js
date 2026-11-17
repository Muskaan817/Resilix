const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { retrySync } = require('../src/retrySync');
const { ResilixError, ResilixConfigError } = require('../src/errors');

describe('retrySync Module', () => {
  it('executes successfully on the first attempt synchronously', () => {
    let callCount = 0;
    const result = retrySync(() => {
      callCount++;
      return 42;
    });

    assert.equal(result, 42);
    assert.equal(callCount, 1);
  });

  it('retries on synchronous exceptions and recovers', () => {
    let callCount = 0;
    const result = retrySync(() => {
      callCount++;
      if (callCount < 3) {
        throw new Error(`Sync fail ${callCount}`);
      }
      return 'sync-success';
    }, { maxRetries: 3, delay: 0 });

    assert.equal(result, 'sync-success');
    assert.equal(callCount, 3);
  });

  it('throws ResilixError when synchronous retries are exhausted', () => {
    let callCount = 0;
    const original = new Error('Sync permanent failure');

    assert.throws(
      () => {
        retrySync(() => {
          callCount++;
          throw original;
        }, { maxRetries: 2, delay: 0, name: 'syncTask' });
      },
      (err) => {
        assert.ok(err instanceof ResilixError);
        assert.equal(err.attempts, 3);
        assert.equal(err.retries, 2);
        assert.equal(err.originalError, original);
        assert.equal(err.operationName, 'syncTask');
        assert.equal(err.errors.length, 3);
        return true;
      }
    );

    assert.equal(callCount, 3);
  });

  it('throws immediately on non-retryable error in retrySync', () => {
    let callCount = 0;
    class NonRetryableSyncError extends Error {}

    assert.throws(
      () => {
        retrySync(() => {
          callCount++;
          throw new NonRetryableSyncError('Fatal sync error');
        }, {
          maxRetries: 3,
          delay: 0,
          shouldRetry: (err) => !(err instanceof NonRetryableSyncError),
        });
      },
      NonRetryableSyncError
    );

    assert.equal(callCount, 1);
  });

  it('invokes synchronous hooks safely (onRetry, beforeRetry, afterRetry)', () => {
    const hooksCalled = [];
    let callCount = 0;

    const result = retrySync(() => {
      callCount++;
      if (callCount === 1) throw new Error('Attempt 1 error');
      return 'done';
    }, {
      maxRetries: 1,
      delay: 0,
      onRetry: () => hooksCalled.push('onRetry'),
      beforeRetry: () => hooksCalled.push('beforeRetry'),
      afterRetry: () => hooksCalled.push('afterRetry'),
    });

    assert.equal(result, 'done');
    assert.deepEqual(hooksCalled, ['onRetry', 'beforeRetry', 'afterRetry']);
  });

  it('invokes onSuccess hook with result and metadata on success', () => {
    let successMeta = null;
    let successResult = null;

    const result = retrySync(() => {
      return { status: 'OK' };
    }, {
      onSuccess: (res, meta) => {
        successResult = res;
        successMeta = meta;
      },
    });

    assert.deepEqual(result, { status: 'OK' });
    assert.deepEqual(successResult, { status: 'OK' });
    assert.equal(successMeta.attempt, 1);
    assert.equal(successMeta.retries, 0);
  });

  it('invokes onFailure hook with error and metadata on exhaustion', () => {
    let failureMeta = null;
    let failureError = null;

    assert.throws(() => {
      retrySync(() => {
        throw new Error('Fatal exhaustion');
      }, {
        maxRetries: 1,
        delay: 0,
        onFailure: (err, meta) => {
          failureError = err;
          failureMeta = meta;
        },
      });
    }, ResilixError);

    assert.ok(failureError instanceof ResilixError);
    assert.equal(failureMeta.attempts, 2);
    assert.equal(failureMeta.retries, 1);
  });

  it('supports strategy alias for backoff', () => {
    let callCount = 0;
    const result = retrySync(() => {
      callCount++;
      if (callCount === 1) throw new Error('Glitch');
      return 'strategy-ok';
    }, {
      maxRetries: 1,
      delay: 0,
      strategy: 'fixed',
    });

    assert.equal(result, 'strategy-ok');
    assert.equal(callCount, 2);
  });

  it('validates invalid callback argument in retrySync', () => {
    assert.throws(() => retrySync(null), ResilixConfigError);
    assert.throws(() => retrySync('not-a-func'), ResilixConfigError);
  });
});
