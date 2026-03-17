package sample

type User struct {
    Name string
    Email string
}

func NewUser(name, email string) User {
    return User{Name: name, Email: email}
}
