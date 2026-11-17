# Resilix

> A lightweight, zero-dependency retry and resilience library for JavaScript, TypeScript, and Node.js applications.

[![npm version](https://img.shields.io/npm/v/resilix.svg)](https://www.npmjs.com/package/resilix)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/Muskaan817/Resilix/actions/workflows/ci.yml/badge.svg)](https://github.com/Muskaan817/Resilix/actions)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](https://github.com/Muskaan817/Resilix)

Resilix gives developers automatic, robust retry logic for transient operations such as network requests, microservice RPCs, distributed database queries, and third-party API integrations. With support for exponential backoff, fixed delays, full/half jitter, per-attempt timeouts, custom retry conditions, lifecycle hooks (`onRetry`, `onSuccess`, `onFailure`), and synchronous/asynchronous execution, Resilix protects your application without bloated dependencies or complex boilerplate.

---

## Table of Contents

- [Why Resilix?](#why-resilix)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Module Formats & Imports](#module-formats--imports)
  - [CommonJS (CJS)](#commonjs-cjs)
  - [ECMAScript Modules (ESM)](#ecmascript-modules-esm)
  - [TypeScript (TS)](#typescript-ts)
- [Core Concepts](#core-concepts)
  - [Understanding `maxRetries`](#understanding-maxretries)
  - [Exponential Backoff](#exponential-backoff)
  - [Fixed Delay](#fixed-delay)
  - [Jitter Strategies](#jitter-strategies)
  - [Timeouts and Cooperative Cancellation](#timeouts-and-cooperative-cancellation)
- [API Reference](#api-reference)
  - [`retry(callback, options)`](#retrycallback-options)
  - [`retrySync(callback, options)`](#retrysynccallback-options)
  - [`withTimeout(callback, timeoutMs, options)`](#withtimeoutcallback-timeoutms-options)
  - [`exponentialBackoff(attempt, options)`](#exponentialbackoffattempt-options)
  - [`fixedDelay(attempt, options)`](#fixeddelayattempt-options)
  - [`shouldRetry(error, options)`](#shouldretryerror-options)
  - [Error Hierarchy](#error-hierarchy)
- [Configuration Options](#configuration-options)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Usage Examples](#usage-examples)
  - [1. Asynchronous Retry with Exponential Backoff](#1-asynchronous-retry-with-exponential-backoff)
  - [2. Synchronous Retry for Lock Acquisition](#2-synchronous-retry-for-lock-acquisition)
  - [3. Fixed Delay with Jitter](#3-fixed-delay-with-jitter)
  - [4. Selective Retry and Custom Error Filtering](#4-selective-retry-and-custom-error-filtering)
  - [5. Per-Attempt Timeout with AbortSignal](#5-per-attempt-timeout-with-abortsignal)
  - [6. Express.js Middleware & Endpoint Integration](#6-expressjs-middleware--endpoint-integration)
  - [7. Full TypeScript Implementation](#7-full-typescript-implementation)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## Why Resilix?

Many retry utilities in the JavaScript ecosystem are either bloated with transitive dependencies, lack synchronous support, neglect TypeScript generics, or provide incomplete error propagation.

Resilix was built from the ground up to solve these pain points:
- **Zero runtime dependencies**: Pure native JavaScript utilizing standard `Promise`, `setTimeout`, and `Atomics.wait`.
- **Dual module support**: True CommonJS (`index.js`) and native ECMAScript Modules (`index.mjs`) alongside comprehensive `.d.ts` declaration files.
- **Root-cause error preservation**: Preserves full error histories across all attempts and standard ES2022 `Error.cause` linkage.
- **Cooperative cancellation**: Provides `AbortSignal` to prevent orphan background promises on timeout.

---

## Features

- **Zero Dependencies**: 0 runtime dependencies, keeping your `node_modules` minimal and auditable.
- **Dual Async & Sync Engines**: Retry Promises with `retry()` or synchronous blocking tasks with `retrySync()`.
- **Configurable Backoff Curves**: Exponential progression, constant fixed delay, custom mathematical functions, and full/half jitter.
- **Per-Attempt Timeouts**: Enforce maximum execution durations per attempt via `withTimeout()`.
- **Intelligent Error Conditions**: Distinguish transient glitches (5xx, 429, ECONNRESET) from permanent failures (400, 401, 404).
- **Rich Lifecycle Hooks**: Observability into execution with `onRetry`, `onSuccess`, `onFailure`, `beforeRetry`, and `afterRetry`.
- **First-Class TypeScript Support**: Strongly typed configuration objects, metadata interfaces, and generic return types (`retry<T>()`).
- **Comprehensive Test Coverage**: Tested across Node.js 18.x, 20.x, and 22.x with 65+ unit tests using `node:test`.

---

## Requirements

- **Node.js**: `>= 18.0.0`
- Suitable for both Node.js server environments and modern bundler-based frontend stacks.

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

async function fetchUser(userId) {
  return await retry(
    async ({ attempt }) => {
      const response = await fetch(`https://api.example.com/users/${userId}`);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    },
    {
      maxRetries: 3,
      initialDelay: 500,
      strategy: 'exponential',
      onRetry: (err, meta) => {
        console.warn(`Attempt ${meta.attempt} failed (${err.message}). Retrying in ${meta.delay}ms...`);
      },
    }
  );
}
```

---

## Module Formats & Imports

### CommonJS (CJS)
```javascript
const { retry, retrySync, withTimeout, ResilixError } = require('resilix');
```

### ECMAScript Modules (ESM)
```javascript
import { retry, retrySync, withTimeout, ResilixError } from 'resilix';
// Or default import:
import resilix from 'resilix';
```

### TypeScript (TS)
```typescript
import {
  retry,
  retrySync,
  ResilixError,
  RetryOptions,
  RetryContext,
  RetryMetadata,
  SuccessMetadata,
} from 'resilix';
```

---

## Core Concepts

### Understanding `maxRetries`

To eliminate ambiguity across resilience libraries, Resilix uses one strict definition:

> **`maxRetries` represents the maximum number of additional retry attempts allowed after the initial failure.**

- `maxRetries: 3`: **1 initial attempt** + up to **3 retries** = up to **4 total attempts**.
- `maxRetries: 0`: **1 initial attempt** with **0 retries** (fails fast on the first error).

| `maxRetries` | Initial Try | Max Retries Allowed | Max Total Invocations |
| :--- | :--- | :--- | :--- |
| `0` | 1 | 0 | 1 (Fail-fast) |
| `1` | 1 | 1 | 2 |
| `3` (default) | 1 | 3 | 4 |
| `5` | 1 | 5 | 6 |

---

### Exponential Backoff

When a downstream service is struggling, retrying at constant intervals can trigger a "thundering herd" effect. Exponential backoff dynamically increases delays between attempts:

$$\text{delay} = \min(\text{initialDelay} \times \text{factor}^{(\text{attempt} - 1)}, \text{maxDelay})$$

- `initialDelay`: Base delay in milliseconds (default: `1000ms`).
- `factor`: Exponential multiplier (default: `2`).
- `maxDelay`: Upper bound ceiling to prevent runaway delays (default: `30000ms`).

---

### Fixed Delay

For predictable polling or lightweight operations, fixed delay calculates a constant interval:

$$\text{delay} = \min(\text{initialDelay}, \text{maxDelay})$$

---

### Jitter Strategies

Jitter adds pseudo-randomness to the calculated delay to desynchronize concurrent clients retrying simultaneously:

- `jitter: false` (default): Exact calculated delay.
- `jitter: true` or `'full'`: Random value in range $[0, \text{delay}]$.
- `jitter: 'half'`: Random value in range $[\frac{\text{delay}}{2}, \text{delay}]$.

---

### Timeouts and Cooperative Cancellation

JavaScript Promises run to completion and cannot be forcibly aborted from the outside without a cancellation token. 

When you configure a `timeout`:
1. If the operation exceeds `timeout` ms, Resilix immediately rejects with `ResilixTimeoutError`.
2. Resilix provides an `AbortSignal` inside the context object passed to your callback.
3. Pass this signal to native `fetch()`, database drivers, or `axios` to abort the underlying network connection cooperatively:

```javascript
await retry(async ({ signal }) => {
  return await fetch('https://api.example.com/data', { signal });
}, {
  timeout: 3000,
});
```

---

## API Reference

### `retry(callback, options)`

Executes an asynchronous operation and automatically retries upon failure.

- **Parameters:**
  - `callback(context)`: `(context: RetryContext) => Promise<T>`. Receives `{ attempt, retryCount, retriesLeft, signal }`.
  - `options`: `RetryOptions<T>` (optional).
- **Returns:** `Promise<T>` resolving with the callback result.
- **Throws:** `ResilixError` if retries are exhausted, or the original error if non-retryable.

---

### `retrySync(callback, options)`

Retries a synchronous operation that throws an exception.

- **Parameters:**
  - `callback(context)`: `(context: Omit<RetryContext, 'signal'>) => T`.
  - `options`: `RetryOptions<T>` (optional).
- **Returns:** `T` (synchronous return value).
- **Throws:** `ResilixError` if retries are exhausted, or the original error if non-retryable.

---

### `withTimeout(callback, timeoutMs, options)`

Executes an asynchronous operation bounded by a strict timeout limit.

- **Parameters:**
  - `callback`: `((context: { signal?: AbortSignal }) => Promise<T>) | Promise<T>`.
  - `timeoutMs`: `number` (positive integer).
  - `options`: `{ operationName?: string, signal?: AbortSignal }` (optional).
- **Returns:** `Promise<T>`.
- **Throws:** `ResilixTimeoutError` if timeout fires before resolution.

---

### `exponentialBackoff(attempt, options)`

Calculates the exponential delay for a specific 1-indexed attempt number.

- **Parameters:**
  - `attempt`: `number` (1 for first retry, 2 for second, etc.).
  - `options`: `{ initialDelay?: number, factor?: number, maxDelay?: number, jitter?: boolean | 'full' | 'half' }`.
- **Returns:** `number` (delay in milliseconds).

---

### `fixedDelay(attempt, options)`

Calculates fixed delay for a specific attempt number.

- **Parameters:**
  - `attempt`: `number`.
  - `options`: `{ delay?: number, maxDelay?: number, jitter?: boolean }`.
- **Returns:** `number` (delay in milliseconds).

---

### `shouldRetry(error, options)`

Utility function determining whether an error should trigger a retry attempt.

- **Parameters:**
  - `error`: `Error | unknown`.
  - `options`: Predicate function or `{ retryableErrors?: [], nonRetryableErrors?: [] }`.
- **Returns:** `boolean`.

---

### Error Hierarchy

#### `ResilixError`
Thrown when all configured retries are exhausted:
- `err.originalError`: The error thrown on the final attempt.
- `err.cause`: Standard ES2022 link to `originalError`.
- `err.errors`: Array of all errors collected across every attempt.
- `err.attempts`: Total attempts performed (e.g. `4`).
- `err.retries`: Number of retries performed (e.g. `3`).
- `err.totalDelay`: Cumulative milliseconds spent sleeping between retries.
- `err.operationName`: The name passed in `options.name`.

#### `ResilixTimeoutError`
Subclass of `ResilixError` thrown when an operation exceeds its configured timeout:
- `err.timeoutMs`: The timeout duration in milliseconds.

#### `ResilixConfigError`
Subclass of `TypeError` thrown immediately when invalid arguments or configuration options are provided.

---

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxRetries` | `number` | `3` | Maximum retry attempts after the first failure. |
| `initialDelay` / `delay` | `number` | `1000` | Base delay between attempts in milliseconds. |
| `strategy` / `backoff` | `string \| Function` | `'fixed'` | `'fixed'`, `'exponential'`, or custom `(attempt, options) => number`. |
| `factor` / `multiplier` | `number` | `2` | Multiplier for exponential backoff ($\ge 1$). |
| `maxDelay` | `number` | `30000` | Upper delay ceiling in milliseconds. |
| `jitter` | `boolean \| string` | `false` | `true`/'full' for uniform random jitter; `'half'` for 50-100% jitter. |
| `timeout` | `number` | `undefined` | Per-attempt timeout limit in milliseconds. |
| `shouldRetry` | `Function \| object` | `undefined` | Predicate `(err, meta) => boolean` or error filter object. |
| `onRetry` | `Function` | `undefined` | Hook called before scheduling retry: `(err, meta) => void`. |
| `onSuccess` | `Function` | `undefined` | Hook called upon success: `(result, meta) => void`. |
| `onFailure` | `Function` | `undefined` | Hook called upon final exhaustion or non-retryable error: `(err, meta) => void`. |
| `beforeRetry` | `Function` | `undefined` | Hook called immediately before sleep delay: `(meta) => void`. |
| `afterRetry` | `Function` | `undefined` | Hook called immediately after sleep delay: `(meta) => void`. |
| `signal` | `AbortSignal` | `undefined` | External AbortSignal to cancel retry sequence. |
| `name` | `string` | `undefined` | Operation identifier for logging and error reporting. |

---

## Lifecycle Hooks

Resilix provides hooks with detailed metadata:

```javascript
await retry(fetchOrderData, {
  maxRetries: 3,
  delay: 200,
  onRetry: (error, meta) => {
    // meta: { attempt, retryCount, maxRetries, retriesLeft, delay, totalDelay, elapsedMs, error }
    console.log(`[onRetry] Error: ${error.message}. Retries remaining: ${meta.retriesLeft}`);
  },
  onSuccess: (result, meta) => {
    // meta: { attempt, attempts, retryCount, retries, totalDelay, elapsedMs, result }
    console.log(`[onSuccess] Succeeded on attempt ${meta.attempt} in ${meta.elapsedMs}ms`);
  },
  onFailure: (error, meta) => {
    // meta: { attempt, attempts, retryCount, retries, totalDelay, elapsedMs, error, errors }
    console.error(`[onFailure] Failed after ${meta.attempts} attempts: ${error.message}`);
  },
});
```

---

## Usage Examples

### 1. Asynchronous Retry with Exponential Backoff

```javascript
const { retry } = require('resilix');

const result = await retry(
  async ({ attempt }) => {
    return await queryDatabase(attempt);
  },
  {
    maxRetries: 4,
    initialDelay: 300,
    strategy: 'exponential',
    factor: 2,
    maxDelay: 5000,
    jitter: true,
  }
);
```

### 2. Synchronous Retry for Lock Acquisition

```javascript
const { retrySync } = require('resilix');

const token = retrySync(
  () => {
    return acquireFileSystemLock('/var/lock/resilix.lock');
  },
  {
    maxRetries: 2,
    delay: 100,
  }
);
```

### 3. Fixed Delay with Jitter

```javascript
const { retry } = require('resilix');

await retry(pollJobStatus, {
  maxRetries: 5,
  strategy: 'fixed',
  delay: 1000,
  jitter: true,
});
```

### 4. Selective Retry and Custom Error Filtering

```javascript
const { retry, shouldRetry } = require('resilix');

class AuthError extends Error {}

await retry(callBillingService, {
  maxRetries: 3,
  shouldRetry: (error) => {
    // Fail fast on authentication errors
    if (error instanceof AuthError || error.status === 401) {
      return false;
    }
    // Retry on 5xx, 429, and network drops
    return shouldRetry(error);
  },
});
```

### 5. Per-Attempt Timeout with AbortSignal

```javascript
const { retry } = require('resilix');

const data = await retry(
  async ({ signal }) => {
    return await fetch('https://slow-api.internal/stats', { signal });
  },
  {
    maxRetries: 2,
    timeout: 2500, // 2.5s per attempt
    delay: 500,
  }
);
```

### 6. Express.js Middleware & Endpoint Integration

```javascript
const express = require('express');
const { retry, ResilixError } = require('resilix');

const app = express();

app.get('/api/users/:id', async (req, res, next) => {
  try {
    const user = await retry(
      async () => await fetchUserFromMicroservice(req.params.id),
      {
        maxRetries: 3,
        initialDelay: 200,
        strategy: 'exponential',
        name: 'getUser',
      }
    );
    res.json({ success: true, user });
  } catch (error) {
    if (error instanceof ResilixError) {
      return res.status(503).json({
        error: 'User service temporarily unavailable',
        attemptsMade: error.attempts,
        originalError: error.originalError?.message,
      });
    }
    next(error);
  }
});
```

### 7. Full TypeScript Implementation

```typescript
import { retry, RetryOptions, RetryContext } from 'resilix';

interface Product {
  id: string;
  name: string;
  price: number;
}

async function getProduct(productId: string): Promise<Product> {
  const options: RetryOptions<Product> = {
    maxRetries: 3,
    initialDelay: 250,
    strategy: 'exponential',
  };

  return await retry<Product>(async (ctx: RetryContext) => {
    const res = await fetch(`https://api.shop.com/products/${productId}`);
    return await res.json();
  }, options);
}
```

---

## Error Handling

When all retries are exhausted, inspect the rich `ResilixError`:

```javascript
const { retry, ResilixError } = require('resilix');

try {
  await retry(unstableTask, { maxRetries: 3 });
} catch (error) {
  if (error instanceof ResilixError) {
    console.error(`Total attempts: ${error.attempts}`);
    console.error(`Total retries: ${error.retries}`);
    console.error(`Time spent sleeping: ${error.totalDelay}ms`);
    console.error(`Root error message: ${error.originalError.message}`);
    console.error(`All errors:`, error.errors.map(e => e.message));
  }
}
```

---

## Testing

Resilix uses Node.js's built-in test runner (`node:test`) and strict assertions:

```bash
# Run unit test suite
npm test

# Run tests in watch mode
npm run test:watch

# Run TypeScript typecheck
npm run typecheck
```

---

## Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing guidelines.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version release notes.

---

## License

This project is licensed under the [MIT License](LICENSE).
