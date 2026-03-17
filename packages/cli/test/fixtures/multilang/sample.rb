class UserService
  def initialize(db)
    @db = db
  end

  def find_by_id(user_id)
    @db.get(user_id)
  end

  def create(name, email)
    validate_email(email)
    { id: generate_id, name: name, email: email }
  end
end

module Helpers
  def self.format_name(name)
    name.strip.downcase
  end
end

def validate_email(email)
  raise "Invalid email" unless email.include?("@")
end

def generate_id
  SecureRandom.uuid
end
