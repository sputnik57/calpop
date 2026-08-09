from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Any, Union

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central application configuration loaded from environment variables or .env."""

    environment: str = Field("development", description="Environment name (development|staging|production)")
    debug: bool = Field(False, description="Enable debug mode and verbose logging")

    base_url: Optional[AnyHttpUrl] = Field(
        None, description="Public base URL for the application (used for callbacks/cookies)"
    )
    api_prefix: str = Field("/api", description="Base prefix for API routes")

    database_url: str = Field(
        "sqlite:///./letters.db",
        description="Database connection string (postgresql+asyncpg://user:pass@host:port/db)",
    )

    file_encryption_key: Optional[str] = Field(
        None,
        description="Base64-encoded 32 byte key for file encryption (AES-256). Required in production.",
    )
    mapping_store_key: Optional[str] = Field(
        None,
        description="Key used for tokenization mapping store (separate from file encryption key).",
    )
    cookie_secret: str = Field(
        "change-me",
        description="Secret used to sign session cookies. Must be rotated and unique per deployment.",
    )

    session_cookie_name: str = Field("calpop_session", description="Name of the session cookie.")
    session_cookie_domain: Optional[str] = Field(
        None, description="Domain attribute applied to session cookies (optional)."
    )
    session_cookie_secure: bool = Field(False, description="Set Secure flag on session cookies.")
    session_cookie_samesite: str = Field("lax", description="SameSite policy for session cookies (lax|strict|none).")
    session_expiry_seconds: int = Field(3600, description="Session lifetime in seconds.")
    default_role: str = Field("sponsor", description="Default role assigned to authenticated users.")

    azure_tenant_id: Optional[str] = Field(None, description="Azure AD tenant ID")
    azure_client_id: Optional[str] = Field(None, description="Azure AD application (client) ID")
    azure_client_secret: Optional[str] = Field(None, description="Azure AD client secret")
    azure_redirect_uri: Optional[AnyHttpUrl] = Field(None, description="Azure AD redirect URI for OAuth flows")
    azure_scopes: List[str] = Field(
        default_factory=lambda: ["User.Read"],
        description="OAuth scopes requested from Azure AD.",
    )
    azure_admin_group_ids: List[str] = Field(
        default_factory=list,
        description="Azure AD group IDs that should map to the admin role.",
    )
    azure_auditor_group_ids: List[str] = Field(
        default_factory=list,
        description="Azure AD group IDs that should map to the auditor role.",
    )

    onedrive_root_folder_id: Optional[str] = Field(
        None, description="Root folder ID in OneDrive where the application stores artifacts."
    )
    onedrive_sponsor_prefix: Optional[str] = Field(
        "Sponsors",
        description="Folder prefix used when creating sponsor-specific directories in OneDrive.",
    )

    ocr_provider: str = Field(
        "local",
        description="OCR provider selection (local|google_vision|custom).",
    )
    google_vision_credentials_path: Optional[Path] = Field(
        None, description="Filesystem path to Google Vision service account JSON (if using google_vision)."
	)
    google_vision_credentials_json: Optional[str] = Field(
        None, description="Raw JSON string for Google Vision service account (if using google_vision)."
    )
    ollama_base_url: str = Field(
        "http://host.docker.internal:11434",
        description="Base URL of the local Ollama server used for offline OCR (used when ocr_provider=local). "
        "Use http://localhost:11434 instead if the backend runs outside Docker.",
    )
    ollama_vision_model: str = Field(
        "qwen2.5vl:7b",
        description="Ollama model tag used for local handwriting/document OCR.",
    )
    ollama_timeout_seconds: float = Field(
        120.0, description="Timeout in seconds for local Ollama OCR requests.",
    )
    
    # Return-address blocks for outgoing envelopes. Two variants, never one:
    # "safe" uses the org's real identifying name; "unsafe" must contain no
    # substring that identifies the program's nature (e.g. no "SAA") for
    # prisoners where that association could put them at risk. Configured
    # here (not hardcoded in envelope_service.py) since the org's own
    # wording is the one thing here that should never require a code change.
    envelope_sender_name_safe: str = Field(
        "SCISAA", description="Return-address name line used for prisoners classified 'safe'."
    )
    envelope_sender_attn_safe: Optional[str] = Field(
        "Attn: Calif. Prisoner Outreach Program",
        description="Optional extra return-address line for the 'safe' variant.",
    )
    envelope_sender_name_unsafe: str = Field(
        "Calif. Prisoner Outreach Program",
        description="Return-address name line used for prisoners classified 'unsafe' (or unknown). "
        "Must not contain any substring identifying the program's specific nature.",
    )
    envelope_sender_address_line1: str = Field(
        "PO Box 57648", description="Return-address street/box line, shared by both variants."
    )
    envelope_sender_city_state_zip: str = Field(
        "Sherman Oaks, CA 91413", description="Return-address city/state/zip, shared by both variants."
    )

    library_curriculum_root: Optional[Path] = Field(
        None, description="Path to curriculum documents and templates."
    )
    library_history_root: Optional[Path] = Field(
        None, description="Path to archival/past letter documents."
    )

    tls_cert_path: Optional[Path] = Field(
        None, description="Path to TLS certificate for reverse proxy termination (PEM)."
    )
    tls_key_path: Optional[Path] = Field(
        None, description="Path to TLS private key for reverse proxy termination (PEM)."
    )

    allowed_origins: Any = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:4000",
            "http://127.0.0.1:4000",
        ],
        description="Origins allowed for CORS requests.",
    )

    data_root: Path = Field(
        default=Path("./data"),
        description="Root directory for file storage (originals, redacted copies, OCR artifacts).",
    )

    library_curriculum_path: Optional[str] = Field(None)
    library_history_path: Optional[str] = Field(None)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

    @field_validator("allowed_origins", mode="before")
    def parse_allowed_origins(cls, value):  # type: ignore[override]
        if value is None:
            return []
        if isinstance(value, str):
            # Clean up potential leading/trailing quotes from .env
            value = value.strip().strip("'").strip('"')
            # If it looks like a JSON list, try to parse it
            if value.startswith("[") and value.endswith("]"):
                try:
                    import json
                    return json.loads(value)
                except:
                    pass
            # Fallback to comma-separated
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, (list, tuple)):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return value

    @field_validator("azure_scopes", "azure_admin_group_ids", "azure_auditor_group_ids", mode="before")
    def parse_comma_separated(cls, value):  # type: ignore[override]
        if value is None:
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        if isinstance(value, (list, tuple)):
            return [str(item).strip() for item in value if str(item).strip()]
        return value

    @field_validator("session_cookie_samesite", mode="before")
    def normalize_samesite(cls, value):  # type: ignore[override]
        if isinstance(value, str):
            value = value.lower()
            if value not in {"lax", "strict", "none"}:
                raise ValueError("session_cookie_samesite must be one of: lax, strict, none")
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def azure_authority(self) -> Optional[str]:
        if self.azure_tenant_id:
            return f"https://login.microsoftonline.com/{self.azure_tenant_id}"
        return None

    @property
    def auth_redirect_uri(self) -> Optional[str]:
        if self.azure_redirect_uri:
            return str(self.azure_redirect_uri)
        if self.base_url:
            return f"{str(self.base_url).rstrip('/')}{self.api_prefix}/auth/callback"
        return None


@lru_cache()
def get_settings() -> Settings:
    return Settings()
