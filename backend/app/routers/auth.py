# app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.models import User
from app.schemas.auth import UserLogin, TokenResponse
from app.utils.auth import verify_password, create_access_token

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")

    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role, full_name=user.full_name, user_id=user.id
    )