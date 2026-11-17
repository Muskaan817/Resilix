const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { retry, retrySync, shouldRetry } = require('../src/retry');
const { ResilixError, ResilixConfigError, ResilixTimeoutError } = require('../src/errors');

describe('Retry Module', () => {
  describe('retry() - Asynchronous Operations', () => {
    it('executes successfully on the first attempt without retrying', async () => {
      let callCount = 0;
      const result = await retry(async () => {
        callCount++;
        return 'success';
      }, { delay: 1 });

      assert.equal(result, 'success');
      assert.equal(callCount, 1);
    });

    it('recovers on second attempt after first attempt fails', async () => {
      let callCount = 0;
      const result = await retry(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary glitch');
        }
        return 'recovered';
      }, { maxRetries: 2, delay: 1 });

      assert.equal(result, 'recovered');
      assert.equal(callCount, 2);
    });

    it('handles multiple retry attempts before succeeding', async () => {
      let callCount = 0;
      const result = await retry(async () => {
        callCount++;
        if (callCount < 4) {
          throw new Error(`Glitch attempt ${callCount}`);
        }
        return 'finally succeeded';
      }, { maxRetries: 4, delay: 1 });

      assert.equal(result, 'finally succeeded');
      assert.equal(callCount, 4);
    });

    it('throws ResilixError when maximum retries are exhausted', async () => {
      let callCount = 0;
      const rootError = new Error('Persistent database failure');

      await assert.rejects(
        async () => {
          await retry(async () => {
            callCount++;
            throw rootError;
          }, {
            maxRetries: 3,
            delay: 1,
            name: 'dbQuery',
          });
        },
        (err) => {
          assert.ok(err instanceof ResilixError);
          assert.equal(err.name, 'ResilixError');
          assert.equal(err.attempts, 4); // 1 initial + 3 retries
          assert.equal(err.retries, 3);
          assert.equal(err.originalError, rootError);
          assert.equal(err.lastError, rootError);
          assert.equal(err.cause, rootError);
          assert.equal(err.operationName, 'dbQuery');
          assert.equal(err.errors.length, 4);
          assert.ok(err.message.includes('Operation "dbQuery" failed after 4 attempts (3 retries exhausted)'));
          return true;
        }
      );

      assert.equal(callCount, 4);
    });

    it('handles zero retries (maxRetries: 0) by failing immediately after 1 attempt', async () => {
      let callCount = 0;
      await assert.rejects(
        async () => {
          await retry(async () => {
            callCount++;
            throw new Error('Single try fail');
          }, { maxRetries: 0, delay: 1 });
        },
        (err) => {
          assert.ok(err instanceof ResilixError);
          assert.equal(err.attempts, 1);
          assert.equal(err.retries, 0);
          return true;
        }
      );
      assert.equal(callCount, 1);
    });

    it('uses default options when options is omitted or empty', async () => {
      let callCount = 0;
      const result = await retry(async () => {
        callCount++;
        return 'default-opts';
      });
      assert.equal(result, 'default-opts');
      assert.equal(callCount, 1);
    });

    it('rejects with ResilixConfigError on invalid callback', async () => {
      await assert.rejects(() => retry('not-a-func'), ResilixConfigError);
      await assert.rejects(() => retry(null), ResilixConfigError);
    });

    it('rejects with ResilixConfigError on invalid options', async () => {
      await assert.rejects(() => retry(async () => {}, { maxRetries: -1 }), ResilixConfigError);
      await assert.rejects(() => retry(async () => {}, { maxRetries: 1.5 }), ResilixConfigError);
      await assert.rejects(() => retry(async () => {}, { delay: -50 }), ResilixConfigError);
      await assert.rejects(() => retry(async () => {}, { backoff: 'unsupported' }), ResilixConfigError);
      await assert.rejects(() => retry(async () => {}, { factor: 0.5 }), ResilixConfigError);
      await assert.rejects(() => retry(async () => {}, { maxDelay: -1 }), ResilixConfigError);
      await assert.rejects(() => retry(async () => {}, { timeout: -100 }), ResilixConfigError);
    });

    it('executes exponential backoff when configured', async () => {
      const delaysObserved = [];
      let callCount = 0;

      await assert.rejects(
        async () => {
          await retry(async () => {
            callCount++;
            throw new Error('Fail');
          }, {
            maxRetries: 3,
            delay: 10,
            backoff: 'exponential',
            factor: 2,
            onRetry: (err, meta) => {
              delaysObserved.push(meta.delay);
            },
          });
        },
        ResilixError
      );

      // attempt 1: retry 1 -> delay 10 * 2^0 = 10
      // attempt 2: retry 2 -> delay 10 * 2^1 = 20
      // attempt 3: retry 3 -> delay 10 * 2^2 = 40
      assert.deepEqual(delaysObserved, [10, 20, 40]);
    });

    it('supports strategy option name as alias for backoff', async () => {
      let callCount = 0;
      const result = await retry(async () => {
        callCount++;
        if (callCount === 1) throw new Error('First try drop');
        return 'strategy-ok';
      }, {
        maxRetries: 2,
        strategy: 'fixed',
        delay: 5,
      });

      assert.equal(result, 'strategy-ok');
      assert.equal(callCount, 2);
    });

    it('supports initialDelay option name as alias for delay', async () => {
      let callCount = 0;
      const result = await retry(async () => {
        callCount++;
        if (callCount === 1) throw new Error('First try drop');
        return 'initialDelay-ok';
      }, {
        maxRetries: 2,
        initialDelay: 5,
      });

      assert.equal(result, 'initialDelay-ok');
      assert.equal(callCount, 2);
    });

    it('supports custom backoff delay function', async () => {
      const delaysObserved = [];
      await assert.rejects(
        async () => {
          await retry(async () => {
            throw new Error('Custom backoff fail');
          }, {
            maxRetries: 2,
            backoff: (attempt) => attempt * 5,
            onRetry: (err, meta) => {
              delaysObserved.push(meta.delay);
            },
          });
        },
        ResilixError
      );

      assert.deepEqual(delaysObserved, [5, 10]);
    });

    it('respects maxDelay limit during exponential backoff', async () => {
      const delaysObserved = [];
      await assert.rejects(
        async () => {
          await retry(async () => {
            throw new Error('Clamped fail');
          }, {
            maxRetries: 3,
            delay: 100,
            factor: 3,
            maxDelay: 250,
            backoff: 'exponential',
            onRetry: (err, meta) => {
              delaysObserved.push(meta.delay);
            },
          });
        },
        ResilixError
      );

      assert.deepEqual(delaysObserved, [100, 250, 250]);
    });

    it('stops retrying immediately on non-retryable error via custom shouldRetry function', async () => {
      class FatalAuthError extends Error {}
      let callCount = 0;

      await assert.rejects(
        async () => {
          await retry(async () => {
            callCount++;
            throw new FatalAuthError('Invalid credentials');
          }, {
            maxRetries: 3,
            delay: 1,
            shouldRetry: (err) => !(err instanceof FatalAuthError),
          });
        },
        FatalAuthError
      );

      assert.equal(callCount, 1);
    });

    it('calls beforeRetry, afterRetry, and onRetry hooks with correct metadata', async () => {
      const events = [];
      let callCount = 0;

      const result = await retry(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Attempt 1 failed');
        return 'success on 2';
      }, {
        maxRetries: 2,
        delay: 5,
        onRetry: (err, meta) => {
          events.push({ hook: 'onRetry', attempt: meta.attempt, retryCount: meta.retryCount, retriesLeft: meta.retriesLeft });
        },
        beforeRetry: (meta) => {
          events.push({ hook: 'beforeRetry', attempt: meta.attempt, delay: meta.delay });
        },
        afterRetry: (meta) => {
          events.push({ hook: 'afterRetry', attempt: meta.attempt });
        },
      });

      assert.equal(result, 'success on 2');
      assert.equal(events.length, 3);
      assert.equal(events[0].hook, 'onRetry');
      assert.equal(events[0].attempt, 2);
      assert.equal(events[0].retryCount, 1);
      assert.equal(events[0].retriesLeft, 1);
      assert.equal(events[1].hook, 'beforeRetry');
      assert.equal(events[2].hook, 'afterRetry');
    });

    it('executes onSuccess hook upon successful completion', async () => {
      let successData = null;
      let successMeta = null;

      const result = await retry(async () => {
        return 'payload-123';
      }, {
        delay: 1,
        onSuccess: (res, meta) => {
          successData = res;
          successMeta = meta;
        },
      });

      assert.equal(result, 'payload-123');
      assert.equal(successData, 'payload-123');
      assert.equal(successMeta.attempts, 1);
      assert.equal(successMeta.retries, 0);
      assert.ok(typeof successMeta.elapsedMs === 'number');
    });

    it('executes onFailure hook upon exhaustion with ResilixError and metadata', async () => {
      let failureError = null;
      let failureMeta = null;

      await assert.rejects(
        async () => {
          await retry(async () => {
            throw new Error('Fatal network partition');
          }, {
            maxRetries: 2,
            delay: 1,
            onFailure: (err, meta) => {
              failureError = err;
              failureMeta = meta;
            },
          });
        },
        ResilixError
      );

      assert.ok(failureError instanceof ResilixError);
      assert.equal(failureMeta.attempts, 3);
      assert.equal(failureMeta.retries, 2);
      assert.equal(failureMeta.errors.length, 3);
    });

    it('executes onFailure hook on non-retryable error', async () => {
      let failureError = null;

      await assert.rejects(
        async () => {
          await retry(async () => {
            const err = new Error('Client 400 Bad Request');
            err.status = 400;
            throw err;
          }, {
            maxRetries: 3,
            delay: 1,
            onFailure: (err) => {
              failureError = err;
            },
          });
        },
        (err) => err.status === 400
      );

      assert.equal(failureError.status, 400);
    });

    it('ensures hooks throwing errors do not break retry execution', async () => {
      let callCount = 0;
      const result = await retry(async () => {
        callCount++;
        if (callCount === 1) throw new Error('First try glitch');
        return 'resilient';
      }, {
        maxRetries: 2,
        delay: 1,
        onRetry: () => {
          throw new Error('Buggy hook inside onRetry');
        },
        beforeRetry: () => {
          throw new Error('Buggy hook inside beforeRetry');
        },
        afterRetry: () => {
          throw new Error('Buggy hook inside afterRetry');
        },
        onSuccess: () => {
          throw new Error('Buggy hook inside onSuccess');
        },
      });

      assert.equal(result, 'resilient');
      assert.equal(callCount, 2);
    });

    it('enforces per-attempt timeout and retries when timeout is exceeded', async () => {
      let callCount = 0;

      const result = await retry(async () => {
        callCount++;
        if (callCount === 1) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return 'too-late';
        }
        return 'fast-success';
      }, {
        maxRetries: 2,
        delay: 1,
        timeout: 30,
      });

      assert.equal(result, 'fast-success');
      assert.equal(callCount, 2);
    });

    it('cancels retry sequence when external AbortSignal is triggered', async () => {
      const controller = new AbortController();
      let callCount = 0;

      const promise = retry(async () => {
        callCount++;
        throw new Error('Network offline');
      }, {
        maxRetries: 5,
        delay: 50,
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(new Error('User cancelled')), 15);

      await assert.rejects(
        promise,
        {
          message: 'User cancelled',
        }
      );

      assert.ok(callCount >= 1 && callCount < 4);
    });
  });

  describe('shouldRetry() Condition Utility', () => {
    it('returns true for general errors by default', () => {
      assert.equal(shouldRetry(new Error('Generic failure')), true);
    });

    it('returns false for null or undefined errors', () => {
      assert.equal(shouldRetry(null), false);
      assert.equal(shouldRetry(undefined), false);
    });

    it('checks custom predicate function', () => {
      const isNetwork = (err) => err.code === 'ECONNRESET';
      assert.equal(shouldRetry({ code: 'ECONNRESET' }, isNetwork), true);
      assert.equal(shouldRetry({ code: 'EINVAL' }, isNetwork), false);
    });

    it('respects nonRetryableErrors blacklist', () => {
      class ValidationError extends Error {}
      const opts = { nonRetryableErrors: [ValidationError, 'UNAUTHORIZED'] };

      assert.equal(shouldRetry(new ValidationError('Bad input'), opts), false);
      assert.equal(shouldRetry({ code: 'UNAUTHORIZED' }, opts), false);
      assert.equal(shouldRetry(new Error('Network drop'), opts), true);
    });

    it('considers standard 4xx HTTP client errors non-retryable except 408 and 429', () => {
      assert.equal(shouldRetry({ status: 400 }), false);
      assert.equal(shouldRetry({ status: 401 }), false);
      assert.equal(shouldRetry({ status: 404 }), false);
      assert.equal(shouldRetry({ statusCode: 403 }), false);

      // 408 (Request Timeout) and 429 (Too Many Requests) should be retryable
      assert.equal(shouldRetry({ status: 408 }), true);
      assert.equal(shouldRetry({ status: 429 }), true);

      // 5xx server errors should be retryable
      assert.equal(shouldRetry({ status: 500 }), true);
      assert.equal(shouldRetry({ status: 503 }), true);
    });

    it('respects retryableErrors whitelist', () => {
      const opts = { retryableErrors: ['ETIMEDOUT', 'ECONNRESET'] };
      assert.equal(shouldRetry({ code: 'ETIMEDOUT' }, opts), true);
      assert.equal(shouldRetry({ code: 'ECONNRESET' }, opts), true);
      assert.equal(shouldRetry({ code: 'ENOTFOUND' }, opts), false);
    });
  });
});
