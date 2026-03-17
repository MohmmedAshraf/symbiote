import java.util.HashMap;
import java.util.Optional;

public class Sample {
    private HashMap<String, User> users = new HashMap<>();

    public User createUser(String name) {
        User user = new User(generateId(), name);
        users.put(user.getId(), user);
        return user;
    }

    public Optional<User> findById(String id) {
        return Optional.ofNullable(users.get(id));
    }

    private String generateId() {
        return java.util.UUID.randomUUID().toString();
    }
}

class User {
    private String id;
    private String name;

    public User(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }
}

enum UserRole {
    ADMIN,
    MEMBER,
    GUEST
}

interface Repository {
    User find(String id);
    void save(User user);
}
