"""Rotating refresh sessions.

Each refresh token is single-use: using it creates a successor in the same family. If the same old token
shows up again within GRACE_SECONDS (two browser tabs refreshing at once) it is given a sibling successor;
after the window it is treated as theft and the whole family is revoked. Only the SHA-256 of a token is stored.
"""
import datetime
import hashlib
import secrets
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import UserSession

GRACE_SECONDS = 10


class SessionError(Exception):
    pass


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)  # naive UTC, as stored


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


VALID_CLIENT_TYPES = ("web", "native")


def _new_session(
    db: Session, user_id: int, family_id: str, user_agent: str | None, client_type: str = "web"
) -> tuple[str, UserSession]:
    if client_type not in VALID_CLIENT_TYPES:
        raise ValueError(f"Invalid client_type: {client_type}")
    token = secrets.token_urlsafe(48)
    row = UserSession(
        user_id=user_id,
        family_id=family_id,
        refresh_hash=_sha256(token),
        client_type=client_type,
        expires_at=_now() + datetime.timedelta(days=settings.REFRESH_TOKEN_DAYS),
        user_agent_hash=_sha256(user_agent) if user_agent else None,
    )
    db.add(row)
    db.flush()
    return token, row


def issue_session(
    db: Session, user_id: int, user_agent: str | None, client_type: str = "web"
) -> tuple[str, UserSession]:
    token, row = _new_session(db, user_id, str(uuid.uuid4()), user_agent, client_type=client_type)
    db.commit()
    return token, row


def _revoke_family(db: Session, family_id: str) -> None:
    now = _now()
    for s in db.query(UserSession).filter(UserSession.family_id == family_id, UserSession.revoked_at.is_(None)).all():
        s.revoked_at = now


def rotate_session(
    db: Session, refresh_token: str, user_agent: str | None = None, expected_client_type: str = "web"
) -> tuple[str, UserSession]:
    row = (
        db.query(UserSession)
        .filter(UserSession.refresh_hash == _sha256(refresh_token))
        .with_for_update()
        .first()
    )
    if row is None:
        raise SessionError("unknown refresh token")
    if row.client_type != expected_client_type:
        db.rollback()
        raise SessionError("refresh token client type mismatch")
    now = _now()
    if row.revoked_at is not None or row.expires_at <= now:
        db.rollback()
        raise SessionError("refresh token is no longer valid")
    if row.rotated_at is not None and (now - row.rotated_at).total_seconds() > GRACE_SECONDS:
        _revoke_family(db, row.family_id)
        db.commit()
        raise SessionError("refresh token reuse detected; session revoked")

    token, successor = _new_session(db, row.user_id, row.family_id, user_agent, client_type=row.client_type)
    if row.rotated_at is None:  # first use; a grace-window reuse leaves the original successor link alone
        row.rotated_at = now
        row.replaced_by = successor.id
    db.commit()
    return token, successor


def revoke_session(db: Session, refresh_token: str, expected_client_type: str | None = None) -> None:
    """Logout: revoke the token's whole family so no later generation survives."""
    row = db.query(UserSession).filter(UserSession.refresh_hash == _sha256(refresh_token)).first()
    if row is not None and (expected_client_type is None or row.client_type == expected_client_type):
        _revoke_family(db, row.family_id)
        db.commit()


def revoke_all_for_user(db: Session, user_id: int) -> None:
    now = _now()
    for s in db.query(UserSession).filter(UserSession.user_id == user_id, UserSession.revoked_at.is_(None)).all():
        s.revoked_at = now
    db.commit()
