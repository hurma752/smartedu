# app/services/email_service.py
"""
Sends transactional emails via Gmail SMTP.
All sends are fire-and-forget — failures are logged, never raised,
so a flaky email cannot crash account creation or the API response.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings


def _send(to_email: str, subject: str, html: str) -> bool:
    """Core SMTP send. Returns True on success, False on any failure."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(f"[Email] SMTP not configured — would have sent '{subject}' to {to_email}")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        print(f"[Email] Sent '{subject}' to {to_email}")
        return True
    except Exception as e:
        print(f"[Email] Failed to send '{subject}' to {to_email}: {e}")
        return False


def send_account_setup_email(to_email: str, full_name: str, token: str) -> bool:
    """
    Sent when admin creates a new account.
    The user has no password yet — this link is how they set one.
    Token expires in 48 hours.
    """
    link = f"{settings.FRONTEND_URL}/set-password?token={token}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #1F4E3D;">Welcome to SmartEdu</h2>
      <p>Hi {full_name},</p>
      <p>An account has been created for you on the SmartEdu Learning Management System.</p>
      <p>Click the button below to set your password and access your account:</p>
      <p style="margin: 24px 0;">
        <a href="{link}"
           style="background:#1F4E3D;color:white;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;">
          Set My Password
        </a>
      </p>
      <p style="color:#666;font-size:13px;">
        This link expires in 48 hours. If you did not expect this email, you can safely ignore it.
      </p>
    </div>
    """
    return _send(to_email, "Your SmartEdu account is ready", html)


def send_password_reset_email(to_email: str, full_name: str, token: str) -> bool:
    """
    Sent when a user clicks 'Forgot password?'.
    Token expires in 30 minutes.
    """
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #1F4E3D;">Reset your password</h2>
      <p>Hi {full_name},</p>
      <p>We received a request to reset your SmartEdu password.</p>
      <p style="margin: 24px 0;">
        <a href="{link}"
           style="background:#1F4E3D;color:white;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;">
          Reset Password
        </a>
      </p>
      <p style="color:#666;font-size:13px;">
        This link expires in 30 minutes. If you didn't request this, ignore this email — your password won't change.
      </p>
    </div>
    """
    return _send(to_email, "Reset your SmartEdu password", html)


def send_enrollment_notification(to_email: str, full_name: str, course_name: str, course_code: str) -> bool:
    """Sent to a student when an admin enrolls them in a course."""
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #1F4E3D;">You've been enrolled in a course</h2>
      <p>Hi {full_name},</p>
      <p>You have been enrolled in:</p>
      <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
        <strong>{course_name}</strong><br>
        <span style="color:#666;">Course Code: {course_code}</span>
      </div>
      <p>Log in to SmartEdu to access your course materials and start learning.</p>
      <p style="margin:24px 0;">
        <a href="{settings.FRONTEND_URL}/login"
           style="background:#1F4E3D;color:white;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;">
          Go to SmartEdu
        </a>
      </p>
    </div>
    """
    return _send(to_email, f"You've been enrolled in {course_name}", html)