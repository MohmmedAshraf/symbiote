import { UserService } from './service';
import { formatResponse } from './utils';

const service = new UserService();

export async function handleCreate(body: unknown): Promise<string> {
    const result = await service.create(body);
    return formatResponse(result);
}

export async function handleGet(id: string): Promise<string> {
    const result = await service.findById(id);
    return formatResponse(result);
}
