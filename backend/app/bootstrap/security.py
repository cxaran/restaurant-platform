import hmac

from fastapi import status
from pydantic import SecretStr

from backend.app.api.resource_actions import api_error


BOOTSTRAP_TOKEN_HEADER = "X-Bootstrap-Token"


def bootstrap_token_required(token: SecretStr | None) -> bool:
    return token is not None and token.get_secret_value().strip() != ""


def require_bootstrap_token(configured_token: SecretStr | None, provided_token: str | None) -> None:
    if not bootstrap_token_required(configured_token):
        return
    expected = configured_token.get_secret_value()
    provided = provided_token or ""
    if not hmac.compare_digest(expected, provided):
        api_error(
            status.HTTP_403_FORBIDDEN,
            "bootstrap_token_invalid",
            "Bootstrap no disponible.",
        )
