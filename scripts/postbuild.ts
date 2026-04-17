import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

// Transpile src/cli.ts → dist/cli.mjs
const source = readFileSync('src/cli.ts', 'utf-8');

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

const cli = `#!/usr/bin/env node\n${outputText.replace(/from '\.\/main\.ts'/, "from './main.mjs'")}`;

writeFileSync('dist/cli.mjs', cli);
