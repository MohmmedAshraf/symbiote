<?php

namespace App\Models;

use App\Contracts\Repository;

class UserService
{
    private array $users = [];

    public function create(string $name): array
    {
        $id = $this->generateId();
        $user = ['id' => $id, 'name' => $name];
        $this->users[$id] = $user;
        return $user;
    }

    public function findById(string $id): ?array
    {
        return $this->users[$id] ?? null;
    }

    private function generateId(): string
    {
        return uniqid();
    }
}

interface Repository
{
    public function find(string $id): mixed;
    public function save(array $data): void;
}

enum UserRole: string
{
    case Admin = 'admin';
    case Member = 'member';
    case Guest = 'guest';
}

function validate_email(string $email): bool
{
    return str_contains($email, '@');
}
