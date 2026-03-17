import { UserService } from './service';
import { UserRepository } from './repository';
import { parseBody, validateInput } from './middleware';
import type { Request, Response } from './middleware';

const repo = new UserRepository();
const service = new UserService(repo);

export async function handleCreate(req: Request, res: Response): Promise<void> {
    const body = parseBody(req);
    const valid = await validateInput(body);
    if (!valid) {
        res.status(400).json({ error: 'invalid input' });
        return;
    }
    const data = body as { name: string; email: string };
    const user = await service.createUser(data.name, data.email);
    res.json(user);
}

export async function handleGet(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    const user = await service.getUser(id);
    if (!user) {
        res.status(404).json({ error: 'not found' });
        return;
    }
    res.json(user);
}
