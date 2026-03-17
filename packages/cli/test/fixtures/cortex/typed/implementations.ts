import type { IUserService, IRepository, User } from './interfaces';

export class UserService implements IUserService {
    constructor(private repo: IRepository<User>) {}

    async create(data: { name: string; email: string }): Promise<User> {
        const user: User = { id: crypto.randomUUID(), ...data };
        return this.repo.insert(user);
    }

    async findById(id: string): Promise<User | null> {
        return this.repo.findOne(id);
    }

    async delete(id: string): Promise<void> {
        // no-op
    }
}

export class InMemoryUserRepo implements IRepository<User> {
    private store = new Map<string, User>();

    async insert(item: User): Promise<User> {
        this.store.set(item.id, item);
        return item;
    }

    async findOne(id: string): Promise<User | null> {
        return this.store.get(id) ?? null;
    }

    async findAll(): Promise<User[]> {
        return Array.from(this.store.values());
    }
}
