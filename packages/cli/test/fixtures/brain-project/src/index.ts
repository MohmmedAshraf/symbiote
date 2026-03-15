import { UserService } from './service.js';
import { formatName } from './utils.js';

const service = new UserService();
const user = service.create('Alice');
console.log(formatName(user));
