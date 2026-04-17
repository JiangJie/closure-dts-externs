import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const rootDir = resolve(import.meta.dirname, '..');

// Transpile src/cli.ts → bin/cli.mjs
const source = readFileSync(resolve(rootDir, 'src/cli.ts'), 'utf-8');

// Strip the original shebang (will add back with node path)
const withoutShebang = source.replace(/^#!.*\n/, '');

// Transpile TS → JS, rewrite import path
const { outputText } = ts.transpileModule(withoutShebang, {
    compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: false,
        removeComments: true,
    },
});

const cli = `#!/usr/bin/env node\n${outputText.replace(/from '\.\/main\.ts'/, "from '../dist/main.mjs'")}`;

const binDir = resolve(rootDir, 'bin');
rmSync(binDir, { recursive: true });
mkdirSync(binDir, { recursive: true });
writeFileSync(resolve(binDir, 'cli.mjs'), cli);
