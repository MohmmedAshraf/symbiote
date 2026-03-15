import { UserService } from './service.js';

const service = new UserService();
const user = service.create({ name: 'Alice', email: 'alice@test.com' });
console.log(service.findById(user.id));
