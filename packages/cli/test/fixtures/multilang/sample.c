#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char id[37];
    char name[100];
} User;

typedef enum {
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLE_GUEST
} UserRole;

User* create_user(const char* name) {
    User* user = malloc(sizeof(User));
    strcpy(user->name, name);
    generate_id(user->id);
    return user;
}

void generate_id(char* buffer) {
    strcpy(buffer, "uuid-placeholder");
}

void print_user(const User* user) {
    printf("User: %s (%s)\n", user->name, user->id);
}
