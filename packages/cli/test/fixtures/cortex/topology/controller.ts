import { UserService } from './service';
import type { CreateUserInput } from './types';
import { formatResponse } from './helpers';

const service = new UserService();

export async function handleGetUser(id: string): Promise<unknown> {
    const user = await service.getUser(id);
    return formatResponse(user);
}

export async function handleCreateUser(input: CreateUserInput): Promise<unknown> {
    const user = await service.createUser(input);
    return formatResponse(user);
}

export async function handleListUsers(): Promise<unknown> {
    const users = await service.listUsers();
    return formatResponse(users);
}
