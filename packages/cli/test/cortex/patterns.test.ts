import { describe, it, expect } from 'vitest';
import {
    detectGodClasses,
    detectCircularDependencies,
    detectLayerViolations,
    detectBarrelAbuse,
    detectComplexityHotspots,
    detectFeatureEnvy,
    detectShotgunSurgery,
} from '../../src/cortex/patterns.js';

describe('Pattern Detector', () => {
    describe('detectGodClasses', () => {
        it('flags classes with method count above threshold', () => {
            const classMetrics = [
                {
                    nodeId: 'class:god-class.ts:GodService',
                    name: 'GodService',
                    filePath: 'god-class.ts',
                    methodCount: 16,
                    betweenness: 0.4,
                },
            ];
            const findings = detectGodClasses(classMetrics, { methodThreshold: 10 });
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('god_class');
            expect(findings[0].severity).toBe('warning');
            expect(findings[0].nodeIds).toContain('class:god-class.ts:GodService');
        });

        it('does not flag small classes', () => {
            const classMetrics = [
                {
                    nodeId: 'class:clean.ts:CleanService',
                    name: 'CleanService',
                    filePath: 'clean.ts',
                    methodCount: 4,
                    betweenness: 0.1,
                },
            ];
            const findings = detectGodClasses(classMetrics, { methodThreshold: 10 });
            expect(findings).toHaveLength(0);
        });

        it('escalates to error severity when betweenness is also high', () => {
            const classMetrics = [
                {
                    nodeId: 'class:god.ts:Mega',
                    name: 'Mega',
                    filePath: 'god.ts',
                    methodCount: 20,
                    betweenness: 0.7,
                },
            ];
            const findings = detectGodClasses(classMetrics, {
                methodThreshold: 10,
                betweennessThreshold: 0.5,
            });
            expect(findings[0].severity).toBe('error');
        });
    });

    describe('detectCircularDependencies', () => {
        it('detects direct circular imports between two files', () => {
            const importEdges = [
                { sourceId: 'file:a.ts', targetId: 'file:b.ts' },
                { sourceId: 'file:b.ts', targetId: 'file:a.ts' },
            ];
            const findings = detectCircularDependencies(importEdges);
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('circular_dependency');
        });

        it('detects transitive cycles', () => {
            const importEdges = [
                { sourceId: 'file:a.ts', targetId: 'file:b.ts' },
                { sourceId: 'file:b.ts', targetId: 'file:c.ts' },
                { sourceId: 'file:c.ts', targetId: 'file:a.ts' },
            ];
            const findings = detectCircularDependencies(importEdges);
            expect(findings).toHaveLength(1);
            expect(findings[0].nodeIds).toHaveLength(3);
        });

        it('returns empty for acyclic graphs', () => {
            const importEdges = [
                { sourceId: 'file:a.ts', targetId: 'file:b.ts' },
                { sourceId: 'file:b.ts', targetId: 'file:c.ts' },
            ];
            const findings = detectCircularDependencies(importEdges);
            expect(findings).toHaveLength(0);
        });
    });

    describe('detectLayerViolations', () => {
        it('detects controller importing from repository', () => {
            const layers = [
                { nodeId: 'file:ctrl.ts', layer: 'controller' as const, confidence: 0.9 },
                { nodeId: 'file:repo.ts', layer: 'repository' as const, confidence: 0.9 },
            ];
            const edges = [{ sourceId: 'file:ctrl.ts', targetId: 'file:repo.ts' }];
            const findings = detectLayerViolations(layers, edges);
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('layer_violation');
        });

        it('allows controller importing from service', () => {
            const layers = [
                { nodeId: 'file:ctrl.ts', layer: 'controller' as const, confidence: 0.9 },
                { nodeId: 'file:svc.ts', layer: 'service' as const, confidence: 0.9 },
            ];
            const edges = [{ sourceId: 'file:ctrl.ts', targetId: 'file:svc.ts' }];
            const findings = detectLayerViolations(layers, edges);
            expect(findings).toHaveLength(0);
        });

        it('detects database layer importing from controller', () => {
            const layers = [
                { nodeId: 'file:db.ts', layer: 'database' as const, confidence: 0.9 },
                { nodeId: 'file:ctrl.ts', layer: 'controller' as const, confidence: 0.9 },
            ];
            const edges = [{ sourceId: 'file:db.ts', targetId: 'file:ctrl.ts' }];
            const findings = detectLayerViolations(layers, edges);
            expect(findings).toHaveLength(1);
        });
    });

    describe('detectBarrelAbuse', () => {
        it('flags re-export chains exceeding threshold', () => {
            const reExportChains = [
                {
                    symbolName: 'helperA',
                    chain: ['index.ts', 'barrel-1.ts', 'barrel-2.ts', 'barrel-3.ts', 'source.ts'],
                },
            ];
            const findings = detectBarrelAbuse(reExportChains, { maxHops: 3 });
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('barrel_abuse');
        });

        it('allows chains within threshold', () => {
            const reExportChains = [
                {
                    symbolName: 'add',
                    chain: ['index.ts', 'utils.ts'],
                },
            ];
            const findings = detectBarrelAbuse(reExportChains, { maxHops: 3 });
            expect(findings).toHaveLength(0);
        });
    });

    describe('detectComplexityHotspots', () => {
        it('combines PageRank and betweenness for hotspot scoring', () => {
            const nodeMetrics = [
                {
                    nodeId: 'fn:hot.ts:criticalPath',
                    name: 'criticalPath',
                    filePath: 'hot.ts',
                    pageRank: 0.8,
                    betweenness: 0.7,
                    lineCount: 200,
                },
                {
                    nodeId: 'fn:cold.ts:simpleHelper',
                    name: 'simpleHelper',
                    filePath: 'cold.ts',
                    pageRank: 0.01,
                    betweenness: 0.01,
                    lineCount: 5,
                },
            ];
            const findings = detectComplexityHotspots(nodeMetrics, {
                topN: 1,
                minScore: 0.3,
            });
            expect(findings).toHaveLength(1);
            expect(findings[0].nodeIds).toContain('fn:hot.ts:criticalPath');
            expect(findings[0].kind).toBe('complexity_hotspot');
        });
    });

    describe('detectFeatureEnvy', () => {
        it('flags functions that reference another module more than their own', () => {
            const callPatterns = [
                {
                    nodeId: 'fn:a.ts:process',
                    name: 'process',
                    filePath: 'a.ts',
                    callsByTarget: { 'b.ts': 8, 'a.ts': 1 },
                },
            ];
            const findings = detectFeatureEnvy(callPatterns, { ratio: 3 });
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('feature_envy');
        });

        it('does not flag balanced call distribution', () => {
            const callPatterns = [
                {
                    nodeId: 'fn:a.ts:balanced',
                    name: 'balanced',
                    filePath: 'a.ts',
                    callsByTarget: { 'b.ts': 3, 'a.ts': 3 },
                },
            ];
            const findings = detectFeatureEnvy(callPatterns, { ratio: 3 });
            expect(findings).toHaveLength(0);
        });
    });

    describe('detectShotgunSurgery', () => {
        it('flags nodes whose dependents span many files', () => {
            const dependencySpans = [
                {
                    nodeId: 'fn:core.ts:sharedConfig',
                    name: 'sharedConfig',
                    filePath: 'core.ts',
                    dependentFiles: [
                        'a.ts',
                        'b.ts',
                        'c.ts',
                        'd.ts',
                        'e.ts',
                        'f.ts',
                        'g.ts',
                        'h.ts',
                        'i.ts',
                        'j.ts',
                    ],
                },
            ];
            const findings = detectShotgunSurgery(dependencySpans, {
                fileThreshold: 8,
            });
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('shotgun_surgery');
        });
    });
});
