const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withTimeout } = require('../src/timeout');
const { ResilixTimeoutError, ResilixConfigError } = require('../src/errors');

describe('Timeout Module', () => {
  it('resolves successfully when operation completes within timeout', async () => {
    const result = await withTimeout(async () => {
      return 'success';
    }, 500);

    assert.equal(result, 'success');
  });

  it('rejects with ResilixTimeoutError when operation exceeds timeout', async () => {
    await assert.rejects(
      async () => {
        await withTimeout(
          () => new Promise((resolve) => setTimeout(resolve, 300)),
          50,
          { operationName: 'slowOperation' }
        );
      },
      (err) => {
        assert.ok(err instanceof ResilixTimeoutError);
        assert.equal(err.timeoutMs, 50);
        assert.equal(err.operationName, 'slowOperation');
        assert.ok(err.message.includes('Operation "slowOperation" timed out after 50ms'));
        return true;
      }
    );
  });

  it('works with a Promise instance directly', async () => {
    const fastPromise = Promise.resolve('direct-promise');
    const result = await withTimeout(fastPromise, 200);
    assert.equal(result, 'direct-promise');
  });

  it('propagates underlying callback error if it rejects before timeout', async () => {
    await assert.rejects(
      async () => {
        await withTimeout(async () => {
          throw new Error('Immediate internal failure');
        }, 500);
      },
      {
        name: 'Error',
        message: 'Immediate internal failure',
      }
    );
  });

  it('passes AbortSignal to callback and triggers abort on timeout', async () => {
    let signalWasAborted = false;

    await assert.rejects(
      async () => {
        await withTimeout(async ({ signal }) => {
          signal.addEventListener('abort', () => {
            signalWasAborted = true;
          });
          await new Promise((resolve) => setTimeout(resolve, 300));
        }, 50);
      },
      ResilixTimeoutError
    );

    assert.equal(signalWasAborted, true);
  });

  it('rejects immediately if external AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted'));

    await assert.rejects(
      async () => {
        await withTimeout(async () => 'never', 500, { signal: controller.signal });
      },
      {
        message: 'Pre-aborted',
      }
    );
  });

  it('validates invalid callback argument', () => {
    assert.throws(() => withTimeout('not-a-function', 100), ResilixConfigError);
    assert.throws(() => withTimeout(null, 100), ResilixConfigError);
  });

  it('validates invalid timeout argument', () => {
    assert.throws(() => withTimeout(async () => {}, -10), ResilixConfigError);
    assert.throws(() => withTimeout(async () => {}, 0), ResilixConfigError);
    assert.throws(() => withTimeout(async () => {}, '100'), ResilixConfigError);
  });
});
