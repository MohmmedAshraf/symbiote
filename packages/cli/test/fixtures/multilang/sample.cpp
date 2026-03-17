#include <string>
#include <map>
#include <iostream>

class User {
public:
    std::string id;
    std::string name;

    User(const std::string& id, const std::string& name)
        : id(id), name(name) {}

    std::string full_name() const {
        return "User: " + name;
    }
};

class UserStore {
private:
    std::map<std::string, User> users;

public:
    void save(const User& user) {
        users[user.id] = user;
    }

    User* find(const std::string& id) {
        auto it = users.find(id);
        if (it != users.end()) return &it->second;
        return nullptr;
    }
};

std::string generate_id() {
    return "uuid-placeholder";
}

User create_user(const std::string& name) {
    return User(generate_id(), name);
}
