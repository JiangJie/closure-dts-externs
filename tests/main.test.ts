import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateExterns } from '../src/main.ts';

const fixturePath = join('tests', 'fixtures', 'comprehensive.d.ts');

describe('generateExterns', () => {
    it('should return externs content as string', () => {
        const content = generateExterns({ input: fixturePath });

        expect(content).toBeTypeOf('string');
        expect(content.length).toBeGreaterThan(0);
    });

    it('should start with auto-generated comment', () => {
        const content = generateExterns({ input: fixturePath });

        expect(content).toMatch(/^\/\/ Auto-generated/);
    });

    it('should contain auto-extracted global var declarations', () => {
        const content = generateExterns({ input: fixturePath });

        expect(content).toContain('var app;');
        expect(content).toContain('var plugin;');
        expect(content).toContain('var VERSION;');
        expect(content).toContain('var counter;');
        expect(content).toContain('var bootstrap;');
        expect(content).toContain('var shutdown;');
    });

    it('should expand global object members from associated interface', () => {
        const content = generateExterns({ input: fixturePath });

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
        const content = generateExterns({ input: fixturePath });

        // App and TopPlugin are consumed by `app` and `plugin`
        expect(content).not.toContain('function App() {}');
        expect(content).not.toContain('function TopPlugin() {}');
    });

    it('should output prototype form for unconsumed interfaces and classes', () => {
        const content = generateExterns({ input: fixturePath });

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
        const content = generateExterns({ input: fixturePath });

        // Logger exists in both TestLib and AnotherLib — members should be merged
        expect(content).toContain('function Logger() {}');
        expect(content).toContain('Logger.prototype.log;');
        expect(content).toContain('Logger.prototype.warn;');
        expect(content).toContain('Logger.prototype.error;');
        // Only one function declaration
        expect(content.match(/function Logger\(\)/g)?.length).toBe(1);
    });

    it('should merge same-name classes across different namespaces', () => {
        const content = generateExterns({ input: fixturePath });

        // EventEmitter exists in both TestLib and AnotherLib — members should be merged
        expect(content).toContain('function EventEmitter() {}');
        expect(content).toContain('EventEmitter.prototype.on;');
        expect(content).toContain('EventEmitter.prototype.emit;');
        expect(content).toContain('EventEmitter.prototype.off;');
        expect(content.match(/function EventEmitter\(\)/g)?.length).toBe(1);
    });

    it('should recursively expand inline object type literals', () => {
        const content = generateExterns({ input: fixturePath });

        // app.env: { DATA_PATH: string }
        expect(content).toContain('app.env;');
        expect(content).toContain('app.env.DATA_PATH;');

        // Config.prototype.options: { verbose, level }
        expect(content).toContain('Config.prototype.options;');
        expect(content).toContain('Config.prototype.options.verbose;');
        expect(content).toContain('Config.prototype.options.level;');
    });

    it('should produce sorted output', () => {
        const content = generateExterns({ input: fixturePath });
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

        it('should write to file and log info when output is provided', () => {
            const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

            const content = generateExterns({ input: fixturePath, output });

            expect(existsSync(output)).toBe(true);
            expect(readFileSync(output, 'utf-8')).toBe(content);
            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(`Generated ${output}`));

            infoSpy.mockRestore();
        });
    });

    describe('options', () => {
        it('should support excludeDeclarations with exact match', () => {
            const content = generateExterns({
                input: fixturePath,
                excludeDeclarations: ['debugHelper'],
            });

            expect(content).not.toContain('var debugHelper;');
            expect(content).toContain('var app;');
        });

        it('should support excludeDeclarations with wildcard', () => {
            const content = generateExterns({
                input: fixturePath,
                excludeDeclarations: ['temp*', 'debug*'],
            });

            expect(content).not.toContain('var tempVar;');
            expect(content).not.toContain('var debugHelper;');
            expect(content).toContain('var app;');
        });

        it('should use default fileFilter excluding typescript libs', () => {
            const content = generateExterns({ input: fixturePath });

            expect(content).toBeTypeOf('string');
            expect(content.length).toBeGreaterThan(0);
        });

        it('should support input as string array', () => {
            const content = generateExterns({ input: [fixturePath] });

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
            const content = generateExterns({ input: fixtureFile });

            expect(content).toContain('Named.prototype.namedMember;');
            expect(content).not.toContain('anonMember');
        });

        it('should skip function declarations without identifiable name', () => {
            writeFileSync(fixtureFile, `
declare function namedFn(): void;
`);
            const content = generateExterns({ input: fixtureFile });

            expect(content).toContain('var namedFn;');
        });

        it('should handle declare const without type annotation', () => {
            writeFileSync(fixtureFile, `
declare const noType;
`);
            const content = generateExterns({ input: fixtureFile });

            expect(content).toContain('var noType;');
        });

        it('should handle fileFilter', () => {
            writeFileSync(fixtureFile, `
declare const shouldAppear: string;
`);
            const content = generateExterns({
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
            const content = generateExterns({ input: fixtureFile });

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
            const content = generateExterns({ input: fixtureFile });

            expect(content).toContain('function Hybrid() {}');
            expect(content).toContain('Hybrid.prototype.fromInterface;');
            expect(content).toContain('Hybrid.prototype.fromClass;');
            expect(content.match(/function Hybrid\(\)/g)?.length).toBe(1);
        });
    });

    describe('e2e snapshot', () => {
        it('should match the snapshot of comprehensive fixture output', () => {
            const content = generateExterns({ input: fixturePath });
            const snapshot = readFileSync(join('tests', 'snapshots', 'comprehensive.snap.js'), 'utf-8');

            expect(content).toBe(snapshot);
        });
    });
});
