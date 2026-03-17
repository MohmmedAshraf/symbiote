import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    handleGetConstraintsDeprecated,
    handleGetDecisionsDeprecated,
    handleProposeDecisionDeprecated,
    handleProposeConstraintDeprecated,
} from '../../../src/mcp/tools/intent-tools.js';
import { handleRecordInstructionDeprecated } from '../../../src/mcp/tools/dna-tools.js';
import type { ServerContext } from '../../../src/mcp/context.js';

describe('Deprecated Tools', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('get_constraints logs deprecation warning', async () => {
        const mockCtx = {
            intent: {
                listEntries: vi.fn().mockResolvedValue([]),
            },
        } as unknown as ServerContext;
        await handleGetConstraintsDeprecated(mockCtx, {});
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('get_constraints is deprecated'),
        );
    });

    it('get_decisions logs deprecation warning', async () => {
        const mockCtx = {
            intent: {
                listEntries: vi.fn().mockResolvedValue([]),
            },
        } as unknown as ServerContext;
        await handleGetDecisionsDeprecated(mockCtx, {});
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('get_decisions is deprecated'),
        );
    });

    it('propose_decision logs deprecation warning', () => {
        const mockCtx = {
            intent: {
                writeEntry: vi.fn(),
            },
        } as unknown as ServerContext;
        handleProposeDecisionDeprecated(mockCtx, {
            id: 'test',
            content: 'test',
            scope: 'global',
        });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('propose_decision is deprecated'),
        );
    });

    it('propose_constraint logs deprecation warning', () => {
        const mockCtx = {
            intent: {
                writeEntry: vi.fn(),
            },
        } as unknown as ServerContext;
        handleProposeConstraintDeprecated(mockCtx, {
            id: 'test',
            content: 'test',
            scope: 'global',
        });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('propose_constraint is deprecated'),
        );
    });

    it('record_instruction logs deprecation warning', () => {
        const mockCtx = {
            dnaEngine: {
                captureInstruction: vi.fn().mockReturnValue({
                    frontmatter: { id: 'test' },
                    content: 'test',
                }),
            },
        } as unknown as ServerContext;
        handleRecordInstructionDeprecated(mockCtx, {
            instruction: 'test',
            sessionId: 'test',
            isExplicit: false,
        });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('record_instruction is deprecated'),
        );
    });
});
