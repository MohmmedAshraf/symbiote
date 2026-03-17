export interface IUserService {
    create(data: { name: string; email: string }): Promise<User>;
    findById(id: string): Promise<User | null>;
    delete(id: string): Promise<void>;
}

export interface IRepository<T> {
    insert(item: T): Promise<T>;
    findOne(id: string): Promise<T | null>;
    findAll(): Promise<T[]>;
}

export interface User {
    id: string;
    name: string;
    email: string;
}
