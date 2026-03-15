import { formatName } from './utils.js';

export class UserService {
    create(name: string) {
        return { id: crypto.randomUUID(), name: formatName(name) };
    }
}
