import type { User, CreateUserInput } from './types.js';

export class UserService {
    private users: Map<string, User> = new Map();

    create(input: CreateUserInput): User {
        const user: User = { id: crypto.randomUUID(), ...input };
        this.users.set(user.id, user);
        return user;
    }

    findById(id: string): User | undefined {
        return this.users.get(id);
    }
}
