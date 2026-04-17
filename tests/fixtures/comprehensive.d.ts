// Comprehensive fixture for e2e testing.
// Covers: namespaces, interfaces, classes, global vars, global functions,
// inline object type literals, interface augmentation, and nested namespaces.

declare namespace TestLib {
    interface App {
        init(): void;
        run(): void;
        env: { DATA_PATH: string; };
    }

    interface Config {
        debug: boolean;
        options: {
            verbose: boolean;
            level: number;
        };
    }

    interface Logger {
        log(msg: string): void;
        warn(msg: string): void;
    }

    class EventEmitter {
        on(event: string, fn: (...args: unknown[]) => void): void;
        emit(event: string): void;
    }

    // Type alias (should be ignored by visitor)
    type AnyObject = Record<string, unknown>;
}

// Augmented interface (same namespace, different block)
declare namespace TestLib {
    interface App {
        destroy(): void;
    }
}

// Nested namespace
declare namespace TestLib {
    namespace Inner {
        interface Util {
            format(s: string): string;
        }
    }
}

// Top-level interface (not in namespace)
interface TopPlugin {
    activate(): void;
    deactivate(): void;
}

// Augmented top-level interface
interface TopPlugin {
    reload(): void;
}

// Global variable with qualified type reference
declare const app: TestLib.App;

// Global variable with simple type reference
declare const plugin: TopPlugin;

// Global variable without type annotation
declare const VERSION;

// Global variable with non-interface type (no member expansion)
declare let counter: number;

// Global functions
declare function bootstrap(): void;
declare function shutdown(): void;

// Globals to be excluded in tests
declare function debugHelper(): void;
declare const tempVar: string;

// Cross-namespace same-name interface (members should be merged)
declare namespace AnotherLib {
    interface Logger {
        error(msg: string): void;
    }
}

// Top-level class (not in namespace)
declare class Timer {
    start(): void;
    stop(): void;
}
