import { validateEmail, generateId } from './utils.js';
import type { User, CreateUserInput } from './types.js';

export class UserService {
    private users: Map<string, User> = new Map();

    create(input: CreateUserInput): User {
        validateEmail(input.name);
        const user: User = { id: generateId(), ...input };
        this.users.set(user.id, user);
        return user;
    }

    findById(id: string): User | undefined {
        return this.users.get(id);
    }
}

export function createDefaultService(): UserService {
    return new UserService();
}
