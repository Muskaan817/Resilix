# Contributing to Resilix

Thank you for your interest in contributing to **Resilix**! We welcome bug reports, feature suggestions, documentation improvements, and pull requests.

## Code of Conduct

Please maintain a respectful, welcoming, and collaborative environment for everyone.

## Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<YOUR_USERNAME>/resilix.git
   cd resilix
   ```
2. Install development dependencies:
   ```bash
   npm install
   ```
3. Run the unit test suite:
   ```bash
   npm test
   ```
4. Run TypeScript type-checking:
   ```bash
   npm run typecheck
   ```

## Design Philosophy

- **Zero Runtime Dependencies**: The core package must never introduce runtime dependencies. Use modern Node.js built-ins (`Promise`, `setTimeout`, `AbortController`, `Atomics`).
- **Deterministic Testing**: Avoid real-time sleeps in tests. Abstract or use millisecond delays to keep tests fast and deterministic.
- **Dual CJS & ESM Support**: Ensure changes maintain full compatibility across both CommonJS (`index.js`) and native ESM (`index.mjs`).
- **Complete Type Safety**: Keep `types/index.d.ts` synchronized with all public API additions.

## Pull Request Guidelines

1. Create a feature branch (`git checkout -b feature/my-feature`).
2. Add or update tests for your changes.
3. Verify all tests and type checks pass:
   ```bash
   npm test
   npm run typecheck
   ```
4. Verify packaging:
   ```bash
   npm pack --dry-run
   ```
5. Commit with descriptive messages.
6. Push to your branch and open a Pull Request against `main`.
