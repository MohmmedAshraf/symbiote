export interface Request {
    body: unknown;
    params: Record<string, string>;
    query: Record<string, string>;
}

export interface Response {
    json(data: unknown): void;
    status(code: number): Response;
}

export function parseBody(req: Request): unknown {
    return req.body;
}

export async function validateInput(data: unknown): Promise<boolean> {
    return data !== null && data !== undefined;
}
