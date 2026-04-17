# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

`closure-dts-externs` generates Closure Compiler externs from any `.d.ts` type definitions.

It parses `.d.ts` files using the TypeScript compiler API and outputs externs declarations for:
- Global variables (`declare const/var/let`) with automatic interface member expansion
- Global functions (`declare function`)
- Interface/class prototype members (from namespaces and top-level declarations)
- Inline object type literals are recursively expanded (e.g. `env: { USER_DATA_PATH: string }` → `wx.env;` + `wx.env.USER_DATA_PATH;`)

Available as both a **CLI tool** and a **JS/TS API**.

## Development Commands

### Testing
```bash
# Run all tests with coverage
pnpm run test

# Run tests in watch mode
pnpm run test:watch
```

### Building
```bash
# Full build (includes type check, lint, vite build)
pnpm run build

# Type checking only
pnpm run check

# Linting only
pnpm run lint
```

### Build Architecture

Single-step build (same as happy-codec):

**Vite + vite-plugin-dts** - Compiles TypeScript to JavaScript (CJS + ESM) and generates `.d.ts` type declarations, with two entry points:
- `src/main.ts` → `dist/main.{mjs,cjs}` (library API)
- `src/cli.ts` → `dist/cli.{mjs,cjs}` (CLI entry)

External dependencies (`typescript`, `node:fs`) are NOT bundled.

## Architecture

### Source Structure

```
src/
├── main.ts   # Core logic: generateExterns() and AST traversal helpers, also the public API entry
└── cli.ts    # CLI entry with #!/usr/bin/env node shebang
```

### Key Function

`generateExterns(options)` accepts:
- `input` (required): path(s) to the `.d.ts` file(s)
- `output` (optional): write to file; if omitted returns content as string
- `fileFilter` (optional): filter which source files to process; defaults to excluding TypeScript built-in libs
- `exclude` (optional): callback `(name, context) => boolean` to exclude declarations; context has `kind` (`'namespace'`/`'variable'`/`'function'`/`'interface'`/`'class'`/`'member'`) and `scope` (dot-separated path)

### How It Works

1. Creates a TypeScript program from the `.d.ts` entry
2. Traverses all source files (filtered by `fileFilter`, default excludes `typescript/lib/`)
3. Collects top-level declarations:
   - `declare const/var/let xxx: Type` → global variable, resolves type to interface for member expansion
   - `declare function xxx` → global function
   - `interface` / `class` → prototype members
4. Visits namespace declarations recursively, collecting interface/class members
5. Associates global variables with their interface types (e.g. `declare const wx: Wx` → expand `Wx` members as `wx.*`)
6. Recursively expands inline object type literals (e.g. `env: { USER_DATA_PATH: string }`)
7. Outputs sorted Closure Compiler externs format:
   - Global variable declarations (`var xxx;`)
   - Global object members (`xxx.member;`)
   - Remaining interface/class prototypes (`function Type() {}` / `Type.prototype.member;`)

### Example Usage

```ts
import { generateExterns } from 'closure-dts-externs';

// Generate externs with filtering and exclusions
const content = generateExterns({
    input: 'node_modules/my-typings/types/index.d.ts',
    fileFilter: (f) => f.includes('my-typings'),
    exclude: (name) =>
        ['console', 'require', 'module', 'exports'].includes(name)
        || name.startsWith('set') || name.startsWith('clear'),
    output: 'externs.js',
});

// Any .d.ts file
const externs = generateExterns({ input: 'path/to/typings.d.ts' });
```

## Testing

- Test files in `tests/` directory
- Uses Vitest with `@vitest/coverage-v8`
- Comprehensive fixture at `tests/fixtures/comprehensive.d.ts` covers all scenarios
- Snapshot test at `tests/snapshots/comprehensive.snap.js` guards against regressions
- Run with: `pnpm run test`

## Toolchain

- **pnpm** for package management
- **TypeScript** with strict mode, bundler module resolution
- **Vite 8** (Rolldown) for JS bundling
- **vite-plugin-dts** for `.d.ts` generation
- **ESLint** with typescript-eslint strict + stylistic
- **Vitest** for testing

## Publishing

Published to **npm** as both:
- A library (`import { generateExterns } from 'closure-dts-externs'`)
- A CLI tool (`npx closure-dts-externs [dtsEntry] [outputPath]`)

## Code Style

Same as happy-rusty:
- Semicolons required
- Trailing commas in multiline
- Template literal spacing: `${value}` (no spaces)
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters`, `strictNullChecks`
- File extensions required in imports (`.ts` suffix)

## CI/CD

- **test.yml** - Runs tests on push to main
- **npm-publish.yml** - Publishes to npm on release
