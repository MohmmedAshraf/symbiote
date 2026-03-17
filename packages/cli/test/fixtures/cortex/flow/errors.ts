import { UserService } from './service';
import { UserRepository } from './repository';

const repo = new UserRepository();
const service = new UserService(repo);

export async function safeCreate(name: string, email: string): Promise<unknown> {
    try {
        const result = await service.createUser(name, email);
        return { ok: true, data: result };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export async function riskyUpdate(id: string, email: string): Promise<void> {
    const result = await service.updateEmail(id, email);
    if (!result) {
        throw new Error(`User ${id} not found`);
    }
}
