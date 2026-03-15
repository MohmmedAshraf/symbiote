export interface User {
    id: string;
    name: string;
    email: string;
}

export type CreateUserInput = Omit<User, 'id'>;
