"""Local CLI tool for signing and verifying Kabisado Android release metadata (latest.json + latest.json.sig).

Uses a dedicated Ed25519 manifest-signing keypair (separate from the Android APK keystore).
The private key must always remain outside the repository; only the 64-hex public key is embedded in the client.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST_PATH = REPO_ROOT / "wake" / "release" / "latest.json"
DEFAULT_SIG_PATH = REPO_ROOT / "wake" / "release" / "latest.json.sig"

SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
HEX128_RE = re.compile(r"^[0-9a-f]{128}$")
GITHUB_APK_URL_RE = re.compile(r"^https://github\.com/[^/]+/[^/]+/releases/download/[^/]+/[^/]+\.apk$")


def compute_version_code(version_name: str) -> int:
    """versionCode = MAJOR*10000 + MINOR*100 + PATCH."""
    match = SEMVER_RE.match(version_name.strip())
    if not match:
        raise ValueError(f"Version name '{version_name}' must follow MAJOR.MINOR.PATCH (e.g. 1.0.0).")
    major, minor, patch = (int(part) for part in match.groups())
    if minor >= 100 or patch >= 100:
        raise ValueError("MINOR and PATCH version numbers must be between 0 and 99.")
    if major <= 0 and minor <= 0 and patch <= 0:
        raise ValueError("Version must be greater than 0.0.0.")
    return major * 10000 + minor * 100 + patch


def generate_keypair() -> tuple[str, str]:
    """Return (private_key_hex_64, public_key_hex_64)."""
    priv = Ed25519PrivateKey.generate()
    priv_bytes = priv.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_bytes = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return priv_bytes.hex(), pub_bytes.hex()


def public_key_from_private_hex(private_key_hex: str) -> str:
    cleaned = private_key_hex.strip().lower()
    if not HEX64_RE.match(cleaned):
        raise ValueError("Ed25519 private key must be 64 hex characters (32 raw bytes).")
    priv = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(cleaned))
    pub_bytes = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return pub_bytes.hex()


def sign_manifest_bytes(raw_json_bytes: bytes, private_key_hex: str) -> str:
    """Return 128-hex detached Ed25519 signature over raw_json_bytes."""
    cleaned = private_key_hex.strip().lower()
    if not HEX64_RE.match(cleaned):
        raise ValueError("Ed25519 private key must be 64 hex characters (32 raw bytes).")
    priv = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(cleaned))
    return priv.sign(raw_json_bytes).hex()


def verify_manifest_bytes(raw_json_bytes: bytes, signature_hex: str, public_key_hex: str) -> bool:
    """Verify a 128-hex detached Ed25519 signature against a 64-hex Ed25519 public key."""
    sig_clean = signature_hex.strip().lower()
    pub_clean = public_key_hex.strip().lower()
    if not HEX128_RE.match(sig_clean) or not HEX64_RE.match(pub_clean):
        return False
    try:
        pub = Ed25519PublicKey.from_public_bytes(bytes.fromhex(pub_clean))
        pub.verify(bytes.fromhex(sig_clean), raw_json_bytes)
        return True
    except (InvalidSignature, ValueError):
        return False


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def build_release_manifest(
    *,
    apk_path: Path,
    version_name: str,
    apk_url: str,
    signing_cert_sha256: str,
    release_notes: list[str],
    mandatory: bool = False,
    min_supported_version_code: int | None = None,
    min_sdk: int = 24,
    previous_version_code: int | None = None,
    release_date: str | None = None,
) -> dict[str, Any]:
    if not apk_path.is_file():
        raise FileNotFoundError(f"APK file not found: {apk_path}")
    apk_bytes = apk_path.read_bytes()
    if len(apk_bytes) < 4 or apk_bytes[:2] != b"PK":
        raise ValueError("File is not a valid APK (ZIP) archive.")

    version_code = compute_version_code(version_name)
    if previous_version_code is not None and version_code <= previous_version_code:
        raise ValueError(
            f"New version_code ({version_code}) must be strictly greater than previous version_code ({previous_version_code})."
        )

    url_clean = apk_url.strip()
    if not GITHUB_APK_URL_RE.match(url_clean):
        raise ValueError("apk_url must be an HTTPS GitHub Releases .apk download URL.")

    cert_clean = signing_cert_sha256.strip().lower().replace(":", "")
    if not HEX64_RE.match(cert_clean):
        raise ValueError("signing_cert_sha256 must be a 64-character hex SHA-256 fingerprint.")

    min_supported = min_supported_version_code if min_supported_version_code is not None else version_code
    if min_supported > version_code:
        raise ValueError("min_supported_version_code cannot exceed version_code.")

    return {
        "version_name": version_name.strip(),
        "version_code": version_code,
        "min_supported_version_code": min_supported,
        "min_sdk": min_sdk,
        "min_android_version": "Android 7.0 (Nougat)" if min_sdk == 24 else f"Android API {min_sdk}+",
        "published": True,
        "apk_url": url_clean,
        "sha256": hashlib.sha256(apk_bytes).hexdigest(),
        "signing_cert_sha256": cert_clean,
        "file_size_bytes": len(apk_bytes),
        "release_date": release_date or datetime.date.today().isoformat(),
        "mandatory": bool(mandatory),
        "release_notes": [str(n).strip() for n in release_notes if str(n).strip()],
    }


def write_signed_manifest(
    manifest: dict[str, Any],
    private_key_hex: str,
    manifest_path: Path = DEFAULT_MANIFEST_PATH,
    sig_path: Path = DEFAULT_SIG_PATH,
) -> tuple[bytes, str]:
    raw_bytes = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    sig_hex = sign_manifest_bytes(raw_bytes, private_key_hex)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_bytes(raw_bytes)
    sig_path.write_text(sig_hex + "\n", encoding="utf-8")
    return raw_bytes, sig_hex


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Kabisado Android release manifest & Ed25519 signing tool.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    gen = sub.add_parser("generate-key", help="Generate a new Ed25519 manifest-signing keypair.")
    gen.add_argument("--out-private", type=Path, required=True, help="Path OUTSIDE the repo to save private key.")

    prep = sub.add_parser("prepare-release", help="Hash a signed APK, update latest.json, and write latest.json.sig.")
    prep.add_argument("--apk", type=Path, required=True)
    prep.add_argument("--version-name", required=True)
    prep.add_argument("--apk-url", required=True)
    prep.add_argument("--signing-cert-sha256", required=True)
    prep.add_argument("--private-key-file", type=Path, required=True)
    prep.add_argument("--note", action="append", default=[], help="Release note bullet (repeatable).")
    prep.add_argument("--mandatory", action="store_true")
    prep.add_argument("--min-supported-version-code", type=int, default=None)
    prep.add_argument("--manifest-out", type=Path, default=DEFAULT_MANIFEST_PATH)
    prep.add_argument("--sig-out", type=Path, default=DEFAULT_SIG_PATH)

    ver = sub.add_parser("verify-release", help="Verify latest.json and latest.json.sig against an Ed25519 public key.")
    ver.add_argument("--public-key", required=True, help="64-hex Ed25519 public key.")
    ver.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    ver.add_argument("--sig", type=Path, default=DEFAULT_SIG_PATH)

    args = parser.parse_args(argv)
    if args.cmd == "generate-key":
        out_path = args.out_private.resolve()
        if out_path.is_relative_to(REPO_ROOT):
            print("ERROR: Private key must be stored OUTSIDE the repository directory.", file=sys.stderr)
            return 2
        priv_hex, pub_hex = generate_keypair()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        fd = os.open(out_path, flags, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(priv_hex + "\n")
        try:
            os.chmod(out_path, 0o600)
        except OSError:
            pass
        print(f"Private key saved to: {out_path}")
        print(f"Public key (embed in VITE_RELEASE_PUBLIC_KEY): {pub_hex}")
        return 0

    if args.cmd == "prepare-release":
        prev_code = None
        if args.manifest_out.is_file():
            prev_data = json.loads(args.manifest_out.read_text(encoding="utf-8"))
            if prev_data.get("published"):
                prev_code = prev_data.get("version_code")
        priv_hex = args.private_key_file.read_text(encoding="utf-8").strip()
        manifest = build_release_manifest(
            apk_path=args.apk,
            version_name=args.version_name,
            apk_url=args.apk_url,
            signing_cert_sha256=args.signing_cert_sha256,
            release_notes=args.note or [f"Kabisado Android release v{args.version_name}"],
            mandatory=args.mandatory,
            min_supported_version_code=args.min_supported_version_code,
            previous_version_code=prev_code,
        )
        _, sig_hex = write_signed_manifest(manifest, priv_hex, args.manifest_out, args.sig_out)
        pub_hex = public_key_from_private_hex(priv_hex)
        print(f"Wrote {args.manifest_out} and {args.sig_out}")
        print(f"APK SHA-256: {manifest['sha256']}")
        print(f"Signature:   {sig_hex}")
        print(f"Public key:  {pub_hex}")
        return 0

    if args.cmd == "verify-release":
        raw_bytes = args.manifest.read_bytes()
        sig_hex = args.sig.read_text(encoding="utf-8").strip()
        ok = verify_manifest_bytes(raw_bytes, sig_hex, args.public_key)
        if not ok:
            print("INVALID: Manifest signature verification failed.", file=sys.stderr)
            return 2
        print("OK: Manifest Ed25519 signature verified.")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
