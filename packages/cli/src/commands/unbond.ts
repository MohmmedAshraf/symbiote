import * as p from '@clack/prompts';
import pc from 'picocolors';

export async function cmdUnbond(targetId?: string): Promise<void> {
    const { detectInstalledAgents, isBonded, disconnectWithHooks } =
        await import('#init/agent-connector.js');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Detaching'));

    const agents = detectInstalledAgents();
    const bonded = agents.filter((a) => a.installed && isBonded(a));

    if (bonded.length === 0) {
        p.outro('No bonded hosts found.');
        return;
    }

    const toUnbond = targetId ? bonded.filter((a) => a.id === targetId) : bonded;

    if (targetId && toUnbond.length === 0) {
        p.log.error(`Host not found or not bonded: ${targetId}`);
        p.outro('');
        return;
    }

    for (const agent of toUnbond) {
        const result = disconnectWithHooks(agent);
        if (result.mcp.success) {
            p.log.success(`Detached from ${agent.name}`);
        } else {
            p.log.error(`Failed to detach from ${agent.name}: ${result.mcp.message}`);
        }
    }

    p.outro('Symbiote detached.');
}
