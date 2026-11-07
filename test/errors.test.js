const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ResilixError, ResilixTimeoutError, ResilixConfigError } = require('../src/errors');

describe('Errors Module', () => {
  describe('ResilixError', () => {
    it('creates an instance with default metadata', () => {
      const err = new ResilixError('Operation failed');
      assert.ok(err instanceof Error);
      assert.ok(err instanceof ResilixError);
      assert.equal(err.name, 'ResilixError');
      assert.equal(err.message, 'Operation failed');
      assert.equal(err.attempts, 1);
      assert.equal(err.retries, 0);
      assert.equal(err.totalDelay, 0);
      assert.equal(err.originalError, null);
      assert.deepEqual(err.errors, []);
    });

    it('retains originalError and links cause', () => {
      const original = new Error('Database connection refused');
      const err = new ResilixError('Retries exhausted', {
        originalError: original,
        attempts: 4,
        retries: 3,
        totalDelay: 7000,
        operationName: 'fetchUsers',
      });

      assert.equal(err.originalError, original);
      assert.equal(err.lastError, original);
      assert.equal(err.cause, original);
      assert.equal(err.attempts, 4);
      assert.equal(err.retries, 3);
      assert.equal(err.totalDelay, 7000);
      assert.equal(err.operationName, 'fetchUsers');
      assert.deepEqual(err.errors, [original]);
    });

    it('stores all accumulated errors across attempts', () => {
      const err1 = new Error('Err 1');
      const err2 = new Error('Err 2');
      const err = new ResilixError('Failed', {
        errors: [err1, err2],
        originalError: err2,
        attempts: 2,
        retries: 1,
      });

      assert.equal(err.errors.length, 2);
      assert.equal(err.errors[0], err1);
      assert.equal(err.errors[1], err2);
      assert.equal(err.lastError, err2);
    });
  });

  describe('ResilixTimeoutError', () => {
    it('creates an instance extending ResilixError', () => {
      const timeoutErr = new ResilixTimeoutError(5000, 'paymentService');
      assert.ok(timeoutErr instanceof Error);
      assert.ok(timeoutErr instanceof ResilixError);
      assert.ok(timeoutErr instanceof ResilixTimeoutError);
      assert.equal(timeoutErr.name, 'ResilixTimeoutError');
      assert.equal(timeoutErr.timeoutMs, 5000);
      assert.equal(timeoutErr.operationName, 'paymentService');
      assert.ok(timeoutErr.message.includes('Operation "paymentService" timed out after 5000ms'));
      assert.ok(timeoutErr.message.includes('AbortSignal'));
    });

    it('formats default message when operationName is omitted', () => {
      const timeoutErr = new ResilixTimeoutError(3000);
      assert.ok(timeoutErr.message.includes('Operation timed out after 3000ms'));
      assert.equal(timeoutErr.operationName, null);
    });
  });

  describe('ResilixConfigError', () => {
    it('creates an instance extending TypeError', () => {
      const configErr = new ResilixConfigError('Invalid maxRetries value');
      assert.ok(configErr instanceof Error);
      assert.ok(configErr instanceof TypeError);
      assert.ok(configErr instanceof ResilixConfigError);
      assert.equal(configErr.name, 'ResilixConfigError');
      assert.equal(configErr.message, 'Invalid maxRetries value');
    });
  });
});
