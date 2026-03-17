import { UserRepository } from './repository';
import type { DbRow } from './repository';

export class UserService {
    constructor(private repo: UserRepository) {}

    async createUser(name: string, email: string): Promise<DbRow> {
        const row: DbRow = { id: crypto.randomUUID(), name, email };
        return this.repo.insert(row);
    }

    async getUser(id: string): Promise<DbRow | null> {
        return this.repo.findById(id);
    }

    async updateEmail(id: string, email: string): Promise<DbRow | null> {
        return this.repo.update(id, { email });
    }
}
