import { setupDb } from './lib/db';

export async function main(): Promise<void> {
    const db = setupDb();
    console.log('App started with db:', db);
}
