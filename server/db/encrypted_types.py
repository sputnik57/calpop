from typing import Optional

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from config import get_settings
from core.cipher import encrypt_text, decrypt_text


class EncryptedString(TypeDecorator):
    """
    Transparently encrypts/decrypts a string column with AES-256-GCM
    (MAPPING_STORE_KEY). Stored as ciphertext (base64) in a Text column.

    Ciphertext is non-deterministic (random nonce per value) and longer than
    the plaintext, so these columns cannot be filtered/searched via SQL
    directly (no WHERE first_name = 'X', no LIKE). Anything that needs to
    match against these fields has to fetch rows and compare after
    decryption in Python -- MatchingService already works this way.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Optional[str], dialect) -> Optional[str]:
        if value is None:
            return None
        settings = get_settings()
        return encrypt_text(value, settings.mapping_store_key)

    def process_result_value(self, value: Optional[str], dialect) -> Optional[str]:
        if value is None:
            return None
        settings = get_settings()
        try:
            return decrypt_text(value, settings.mapping_store_key)
        except Exception:
            # A row written before encryption was wired up (or with a
            # different key) -- surface the raw value rather than crash the
            # whole query. The next sync (Excel upload / startup reload)
            # re-encrypts it correctly.
            return value
