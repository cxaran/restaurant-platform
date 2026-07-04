"""Schemas de perfiles 1:1 (§8.2 cliente, §8.4 personal)."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema


class CustomerProfileRead(ApiReadSchema):
    user_id: UUID
    full_name: str
    phone: str
    phone_normalized: str
    email: Optional[str] = None
    internal_notes: Optional[str] = None
    is_active: bool
    created_at: datetime


class CustomerProfileSelfRead(ApiReadSchema):
    """Vista del propio cliente: sin notas internas (§8.2)."""

    full_name: str
    phone: str
    email: Optional[str] = None


class CustomerProfileUpsert(ApiWriteSchema):
    full_name: str = Field(min_length=1, max_length=180)
    phone: str = Field(min_length=7, max_length=30)
    email: Optional[str] = Field(default=None, max_length=180)
    internal_notes: Optional[str] = None


class CustomerProfileSelfUpsert(ApiWriteSchema):
    """El cliente edita lo suyo; jamás las notas internas."""

    full_name: str = Field(min_length=1, max_length=180)
    phone: str = Field(min_length=7, max_length=30)
    email: Optional[str] = Field(default=None, max_length=180)


class StaffProfileRead(ApiReadSchema):
    user_id: UUID
    display_name: str
    contact_phone: Optional[str] = None
    public_contact_phone: Optional[str] = None
    photo_file_id: Optional[UUID] = None
    can_deliver: bool
    is_delivery_available: bool
    courier_public_note: Optional[str] = None
    is_active: bool


class StaffProfileUpsert(ApiWriteSchema):
    display_name: str = Field(min_length=1, max_length=180)
    contact_phone: Optional[str] = Field(default=None, max_length=30)
    public_contact_phone: Optional[str] = Field(default=None, max_length=30)
    photo_file_id: Optional[UUID] = None
    can_deliver: bool = False
    courier_public_note: Optional[str] = Field(default=None, max_length=120)
    is_active: bool = True


class CourierAvailabilityUpdate(ApiPatchSchema):
    is_delivery_available: Optional[bool] = None
