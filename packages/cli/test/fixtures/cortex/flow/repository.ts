export interface DbRow {
    id: string;
    [key: string]: unknown;
}

export class UserRepository {
    private data: Map<string, DbRow> = new Map();

    async insert(row: DbRow): Promise<DbRow> {
        this.data.set(row.id, row);
        return row;
    }

    async findById(id: string): Promise<DbRow | null> {
        return this.data.get(id) ?? null;
    }

    async update(id: string, fields: Partial<DbRow>): Promise<DbRow | null> {
        const existing = this.data.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...fields };
        this.data.set(id, updated);
        return updated;
    }
}
