"""Gmail SMTP email delivery for password recovery codes.

Uses Python's built-in smtplib with a Gmail account + Google App Password (no extra dependencies, ₱0/month).
Never logs reset codes or SMTP credentials.
"""
from __future__ import annotations

import html
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.config import settings

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    pass


class EmailDeliveryError(RuntimeError):
    pass


def is_smtp_configured() -> bool:
    return bool((settings.SMTP_USERNAME or "").strip() and (settings.SMTP_PASSWORD or "").strip())


def send_password_reset_email(to_email: str, code: str, display_name: str) -> None:
    """Send a 6-digit password reset code via Gmail SMTP."""
    if not is_smtp_configured():
        raise EmailNotConfiguredError("SMTP credentials are not configured.")

    sender = settings.SMTP_USERNAME.strip()
    ttl = settings.RESET_CODE_TTL_MINUTES
    safe_name = (display_name or "Student").strip()

    msg = EmailMessage()
    msg["Subject"] = f"{code} is your Examnesia password reset code"
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, sender))
    msg["To"] = to_email

    msg.set_content(
        f"Hi {safe_name},\n\n"
        f"We received a request to reset your Examnesia password.\n\n"
        f"Your 6-digit reset code is: {code}\n\n"
        f"This code expires in {ttl} minutes. If you didn't request this, you can safely ignore this email.\n\n"
        f"— Examnesia\n"
    )
    msg.add_alternative(
        f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; line-height: 1.5; padding: 16px;">
    <div style="max-width: 460px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; background: #ffffff;">
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Reset your Examnesia password</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">
        Hi {html.escape(safe_name)}, enter this 6-digit code in Examnesia to set a new password:
      </p>
      <div style="text-align: center; margin: 20px 0; padding: 14px; border-radius: 12px; background: #fffbeb; border: 1px solid #fde68a;">
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #b45309;">{code}</span>
      </div>
      <p style="margin: 0; font-size: 12px; color: #64748b;">
        This code expires in {ttl} minutes. If you didn&rsquo;t request a password reset, you can safely ignore this email.
      </p>
    </div>
  </body>
</html>
""",
        subtype="html",
    )

    try:
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS) as smtp:
                smtp.login(sender, settings.SMTP_PASSWORD)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(sender, settings.SMTP_PASSWORD)
                smtp.send_message(msg)
    except Exception as err:
        logger.warning("Failed to send password reset email via SMTP: %s", type(err).__name__)
        raise EmailDeliveryError("Could not send the reset email right now. Please try again shortly.") from err
