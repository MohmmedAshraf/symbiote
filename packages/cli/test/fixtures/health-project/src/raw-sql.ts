import { db } from './db.js';

export function getUsers() {
    return db.execute('SELECT * FROM users');
}

export function getUserById(id: string) {
    return db.execute(`SELECT * FROM users WHERE id = '${id}'`);
}
