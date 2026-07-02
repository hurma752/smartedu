# app/routers/password.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.models import User
from app.schemas.password import ForgotPasswordRequest, SetPasswordRequest, ChangePasswordRequest
from app.utils.auth import hash_password, verify_password, get_current_user
from app.utils.tokens import create_reset_token, validate_and_consume_token
from app.services.email_service import send_password_reset_email

router = APIRouter()


@router.post("/forgot")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Always returns the same message regardless of whether the email exists.
    This is intentional — revealing which emails are registered is a
    security issue called account enumeration.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if user and user.is_active:
        token = create_reset_token(db, user.id, expires_minutes=30)
        send_password_reset_email(user.email, user.full_name, token)

    return {"message": "If an account exists with that email, a reset link has been sent."}


@router.post("/set")
def set_password(payload: SetPasswordRequest, db: Session = Depends(get_db)):
    """
    Used by BOTH first-time setup (link from account-created email)
    and forgot-password reset. Same endpoint, same token mechanism.
    """
    if len(payload.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user_id = validate_and_consume_token(db, payload.token)
    if not user_id:
        raise HTTPException(400, "This link is invalid or has expired. Please request a new one.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.password_hash = hash_password(payload.new_password)
    user.has_set_password = True
    db.commit()

    return {"message": "Password set successfully. You can now log in."}


@router.post("/change")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.password_hash or not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}