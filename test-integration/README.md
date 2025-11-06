# Integration Tests

These integration tests verify that the compiled ESM and CJS outputs work correctly when imported/required by consumers.

## Directory Structure

```
test-integration/
├── esm/
│   └── import.test.mjs    # ESM module import tests
└── cjs/
    └── require.test.mjs   # CJS require tests (uses createRequire)
```

## Running Tests

```bash
# Run all integration tests (builds first)
npm run test:integration

# Run only ESM integration tests
npm run test:integration:esm

# Run only CJS integration tests
npm run test:integration:cjs
```

## What These Tests Do

Unlike unit tests that test source code (`src/`), these integration tests:

1. **Import/require the compiled outputs** (`esm/` and `cjs/`)
2. **Verify the module structure** is correct (exports are available)
3. **Test basic instantiation** to ensure the code runs in both module systems
4. **Validate that the build process** produces functional output

## How It Works

### ESM Tests (`esm/import.test.mjs`)
- Uses standard ESM `import` to load the ESM build
- Imports directly from `../../esm/index.js`

### CJS Tests (`cjs/require.test.mjs`)
- Written as an ESM file (`.mjs`) but uses `createRequire` to test CJS output
- Uses Node's `createRequire` API to dynamically require the CJS build
- This approach is necessary because Vitest itself is ESM-only

## Prerequisites

Integration tests require the project to be built first:

```bash
npm run build
```

The `test:integration` script automatically runs the build step.

## CI Integration

Integration tests run in CI as part of the Test job after unit tests complete.
