import { describe, it, expect } from 'vitest';
import { parseFile } from '#core/parser.js';
import path from 'node:path';

const ML = path.join(import.meta.dirname, '../fixtures/multilang');

function parse(file: string) {
    const result = parseFile(path.join(ML, file));
    expect(result).not.toBeNull();
    return result!;
}

function nodeNames(file: string, type: string): string[] {
    return parse(file)
        .nodes.filter((n) => n.type === type)
        .map((n) => n.name);
}

function edgeCount(file: string, type: string): number {
    return parse(file).edges.filter((e) => e.type === type).length;
}

describe('Python parser', () => {
    const file = 'sample.py';

    it('extracts classes', () => {
        expect(nodeNames(file, 'class')).toEqual(['UserService']);
    });

    it('extracts methods inside classes', () => {
        const methods = nodeNames(file, 'method');
        expect(methods).toContain('UserService.__init__');
        expect(methods).toContain('UserService.find_by_id');
        expect(methods).toContain('UserService.create');
    });

    it('extracts top-level functions', () => {
        const fns = nodeNames(file, 'function');
        expect(fns).toContain('validate_email');
        expect(fns).toContain('generate_id');
    });

    it('does not extract methods as top-level functions', () => {
        const fns = nodeNames(file, 'function');
        expect(fns).not.toContain('__init__');
        expect(fns).not.toContain('find_by_id');
    });

    it('extracts import edges', () => {
        expect(edgeCount(file, 'imports')).toBe(2);
    });

    it('detects call expressions', () => {
        expect(edgeCount(file, 'calls')).toBeGreaterThanOrEqual(2);
    });

    it('generates contains edges for all non-file nodes', () => {
        const r = parse(file);
        const nonFileNodes = r.nodes.filter((n) => n.type !== 'file');
        const containsEdges = r.edges.filter((e) => e.type === 'contains');
        expect(containsEdges).toHaveLength(nonFileNodes.length);
    });
});

describe('Go parser', () => {
    const file = 'sample.go';

    it('extracts struct types as classes', () => {
        expect(nodeNames(file, 'class')).toContain('User');
    });

    it('extracts functions including method declarations', () => {
        const fns = nodeNames(file, 'function');
        expect(fns).toContain('NewUser');
        expect(fns).toContain('FullName');
        expect(fns).toContain('generateID');
    });

    it('extracts import edges', () => {
        expect(edgeCount(file, 'imports')).toBeGreaterThanOrEqual(1);
    });

    it('detects call expressions', () => {
        expect(edgeCount(file, 'calls')).toBeGreaterThanOrEqual(2);
    });
});

describe('Rust parser', () => {
    const file = 'sample.rs';

    it('extracts structs as classes', () => {
        const classes = nodeNames(file, 'class');
        expect(classes).toContain('UserStore');
        expect(classes).toContain('User');
    });

    it('extracts traits as interfaces', () => {
        expect(nodeNames(file, 'interface')).toContain('Repository');
    });

    it('extracts enums', () => {
        expect(nodeNames(file, 'enum')).toContain('UserRole');
    });

    it('extracts type aliases', () => {
        expect(nodeNames(file, 'type_alias')).toContain('UserId');
    });

    it('extracts top-level functions', () => {
        const fns = nodeNames(file, 'function');
        expect(fns).toContain('create_user');
        expect(fns).toContain('generate_id');
    });

    it('extracts use declarations as imports', () => {
        expect(edgeCount(file, 'imports')).toBeGreaterThanOrEqual(1);
    });

    it('detects call expressions', () => {
        expect(edgeCount(file, 'calls')).toBeGreaterThanOrEqual(2);
    });
});

describe('Java parser', () => {
    const file = 'Sample.java';

    it('extracts classes', () => {
        const classes = nodeNames(file, 'class');
        expect(classes).toContain('Sample');
        expect(classes).toContain('User');
    });

    it('extracts methods from classes', () => {
        const methods = nodeNames(file, 'method');
        expect(methods).toContain('Sample.createUser');
        expect(methods).toContain('Sample.findById');
        expect(methods).toContain('User.getId');
    });

    it('extracts enums', () => {
        expect(nodeNames(file, 'enum')).toContain('UserRole');
    });

    it('extracts interfaces', () => {
        expect(nodeNames(file, 'interface')).toContain('Repository');
    });

    it('extracts import edges', () => {
        expect(edgeCount(file, 'imports')).toBe(2);
    });

    it('detects call expressions', () => {
        expect(edgeCount(file, 'calls')).toBeGreaterThanOrEqual(3);
    });
});

describe('Ruby parser', () => {
    const file = 'sample.rb';

    it('extracts classes and modules', () => {
        const classes = nodeNames(file, 'class');
        expect(classes).toContain('UserService');
        expect(classes).toContain('Helpers');
    });

    it('extracts methods inside classes', () => {
        const methods = nodeNames(file, 'method');
        expect(methods).toContain('UserService.initialize');
        expect(methods).toContain('UserService.find_by_id');
        expect(methods).toContain('Helpers.format_name');
    });

    it('extracts top-level functions', () => {
        const fns = nodeNames(file, 'function');
        expect(fns).toContain('validate_email');
        expect(fns).toContain('generate_id');
    });

    it('detects call expressions', () => {
        expect(edgeCount(file, 'calls')).toBeGreaterThanOrEqual(2);
    });
});

describe('PHP parser', () => {
    const file = 'sample.php';

    it('extracts classes', () => {
        expect(nodeNames(file, 'class')).toContain('UserService');
    });

    it('extracts methods from classes', () => {
        const methods = nodeNames(file, 'method');
        expect(methods).toContain('UserService.create');
        expect(methods).toContain('UserService.findById');
    });

    it('extracts interfaces', () => {
        expect(nodeNames(file, 'interface')).toContain('Repository');
    });

    it('extracts enums', () => {
        expect(nodeNames(file, 'enum')).toContain('UserRole');
    });

    it('extracts top-level functions', () => {
        expect(nodeNames(file, 'function')).toContain('validate_email');
    });
});

describe('C parser', () => {
    const file = 'sample.c';

    it('extracts typedef structs as classes', () => {
        expect(nodeNames(file, 'class')).toContain('User');
    });

    it('extracts typedef enums', () => {
        expect(nodeNames(file, 'enum')).toContain('UserRole');
    });

    it('extracts functions', () => {
        const fns = nodeNames(file, 'function');
        expect(fns).toContain('create_user');
        expect(fns).toContain('generate_id');
        expect(fns).toContain('print_user');
    });

    it('extracts #include as import edges', () => {
        expect(edgeCount(file, 'imports')).toBe(3);
    });

    it('detects call expressions', () => {
        expect(edgeCount(file, 'calls')).toBeGreaterThanOrEqual(3);
    });
});

describe('C++ parser', () => {
    const file = 'sample.cpp';

    it('extracts classes', () => {
        const classes = nodeNames(file, 'class');
        expect(classes).toContain('User');
        expect(classes).toContain('UserStore');
    });

    it('extracts top-level functions', () => {
        const fns = nodeNames(file, 'function');
        expect(fns).toContain('generate_id');
        expect(fns).toContain('create_user');
    });

    it('extracts #include as import edges', () => {
        expect(edgeCount(file, 'imports')).toBe(3);
    });

    it('detects call expressions', () => {
        expect(edgeCount(file, 'calls')).toBeGreaterThanOrEqual(2);
    });
});

describe('parser internals', () => {
    it('sets correct language in result', () => {
        expect(parse('sample.py').language).toBe('python');
        expect(parse('sample.go').language).toBe('go');
        expect(parse('sample.rs').language).toBe('rust');
        expect(parse('Sample.java').language).toBe('java');
        expect(parse('sample.rb').language).toBe('ruby');
        expect(parse('sample.php').language).toBe('php');
        expect(parse('sample.c').language).toBe('c');
        expect(parse('sample.cpp').language).toBe('cpp');
    });

    it('always includes a file node as the first node', () => {
        for (const file of [
            'sample.py',
            'sample.go',
            'sample.rs',
            'Sample.java',
            'sample.rb',
            'sample.php',
            'sample.c',
            'sample.cpp',
        ]) {
            const r = parse(file);
            expect(r.nodes[0].type).toBe('file');
            expect(r.nodes[0].id).toMatch(/^file:/);
        }
    });

    it('all non-file nodes have valid line ranges', () => {
        for (const file of ['sample.py', 'sample.go', 'sample.rs', 'Sample.java']) {
            const r = parse(file);
            for (const node of r.nodes) {
                expect(node.lineStart).toBeGreaterThan(0);
                expect(node.lineEnd).toBeGreaterThanOrEqual(node.lineStart);
            }
        }
    });

    it('returns null for unsupported file types', () => {
        expect(parseFile('/tmp/test.txt')).toBeNull();
        expect(parseFile('/tmp/test.md')).toBeNull();
    });

    it('returns null for non-existent files', () => {
        expect(parseFile('/nonexistent/file.py')).toBeNull();
    });

    it('can parse from content string without file on disk', () => {
        const content = 'def hello():\n    pass\n';
        const result = parseFile('/virtual/test.py', content);
        expect(result).not.toBeNull();
        expect(result!.nodes.some((n) => n.name === 'hello')).toBe(true);
    });
});
