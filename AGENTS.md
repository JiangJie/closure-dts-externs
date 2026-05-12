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

# Run a single test file
pnpm vitest tests/main.test.ts

# Run tests matching a name pattern
pnpm vitest -t "expand interface members"

# Update snapshots after intentional output changes
pnpm vitest -u
```

### Building
```bash
# Full build (includes type check, lint, vite build, postbuild)
pnpm run build

# Type checking only
pnpm run check

# Linting only
pnpm run lint
```

### Build Architecture

**Vite + unplugin-dts** - Compiles TypeScript to JavaScript (CJS + ESM) and generates bundled `.d.ts` type declarations:
- `src/main.ts` → `dist/main.{mjs,cjs}` (library API)
- `src/cli.ts` → `bin/cli.mjs` (CLI entry, transpiled by `scripts/postbuild.ts` which strips shebang, rewrites import path to `../dist/main.mjs`, and removes comments)

`scripts/postbuild.ts` uses `import.meta.dirname` to resolve absolute paths so it works regardless of the working directory (important for GitHub Actions). Keep it absolute — do not regress to relative paths.

External dependencies (`typescript`, `node:fs`) are NOT bundled.

## Architecture

### Source Structure

```
src/
├── main.ts   # Core logic: generate() and AST traversal helpers, also the public API entry
└── cli.ts    # CLI entry with #!/usr/bin/env node shebang
```

### Key Function

`generate(options)` accepts:
- `input` (required): path(s) to the `.d.ts` file(s)
- `output` (optional): write to file; if omitted returns content as string
- `fileFilter` (optional): filter which source files to process; defaults to excluding TypeScript built-in libs
- `exclude` (optional): callback `(name, context) => boolean` to exclude declarations; context has `kind` (`'namespace'`/`'variable'`/`'function'`/`'interface'`/`'class'`/`'member'`) and `scope` (dot-separated path)

The `ExcludeContext` and `ExcludeFilter` types are exported from the package for external use.

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

   Note: same-name interfaces/classes from different namespaces are **merged** into one declaration (Closure externs is a flat global namespace), with members deduplicated via `Set<string>`.

### Example Usage

```ts
import { generate } from 'closure-dts-externs';

// Generate externs with filtering and exclusions
const content = generate({
    input: 'node_modules/my-typings/types/index.d.ts',
    fileFilter: (f) => f.includes('my-typings'),
    exclude: (name) =>
        ['console', 'require', 'module', 'exports'].includes(name)
        || name.startsWith('set') || name.startsWith('clear'),
    output: 'externs.js',
});

// Any .d.ts file
const externs = generate({ input: 'path/to/typings.d.ts' });
```

## Testing

- Test files in `tests/` directory
- Uses Vitest with `@vitest/coverage-v8`
- Comprehensive fixture at `tests/fixtures/comprehensive.d.ts` covers all scenarios
- Snapshot test via vitest `toMatchSnapshot()` in `tests/__snapshots__/` guards against regressions
- When adding new declaration handling, extend `tests/fixtures/comprehensive.d.ts` first, then update snapshots via `pnpm vitest -u`
- Run with: `pnpm run test`

## Toolchain

- **pnpm** for package management
- **TypeScript 6** with strict mode, bundler module resolution
- **Vite 8** (Rolldown) for JS bundling
- **unplugin-dts** for `.d.ts` generation (bundled via `@microsoft/api-extractor`)
- **ESLint** with typescript-eslint strict + stylistic
- **Vitest** for testing

## Publishing

Published to **npm** as both:
- A library (`import { generate } from 'closure-dts-externs'`)
- A CLI tool (`npx closure-dts-externs <input...> [options]`)

CLI options: `--filter <substring>`, `--exclude <pattern>` (repeatable, supports `*` wildcards), `-o/--output <path>`, `-h/--help`.

Published files (from `package.json` `files` field): `bin/`, `dist/`, `LICENSE`, `README.md`, `CHANGELOG.md`.

`bin/` and `dist/` are in `.gitignore` — never commit build artifacts.

## Code Style

- Semicolons required
- Trailing commas in multiline
- Template literal spacing: `${value}` (no spaces)
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters`, `strictNullChecks`
- File extensions required in imports (`.ts` suffix)
- Internal code organized with `#region` blocks: `Internal Types` → `Internal Functions`
- Public API requires JSDoc with `@example` (see `generate` in `src/main.ts`)
- Comments explain *why*, not *what*
- Add `/*#__PURE__*/` to top-level function call expressions to help bundler tree-shaking
- Prefer `interface` over `type` (except for unions and other special cases)
- Avoid `any`; use `unknown` when a type cannot be inferred
- Commit messages in English, following Conventional Commits

## CI/CD

- **test.yml** - Runs tests on push to main; uploads coverage to Codecov; reusable via `workflow_call` (workflow-level `permissions: contents: read`)
- **npm-publish.yml** - Triggers on GitHub Release; publishes to npm with **OIDC + Provenance** (`id-token: write`, no `NPM_TOKEN`); reuses `test.yml`
- **npm-publish-github-packages.yml** - Triggers on GitHub Release; publishes a `@jiangjie/closure-dts-externs` mirror to GitHub Packages using `GITHUB_TOKEN`
