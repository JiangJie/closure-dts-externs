import { writeFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Context passed to the `exclude` filter callback.
 */
export interface ExcludeContext {
    /** The kind of declaration being visited. */
    kind: 'namespace' | 'variable' | 'function' | 'interface' | 'class' | 'member';
    /**
     * Full scope path of the declaration.
     * `undefined` for top-level declarations.
     *
     * @example
     * ```
     * 'TestLib'           // interface inside TestLib namespace
     * 'TestLib.Inner'     // interface inside nested namespace
     * 'TestLib.Logger'    // member of Logger interface in TestLib
     * 'TopPlugin'         // member of top-level interface
     * ```
     */
    scope?: string;
}

/**
 * Options for generating Closure Compiler externs.
 */
export interface GenerateOptions {
    /**
     * Path(s) to the `.d.ts` input file(s).
     *
     * @example
     * ```ts
     * // Single input
     * 'path/to/typings.d.ts'
     * // Multiple inputs
     * ['types/api.d.ts', 'types/cloud.d.ts']
     * ```
     */
    input: string | string[];

    /**
     * Path to write the generated externs file.
     * If omitted, the externs content is returned as a string without writing to disk.
     */
    output?: string;

    /**
     * Filter which source files to process.
     * By default, all files except TypeScript built-in libs are processed.
     *
     * @example
     * ```ts
     * // Only process files from a specific package
     * fileFilter: (filePath) => filePath.includes('my-typings')
     * ```
     */
    fileFilter?: (filePath: string) => boolean;

    /**
     * Filter to exclude declarations from output.
     * Return `true` to exclude, `false` to include.
     * For `namespace` kind, returning `true` skips the entire namespace and all its contents.
     *
     * @example
     * ```ts
     * // Exclude specific variables and functions
     * exclude: (name) =>
     *     name === 'console' || name.startsWith('set') || name.startsWith('clear')
     *
     * // Skip an entire namespace
     * exclude: (name, { kind }) => kind === 'namespace' && name === 'AnotherLib'
     *
     * // Exclude a specific member
     * exclude: (name, { kind, scope }) =>
     *     kind === 'member' && scope === 'TestLib.Logger' && name === 'warn'
     * ```
     */
    exclude?: (name: string, context: ExcludeContext) => boolean;
}

type ExcludeFilter = (name: string, context: ExcludeContext) => boolean;

function getNodeName(node: ts.Node): string | undefined {
    const name = (node as ts.NamedDeclaration).name;
    if (name && ts.isIdentifier(name)) {
        return name.text;
    }
    return undefined;
}

function collectMembers(node: ts.Node, prefix: string, scope: string, filter?: ExcludeFilter): Set<string> {
    const members = new Set<string>();
    ts.forEachChild(node, child => {
        const memberName = getNodeName(child);
        if (!memberName) return;
        if (filter?.(memberName, { kind: 'member', scope })) return;
        const path = prefix ? `${prefix}.${memberName}` : memberName;
        members.add(path);
        // Recursively expand inline object type literals (e.g. `env: { USER_DATA_PATH: string }`)
        if ((ts.isPropertySignature(child) || ts.isPropertyDeclaration(child)) && child.type && ts.isTypeLiteralNode(child.type)) {
            for (const nested of collectMembers(child.type, path, `${scope}.${memberName}`, filter)) {
                members.add(nested);
            }
        }
    });
    return members;
}

/**
 * Resolve the type name from a type annotation like `SomeNamespace.TypeName` or `TypeName`.
 */
function resolveTypeName(typeNode: ts.TypeNode): string | undefined {
    if (ts.isTypeReferenceNode(typeNode)) {
        const typeName = typeNode.typeName;
        if (ts.isQualifiedName(typeName)) {
            // e.g. WechatMinigame.Wx → 'Wx'
            return typeName.right.text;
        }
        // typeName is Identifier (e.g. `declare const x: Foo`)
        return (typeName as ts.Identifier).text;
    }
    return undefined;
}

function mergeMembers(map: Map<string, Set<string>>, name: string, members: Set<string>): void {
    const existing = map.get(name);
    if (existing) {
        for (const m of members) {
            existing.add(m);
        }
    } else {
        map.set(name, members);
    }
}

function visitNamespace(
    nsDecl: ts.ModuleDeclaration,
    interfaceMembers: Map<string, Set<string>>,
    namespacePath: string,
    filter?: ExcludeFilter,
): void {
    const body = nsDecl.body as ts.ModuleBody;
    ts.forEachChild(body, child => {
        if (ts.isModuleDeclaration(child) && child.name && ts.isIdentifier(child.name)) {
            const nestedName = child.name.text;
            if (filter?.(nestedName, { kind: 'namespace', scope: namespacePath })) return;
            visitNamespace(child, interfaceMembers, `${namespacePath}.${nestedName}`, filter);
        } else if (ts.isInterfaceDeclaration(child)) {
            const name = child.name.text;
            if (filter?.(name, { kind: 'interface', scope: namespacePath })) return;
            const memberScope = `${namespacePath}.${name}`;
            mergeMembers(interfaceMembers, name, collectMembers(child, '', memberScope, filter));
        } else if (ts.isClassDeclaration(child)) {
            const name = child.name?.text;
            if (!name) return;
            if (filter?.(name, { kind: 'class', scope: namespacePath })) return;
            const memberScope = `${namespacePath}.${name}`;
            mergeMembers(interfaceMembers, name, collectMembers(child, '', memberScope, filter));
        }
    });
}

interface GlobalVarInfo {
    varName: string;
    typeName?: string;
}

function buildExternsContent(
    globalVars: GlobalVarInfo[],
    globalFunctions: Set<string>,
    interfaceMembers: Map<string, Set<string>>,
): string {
    const lines: string[] = [
        '// Auto-generated by closure-dts-externs',
        '',
    ];

    // Associate global variables with their interface members
    const globalObjectMembers = new Map<string, Set<string>>();
    for (const { varName, typeName } of globalVars) {
        if (typeName && interfaceMembers.has(typeName)) {
            globalObjectMembers.set(varName, interfaceMembers.get(typeName) as Set<string>);
            interfaceMembers.delete(typeName);
        }
    }

    // 1. Global variable declarations
    const allGlobalNames = new Set<string>();
    for (const { varName } of globalVars) {
        allGlobalNames.add(varName);
    }
    for (const fn of globalFunctions) {
        allGlobalNames.add(fn);
    }

    for (const name of [...allGlobalNames].sort()) {
        lines.push(`var ${name};`);
    }
    lines.push('');

    // 2. Global object members
    const sortedGlobalObjects = [...globalObjectMembers].sort(([a], [b]) => a.localeCompare(b));
    for (const [varName, members] of sortedGlobalObjects) {
        for (const member of [...members].sort()) {
            lines.push(`${varName}.${member};`);
        }
        lines.push('');
    }

    // 3. Remaining interface/class prototype declarations
    if (interfaceMembers.size > 0) {
        const sorted = [...interfaceMembers].sort(([a], [b]) => a.localeCompare(b));
        for (const [ifaceName, members] of sorted) {
            lines.push(`function ${ifaceName}() {}`);
            for (const member of [...members].sort()) {
                lines.push(`${ifaceName}.prototype.${member};`);
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

const defaultFileFilter = (filePath: string): boolean => !filePath.includes('/typescript/lib/');

/**
 * Generate Closure Compiler externs from `.d.ts` type definitions.
 *
 * @example
 * ```ts
 * // Write to file
 * generate({ input: 'path/to/typings.d.ts', output: 'externs.js' });
 *
 * // Get as string
 * const content = generate({ input: 'path/to/typings.d.ts' });
 * ```
 */
export function generate(options: GenerateOptions): string {
    const {
        input,
        output,
        fileFilter = defaultFileFilter,
        exclude: filter,
    } = options;

    const interfaceMembers = new Map<string, Set<string>>();
    const globalVars: GlobalVarInfo[] = [];
    const globalFunctions = new Set<string>();

    const program = ts.createProgram({
        rootNames: Array.isArray(input) ? input : [input],
        options: {
            // Prevent auto-inclusion of @types/* packages, only process input and its explicit references
            types: [],
        },
    });

    for (const sourceFile of program.getSourceFiles()) {
        if (!fileFilter(sourceFile.fileName)) continue;
        ts.forEachChild(sourceFile, node => {
            if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
                const nsName = node.name.text;
                if (filter?.(nsName, { kind: 'namespace' })) return;
                visitNamespace(node, interfaceMembers, nsName, filter);
            } else if (ts.isVariableStatement(node)) {
                // declare const/var/let xxx: Type
                for (const decl of node.declarationList.declarations) {
                    const varName = getNodeName(decl);
                    if (!varName || filter?.(varName, { kind: 'variable' })) continue;
                    const typeName = decl.type ? resolveTypeName(decl.type) : undefined;
                    globalVars.push({ varName, typeName });
                }
            } else if (ts.isFunctionDeclaration(node) && node.name) {
                const fnName = getNodeName(node);
                if (fnName && !filter?.(fnName, { kind: 'function' })) {
                    globalFunctions.add(fnName);
                }
            } else if (ts.isInterfaceDeclaration(node)) {
                const name = node.name.text;
                if (filter?.(name, { kind: 'interface' })) return;
                mergeMembers(interfaceMembers, name, collectMembers(node, '', name, filter));
            } else if (ts.isClassDeclaration(node) && node.name) {
                const name = node.name.text;
                if (filter?.(name, { kind: 'class' })) return;
                mergeMembers(interfaceMembers, name, collectMembers(node, '', name, filter));
            }
        });
    }

    const content = buildExternsContent(globalVars, globalFunctions, interfaceMembers);

    if (output) {
        writeFileSync(output, content);

        const totalMembers = [...interfaceMembers.values()].reduce((sum, m) => sum + m.size, 0);
        console.info(`Generated ${output}`);
        console.info(`  global vars: ${globalVars.length}, global functions: ${globalFunctions.size}`);
        console.info(`  interface/class types: ${interfaceMembers.size}, total members: ${totalMembers}`);
    }

    return content;
}
