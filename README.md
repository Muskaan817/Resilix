# Resilix

> A lightweight, zero-dependency retry and resilience library for JavaScript and Node.js applications.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](https://github.com/resilix/resilix)

Resilix gives developers automatic, robust retry logic for transient operations such as network requests, microservice RPCs, and database connections. With support for exponential backoff, configurable jitter, per-attempt timeouts, custom retry conditions, lifecycle hooks, and synchronous/asynchronous execution, Resilix keeps your Node.js and browser applications resilient without bloated dependencies.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Understanding `maxRetries`](#understanding-maxretries)
  - [Exponential Backoff and Jitter](#exponential-backoff-and-jitter)
  - [Timeouts and Cancellation](#timeouts-and-cancellation)
- [API Reference](#api-reference)
  - [`retry(callback, options)`](#retrycallback-options)
  - [`retrySync(callback, options)`](#retrysynccallback-options)
  - [`withTimeout(callback, timeoutMs, options)`](#withtimeoutcallback-timeoutms-options)
  - [`exponentialBackoff(attempt, options)`](#exponentialbackoffattempt-options)
  - [`fixedDelay(attempt, options)`](#fixeddelayattempt-options)
  - [`shouldRetry(error, options)`](#shouldretryerror-options)
  - [Error Classes](#error-classes)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
  - [Asynchronous Operations](#asynchronous-operations)
  - [Synchronous Operations](#synchronous-operations)
  - [Selective Retry and Custom Conditions](#selective-retry-and-custom-conditions)
  - [Lifecycle Hooks & Metadata](#lifecycle-hooks--metadata)
  - [Per-Attempt Timeout](#per-attempt-timeout)
  - [Express.js Integration](#expressjs-integration)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Zero Dependencies**: Pure, modern JavaScript relying solely on native Promises and standard timers.
- **Async & Sync Support**: Retry async promises with `retry()` or synchronous operations with `retrySync()`.
- **Flexible Backoff Strategies**: Fixed delays, exponential backoff, custom backoff curves, and full/half jitter.
- **Per-Attempt Timeouts**: Enforce maximum execution duration per attempt with `withTimeout()`.
- **Intelligent Retry Conditions**: Filter transient failures (5xx, 429, ECONNRESET) from fatal errors (401, 404).
- **Rich Metadata & Lifecycle Hooks**: Inspect `attempt`, `retriesLeft`, `delay`, and `elapsedMs` via `onRetry`, `beforeRetry`, and `afterRetry`.
- **Strict Error Preservation**: Access the underlying error via `err.originalError` and standard ES2022 `err.cause`.
- **Dual CJS & ESM Support**: Ships with CommonJS entry point and comprehensive TypeScript type definitions (`index.d.ts`).

---

## Installation

Install via npm:

```bash
npm install resilix
```

Or using Yarn / pnpm:

```bash
yarn add resilix
# or
pnpm add resilix
```

---

## Quick Start

```javascript
const { retry } = require('resilix');

async function fetchUserData(userId) {
  return await retry(
    async ({ attempt }) => {
      console.log(`Fetching user ${userId} (Attempt #${attempt})...`);
      const response = await fetch(`https://api.example.com/users/${userId}`);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      return await response.json();
    },
    {
      maxRetries: 3,
      delay: 500,
      backoff: 'exponential',
      onRetry: (err, meta) => {
        console.warn(`Attempt failed: ${err.message}. Retrying in ${meta.delay}ms...`);
      },
    }
  );
}
```

---

## Core Concepts

### Understanding `maxRetries`

To avoid ambiguity, Resilix adopts one consistent definition across all APIs and documentation:

> **`maxRetries` denotes the maximum number of additional retry attempts permitted after the initial failure.**

- If `maxRetries: 3`, Resilix will make **1 initial attempt** and up to **3 retries**, allowing up to **4 total attempts**.
- If `maxRetries: 0`, Resilix will make **1 initial attempt** with **0 retries** (failing immediately on the first error).

| `maxRetries` | Initial Attempt | Max Retries Allowed | Max Total Invocations |
| :--- | :--- | :--- | :--- |
| `0` | 1 | 0 | 1 |
| `1` | 1 | 1 | 2 |
| `3` (default) | 1 | 3 | 4 |
| `5` | 1 | 5 | 6 |

---

### Exponential Backoff and Jitter

When a service is under heavy load, retrying at constant intervals can overwhelm the downstream service (the "thundering herd" problem). Exponential backoff increases delays geometrically between attempts:

$$\text{delay} = \min(\text{initialDelay} \times \text{factor}^{(\text{attempt} - 1)}, \text{maxDelay})$$

Adding **jitter** randomizes delays to distribute retry traffic across different moments in time:
- `jitter: true` or `'full'`: Multiplies the computed delay by a uniform random factor between $0.0$ and $1.0$.
- `jitter: 'half'`: Randomizes between $50\%$ and $100\%$ of the computed delay.

---

### Timeouts and Cancellation

JavaScript Promises are natively non-cancellable once in flight. Resilix provides the `withTimeout()` utility and the `timeout` option in `retry()`.

> **Important Note on Cooperative Cancellation:**
> When an operation times out, Resilix rejects immediately with a `ResilixTimeoutError`. However, standard asynchronous promises will continue running in the background unless they cooperatively listen for an `AbortSignal`. Resilix supplies an `AbortSignal` inside the context object passed to your callback:

```javascript
await retry(async ({ signal }) => {
  // Pass the signal to fetch or database drivers supporting AbortSignal
  return await fetch('https://api.example.com/data', { signal });
}, {
  timeout: 3000,
});
```

---

## API Reference

### `retry(callback, options)`

Executes an asynchronous operation and automatically retries it when it fails according to configuration.

- **Parameters:**
  - `callback(context)`: `Function` (must return a Promise or be async). Receives `{ attempt, retryCount, retriesLeft, signal }`.
  - `options`: `object` (optional). See [Configuration Options](#configuration-options).
- **Returns:** `Promise<T>` resolving with the callback's return value.
- **Throws:** `ResilixError` if retries are exhausted, or the original error if non-retryable.

---

### `retrySync(callback, options)`

Retries a synchronous operation that throws an exception.

- **Parameters:**
  - `callback(context)`: `Function` (synchronous). Receives `{ attempt, retryCount, retriesLeft }`.
  - `options`: `object` (optional).
- **Returns:** The synchronous return value of the callback.
- **Throws:** `ResilixError` if retries are exhausted, or the original error if non-retryable.

---

### `withTimeout(callback, timeoutMs, options)`

Wraps a promise or async callback in a timeout boundary.

- **Parameters:**
  - `callback`: `Function` or `Promise`. If a function, receives `{ signal }`.
  - `timeoutMs`: `number` (positive integer in milliseconds).
  - `options`: `object` (optional). `{ operationName?: string, signal?: AbortSignal }`.
- **Returns:** `Promise<T>`.
- **Throws:** `ResilixTimeoutError` if the timeout fires before resolution.

---

### `exponentialBackoff(attempt, options)`

Pure utility calculating the backoff delay for a specific retry attempt number.

- **Parameters:**
  - `attempt`: `number` (1-indexed retry number: `1` for the first retry).
  - `options`: `object` (`{ initialDelay = 1000, factor = 2, maxDelay = 30000, jitter = false }`).
- **Returns:** `number` (delay in milliseconds).

---

### `fixedDelay(attempt, options)`

Returns a fixed delay clamped to `maxDelay`.

- **Parameters:**
  - `attempt`: `number` (1-indexed retry number).
  - `options`: `object` (`{ delay = 1000, maxDelay = Infinity, jitter = false }`).
- **Returns:** `number` (delay in milliseconds).

---

### `shouldRetry(error, options)`

Evaluates whether an error is transient and eligible for retry.

- **Parameters:**
  - `error`: `Error | unknown`.
  - `options`: `object | Function`. Can be a predicate function or `{ retryableErrors?: [], nonRetryableErrors?: [] }`.
- **Returns:** `boolean`.

---

### Error Classes

#### `ResilixError`
Thrown when all retry attempts have been exhausted.

- `err.originalError`: The error thrown on the final attempt.
- `err.lastError`: Alias for `originalError`.
- `err.cause`: Standard link to `originalError`.
- `err.errors`: Array of all errors caught across all attempts.
- `err.attempts`: Total attempts performed (e.g., `4`).
- `err.retries`: Number of retries performed (e.g., `3`).
- `err.totalDelay`: Cumulative milliseconds spent sleeping between retries.
- `err.operationName`: The name passed in `options.name`.

#### `ResilixTimeoutError`
Subclass of `ResilixError` thrown when an operation exceeds its time limit.

- `err.timeoutMs`: Configured timeout duration in milliseconds.

#### `ResilixConfigError`
Subclass of `TypeError` thrown immediately when invalid parameters or options are passed.

---

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxRetries` | `number` | `3` | Maximum retry attempts after the first failure. |
| `delay` / `initialDelay` | `number` | `1000` | Base delay between attempts in milliseconds. |
| `backoff` | `string \| Function` | `'fixed'` | `'fixed'`, `'exponential'`, or custom `(attempt, options) => number`. |
| `factor` / `multiplier` | `number` | `2` | Multiplier for exponential backoff (must be $\ge 1$). |
| `maxDelay` | `number` | `30000` | Maximum ceiling for backoff delay in milliseconds. |
| `jitter` | `boolean \| string` | `false` | `true` or `'full'` for uniform random jitter; `'half'` for 50-100% jitter. |
| `timeout` | `number` | `undefined` | Per-attempt timeout limit in milliseconds. |
| `shouldRetry` | `Function \| object` | `undefined` | Predicate `(err, meta) => boolean` or options object. |
| `onRetry` | `Function` | `undefined` | Callback invoked when a retry is scheduled: `(err, metadata) => void`. |
| `beforeRetry` | `Function` | `undefined` | Callback invoked before sleeping: `(metadata) => void`. |
| `afterRetry` | `Function` | `undefined` | Callback invoked after sleeping, before next attempt: `(metadata) => void`. |
| `signal` | `AbortSignal` | `undefined` | External AbortSignal to cancel retry sequence. |
| `name` | `string` | `undefined` | Operation name included in error messages and logs. |

---

## Usage Examples

### Asynchronous Operations

```javascript
const { retry } = require('resilix');

const data = await retry(
  async ({ attempt }) => {
    return await queryRemoteDatabase(attempt);
  },
  {
    maxRetries: 4,
    delay: 500,
    backoff: 'exponential',
    factor: 2,
    maxDelay: 5000,
  }
);
```

### Synchronous Operations

```javascript
const { retrySync } = require('resilix');

const result = retrySync(
  () => {
    return parseConfigFile('/etc/app/config.json');
  },
  {
    maxRetries: 2,
    delay: 100,
  }
);
```

### Selective Retry and Custom Conditions

```javascript
const { retry } = require('resilix');

await retry(
  async () => {
    return await externalPaymentGateway();
  },
  {
    maxRetries: 3,
    delay: 1000,
    shouldRetry: (error, metadata) => {
      // Do not retry 4xx Client Errors except 429 Too Many Requests
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        return false;
      }
      return true;
    },
  }
);
```

### Lifecycle Hooks & Metadata

```javascript
const { retry } = require('resilix');

await retry(callService, {
  maxRetries: 3,
  delay: 1000,
  backoff: 'exponential',
  onRetry: (err, meta) => {
    console.log(`[onRetry] ${err.message}. Retries remaining: ${meta.retriesLeft}`);
  },
  beforeRetry: (meta) => {
    console.log(`[beforeRetry] Sleeping for ${meta.delay}ms. Total elapsed: ${meta.elapsedMs}ms`);
  },
  afterRetry: (meta) => {
    console.log(`[afterRetry] Starting attempt ${meta.attempt}...`);
  },
});
```

### Per-Attempt Timeout

```javascript
const { retry, ResilixTimeoutError } = require('resilix');

const response = await retry(
  async ({ signal }) => {
    return await fetch('https://unreliable-api.internal/stats', { signal });
  },
  {
    maxRetries: 2,
    timeout: 2000, // 2-second timeout per attempt
    delay: 500,
  }
);
```

### Express.js Integration

```javascript
const express = require('express');
const { retry, ResilixError } = require('resilix');

const app = express();

app.get('/api/orders/:id', async (req, res, next) => {
  try {
    const order = await retry(
      async () => {
        return await fetchFromOrderService(req.params.id);
      },
      {
        maxRetries: 3,
        delay: 200,
        backoff: 'exponential',
        name: 'fetchOrder',
      }
    );

    res.json({ success: true, order });
  } catch (err) {
    if (err instanceof ResilixError) {
      return res.status(503).json({
        error: 'Order Service Unavailable',
        attemptsMade: err.attempts,
        originalError: err.originalError?.message,
      });
    }
    next(err);
  }
});
```

---

## Error Handling

When all retries are exhausted, `ResilixError` is thrown with complete diagnostics:

```javascript
const { retry, ResilixError } = require('resilix');

try {
  await retry(unstableTask, { maxRetries: 3 });
} catch (error) {
  if (error instanceof ResilixError) {
    console.error('All retries exhausted!');
    console.error(`Total attempts: ${error.attempts}`);
    console.error(`Total retries: ${error.retries}`);
    console.error(`Time spent in backoff: ${error.totalDelay}ms`);
    console.error(`Root cause message: ${error.originalError.message}`);
    console.error(`All errors encountered:`, error.errors.map(e => e.message));
  } else {
    console.error('Non-retryable or unexpected error:', error);
  }
}
```

---

## Testing

Resilix uses Node.js's native test runner (`node:test`) and strict assertions:

```bash
# Run the complete test suite
npm test

# Run tests in watch mode
npm run test:watch
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Ensure all tests pass (`npm test`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## License

This project is licensed under the [MIT License](LICENSE).
