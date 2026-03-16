import { UserService, createDefaultService } from './service.js';
import { formatName } from './utils.js';
import { UserRole } from './types.js';

const service = createDefaultService();
const user = service.create({
    name: formatName('Alice'),
    role: UserRole.Admin,
});
console.log(service.findById(user.id));
