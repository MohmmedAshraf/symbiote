package main

import (
	"fmt"
	"strings"
)

type User struct {
	ID   string
	Name string
}

func NewUser(name string) *User {
	return &User{
		ID:   generateID(),
		Name: strings.TrimSpace(name),
	}
}

func (u *User) FullName() string {
	return fmt.Sprintf("User: %s", u.Name)
}

func generateID() string {
	return "uuid-placeholder"
}
