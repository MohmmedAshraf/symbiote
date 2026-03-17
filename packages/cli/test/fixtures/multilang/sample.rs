use std::collections::HashMap;

pub struct UserStore {
    users: HashMap<String, User>,
}

pub struct User {
    pub id: String,
    pub name: String,
}

pub trait Repository {
    fn find(&self, id: &str) -> Option<&User>;
    fn save(&mut self, user: User);
}

impl Repository for UserStore {
    fn find(&self, id: &str) -> Option<&User> {
        self.users.get(id)
    }

    fn save(&mut self, user: User) {
        self.users.insert(user.id.clone(), user);
    }
}

pub fn create_user(name: &str) -> User {
    User {
        id: generate_id(),
        name: name.to_string(),
    }
}

fn generate_id() -> String {
    String::from("uuid-placeholder")
}

pub enum UserRole {
    Admin,
    Member,
    Guest,
}

pub type UserId = String;
