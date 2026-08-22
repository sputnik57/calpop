import base64
import os
from typing import Optional, Union

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

LEGACY_SHIFT = 1
NONCE_SIZE = 12
AES_KEY_LENGTH = 32

KeyLike = Union[str, bytes]
TokenLike = Union[str, bytes]

__all__ = [
    "caesar_code",
    "caesar_decode",
    "generate_cpid_from_info",
    "encrypt_aes_gcm",
    "decrypt_aes_gcm",
    "encrypt_text",
    "decrypt_text",
]


def caesar_code(first: str, last: str, no: str, shift: int = LEGACY_SHIFT) -> str:
    """
    Legacy Caesar cipher used by the Streamlit prototype.

    Args:
        first: First name
        last: Last name
        no: ID or number
        shift: Shift value (default = LEGACY_SHIFT)

    Returns:
        Encoded string
    """
    combined = f"{first}{last}{no}"
    shifted = "".join(chr((ord(c) + shift) % 256) for c in combined)
    return shifted


def caesar_decode(encoded: str, shift: int = LEGACY_SHIFT) -> str:
    """
    Reverse the legacy Caesar cipher. Provided for backward compatibility.
    """
    return "".join(chr((ord(c) - shift) % 256) for c in encoded)


def generate_cpid_from_info(
    first_name: Optional[str],
    last_name: Optional[str],
    cdcr_number: Optional[str],
    shift: int = LEGACY_SHIFT,
) -> str:
    """
    Caesar-cipher CPID in the roster's "ABC123" format, derived from the
    entered name/CDCR# rather than random -- the human-communication
    convention documented in implementation_plan.md ("how sponsors/staff
    refer to a sponsee without using their real name," not a security
    control).

    Fixes a bug in core/letter_db.py's make_readable_cpid: that version only
    ever fed it 2 real letters (first/last initial) into a 3-letter slot, so
    the 3rd letter was ALWAYS the 'X' pad -- every CPID it ever produced had
    the same shape and collided far more than the letter-space allowed for.
    This version pulls letters from as much of the real name as it can (up
    to 3, from the first+last name concatenated) and only pads with 'X' when
    there genuinely aren't enough real letters (e.g. both names blank).

    Deterministic for given inputs + shift -- the caller is responsible for
    checking uniqueness against existing CPIDs and retrying with a different
    shift (see POST /api/prisoners in main.py) if this collides.
    """
    name_letters = "".join(c for c in f"{first_name or ''}{last_name or ''}".upper() if c.isalpha())
    letters_source = (name_letters[:3] + "XXX")[:3] if len(name_letters) < 3 else name_letters[:3]
    letters = "".join(chr((ord(c) - ord('A') + shift) % 26 + ord('A')) for c in letters_source)

    cdcr_digits = "".join(c for c in str(cdcr_number or "") if c.isdigit())
    digits_source = cdcr_digits[-3:] if len(cdcr_digits) >= 3 else cdcr_digits.zfill(3)
    numbers = "".join(str((int(d) + shift) % 10) for d in digits_source)

    return f"{letters}{numbers}"


def _ensure_key_bytes(key: KeyLike) -> bytes:
    if isinstance(key, str):
        try:
            key_bytes = base64.b64decode(key)
        except Exception as exc:
            raise ValueError("FILE_ENCRYPTION_KEY must be base64-encoded") from exc
    else:
        key_bytes = key

    if len(key_bytes) != AES_KEY_LENGTH:
        raise ValueError(f"AES key must be {AES_KEY_LENGTH} bytes (got {len(key_bytes)})")

    return key_bytes


def encrypt_aes_gcm(
    plaintext: bytes,
    key: KeyLike,
    associated_data: Optional[bytes] = None,
) -> str:
    """
    Encrypt bytes using AES-256-GCM.

    Returns base64-encoded token containing nonce + ciphertext.
    """
    key_bytes = _ensure_key_bytes(key)
    nonce = os.urandom(NONCE_SIZE)
    aesgcm = AESGCM(key_bytes)
    ciphertext = aesgcm.encrypt(nonce, plaintext, associated_data)
    token = base64.b64encode(nonce + ciphertext).decode("utf-8")
    return token


def decrypt_aes_gcm(
    token: TokenLike,
    key: KeyLike,
    associated_data: Optional[bytes] = None,
) -> bytes:
    """
    Decrypt a base64-encoded AES-256-GCM token produced by encrypt_aes_gcm.
    """
    if isinstance(token, str):
        token_bytes = base64.b64decode(token)
    else:
        token_bytes = token

    if len(token_bytes) <= NONCE_SIZE:
        raise ValueError("Invalid token length for AES-GCM payload")

    nonce, ciphertext = token_bytes[:NONCE_SIZE], token_bytes[NONCE_SIZE:]
    key_bytes = _ensure_key_bytes(key)
    aesgcm = AESGCM(key_bytes)
    plaintext = aesgcm.decrypt(nonce, ciphertext, associated_data)
    return plaintext


def encrypt_text(
    value: str,
    key: KeyLike,
    associated_data: Optional[bytes] = None,
) -> str:
    """
    Convenience wrapper to encrypt UTF-8 strings with AES-256-GCM.
    """
    return encrypt_aes_gcm(value.encode("utf-8"), key, associated_data)


def decrypt_text(
    token: str,
    key: KeyLike,
    associated_data: Optional[bytes] = None,
) -> str:
    """
    Convenience wrapper to decrypt AES-256-GCM tokens into UTF-8 strings.
    """
    return decrypt_aes_gcm(token, key, associated_data).decode("utf-8")
