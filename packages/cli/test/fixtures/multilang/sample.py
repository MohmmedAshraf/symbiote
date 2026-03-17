from os.path import join, dirname
import json

class UserService:
    def __init__(self, db):
        self.db = db

    def find_by_id(self, user_id):
        return self.db.get(user_id)

    def create(self, name, email):
        validate_email(email)
        return {"id": generate_id(), "name": name, "email": email}

def validate_email(email):
    if "@" not in email:
        raise ValueError("Invalid email")

def generate_id():
    import uuid
    return str(uuid.uuid4())
