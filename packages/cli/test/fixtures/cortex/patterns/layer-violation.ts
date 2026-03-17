import { query } from '../topology/db-utils';

export async function handleDirectDbAccess(id: string): Promise<unknown> {
    return query('SELECT * FROM users WHERE id = ?', [id]);
}
