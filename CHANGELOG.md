# Changelog

All notable changes to the **Resilix** library are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-17

### Added
- Core asynchronous retry engine `retry(callback, options)`.
- Core synchronous retry engine `retrySync(callback, options)`.
- Configurable timeout boundary `withTimeout(callback, timeoutMs, options)` with cooperative `AbortSignal` cancellation support.
- Exponential backoff calculation `exponentialBackoff(attempt, options)` with configurable initial delay, factor, max delay clamp, and full/half jitter.
- Fixed delay calculation `fixedDelay(attempt, options)`.
- Intelligent error classifier `shouldRetry(error, options)` supporting predicate functions, HTTP status codes (4xx client vs 5xx server), and error whitelists/blacklists.
- Robust custom error hierarchy: `ResilixError`, `ResilixTimeoutError`, and `ResilixConfigError`.
- Comprehensive lifecycle hooks: `onRetry`, `onSuccess`, `onFailure`, `beforeRetry`, and `afterRetry`.
- Unified retry metadata: `attempt`, `attempts`, `retryCount`, `retries`, `totalDelay`, `elapsedMs`, and error history.
- Dual CommonJS (`index.js`) and native ECMAScript Modules (`index.mjs`) exports.
- Complete TypeScript declaration definitions (`types/index.d.ts` and `index.d.ts`) supporting generic return types.
- Native Node.js test suite (`node:test`, `node:assert/strict`) covering 67 unit tests.
- Practical runnable examples under `examples/` (Basic, Exponential Backoff, Fixed Delay, Custom Conditions, Timeout, Express.js integration, and TypeScript).
- GitHub Actions CI matrix covering Node.js 18, 20, and 22 across Linux, macOS, and Windows.
- Zero runtime dependencies.
