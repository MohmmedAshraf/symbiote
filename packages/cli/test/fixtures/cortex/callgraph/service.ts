import { validate } from './utils';
import type { IUserService } from './types';

export class UserService implements IUserService {
    async create(data: unknown): Promise<unknown> {
        if (!validate(data)) {
            throw new Error('Invalid');
        }
        return { id: '1', ...(data as object) };
    }

    async findById(id: string): Promise<unknown> {
        return null;
    }
}
