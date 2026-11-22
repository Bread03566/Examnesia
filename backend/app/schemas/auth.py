import re
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,32}$")
GMAIL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@gmail\.com$")
RESET_CODE_RE = re.compile(r"^\d{6}$")


def normalize_username(raw: str) -> str:
    """NFKC folds look-alikes (full-width letters, etc.) so they cannot create a second account."""
    return unicodedata.normalize("NFKC", raw).strip().lower()


def normalize_email(raw: str) -> str:
    return normalize_username(raw)


def is_valid_gmail(value: str) -> bool:
    if not GMAIL_RE.match(value):
        return False
    local = value.split("@", 1)[0]
    return ".." not in local


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")  # no way to smuggle in role, is_active, subject_ref, ...


class RegisterRequest(_Strict):
    display_name: str = Field(max_length=120)
    email: str = Field(max_length=100)
    password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 60:
            raise ValueError("Display name must be 1 to 60 characters.")
        if any(unicodedata.category(ch)[0] == "C" for ch in v):
            raise ValueError("Display name contains invalid characters.")
        return v

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        v = normalize_email(v)
        if not is_valid_gmail(v):
            raise ValueError("Please use a valid @gmail.com address.")
        return v

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class LoginRequest(_Strict):
    # Accepts @gmail.com for students and also legacy usernames for existing admin accounts.
    email: str = Field(max_length=100)
    password: str = Field(max_length=128)

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        v = normalize_email(v)
        if not v:
            raise ValueError("Please enter your Gmail address.")
        return v


class ForgotPasswordRequest(_Strict):
    email: str = Field(max_length=100)

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        v = normalize_email(v)
        if not is_valid_gmail(v):
            raise ValueError("Please enter a valid @gmail.com address.")
        return v


class ResetPasswordRequest(_Strict):
    email: str = Field(max_length=100)
    code: str = Field(max_length=16)
    new_password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        v = normalize_email(v)
        if not is_valid_gmail(v):
            raise ValueError("Please enter a valid @gmail.com address.")
        return v

    @field_validator("code")
    @classmethod
    def clean_code(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch not in " -\t\r\n")
        if not RESET_CODE_RE.match(digits):
            raise ValueError("Reset code must be 6 digits.")
        return digits

    @model_validator(mode="after")
    def passwords_match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class RecoverRequest(_Strict):
    username: str = Field(max_length=100)
    recovery_code: str = Field(max_length=64)
    new_password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)

    @field_validator("username")
    @classmethod
    def clean_username(cls, v: str) -> str:
        return normalize_username(v)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    display_name: str
    username: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RecoveryTokenResponse(TokenResponse):
    recovery_code: str  # shown exactly once (admin CLI / recovery-code flow)


class NativeTokenResponse(TokenResponse):
    refresh_token: str


class NativeRecoveryTokenResponse(RecoveryTokenResponse):
    refresh_token: str


class NativeRefreshRequest(_Strict):
    refresh_token: str = Field(min_length=1, max_length=256)

    @field_validator("refresh_token")
    @classmethod
    def clean_token(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Refresh token is required.")
        return v


class ChangePasswordRequest(_Strict):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class PasswordConfirmRequest(_Strict):
    password: str = Field(max_length=128)
