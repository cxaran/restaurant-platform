from typing import NoReturn


class QuerySchemaConfigError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


class QueryParameterError(ValueError):
    def __init__(self, code: str, message: str, field_name: str | None = None):
        self.code = code
        self.message = message
        self.field_name = field_name
        super().__init__(f"{code}: {message}")


def fail_config(code: str, message: str) -> NoReturn:
    raise QuerySchemaConfigError(code, message)


def fail_query(code: str, message: str, field_name: str | None = None) -> NoReturn:
    raise QueryParameterError(code, message, field_name)
