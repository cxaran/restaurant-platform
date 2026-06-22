from typing import cast

from backend.app.core.redis import RedisText, redis_client, redis_text


def token_key(prefix: str, subject: str) -> str:
    return f"{prefix}:{subject}"


def get_token(prefix: str, subject: str) -> str | None:
    token = cast("RedisText | None", redis_client.get(token_key(prefix, subject)))
    return redis_text(token) if token else None


def set_token_pair(prefix: str, subject: str, token: str, ttl: int) -> None:
    old_token = get_token(prefix, subject)
    if old_token and old_token != token:
        redis_client.delete(old_token)

    pipe = redis_client.pipeline()  # pyright: ignore[reportUnknownMemberType]
    pipe.setex(token, ttl, subject)
    pipe.setex(token_key(prefix, subject), ttl, token)
    pipe.execute()


def get_subject(prefix: str, token: str) -> str | None:
    subject_value = cast("RedisText | None", redis_client.get(token))
    if not subject_value:
        return None

    subject = redis_text(subject_value)
    if get_token(prefix, subject) != token:
        return None

    return subject


def delete_token_pair(prefix: str, subject: str, token: str | None = None) -> None:
    token = token or get_token(prefix, subject)

    pipe = redis_client.pipeline()  # pyright: ignore[reportUnknownMemberType]
    pipe.delete(token_key(prefix, subject))
    if token:
        pipe.delete(token)
    pipe.execute()
