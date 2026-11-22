"""Shared test helpers for authenticated API tests."""
import uuid

from app.config import settings

STRONG_PASSWORD = "Zq7!mK2pXwR9"
CSRF = {"X-Kabisado-Request": "1"}


def unique_username(prefix: str = "stu") -> str:
    return f"{prefix}{uuid.uuid4().hex[:10]}"


def unique_email(prefix: str = "stu") -> str:
    return f"{prefix}{uuid.uuid4().hex[:10]}@gmail.com"


def register_user(client, username: str | None = None, display_name: str = "Test Student",
                  password: str = STRONG_PASSWORD) -> tuple[dict, str, None]:
    """Register a fresh student with a Gmail address. Returns (auth headers, email, None)."""
    if username is None:
        email = unique_email()
    else:
        email = username if "@" in username else f"{username}@gmail.com"
    res = client.post("/api/auth/register", json={
        "display_name": display_name, "email": email,
        "password": password, "confirm_password": password,
    })
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}, email, None


def refresh_cookie_value(response) -> str | None:
    """The refresh token from a response's Set-Cookie (cookies are Secure, so tests pass them by hand)."""
    prefix = settings.refresh_cookie_name + "="
    for header in response.headers.get_list("set-cookie"):
        if header.startswith(prefix):
            return header.split(";", 1)[0][len(prefix):]
    return None


def post_refresh(client, token: str | None, **extra_headers):
    headers = {**CSRF, **extra_headers}
    if token is not None:
        headers["Cookie"] = f"{settings.refresh_cookie_name}={token}"
    client.cookies.clear()
    return client.post("/api/auth/refresh", headers=headers)
