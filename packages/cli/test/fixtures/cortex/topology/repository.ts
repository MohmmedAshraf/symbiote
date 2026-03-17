import { query, execute } from './db-utils';
import type { User, CreateUserInput } from './types';

export class UserRepository {
    async findById(id: string): Promise<User | null> {
        const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
        return (rows[0] as User) ?? null;
    }

    async create(input: CreateUserInput): Promise<User> {
        await execute('INSERT INTO users (name, email) VALUES (?, ?)', [input.name, input.email]);
        return { id: '1', ...input };
    }

    async findAll(): Promise<User[]> {
        return (await query('SELECT * FROM users', [])) as User[];
    }
}
