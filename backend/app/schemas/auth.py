# app/schemas/auth.py
from pydantic import BaseModel, EmailStr

class UserRegister(BaseModel):
    """Public self-registration — kept for students who sign themselves up.
    If you want self-registration removed entirely (Admin creates everyone),
    just don't expose the /register endpoint in the frontend — the schema
    can stay as-is."""
    email: EmailStr
    password: str
    full_name: str
    role: str  # still "student" or "teacher" only — enforced in the route

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    user_id: int

class AdminCreateUser(BaseModel):
    """Used by Admin to directly create teacher or student accounts."""
    email: EmailStr
    password: str
    full_name: str
    role: str  # "teacher" or "student" — admin should not create other admins via this route