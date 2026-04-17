#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { generateExterns } from './main.ts';

const HELP = `Usage: closure-dts-externs <input...> [options]

Arguments:
  input                 Path(s) to .d.ts input file(s)

Options:
  -o, --output <path>   Write output to file (default: stdout)
  --filter <substring>  Only process files whose path contains <substring>
  --exclude <pattern>   Exclude declarations matching pattern, supports * wildcards (repeatable)
  -h, --help            Show this help message

Examples:
  closure-dts-externs types/index.d.ts -o externs.js
  closure-dts-externs types/index.d.ts --filter my-typings --exclude "set*" --exclude "clear*"
  closure-dts-externs api.d.ts cloud.d.ts -o externs.js`;

const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
        output: { type: 'string', short: 'o' },
        filter: { type: 'string' },
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
    console.error('Error: at least one input path is required.\n');
    console.info(HELP);
    process.exit(1);
}

function matchesPattern(name: string, pattern: string): boolean {
    if (!pattern.includes('*')) {
        return name === pattern;
    }
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
    return regex.test(name);
}

const excludePatterns = values.exclude;

const content = generateExterns({
    input: positionals.length === 1 ? positionals[0] : positionals,
    output: values.output,
    fileFilter: values.filter
        ? (filePath: string) => filePath.includes(values.filter as string)
        : undefined,
    exclude: excludePatterns
        ? (name: string) => excludePatterns.some(p => matchesPattern(name, p))
        : undefined,
});

if (!values.output) {
    process.stdout.write(content);
}
