import { validateEmail } from './utils';
import type { User } from './types';

export class UserService {
    async create(data: { name: string; email: string }): Promise<User> {
        if (!validateEmail(data.email)) {
            throw new Error('Invalid email');
        }
        return { id: '1', ...data };
    }

    async findById(id: string): Promise<User | null> {
        return null;
    }
}
