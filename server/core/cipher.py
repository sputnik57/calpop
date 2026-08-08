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
