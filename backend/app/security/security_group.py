from enum import Enum
from typing import Any

from .security_control import SecurityControl

class SecurityGroup(Enum):
    """Enum base: cada miembro almacena su propio AccessControl."""

    def __init__(self, access: str, description: str):
        self._control = SecurityControl(access, description)

    # ----- Permiso específico (miembro del Enum) -----
    @property
    def access(self) -> SecurityControl:
        return self._control

    @property
    def permission(self) -> str:
        return self._control.access

    @property
    def description(self) -> str | None:
        return self._control.description

    @property
    def check(self):
        return self._control.check

    @property
    def requiere(self) -> Any:
        return self._control.requiere
