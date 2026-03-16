import { describe, it, expect } from 'vitest';
import { parseFile } from '../../src/core/parser.js';
import path from 'node:path';

const FIXTURES = path.join(import.meta.dirname, '../fixtures');
const DEEP_FIXTURES = path.join(import.meta.dirname, '../fixtures/deep-parse-project');

describe('parseFile', () => {
    it('extracts functions from a JavaScript file', () => {
        const result = parseFile(path.join(FIXTURES, 'simple-project/utils.js'));

        expect(result).toBeDefined();
        const functions = result!.nodes.filter((n) => n.type === 'function');
        expect(functions.length).toBeGreaterThanOrEqual(2);

        const greet = functions.find((f) => f.name === 'greet');
        expect(greet).toBeDefined();
        expect(greet!.lineStart).toBeGreaterThan(0);
    });

    it('extracts imports from a JavaScript file', () => {
        const result = parseFile(path.join(FIXTURES, 'simple-project/index.js'));

        expect(result).toBeDefined();
        const imports = result!.edges.filter((e) => e.type === 'imports');
        expect(imports.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts classes from a TypeScript file', () => {
        const result = parseFile(path.join(FIXTURES, 'ts-project/service.ts'));

        expect(result).toBeDefined();
        const classes = result!.nodes.filter((n) => n.type === 'class');
        expect(classes.length).toBeGreaterThanOrEqual(1);

        const userService = classes.find((f) => f.name === 'UserService');
        expect(userService).toBeDefined();
    });

    it('extracts methods from classes', () => {
        const result = parseFile(path.join(FIXTURES, 'ts-project/service.ts'));

        expect(result).toBeDefined();
        const methods = result!.nodes.filter((n) => n.type === 'method');
        expect(methods.length).toBeGreaterThanOrEqual(2);
    });

    it('parses TypeScript config files', () => {
        const result = parseFile(path.join(FIXTURES, '../vitest.config.ts'));
        expect(result).toBeDefined();
    });

    it('returns null for non-existent files', () => {
        const result = parseFile('/nonexistent/file.js');
        expect(result).toBeNull();
    });
});

describe('type node extraction', () => {
    it('extracts interface declarations', () => {
        const result = parseFile(path.join(DEEP_FIXTURES, 'types.ts'));
        expect(result).toBeDefined();
        const interfaces = result!.nodes.filter((n) => n.type === 'interface');
        expect(interfaces).toHaveLength(1);
        expect(interfaces[0].name).toBe('User');
        expect(interfaces[0].id).toBe(`interface:${path.join(DEEP_FIXTURES, 'types.ts')}:User`);
    });

    it('extracts type alias declarations', () => {
        const result = parseFile(path.join(DEEP_FIXTURES, 'types.ts'));
        const types = result!.nodes.filter((n) => n.type === 'type_alias');
        expect(types).toHaveLength(1);
        expect(types[0].name).toBe('CreateUserInput');
    });

    it('extracts enum declarations', () => {
        const result = parseFile(path.join(DEEP_FIXTURES, 'types.ts'));
        const enums = result!.nodes.filter((n) => n.type === 'enum');
        expect(enums).toHaveLength(1);
        expect(enums[0].name).toBe('UserRole');
    });
});
