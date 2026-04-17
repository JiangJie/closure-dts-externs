import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../src/main.ts';

const fixturePath = join('tests', 'fixtures', 'comprehensive.d.ts');

describe('generate', () => {
    it('should return externs content as string', () => {
        const content = generate({ input: fixturePath });

        expect(content).toBeTypeOf('string');
        expect(content.length).toBeGreaterThan(0);
    });

    it('should start with auto-generated comment', () => {
        const content = generate({ input: fixturePath });

        expect(content).toMatch(/^\/\/ Auto-generated/);
    });

    it('should contain auto-extracted global var declarations', () => {
        const content = generate({ input: fixturePath });

        expect(content).toContain('var app;');
        expect(content).toContain('var plugin;');
        expect(content).toContain('var VERSION;');
        expect(content).toContain('var counter;');
        expect(content).toContain('var bootstrap;');
        expect(content).toContain('var shutdown;');
    });

    it('should expand global object members from associated interface', () => {
        const content = generate({ input: fixturePath });

        // app → TestLib.App
        expect(content).toContain('app.init;');
        expect(content).toContain('app.run;');
        expect(content).toContain('app.destroy;');
        // plugin → TopPlugin
        expect(content).toContain('plugin.activate;');
        expect(content).toContain('plugin.deactivate;');
        expect(content).toContain('plugin.reload;');
    });

    it('should not output prototype form for interfaces consumed by global vars', () => {
        const content = generate({ input: fixturePath });

        // App and TopPlugin are consumed by `app` and `plugin`
        expect(content).not.toContain('function App() {}');
        expect(content).not.toContain('function TopPlugin() {}');
    });

    it('should output prototype form for unconsumed interfaces and classes', () => {
        const content = generate({ input: fixturePath });

        // Config and Logger are not referenced by any global var
        expect(content).toContain('function Config() {}');
        expect(content).toContain('Config.prototype.debug;');
        expect(content).toContain('function Logger() {}');
        expect(content).toContain('Logger.prototype.log;');

        // EventEmitter is a class
        expect(content).toContain('function EventEmitter() {}');
        expect(content).toContain('EventEmitter.prototype.on;');
        expect(content).toContain('EventEmitter.prototype.emit;');

        // Util from nested namespace
        expect(content).toContain('function Util() {}');
        expect(content).toContain('Util.prototype.format;');

        // Timer is a top-level class
        expect(content).toContain('function Timer() {}');
        expect(content).toContain('Timer.prototype.start;');
        expect(content).toContain('Timer.prototype.stop;');
    });

    it('should merge same-name interfaces across different namespaces', () => {
        const content = generate({ input: fixturePath });

        // Logger exists in both TestLib and AnotherLib — members should be merged
        expect(content).toContain('function Logger() {}');
        expect(content).toContain('Logger.prototype.log;');
        expect(content).toContain('Logger.prototype.warn;');
        expect(content).toContain('Logger.prototype.error;');
        expect(content.match(/function Logger\(\)/g)?.length).toBe(1);
    });

    it('should merge same-name classes across different namespaces', () => {
        const content = generate({ input: fixturePath });

        // EventEmitter exists in both TestLib and AnotherLib — members should be merged
        expect(content).toContain('function EventEmitter() {}');
        expect(content).toContain('EventEmitter.prototype.on;');
        expect(content).toContain('EventEmitter.prototype.emit;');
        expect(content).toContain('EventEmitter.prototype.off;');
        expect(content.match(/function EventEmitter\(\)/g)?.length).toBe(1);
    });

    it('should recursively expand inline object type literals', () => {
        const content = generate({ input: fixturePath });

        // app.env: { DATA_PATH: string }
        expect(content).toContain('app.env;');
        expect(content).toContain('app.env.DATA_PATH;');

        // Config.prototype.options: { verbose, level }
        expect(content).toContain('Config.prototype.options;');
        expect(content).toContain('Config.prototype.options.verbose;');
        expect(content).toContain('Config.prototype.options.level;');
    });

    it('should produce sorted output', () => {
        const content = generate({ input: fixturePath });
        const lines = content.split('\n');

        // Global variable declarations should be sorted
        const varLines = lines.filter(l => l.startsWith('var '));
        const varNames = varLines.map(l => l.slice(4, -1));
        expect(varNames).toEqual([...varNames].sort());

        // app.* members should be sorted
        const appLines = lines.filter(l => /^app\.\w+;$/.test(l));
        const appNames = appLines.map(l => l.slice(4, -1));
        expect(appNames).toEqual([...appNames].sort());
    });

    describe('output', () => {
        const tmpDir = join('tests', '.tmp');
        const output = join(tmpDir, 'externs.js');

        beforeAll(() => {
            mkdirSync(tmpDir, { recursive: true });
        });

        afterAll(() => {
            rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should write to file when output is provided', () => {
            const content = generate({ input: fixturePath, output });

            expect(existsSync(output)).toBe(true);
            expect(readFileSync(output, 'utf-8')).toBe(content);
        });
    });

    describe('options', () => {
        it('should support exclude with exact match', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name) => name === 'debugHelper',
            });

            expect(content).not.toContain('var debugHelper;');
            expect(content).toContain('var app;');
        });

        it('should support exclude with variable and function kinds', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name) => name.startsWith('temp') || name.startsWith('debug'),
            });

            expect(content).not.toContain('var tempVar;');
            expect(content).not.toContain('var debugHelper;');
            expect(content).toContain('var app;');
        });

        it('should exclude entire namespace when kind is namespace', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name, { kind }) => kind === 'namespace' && name === 'AnotherLib',
            });

            // AnotherLib.Logger.error and AnotherLib.EventEmitter.off should be excluded
            expect(content).not.toContain('Logger.prototype.error;');
            expect(content).not.toContain('EventEmitter.prototype.off;');
            // TestLib members should still exist
            expect(content).toContain('Logger.prototype.log;');
            expect(content).toContain('EventEmitter.prototype.on;');
        });

        it('should exclude specific interface by scope', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name, { kind, scope }) =>
                    kind === 'interface' && scope === 'AnotherLib' && name === 'Logger',
            });

            // AnotherLib.Logger excluded, but TestLib.Logger still merged
            expect(content).toContain('Logger.prototype.log;');
            expect(content).toContain('Logger.prototype.warn;');
            expect(content).not.toContain('Logger.prototype.error;');
        });

        it('should exclude specific member by scope', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name, { kind, scope }) =>
                    kind === 'member' && scope === 'TestLib.Logger' && name === 'warn',
            });

            expect(content).toContain('Logger.prototype.log;');
            expect(content).not.toContain('Logger.prototype.warn;');
            // AnotherLib.Logger.error unaffected
            expect(content).toContain('Logger.prototype.error;');
        });

        it('should exclude top-level interface by kind', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name, { kind }) =>
                    kind === 'interface' && name === 'TopPlugin',
            });

            expect(content).not.toContain('function TopPlugin() {}');
            // plugin var still exists but without member expansion
            expect(content).toContain('var plugin;');
            expect(content).not.toContain('plugin.activate;');
        });

        it('should exclude top-level class by kind', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name, { kind }) =>
                    kind === 'class' && name === 'Timer',
            });

            expect(content).not.toContain('function Timer() {}');
            expect(content).not.toContain('Timer.prototype.start;');
        });

        it('should exclude nested namespace by scope', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name, { kind, scope }) =>
                    kind === 'namespace' && scope === 'TestLib' && name === 'Inner',
            });

            expect(content).not.toContain('function Util() {}');
            expect(content).not.toContain('Util.prototype.format;');
            // Other TestLib members unaffected
            expect(content).toContain('function Config() {}');
        });

        it('should exclude class inside namespace by scope', () => {
            const content = generate({
                input: fixturePath,
                exclude: (name, { kind, scope }) =>
                    kind === 'class' && scope === 'TestLib' && name === 'EventEmitter',
            });

            // TestLib.EventEmitter excluded, but AnotherLib.EventEmitter still present
            expect(content).toContain('function EventEmitter() {}');
            expect(content).toContain('EventEmitter.prototype.off;');
            expect(content).not.toContain('EventEmitter.prototype.on;');
            expect(content).not.toContain('EventEmitter.prototype.emit;');
        });

        it('should use default fileFilter excluding typescript libs', () => {
            const content = generate({ input: fixturePath });

            expect(content).toBeTypeOf('string');
            expect(content.length).toBeGreaterThan(0);
        });

        it('should support input as string array', () => {
            const content = generate({ input: [fixturePath] });

            expect(content).toContain('var app;');
            expect(content).toContain('app.init;');
        });
    });

    describe('edge cases with custom .d.ts', () => {
        const fixtureDir = join('tests', '.fixtures');
        const fixtureFile = join(fixtureDir, 'custom.d.ts');

        beforeAll(() => {
            mkdirSync(fixtureDir, { recursive: true });
        });

        afterAll(() => {
            rmSync(fixtureDir, { recursive: true, force: true });
        });

        it('should skip anonymous class declarations', () => {
            writeFileSync(fixtureFile, `
declare namespace NS {
    class { anonMember: string; }
    class Named { namedMember: string; }
}
`);
            const content = generate({ input: fixtureFile });

            expect(content).toContain('Named.prototype.namedMember;');
            expect(content).not.toContain('anonMember');
        });

        it('should skip function declarations without identifiable name', () => {
            writeFileSync(fixtureFile, `
declare function namedFn(): void;
`);
            const content = generate({ input: fixtureFile });

            expect(content).toContain('var namedFn;');
        });

        it('should handle declare const without type annotation', () => {
            writeFileSync(fixtureFile, `
declare const noType;
`);
            const content = generate({ input: fixtureFile });

            expect(content).toContain('var noType;');
        });

        it('should handle fileFilter', () => {
            writeFileSync(fixtureFile, `
declare const shouldAppear: string;
`);
            const content = generate({
                input: fixtureFile,
                fileFilter: f => f.includes('.fixtures'),
            });

            expect(content).toContain('var shouldAppear;');
        });

        it('should merge same-name top-level classes', () => {
            writeFileSync(fixtureFile, `
declare class Widget { render(): void; }
declare class Widget { dispose(): void; }
`);
            const content = generate({ input: fixtureFile });

            expect(content).toContain('function Widget() {}');
            expect(content).toContain('Widget.prototype.render;');
            expect(content).toContain('Widget.prototype.dispose;');
            expect(content.match(/function Widget\(\)/g)?.length).toBe(1);
        });
        it('should merge same-name interface and class', () => {
            writeFileSync(fixtureFile, `
declare namespace NS {
    interface Hybrid { fromInterface: string; }
    class Hybrid { fromClass(): void; }
}
`);
            const content = generate({ input: fixtureFile });

            expect(content).toContain('function Hybrid() {}');
            expect(content).toContain('Hybrid.prototype.fromInterface;');
            expect(content).toContain('Hybrid.prototype.fromClass;');
            expect(content.match(/function Hybrid\(\)/g)?.length).toBe(1);
        });

        it('should throw when input is an empty array', () => {
            expect(() => generate({ input: [] })).toThrow('`input` must contain at least one .d.ts file path');
        });
    });

    describe('e2e snapshot', () => {
        it('should match the snapshot of comprehensive fixture output', () => {
            const content = generate({ input: fixturePath });

            expect(content).toMatchSnapshot();
        });
    });
});
