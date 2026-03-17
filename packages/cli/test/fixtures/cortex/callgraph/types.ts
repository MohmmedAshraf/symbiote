export interface IUserService {
    create(data: unknown): Promise<unknown>;
    findById(id: string): Promise<unknown>;
}
