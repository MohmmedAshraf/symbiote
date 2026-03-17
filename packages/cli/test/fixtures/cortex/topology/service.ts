import { UserRepository } from './repository';
import type { User, CreateUserInput } from './types';

export class UserService {
    private repo = new UserRepository();

    async getUser(id: string): Promise<User | null> {
        return this.repo.findById(id);
    }

    async createUser(input: CreateUserInput): Promise<User> {
        return this.repo.create(input);
    }

    async listUsers(): Promise<User[]> {
        return this.repo.findAll();
    }
}
