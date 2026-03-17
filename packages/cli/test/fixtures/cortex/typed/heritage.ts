import type { User } from './interfaces';

export abstract class BaseEntity {
    abstract validate(): boolean;
    toJSON(): string {
        return JSON.stringify(this);
    }
}

export class UserEntity extends BaseEntity {
    constructor(public data: User) {
        super();
    }

    validate(): boolean {
        return this.data.email.includes('@');
    }

    getDisplayName(): string {
        return this.data.name;
    }
}

export class AdminEntity extends UserEntity {
    isAdmin(): boolean {
        return true;
    }
}
