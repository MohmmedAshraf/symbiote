import { UserService, InMemoryUserRepo } from './implementations';
import type { User } from './interfaces';

const repo = new InMemoryUserRepo();
const service = new UserService(repo);

export async function createUser(name: string, email: string): Promise<User> {
    const result = await service.create({ name, email });
    return result;
}

export function getServiceType(): typeof service {
    return service;
}

const adminEmail = 'admin@example.com';
const isValid = adminEmail.includes('@');
