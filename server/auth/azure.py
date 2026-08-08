from typing import Any, Dict

import msal

from config import Settings


class AzureNotConfigured(Exception):
    """Raised when Azure AD is not fully configured."""


class AzureADClient:
    """Thin wrapper around MSAL to keep configuration in one place."""

    def __init__(self, settings: Settings):
        if (
            not settings.azure_client_id
            or not settings.azure_client_secret
            or not settings.azure_authority
            or not settings.auth_redirect_uri
        ):
            raise AzureNotConfigured("Azure AD environment variables are incomplete.")
        self.settings = settings
        self._app = msal.ConfidentialClientApplication(
            client_id=settings.azure_client_id,
            client_credential=settings.azure_client_secret,
            authority=settings.azure_authority,
        )

    def build_authorization_url(self, state: str) -> str:
        return self._app.get_authorization_request_url(
            scopes=self.settings.azure_scopes,
            state=state,
            redirect_uri=self.settings.auth_redirect_uri,
            prompt="select_account",
        )

    def acquire_token_by_authorization_code(self, code: str) -> Dict[str, Any]:
        result = self._app.acquire_token_by_authorization_code(
            code,
            scopes=self.settings.azure_scopes,
            redirect_uri=self.settings.auth_redirect_uri,
        )
        return result
