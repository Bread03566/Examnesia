from __future__ import annotations

import datetime
import hashlib
import hmac
import secrets
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.account_cleanup import delete_user_files
from app.config import settings
from app.database import get_db
from app.models.models import PasswordResetCode, User, UserSession
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    PasswordConfirmRequest,
    RecoverRequest,
    RecoveryTokenResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)
from app.security import throttle
from app.security.bearer import get_bearer_user
from app.security.passwords import hash_password_sync, needs_rehash, validate_password, verify_password_sync
from app.security.recovery import generate_recovery_code, hash_recovery_code_sync, verify_recovery_code_sync
from app.security.sessions import (
    SessionError, issue_session, revoke_all_for_user, revoke_session, rotate_session,
)
from app.security.tokens import create_access_token, decode_access_token
from app.services import email_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

BAD_LOGIN = "Incorrect Gmail or password."
BAD_RECOVERY = "That username and recovery code do not match."
BAD_RESET = "Invalid or expired reset code."
FORGOT_OK = "If that Gmail address is registered, we sent a 6-digit reset code. Check your inbox and spam folder."
RESET_MAX_ATTEMPTS = 5
RESET_RESEND_COOLDOWN_SECONDS = 60


def client_ip(request: Request) -> str:
    if settings.TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()  # the hop our own proxy appended, not a client claim
    return request.client.host if request.client else "unknown"


def user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _cookie_args() -> dict:
    return dict(key=settings.refresh_cookie_name, path="/", secure=settings.COOKIE_SECURE,
                httponly=True, samesite="strict")


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(value=token, max_age=settings.REFRESH_TOKEN_DAYS * 86400, **_cookie_args())


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(**_cookie_args())


def require_cookie_csrf(request: Request) -> None:
    """Endpoints that act on the refresh cookie need a custom header (cannot be set by a plain cross-site
    form) and, when the browser sends an Origin, it must be ours."""
    if request.headers.get("x-kabisado-request") != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing request header.")
    origin = request.headers.get("origin")
    if origin and origin not in settings.allowed_origins and urlparse(origin).netloc != request.headers.get("host", ""):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Request origin not allowed.")


def _unauthorized(detail: str, clear_cookie: bool = False) -> JSONResponse:
    resp = JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": detail})
    if clear_cookie:
        clear_refresh_cookie(resp)
    return resp


def _naive_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _start_session(db: Session, user: User, request: Request, response: Response) -> str:
    refresh_token, session = issue_session(db, user.id, user_agent(request))
    set_refresh_cookie(response, refresh_token)
    return create_access_token(user.id, session.id)


def _hash_reset_code(user_id: int, code: str, secret: str | None = None) -> str:
    key = (secret or settings.JWT_SECRET).encode("utf-8")
    return hmac.new(key, f"{user_id}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def _verify_reset_code(user_id: int, code: str, stored_hash: str) -> bool:
    if hmac.compare_digest(stored_hash, _hash_reset_code(user_id, code, settings.JWT_SECRET)):
        return True
    if settings.JWT_SECRET_PREVIOUS:
        return hmac.compare_digest(stored_hash, _hash_reset_code(user_id, code, settings.JWT_SECRET_PREVIOUS))
    return False


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        validate_password(payload.password, payload.email)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(err))
    throttle.register_gate(db, client_ip(request))
    if db.query(User.id).filter(User.username == payload.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "That Gmail address is already registered.")

    password_hash = hash_password_sync(payload.password)
    user = User(
        username=payload.email,
        display_name=payload.display_name,
        password_hash=password_hash,
        recovery_hash=None,  # students recover via Gmail reset code
    )  # role/is_active use safe defaults
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # lost a race for the same Gmail
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That Gmail address is already registered.")
    access = _start_session(db, user, request, response)
    return TokenResponse(access_token=access, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = client_ip(request)
    throttle.check_allowed(db, payload.email, ip)
    user = db.query(User).filter(User.username == payload.email).first()
    ok = verify_password_sync(user.password_hash if user else None, payload.password)
    if not (user and ok):
        throttle.record_failure(db, payload.email, ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_LOGIN)
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password_sync(payload.password)
    user.last_login_at = _naive_now()
    throttle.record_success(db, payload.email, ip)  # also commits the changes above
    access = _start_session(db, user, request, response)
    return TokenResponse(access_token=access, user=UserOut.model_validate(user))


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Send a 6-digit password reset code to the user's Gmail. Always returns a generic 200 to prevent enumeration."""
    if not email_service.is_smtp_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Password reset email is not configured on this server yet. Please contact the admin.",
        )

    ip = client_ip(request)
    throttle_key = "forgot:" + payload.email
    throttle.check_allowed(db, throttle_key, ip)
    throttle.record_failure(db, throttle_key, ip)  # rate-limit repeated sends per email + IP

    user = db.query(User).filter(User.username == payload.email).first()
    if user and user.is_active and user.password_hash and user.username.endswith("@gmail.com"):
        now = _naive_now()
        latest = (
            db.query(PasswordResetCode)
            .filter(PasswordResetCode.user_id == user.id)
            .order_by(PasswordResetCode.id.desc())
            .first()
        )
        if latest and (now - latest.created_at).total_seconds() < RESET_RESEND_COOLDOWN_SECONDS:
            return {"detail": FORGOT_OK}

        # Invalidate any previously issued unused codes for this user.
        db.query(PasswordResetCode).filter(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.used_at.is_(None),
        ).update({"used_at": now}, synchronize_session=False)

        code = f"{secrets.randbelow(1_000_000):06d}"
        reset_row = PasswordResetCode(
            user_id=user.id,
            code_hash=_hash_reset_code(user.id, code),
            created_at=now,
            expires_at=now + datetime.timedelta(minutes=settings.RESET_CODE_TTL_MINUTES),
        )
        db.add(reset_row)
        db.commit()

        try:
            email_service.send_password_reset_email(user.username, code, user.display_name)
        except email_service.EmailDeliveryError as err:
            reset_row.used_at = _naive_now()
            db.commit()
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(err))

    return {"detail": FORGOT_OK}


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(payload: ResetPasswordRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = client_ip(request)
    throttle_key = "reset:" + payload.email
    throttle.check_allowed(db, throttle_key, ip)
    try:
        validate_password(payload.new_password, payload.email)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(err))

    user = db.query(User).filter(User.username == payload.email).first()
    now = _naive_now()
    row = None
    if user:
        row = (
            db.query(PasswordResetCode)
            .filter(
                PasswordResetCode.user_id == user.id,
                PasswordResetCode.used_at.is_(None),
                PasswordResetCode.expires_at > now,
                PasswordResetCode.attempts < RESET_MAX_ATTEMPTS,
            )
            .order_by(PasswordResetCode.id.desc())
            .first()
        )

    ok = bool(user and row and _verify_reset_code(user.id, payload.code, row.code_hash))
    if not ok:
        if row is not None:
            row.attempts += 1
            if row.attempts >= RESET_MAX_ATTEMPTS:
                row.used_at = now
            db.commit()
        throttle.record_failure(db, throttle_key, ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_RESET)

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")

    row.used_at = now
    user.password_hash = hash_password_sync(payload.new_password)
    db.commit()
    revoke_all_for_user(db, user.id)
    throttle.record_success(db, throttle_key, ip)
    access = _start_session(db, user, request, response)
    return TokenResponse(access_token=access, user=UserOut.model_validate(user))


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db),
                  _: None = Depends(require_cookie_csrf)):
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token:
        return _unauthorized("Please sign in.")
    try:
        new_token, session = rotate_session(db, token, user_agent(request))
    except SessionError:
        return _unauthorized("Your session has expired. Please sign in again.", clear_cookie=True)
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        revoke_all_for_user(db, session.user_id)
        return _unauthorized("Please sign in.", clear_cookie=True)
    set_refresh_cookie(response, new_token)
    return TokenResponse(access_token=create_access_token(user.id, session.id), user=UserOut.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db), _: None = Depends(require_cookie_csrf)):
    token = request.cookies.get(settings.refresh_cookie_name)
    if token:
        revoke_session(db, token)
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(resp)
    return resp


@router.post("/recover", response_model=RecoveryTokenResponse)
def recover(payload: RecoverRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Recovery-code fallback (used for CLI-created admin accounts)."""
    ip, throttle_name = client_ip(request), "recover:" + payload.username
    throttle.check_allowed(db, throttle_name, ip)
    try:
        validate_password(payload.new_password, payload.username)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(err))
    user = db.query(User).filter(User.username == payload.username).first()
    ok = verify_recovery_code_sync(user.recovery_hash if user else None, payload.recovery_code)
    if not (user and ok):
        throttle.record_failure(db, throttle_name, ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_RECOVERY)
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")

    new_code = generate_recovery_code()
    user.password_hash = hash_password_sync(payload.new_password)
    user.recovery_hash = hash_recovery_code_sync(new_code)
    db.commit()
    revoke_all_for_user(db, user.id)
    throttle.record_success(db, throttle_name, ip)
    access = _start_session(db, user, request, response)
    return RecoveryTokenResponse(access_token=access, user=UserOut.model_validate(user), recovery_code=new_code)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_bearer_user)):
    return user


def _confirm_password(db: Session, request: Request, user: User, password: str) -> None:
    """Re-check the password for sensitive actions. Wrong password is 403 (not 401, which the app treats as
    an expired session) and shares a throttle so a stolen access token cannot be used to guess it."""
    key, ip = f"pw:{user.id}", client_ip(request)
    throttle.check_allowed(db, key, ip)
    if not verify_password_sync(user.password_hash, password):
        throttle.record_failure(db, key, ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect password.")
    throttle.record_success(db, key, ip)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: ChangePasswordRequest, request: Request,
                          user: User = Depends(get_bearer_user), db: Session = Depends(get_db)):
    try:
        validate_password(payload.new_password, user.username)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(err))
    _confirm_password(db, request, user, payload.current_password)
    user.password_hash = hash_password_sync(payload.new_password)
    current_sid = decode_access_token(request.headers["Authorization"].split(" ", 1)[1].strip())["sid"]
    db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.id != current_sid, UserSession.revoked_at.is_(None)
    ).update({"revoked_at": _naive_now()}, synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate(payload: PasswordConfirmRequest, request: Request,
                     user: User = Depends(get_bearer_user), db: Session = Depends(get_db)):
    _confirm_password(db, request, user, payload.password)
    user.is_active = False
    db.commit()
    revoke_all_for_user(db, user.id)
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(resp)
    return resp


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(payload: PasswordConfirmRequest, request: Request,
                         user: User = Depends(get_bearer_user), db: Session = Depends(get_db)):
    _confirm_password(db, request, user, payload.password)
    delete_user_files(db, user)
    db.delete(user)  # ORM cascade removes documents, cards, questions, attempts, flags and sessions
    db.commit()
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(resp)
    return resp
