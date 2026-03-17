class UserManager:
    def create_user(self, name: str) -> dict:
        return {"name": name}

def validate_input(data: dict) -> bool:
    return bool(data)
