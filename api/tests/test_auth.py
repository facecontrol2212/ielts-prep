"""Auth endpoints and the service behind them.

The themes worth keeping green here are: no user enumeration anywhere, email
tokens are one-shot and purpose-bound, and a refresh token is the only thing that
can be refreshed.
"""

from datetime import timedelta

import pytest

from app.core.security import create_token, hash_email_token, hash_password
from app.models.user import EmailToken, User
from app.services import auth_service
from app.services.email import (
    RESET_PASSWORD,
    VERIFY_EMAIL,
    MemoryEmailSender,
    build_sender,
    get_email_sender,
)

REGISTER = "/api/auth/register"
LOGIN = "/api/auth/login"
REFRESH = "/api/auth/refresh"
VERIFY = "/api/auth/verify-email"
FORGOT = "/api/auth/forgot-password"
RESET = "/api/auth/reset-password"
ME = "/api/users/me"


@pytest.fixture
def mail(app) -> MemoryEmailSender:
    """Swap the console sender for one that records, via the DI seam."""
    sender = MemoryEmailSender()
    app.dependency_overrides[get_email_sender] = lambda: sender
    return sender


def register(client, email="new@example.com", password="password123", **extra):
    return client.post(REGISTER, json={"email": email, "password": password, **extra})


# ---------------------------------------------------------------- registration


def test_register_happy_path(client, mail, db):
    r = register(client, "Ann@Example.COM", full_name="Ann", locale="en")
    assert r.status_code == 201, r.text

    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["access_token"] and body["refresh_token"]
    assert body["access_token"] != body["refresh_token"]

    user = db.query(User).filter(User.email == "ann@example.com").one()
    assert user.email == "ann@example.com", "email must be normalised to lowercase"
    assert user.full_name == "Ann"
    assert user.locale == "en"
    assert user.is_verified is False, "a fresh account is never pre-verified"
    assert user.password_hash != "password123"


def test_register_tokens_work_immediately(client, mail):
    tokens = register(client, "imm@example.com").json()
    me = client.get(ME, headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "imm@example.com"
    assert me.json()["is_verified"] is False


def test_register_sends_a_verification_email_with_a_live_token(client, mail, db):
    register(client, "mailed@example.com")

    assert len(mail.sent) == 1
    message = mail.sent[0]
    assert message.to == "mailed@example.com"
    assert message.kind == VERIFY_EMAIL
    assert message.token and message.token in message.body

    stored = db.query(EmailToken).filter(EmailToken.purpose == VERIFY_EMAIL).one()
    assert stored.token_hash == hash_email_token(message.token)
    assert stored.token_hash != message.token, "only the hash may be stored"
    assert stored.used_at is None


def test_register_rejects_a_duplicate_email(client, mail):
    assert register(client, "dupe@example.com").status_code == 201
    r = register(client, "dupe@example.com")
    assert r.status_code == 409


def test_register_duplicate_detection_ignores_case_and_padding(client, mail):
    assert register(client, "case@example.com").status_code == 201
    assert register(client, "CASE@Example.com").status_code == 409
    assert register(client, " Case@EXAMPLE.COM ").status_code == 409


@pytest.mark.parametrize("password", ["short", "1234567", ""])
def test_register_rejects_a_weak_password_at_the_schema(client, mail, password):
    assert register(client, "weak@example.com", password=password).status_code == 422


def test_register_rejects_a_malformed_email(client, mail):
    assert register(client, "not-an-email").status_code == 422


# ---------------------------------------------------------------- login


def test_login_succeeds_and_stamps_last_login(client, db, user):
    assert user.last_login_at is None
    r = client.post(LOGIN, json={"email": user.email, "password": "password123"})
    assert r.status_code == 200
    assert r.json()["access_token"]

    db.refresh(user)
    assert user.last_login_at is not None


def test_login_is_case_insensitive(client, user):
    r = client.post(LOGIN, json={"email": user.email.upper(), "password": "password123"})
    assert r.status_code == 200


def test_login_does_not_leak_whether_the_email_exists(client, user):
    unknown = client.post(LOGIN, json={"email": "ghost@example.com", "password": "password123"})
    wrong = client.post(LOGIN, json={"email": user.email, "password": "wrong-password"})

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json(), "the two failures must be indistinguishable"
    assert unknown.json()["detail"] == auth_service.INVALID_CREDENTIALS


def test_login_refuses_a_deactivated_account_without_saying_so(client, db, user):
    user.is_active = False
    db.commit()
    r = client.post(LOGIN, json={"email": user.email, "password": "password123"})
    assert r.status_code == 401
    assert r.json()["detail"] == auth_service.INVALID_CREDENTIALS


# ---------------------------------------------------------------- refresh


def test_refresh_rotates_the_pair(client, user):
    pair = client.post(LOGIN, json={"email": user.email, "password": "password123"}).json()
    r = client.post(REFRESH, json={"refresh_token": pair["refresh_token"]})
    assert r.status_code == 200

    fresh = r.json()
    assert fresh["refresh_token"] != pair["refresh_token"]
    me = client.get(ME, headers={"Authorization": f"Bearer {fresh['access_token']}"})
    assert me.status_code == 200


def test_refresh_rejects_an_access_token(client, user):
    access = create_token(user.id, "access")
    assert client.post(REFRESH, json={"refresh_token": access}).status_code == 401


@pytest.mark.parametrize("token", ["", "garbage", "a.b.c"])
def test_refresh_rejects_junk(client, token):
    assert client.post(REFRESH, json={"refresh_token": token}).status_code == 401


def test_refresh_rejects_an_expired_token(client, user):
    expired = create_token(user.id, "refresh", expires_delta=timedelta(seconds=-10))
    assert client.post(REFRESH, json={"refresh_token": expired}).status_code == 401


def test_refresh_rejects_a_deleted_user(client, db, user):
    token = create_token(user.id, "refresh")
    db.delete(user)
    db.commit()
    assert client.post(REFRESH, json={"refresh_token": token}).status_code == 401


# ---------------------------------------------------------------- bearer handling


def test_protected_route_needs_a_bearer_token(client):
    assert client.get(ME).status_code == 401


@pytest.mark.parametrize(
    "header",
    ["Bearer garbage", "Bearer ", "Basic abc123", "Bearer a.b.c"],
)
def test_protected_route_rejects_bad_authorization_headers(client, header):
    assert client.get(ME, headers={"Authorization": header}).status_code == 401


def test_protected_route_rejects_an_expired_access_token(client, user):
    token = create_token(user.id, "access", expires_delta=timedelta(seconds=-10))
    assert client.get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_protected_route_rejects_a_refresh_token(client, user):
    token = create_token(user.id, "refresh")
    assert client.get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_protected_route_rejects_a_foreign_signature(client, user):
    from jose import jwt

    forged = jwt.encode({"sub": str(user.id), "type": "access", "exp": 9999999999}, "other-secret")
    assert client.get(ME, headers={"Authorization": f"Bearer {forged}"}).status_code == 401


# ---------------------------------------------------------------- verify email


def test_verify_email_happy_path(client, mail, db):
    register(client, "verify@example.com")
    token = mail.tokens_for("verify@example.com", VERIFY_EMAIL)[0]

    r = client.post(VERIFY, json={"token": token})
    assert r.status_code == 200
    assert r.json()["detail"]

    user = db.query(User).filter(User.email == "verify@example.com").one()
    db.refresh(user)
    assert user.is_verified is True


def test_verify_email_token_is_one_shot(client, mail, db):
    register(client, "once@example.com")
    token = mail.tokens_for("once@example.com", VERIFY_EMAIL)[0]

    assert client.post(VERIFY, json={"token": token}).status_code == 200
    second = client.post(VERIFY, json={"token": token})
    assert second.status_code == 400
    assert second.json()["detail"] == auth_service.INVALID_TOKEN


@pytest.mark.parametrize("token", ["", "garbage", "x" * 64])
def test_verify_email_rejects_junk(client, token):
    assert client.post(VERIFY, json={"token": token}).status_code == 400


def test_verify_email_rejects_an_expired_token(client, db, user):
    token = auth_service.create_email_token(db, user, VERIFY_EMAIL, ttl=timedelta(seconds=-1))
    assert client.post(VERIFY, json={"token": token}).status_code == 400
    db.refresh(user)


def test_a_reset_token_cannot_verify_an_email(client, db, user):
    """Purpose binding: the two token families must never be interchangeable."""
    user.is_verified = False
    db.commit()
    reset_token = auth_service.create_email_token(db, user, RESET_PASSWORD)

    r = client.post(VERIFY, json={"token": reset_token})
    assert r.status_code == 400

    db.refresh(user)
    assert user.is_verified is False
    stored = db.query(EmailToken).filter(EmailToken.purpose == RESET_PASSWORD).one()
    assert stored.used_at is None, "a rejected token must not be burned"


# ---------------------------------------------------------------- forgot password


def test_forgot_password_sends_a_link_for_a_known_address(client, mail, user):
    r = client.post(FORGOT, json={"email": user.email})
    assert r.status_code == 200
    assert r.json()["detail"] == auth_service.FORGOT_PASSWORD_MESSAGE

    assert len(mail.sent) == 1
    assert mail.sent[0].kind == RESET_PASSWORD
    assert mail.sent[0].to == user.email


def test_forgot_password_is_identical_for_an_unknown_address(client, mail, user):
    known = client.post(FORGOT, json={"email": user.email})
    unknown = client.post(FORGOT, json={"email": "nobody@example.com"})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert mail.tokens_for("nobody@example.com") == [], "no email for a stranger"


def test_forgot_password_accepts_any_case(client, mail, user):
    r = client.post(FORGOT, json={"email": user.email.upper()})
    assert r.status_code == 200
    assert len(mail.sent) == 1


def test_forgot_password_supersedes_the_previous_link(client, mail, db, user):
    client.post(FORGOT, json={"email": user.email})
    first = mail.tokens_for(user.email, RESET_PASSWORD)[0]
    client.post(FORGOT, json={"email": user.email})
    second = mail.tokens_for(user.email, RESET_PASSWORD)[1]
    assert first != second

    assert client.post(RESET, json={"token": first, "password": "newpassword1"}).status_code == 400
    assert client.post(RESET, json={"token": second, "password": "newpassword1"}).status_code == 200


# ---------------------------------------------------------------- reset password


def test_reset_password_round_trip(client, mail, db, user):
    old_hash = user.password_hash
    client.post(FORGOT, json={"email": user.email})
    token = mail.tokens_for(user.email, RESET_PASSWORD)[0]

    r = client.post(RESET, json={"token": token, "password": "brand-new-pass"})
    assert r.status_code == 200

    db.refresh(user)
    assert user.password_hash != old_hash

    assert (
        client.post(LOGIN, json={"email": user.email, "password": "password123"}).status_code == 401
    )
    assert (
        client.post(LOGIN, json={"email": user.email, "password": "brand-new-pass"}).status_code
        == 200
    )


def test_reset_password_token_is_one_shot(client, mail, user):
    client.post(FORGOT, json={"email": user.email})
    token = mail.tokens_for(user.email, RESET_PASSWORD)[0]

    assert client.post(RESET, json={"token": token, "password": "first-newpass"}).status_code == 200
    replay = client.post(RESET, json={"token": token, "password": "second-newpass"})
    assert replay.status_code == 400
    assert (
        client.post(LOGIN, json={"email": user.email, "password": "second-newpass"}).status_code
        == 401
    ), "the replayed reset must not have taken effect"


def test_reset_password_rejects_a_verify_token(client, db, user):
    verify_token = auth_service.create_email_token(db, user, VERIFY_EMAIL)
    old_hash = user.password_hash

    r = client.post(RESET, json={"token": verify_token, "password": "hijacked-pass"})
    assert r.status_code == 400

    db.refresh(user)
    assert user.password_hash == old_hash


def test_reset_password_rejects_an_expired_token(client, db, user):
    token = auth_service.create_email_token(db, user, RESET_PASSWORD, ttl=timedelta(seconds=-1))
    assert client.post(RESET, json={"token": token, "password": "newpassword1"}).status_code == 400


def test_reset_password_enforces_the_minimum_length(client, mail, user):
    client.post(FORGOT, json={"email": user.email})
    token = mail.tokens_for(user.email, RESET_PASSWORD)[0]
    assert client.post(RESET, json={"token": token, "password": "short"}).status_code == 422


def test_reset_password_revokes_live_refresh_tokens(client, mail, db, user):
    """A password reset must kill every token minted before it.

    Refresh tokens are stateless JWTs, so they cannot be deleted. Instead
    ``User.password_changed_at`` is stamped on reset and every token whose ``iat``
    predates it is refused -- which is what makes a reset an effective response to
    a stolen session.
    """
    pair = client.post(LOGIN, json={"email": user.email, "password": "password123"}).json()
    client.post(FORGOT, json={"email": user.email})
    token = mail.tokens_for(user.email, RESET_PASSWORD)[0]
    assert client.post(RESET, json={"token": token, "password": "rotated-pass"}).status_code == 200

    revoked = client.post(REFRESH, json={"refresh_token": pair["refresh_token"]})
    assert revoked.status_code == 401


def test_reset_password_revokes_live_access_tokens(client, mail, db, user):
    """The same marker is enforced on every authenticated request, not just refresh."""
    pair = client.post(LOGIN, json={"email": user.email, "password": "password123"}).json()
    headers = {"Authorization": f"Bearer {pair['access_token']}"}
    assert client.get("/api/users/me", headers=headers).status_code == 200

    client.post(FORGOT, json={"email": user.email})
    token = mail.tokens_for(user.email, RESET_PASSWORD)[0]
    assert client.post(RESET, json={"token": token, "password": "rotated-pass"}).status_code == 200

    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_tokens_issued_after_a_reset_still_work(client, mail, user):
    """The marker must not lock the user out of the session they just created."""
    client.post(FORGOT, json={"email": user.email})
    token = mail.tokens_for(user.email, RESET_PASSWORD)[0]
    client.post(RESET, json={"token": token, "password": "rotated-pass"})

    pair = client.post(LOGIN, json={"email": user.email, "password": "rotated-pass"}).json()
    headers = {"Authorization": f"Bearer {pair['access_token']}"}
    assert client.get("/api/users/me", headers=headers).status_code == 200
    assert client.post(REFRESH, json={"refresh_token": pair["refresh_token"]}).status_code == 200


# ---------------------------------------------------------------- service unit tests


def test_normalise_email():
    assert auth_service.normalise_email("  Ann@Example.COM ") == "ann@example.com"


def test_consume_email_token_burns_it_exactly_once(db, user):
    raw = auth_service.create_email_token(db, user, VERIFY_EMAIL)
    token, owner = auth_service.consume_email_token(db, raw, VERIFY_EMAIL)
    assert owner.id == user.id
    assert token.used_at is not None

    with pytest.raises(auth_service.InvalidToken):
        auth_service.consume_email_token(db, raw, VERIFY_EMAIL)


def test_create_email_token_rejects_an_unknown_purpose(db, user):
    with pytest.raises(ValueError):
        auth_service.create_email_token(db, user, "mint-me-money")


def test_authenticate_raises_the_same_error_for_both_failures(db, user):
    with pytest.raises(auth_service.InvalidCredentials) as unknown:
        auth_service.authenticate(db, "ghost@example.com", "password123")
    with pytest.raises(auth_service.InvalidCredentials) as wrong:
        auth_service.authenticate(db, user.email, "nope")
    assert unknown.value.detail == wrong.value.detail
    assert unknown.value.status_code == wrong.value.status_code == 401


def test_register_rejects_a_password_over_the_bcrypt_limit(db):
    from app.schemas.auth import RegisterRequest

    data = RegisterRequest(email="long@example.com", password="a" * 100)
    with pytest.raises(Exception) as exc:
        auth_service.register_user(db, data)
    assert getattr(exc.value, "status_code", None) == 400


def test_password_hash_is_salted():
    assert hash_password("password123") != hash_password("password123")


# ---------------------------------------------------------------- email seam


def test_build_sender_is_chosen_by_environment():
    assert isinstance(build_sender("test"), MemoryEmailSender)
    assert not isinstance(build_sender("development"), MemoryEmailSender)
    assert not isinstance(build_sender("production"), MemoryEmailSender)


def test_console_sender_logs_the_message(caplog):
    from app.services.email import ConsoleEmailSender, EmailMessage

    with caplog.at_level("INFO", logger="app.email"):
        ConsoleEmailSender().send(EmailMessage(to="a@b.c", subject="Hi", body="body"))
    assert "a@b.c" in caplog.text
