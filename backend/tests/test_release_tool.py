import json
from pathlib import Path

import pytest

from scripts import release_tool


def test_compute_version_code_formula_and_validation():
    assert release_tool.compute_version_code("1.0.0") == 10000
    assert release_tool.compute_version_code("1.2.3") == 10203
    assert release_tool.compute_version_code("2.15.9") == 21509
    for invalid in ("1.0", "v1.0.0", "0.0.0", "1.100.0", "1.0.100", "abc"):
        with pytest.raises(ValueError):
            release_tool.compute_version_code(invalid)


def test_ed25519_manifest_signing_and_tamper_detection(tmp_path):
    priv_hex, pub_hex = release_tool.generate_keypair()
    assert len(priv_hex) == 64 and len(pub_hex) == 64
    assert release_tool.public_key_from_private_hex(priv_hex) == pub_hex

    fake_apk = tmp_path / "kabisado-1.0.1-10001.apk"
    fake_apk.write_bytes(b"PK\x03\x04fake-signed-apk-payload-bytes")
    cert_fp = "a" * 64

    manifest = release_tool.build_release_manifest(
        apk_path=fake_apk,
        version_name="1.0.1",
        apk_url="https://github.com/owner/Kabisado-project/releases/download/v1.0.1/kabisado-1.0.1-10001.apk",
        signing_cert_sha256=cert_fp,
        release_notes=["Bug fixes and study improvements."],
        mandatory=False,
        previous_version_code=10000,
    )
    assert manifest["version_code"] == 10001
    assert manifest["published"] is True
    assert manifest["file_size_bytes"] == fake_apk.stat().st_size

    m_path = tmp_path / "latest.json"
    s_path = tmp_path / "latest.json.sig"
    raw_bytes, sig_hex = release_tool.write_signed_manifest(manifest, priv_hex, m_path, s_path)
    assert release_tool.verify_manifest_bytes(raw_bytes, sig_hex, pub_hex) is True

    # Tampering with any field (mandatory flag, min_supported_version_code, apk_url, sha256) invalidates signature
    for field, malicious_value in [
        ("mandatory", True),
        ("min_supported_version_code", 99999),
        ("apk_url", "https://github.com/evil/repo/releases/download/v1/evil.apk"),
        ("sha256", "b" * 64),
    ]:
        tampered = dict(manifest, **{field: malicious_value})
        tampered_bytes = (json.dumps(tampered, indent=2) + "\n").encode("utf-8")
        assert release_tool.verify_manifest_bytes(tampered_bytes, sig_hex, pub_hex) is False

    # Wrong public key also fails verification
    _, other_pub = release_tool.generate_keypair()
    assert release_tool.verify_manifest_bytes(raw_bytes, sig_hex, other_pub) is False


def test_version_code_monotonicity_and_url_enforcement(tmp_path):
    fake_apk = tmp_path / "kabisado.apk"
    fake_apk.write_bytes(b"PK\x03\x04apk-bytes")
    cert_fp = "c" * 64
    good_url = "https://github.com/owner/Kabisado-project/releases/download/v1.0.0/kabisado-1.0.0-10000.apk"

    # Same or lower version_code than previous release is rejected
    with pytest.raises(ValueError, match="strictly greater"):
        release_tool.build_release_manifest(
            apk_path=fake_apk,
            version_name="1.0.0",
            apk_url=good_url,
            signing_cert_sha256=cert_fp,
            release_notes=["Note"],
            previous_version_code=10000,
        )

    # Non-GitHub-Releases or non-HTTPS URLs are rejected
    for bad_url in (
        "http://github.com/owner/repo/releases/download/v1/app.apk",
        "https://evil.example.com/owner/repo/releases/download/v1/app.apk",
        "https://github.com/owner/repo/blob/main/app.apk",
    ):
        with pytest.raises(ValueError, match="GitHub Releases"):
            release_tool.build_release_manifest(
                apk_path=fake_apk,
                version_name="1.0.1",
                apk_url=bad_url,
                signing_cert_sha256=cert_fp,
                release_notes=["Note"],
            )
