#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { generateExterns } from './main.ts';

const HELP = `Usage: closure-dts-externs <dtsEntry...> [options]

Arguments:
  dtsEntry              Path(s) to .d.ts entry file(s)

Options:
  -o, --output <path>   Write output to file (default: stdout)
  --filter <substring>  Only process files whose path contains <substring>
  --extra <name>        Extra global variable name (repeatable)
  --exclude <pattern>   Exclude global declarations matching pattern, supports * wildcards (repeatable)
  -h, --help            Show this help message

Examples:
  closure-dts-externs types/index.d.ts -o externs.js
  closure-dts-externs types/index.d.ts --filter my-typings --exclude "set*" --exclude "clear*"
  closure-dts-externs api.d.ts cloud.d.ts -o externs.js --extra GameGlobal`;

const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
        output: { type: 'string', short: 'o' },
        filter: { type: 'string' },
        extra: { type: 'string', multiple: true },
        exclude: { type: 'string', multiple: true },
        help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
});

if (values.help) {
    console.info(HELP);
    process.exit(0);
}

if (positionals.length === 0) {
    console.error('Error: at least one dtsEntry path is required.\n');
    console.info(HELP);
    process.exit(1);
}

const content = generateExterns({
    dtsEntry: positionals.length === 1 ? positionals[0] : positionals,
    outputPath: values.output,
    fileFilter: values.filter ? (f: string) => f.includes(values.filter as string) : undefined,
    extraGlobalVars: values.extra,
    excludeGlobals: values.exclude,
});

if (!values.output) {
    process.stdout.write(content);
}
