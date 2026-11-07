const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { exponentialBackoff, fixedDelay } = require('../src/backoff');
const { ResilixConfigError } = require('../src/errors');

describe('Backoff Module', () => {
  describe('exponentialBackoff()', () => {
    it('calculates default exponential delays for attempt 1, 2, 3', () => {
      // Default: initialDelay: 1000, factor: 2
      // attempt 1: 1000 * 2^0 = 1000
      // attempt 2: 1000 * 2^1 = 2000
      // attempt 3: 1000 * 2^2 = 4000
      assert.equal(exponentialBackoff(1), 1000);
      assert.equal(exponentialBackoff(2), 2000);
      assert.equal(exponentialBackoff(3), 4000);
      assert.equal(exponentialBackoff(4), 8000);
    });

    it('supports custom initialDelay and factor', () => {
      const opts = { initialDelay: 500, factor: 3 };
      // attempt 1: 500 * 3^0 = 500
      // attempt 2: 500 * 3^1 = 1500
      // attempt 3: 500 * 3^2 = 4500
      assert.equal(exponentialBackoff(1, opts), 500);
      assert.equal(exponentialBackoff(2, opts), 1500);
      assert.equal(exponentialBackoff(3, opts), 4500);
    });

    it('respects delay alias for initialDelay', () => {
      assert.equal(exponentialBackoff(1, { delay: 250, factor: 2 }), 250);
      assert.equal(exponentialBackoff(2, { delay: 250, factor: 2 }), 500);
    });

    it('respects multiplier alias for factor', () => {
      assert.equal(exponentialBackoff(2, { initialDelay: 100, multiplier: 4 }), 400);
    });

    it('enforces maximum delay limits (maxDelay)', () => {
      const opts = { initialDelay: 1000, factor: 2, maxDelay: 3500 };
      // attempt 1: 1000
      // attempt 2: 2000
      // attempt 3: 4000 -> capped at 3500
      // attempt 4: 8000 -> capped at 3500
      assert.equal(exponentialBackoff(1, opts), 1000);
      assert.equal(exponentialBackoff(2, opts), 2000);
      assert.equal(exponentialBackoff(3, opts), 3500);
      assert.equal(exponentialBackoff(4, opts), 3500);
    });

    it('applies full jitter within [0, calculatedDelay]', () => {
      const opts = { initialDelay: 1000, factor: 2, jitter: true };
      for (let i = 0; i < 20; i++) {
        const delay = exponentialBackoff(2, opts);
        assert.ok(delay >= 0 && delay <= 2000, `Delay ${delay} should be between 0 and 2000`);
      }
    });

    it('applies half jitter within [clampedDelay/2, clampedDelay]', () => {
      const opts = { initialDelay: 1000, factor: 2, jitter: 'half' };
      for (let i = 0; i < 20; i++) {
        const delay = exponentialBackoff(2, opts);
        // expected between 1000 and 2000
        assert.ok(delay >= 1000 && delay <= 2000, `Delay ${delay} should be between 1000 and 2000`);
      }
    });

    it('validates invalid attempts', () => {
      assert.throws(() => exponentialBackoff(0), ResilixConfigError);
      assert.throws(() => exponentialBackoff(-1), ResilixConfigError);
      assert.throws(() => exponentialBackoff('one'), ResilixConfigError);
      assert.throws(() => exponentialBackoff(NaN), ResilixConfigError);
    });

    it('validates invalid configuration options', () => {
      assert.throws(() => exponentialBackoff(1, { initialDelay: -50 }), ResilixConfigError);
      assert.throws(() => exponentialBackoff(1, { factor: 0.5 }), ResilixConfigError);
      assert.throws(() => exponentialBackoff(1, { maxDelay: -100 }), ResilixConfigError);
    });
  });

  describe('fixedDelay()', () => {
    it('returns fixed delay for any attempt number', () => {
      assert.equal(fixedDelay(1, { delay: 500 }), 500);
      assert.equal(fixedDelay(2, { delay: 500 }), 500);
      assert.equal(fixedDelay(5, { delay: 500 }), 500);
    });

    it('uses default delay when omitted', () => {
      assert.equal(fixedDelay(1), 1000);
    });

    it('clamps fixed delay to maxDelay', () => {
      assert.equal(fixedDelay(1, { delay: 5000, maxDelay: 2000 }), 2000);
    });

    it('applies jitter to fixed delay', () => {
      const opts = { delay: 1000, jitter: true };
      for (let i = 0; i < 20; i++) {
        const delay = fixedDelay(1, opts);
        assert.ok(delay >= 0 && delay <= 1000);
      }
    });

    it('validates invalid arguments', () => {
      assert.throws(() => fixedDelay(0), ResilixConfigError);
      assert.throws(() => fixedDelay(1, { delay: -10 }), ResilixConfigError);
      assert.throws(() => fixedDelay(1, { maxDelay: -5 }), ResilixConfigError);
    });
  });
});
