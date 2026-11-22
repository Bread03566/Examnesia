import concurrent.futures
import datetime
import threading
import unicodedata

import pytest
from fastapi.testclient import TestClient

from app import cli
from app.config import settings
from app.database import SessionLocal
from app.main import app
from app.models.models import LoginAttempt, PasswordResetCode, User
from app.services import email_service
from tests.helpers import (
    CSRF, STRONG_PASSWORD, post_refresh, refresh_cookie_value, register_user, unique_email, unique_username,
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def captured_emails(monkeypatch):
    """Stub SMTP so password-reset tests run 100% offline and capture every sent reset code."""
    sent = []
    monkeypatch.setattr(email_service, "is_smtp_configured", lambda: True)

    def fake_send(to_email: str, code: str, display_name: str):
        sent.append({"to": to_email, "code": code, "display_name": display_name})

    monkeypatch.setattr(email_service, "send_password_reset_email", fake_send)
    return sent


def body(email, password=STRONG_PASSWORD, **over):
    data = {"display_name": "Ana Reyes", "email": email, "password": password, "confirm_password": password}
    data.update(over)
    return data


def login(client, email, password=STRONG_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


# ---------- register ----------
def test_register_with_gmail_returns_token_and_secure_cookie(client):
    e = unique_email()
    res = client.post("/api/auth/register", json=body(e))
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["role"] == "student" and data["user"]["username"] == e and data["user"]["display_name"] == "Ana Reyes"
    assert data["access_token"] and "recovery_code" not in data
    assert STRONG_PASSWORD not in res.text and "password_hash" not in res.text
    cookie = next(h for h in res.headers.get_list("set-cookie") if h.startswith(settings.refresh_cookie_name))
    assert settings.refresh_cookie_name.startswith("__Host-")
    for flag in ("httponly", "secure", "samesite=strict", "path=/"):
        assert flag in cookie.lower()


@pytest.mark.parametrize("extra", [{"role": "admin"}, {"is_active": False}, {"subject_ref": "x" * 32}, {"username": "ana"}])
def test_register_rejects_unknown_or_privileged_fields(client, extra):
    assert client.post("/api/auth/register", json=body(unique_email(), **extra)).status_code == 422


def test_duplicate_and_lookalike_gmails_create_exactly_one_account(client):
    base = unique_email("ana")
    assert client.post("/api/auth/register", json=body(base)).status_code == 201
    local, domain = base.split("@")
    fullwidth = "".join(chr(ord(c) + 0xFEE0) if c.isalnum() else c for c in local) + "@" + domain
    assert unicodedata.normalize("NFKC", fullwidth) == base and fullwidth != base
    for variant in (base, base.upper(), " " + base + " ", fullwidth):
        res = client.post("/api/auth/register", json=body(variant))
        assert res.status_code in (409, 422), (variant, res.status_code)
    with SessionLocal() as db:
        assert db.query(User).filter(User.username == base).count() == 1


def test_concurrent_registration_of_one_gmail_has_one_winner():
    e = unique_email("race")
    barrier = threading.Barrier(2)

    def attempt(_):
        with TestClient(app) as c:
            barrier.wait()
            return c.post("/api/auth/register", json=body(e)).status_code

    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        codes = sorted(pool.map(attempt, range(2)))
    assert codes == [201, 409]


def test_overlong_password_rejected_before_any_hashing(client, monkeypatch):
    import app.routers.auth as auth_router  # noqa

    def boom(_):
        raise AssertionError("hash_password must not run for oversized input")

    monkeypatch.setattr(auth_router, "hash_password_sync", boom)
    for size in (129, 5_000_000):
        pw = ("Aa1!" * (size // 4 + 1))[:size]
        res = client.post("/api/auth/register", json=body(unique_email(), password=pw))
        assert res.status_code == 422, size


@pytest.mark.parametrize("over,needle", [
    ({"confirm_password": "different-Pass-1"}, "match"),
    ({"password": "Short1!", "confirm_password": "Short1!"}, "8"),
    ({"password": "password123", "confirm_password": "password123"}, "common"),
    ({"password": "nouppercase!1", "confirm_password": "nouppercase!1"}, "uppercase"),
    ({"password": "NoSpecialChar1", "confirm_password": "NoSpecialChar1"}, "special"),
    ({"email": "not-a-gmail"}, "gmail"),
    ({"email": "student@yahoo.com"}, "gmail"),
    ({"email": "bad..dots@gmail.com"}, "gmail"),
    ({"email": "has space@gmail.com"}, "gmail"),
    ({"display_name": "   "}, ""),
    ({"display_name": "bad\x00name"}, ""),
])
def test_registration_validation_errors(client, over, needle):
    data = body(unique_email())
    data.update(over)
    res = client.post("/api/auth/register", json=data)
    assert res.status_code == 422
    assert needle in res.text.lower()


# ---------- login ----------
def test_login_success_returns_token_and_cookie(client):
    _, e, _ = register_user(client)
    res = login(client, e)
    assert res.status_code == 200 and res.json()["access_token"] and refresh_cookie_value(res)


def test_login_failure_is_identical_for_unknown_user_and_wrong_password(client):
    _, e, _ = register_user(client)
    wrong = login(client, e, "Wrong-Password-1")
    unknown = login(client, unique_email("nobody"), STRONG_PASSWORD)
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_five_failures_then_429_with_retry_after_then_success_after_wait(client):
    _, e, _ = register_user(client)
    for _ in range(5):
        assert login(client, e, "Wrong-Password-1").status_code == 401
    locked = login(client, e)  # even the right password is delayed now
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) >= 1
    with SessionLocal() as db:
        db.query(LoginAttempt).delete()  # simulate the wait having passed
        db.commit()
    assert login(client, e).status_code == 200


def test_deactivated_user_cannot_log_in_and_legacy_rows_cannot_either(client):
    _, e, _ = register_user(client)
    with SessionLocal() as db:
        db.query(User).filter_by(username=e).update({"is_active": False})
        db.commit()
    assert login(client, e).status_code == 403
    legacy = unique_username("client-")
    with SessionLocal() as db:
        db.add(User(username=legacy, display_name=legacy))  # password_hash NULL, like migrated client-id rows
        db.commit()
    assert login(client, legacy).status_code == 401


# ---------- refresh / logout ----------
def test_refresh_requires_cookie_header_and_origin(client):
    assert post_refresh(client, None).status_code == 401
    assert post_refresh(client, "garbage-token").status_code == 401
    token = refresh_cookie_value(client.post("/api/auth/register", json=body(unique_email())))
    client.cookies.clear()
    no_header = client.post("/api/auth/refresh", headers={"Cookie": f"{settings.refresh_cookie_name}={token}"})
    assert no_header.status_code == 403
    assert post_refresh(client, token, Origin="https://evil.example").status_code == 403
    ok = post_refresh(client, token, Origin="http://localhost:5173")
    assert ok.status_code == 200 and ok.json()["access_token"]
    assert refresh_cookie_value(ok) not in (None, token)


def test_two_tabs_refreshing_the_same_cookie_both_succeed(client):
    token = refresh_cookie_value(client.post("/api/auth/register", json=body(unique_email())))
    first, second = post_refresh(client, token), post_refresh(client, token)
    assert first.status_code == second.status_code == 200


def test_logout_revokes_the_session_and_is_idempotent(client):
    token = refresh_cookie_value(client.post("/api/auth/register", json=body(unique_email())))
    client.cookies.clear()
    out = client.post("/api/auth/logout", headers={**CSRF, "Cookie": f"{settings.refresh_cookie_name}={token}"})
    assert out.status_code == 204
    assert post_refresh(client, token).status_code == 401
    assert client.post("/api/auth/logout", headers=CSRF).status_code == 204  # no cookie: still fine


# ---------- Gmail password recovery ----------
def reset_pw(client, email, code, new="Brand-New-Pass-77"):
    return client.post("/api/auth/reset-password", json={
        "email": email, "code": code, "new_password": new, "confirm_password": new,
    })


def test_forgot_password_returns_503_when_smtp_not_configured(client, monkeypatch):
    monkeypatch.setattr(email_service, "is_smtp_configured", lambda: False)
    res = client.post("/api/auth/forgot-password", json={"email": unique_email()})
    assert res.status_code == 503


def test_gmail_password_reset_flow_updates_password_and_revokes_old_sessions(client, captured_emails):
    reg = client.post("/api/auth/register", json=body(unique_email()))
    email, old_refresh = reg.json()["user"]["username"], refresh_cookie_value(reg)

    req = client.post("/api/auth/forgot-password", json={"email": email})
    assert req.status_code == 200
    assert len(captured_emails) == 1
    code = captured_emails[0]["code"]
    assert captured_emails[0]["to"] == email and len(code) == 6 and code.isdigit()

    # Plaintext code must never be stored in the database
    with SessionLocal() as db:
        row = db.query(PasswordResetCode).order_by(PasswordResetCode.id.desc()).first()
        assert row is not None and code not in row.code_hash

    res = reset_pw(client, email, f"{code[:3]} {code[3:]}")
    assert res.status_code == 200 and res.json()["access_token"]
    assert login(client, email, "Brand-New-Pass-77").status_code == 200
    assert login(client, email, STRONG_PASSWORD).status_code == 401       # old password is dead
    assert reset_pw(client, email, code).status_code == 401               # code is single-use
    assert post_refresh(client, old_refresh).status_code == 401           # old sessions revoked


def test_forgot_password_does_not_reveal_unknown_gmail(client, captured_emails):
    res = client.post("/api/auth/forgot-password", json={"email": unique_email("ghost")})
    assert res.status_code == 200
    assert captured_emails == []


def test_reset_password_failure_is_indistinguishable_and_rejects_expired(client, captured_emails):
    _, email, _ = register_user(client)
    assert client.post("/api/auth/forgot-password", json={"email": email}).status_code == 200
    code = captured_emails[0]["code"]
    wrong = "000000" if code != "000000" else "999999"

    r_wrong = reset_pw(client, email, wrong)
    r_unknown = reset_pw(client, unique_email("ghost"), wrong)
    assert r_wrong.status_code == r_unknown.status_code == 401
    assert r_wrong.json() == r_unknown.json()

    # Expired code is rejected
    with SessionLocal() as db:
        user = db.query(User).filter_by(username=email).one()
        db.query(PasswordResetCode).filter_by(user_id=user.id).update({
            "expires_at": datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(minutes=1)
        })
        db.commit()
    assert reset_pw(client, email, code).status_code == 401


def test_reset_password_refuses_deactivated_accounts(client, captured_emails):
    _, email, _ = register_user(client)
    assert client.post("/api/auth/forgot-password", json={"email": email}).status_code == 200
    code = captured_emails[0]["code"]
    with SessionLocal() as db:
        db.query(User).filter_by(username=email).update({"is_active": False})
        db.commit()
    assert reset_pw(client, email, code).status_code == 403


# ---------- admin recovery-code fallback ----------
def recover(client, username, code, new="Brand-New-Pass-77"):
    return client.post("/api/auth/recover", json={
        "username": username, "recovery_code": code, "new_password": new, "confirm_password": new})


def test_admin_recovery_code_still_works(client):
    u = unique_username("adm")
    with SessionLocal() as db:
        code = cli.create_admin(db, u, "Admin", STRONG_PASSWORD)
    res = recover(client, u, code.lower().replace("-", " "))
    assert res.status_code == 200
    assert res.json()["recovery_code"] != code and res.json()["access_token"]
    assert login(client, u, "Brand-New-Pass-77").status_code == 200
    assert recover(client, u, code).status_code == 401


# ---------- me ----------
def test_me_requires_a_valid_bearer_token(client):
    headers, e, _ = register_user(client)
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["username"] == e and "password" not in me.text


# ---------- native Android auth ----------
def test_native_register_login_refresh_and_logout_never_set_cookies(client):
    email = unique_email("nat")
    reg = client.post("/api/auth/native/register", json=body(email))
    assert reg.status_code == 201
    assert "set-cookie" not in reg.headers
    reg_data = reg.json()
    assert reg_data["access_token"] and reg_data["refresh_token"] and reg_data["user"]["username"] == email

    log = client.post("/api/auth/native/login", json={"email": email, "password": STRONG_PASSWORD})
    assert log.status_code == 200 and "set-cookie" not in log.headers
    rt1 = log.json()["refresh_token"]

    ref = client.post("/api/auth/native/refresh", json={"refresh_token": rt1})
    assert ref.status_code == 200 and "set-cookie" not in ref.headers
    rt2 = ref.json()["refresh_token"]
    assert rt2 != rt1 and ref.json()["access_token"]

    # Native refresh token cannot be used on the web cookie refresh endpoint, and vice versa
    assert post_refresh(client, rt2, Origin="http://localhost:5173").status_code == 401
    # And NATIVE_ORIGINS ("https://localhost") is rejected by the web cookie CSRF Origin check
    web_cookie = refresh_cookie_value(client.post("/api/auth/login", json={"email": email, "password": STRONG_PASSWORD}))
    assert post_refresh(client, web_cookie, Origin="https://localhost").status_code == 403
    assert client.post("/api/auth/native/refresh", json={"refresh_token": web_cookie}).status_code == 401

    out = client.post("/api/auth/native/logout", json={"refresh_token": rt2})
    assert out.status_code == 204 and "set-cookie" not in out.headers
    assert client.post("/api/auth/native/refresh", json={"refresh_token": rt2}).status_code == 401


def test_native_reset_password_and_recover_return_refresh_token_without_cookies(client, captured_emails):
    email = unique_email("natreset")
    assert client.post("/api/auth/native/register", json=body(email)).status_code == 201
    assert client.post("/api/auth/forgot-password", json={"email": email}).status_code == 200
    code = captured_emails[0]["code"]

    res = client.post("/api/auth/native/reset-password", json={
        "email": email, "code": code, "new_password": "Brand-New-Pass-77", "confirm_password": "Brand-New-Pass-77",
    })
    assert res.status_code == 200 and "set-cookie" not in res.headers
    assert res.json()["access_token"] and res.json()["refresh_token"]

    adm = unique_username("natadm")
    with SessionLocal() as db:
        rec_code = cli.create_admin(db, adm, "Admin", STRONG_PASSWORD)
    adm_res = client.post("/api/auth/native/recover", json={
        "username": adm, "recovery_code": rec_code, "new_password": "Brand-New-Pass-77", "confirm_password": "Brand-New-Pass-77",
    })
    assert adm_res.status_code == 200 and "set-cookie" not in adm_res.headers
    assert adm_res.json()["access_token"] and adm_res.json()["refresh_token"] and adm_res.json()["recovery_code"] != rec_code


def test_cross_platform_bidirectional_web_and_android_workflow(client):
    """Phase 3 requirement: upload on Web -> visible on Android; study on Android -> visible on Web."""
    email = unique_email("xplat")
    # 1. Student registers on Web and creates a module with flashcards and quiz questions
    web_reg = client.post("/api/auth/register", json=body(email))
    assert web_reg.status_code == 201
    web_headers = {"Authorization": f"Bearer {web_reg.json()['access_token']}"}

    doc_res = client.post(
        "/api/documents/text",
        headers=web_headers,
        json={
            "title": "Cell Biology 101",
            "text": (
                "Mitosis is defined as the process of cell division that results in two identical daughter cells. "
                "Meiosis refers to a type of cell division that reduces the chromosome number by half in gametes. "
                "Ribosomes are the cellular structures responsible for protein synthesis in all living cells. "
                "Mitochondria are known as the powerhouses of the cell because they generate adenosine triphosphate. "
                "Chloroplasts are the specialized organelles in plant cells that conduct photosynthesis using sunlight. "
                "Osmosis is defined as the spontaneous net movement of solvent molecules through a selectively permeable membrane."
            ),
        },
    )
    assert doc_res.status_code == 201
    doc_id = doc_res.json()["id"]

    cards_res = client.post(f"/api/documents/{doc_id}/flashcards/generate", headers=web_headers, json={"count": 3})
    assert cards_res.status_code == 200 and len(cards_res.json()) >= 1
    card_id = cards_res.json()[0]["id"]

    quiz_res = client.post(f"/api/documents/{doc_id}/quiz/generate", headers=web_headers, json={"count": 2})
    assert quiz_res.status_code == 200 and len(quiz_res.json()) >= 1
    q = quiz_res.json()[0]

    # 2. Same student signs in on Native Android and sees the module uploaded on Web
    nat_login = client.post(
        "/api/auth/native/login",
        headers={"X-Kabisado-Client": "android/10000"},
        json={"email": email, "password": STRONG_PASSWORD},
    )
    assert nat_login.status_code == 200 and "set-cookie" not in nat_login.headers
    nat_headers = {
        "Authorization": f"Bearer {nat_login.json()['access_token']}",
        "X-Kabisado-Client": "android/10000",
    }

    nat_docs = client.get("/api/documents", headers=nat_headers)
    assert nat_docs.status_code == 200
    assert [d["id"] for d in nat_docs.json()] == [doc_id]

    # 3. Student reviews a flashcard and completes a quiz on Android
    rev_res = client.post(f"/api/flashcards/{card_id}/review", headers=nat_headers, json={"rating": "easy"})
    assert rev_res.status_code == 200

    sub_res = client.post(
        "/api/quizzes/submit",
        headers=nat_headers,
        json={
            "document_id": doc_id,
            "difficulty": "medium",
            "answers": [{"question_id": q["id"], "selected_index": q["correct_index"]}],
        },
    )
    assert sub_res.status_code == 200 and sub_res.json()["score"] == 1

    # 4. Back on Web, the student checks their Progress Dashboard and sees the Android activity
    dash_res = client.get("/api/progress/dashboard?tz_offset_minutes=0", headers=web_headers)
    assert dash_res.status_code == 200
    dash = dash_res.json()
    assert dash["total_quizzes_taken"] == 1
    assert dash["overall_accuracy"] == 100.0
    assert dash["streak_days"] >= 1
    assert len(dash["quiz_history"]) == 1
