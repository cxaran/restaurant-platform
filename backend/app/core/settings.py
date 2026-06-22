
from pydantic_settings import BaseSettings
from pydantic import SecretStr, computed_field, PostgresDsn
from pydantic_core import MultiHostUrl
from typing import Literal
from functools import lru_cache

class Settings(BaseSettings):
    project_name: str = "FastAPI"
    environment: Literal["local", "staging", "production"] = "local"

    secret_key: SecretStr
    algorithm: str = "HS256"
    access_token_expire_minutes: int
    email_token_expire_minutes: int
    trys_before_lock: int

    redis_host: str
    redis_port: int
    redis_db: int

    postgres_user: str
    postgres_password: str
    postgres_server: str
    postgres_port: int
    postgres_db: str

    @computed_field
    @property
    def postgres_dsn(self) -> PostgresDsn:
        return PostgresDsn(
            str(
                MultiHostUrl.build(
                    scheme="postgresql+psycopg2",
                    username=self.postgres_user,
                    password=self.postgres_password,
                    host=self.postgres_server,
                    port=self.postgres_port,
                    path=self.postgres_db,
                )
            )
        )
    

@lru_cache()
def get_settings() -> Settings:
    """
    Obtiene una instancia única y en caché de :class:`Settings`.
    """
    return Settings() # pyright: ignore[reportCallIssue]

settings: Settings = get_settings()