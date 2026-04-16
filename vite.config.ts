import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        dts({
            rollupTypes: true,
            include: 'src',
        }),
    ],
    build: {
        target: 'esnext',
        minify: false,
        sourcemap: true,
        outDir: 'dist',
        lib: {
            entry: 'src/main.ts',
            fileName: format => `main.${format === 'esm' ? 'mjs' : 'cjs'}`,
        },
        rollupOptions: {
            external: ['typescript', 'node:fs'],
            output: [
                {
                    format: 'cjs',
                    topLevelVar: false,
                },
                {
                    format: 'esm',
                    topLevelVar: false,
                },
            ],
            treeshake: {
                moduleSideEffects: false,
                propertyReadSideEffects: false,
            },
        },
    },
    test: {
        include: ['**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['src/cli.ts'],
        },
    },
});
