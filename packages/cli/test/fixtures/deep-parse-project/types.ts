export interface User {
    id: string;
    name: string;
    role: UserRole;
}

export type CreateUserInput = Omit<User, 'id'>;

export enum UserRole {
    Admin = 'admin',
    Member = 'member',
    Guest = 'guest',
}
