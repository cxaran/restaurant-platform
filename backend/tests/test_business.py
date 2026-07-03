"""Tests de la etapa 1: negocio (singletons, horario efectivo) y rutas.

El horario efectivo (§6.3) se prueba sobre SQLite en memoria: prioridad
fecha especial → semanal → cerrado, y rangos que cruzan medianoche (la cola
nocturna pertenece al día que INICIA el rango). La geometría de direcciones no
se ejercita aquí (requiere PostGIS; ver stack Docker dev).
"""

import os
import unittest
from datetime import date, datetime, time


DEV_ENV = {
    "ENVIRONMENT": "local",
    "SECRET_KEY": "test-secret-key",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "EMAIL_TOKEN_EXPIRE_MINUTES": "30",
    "TRYS_BEFORE_LOCK": "5",
    "REDIS_HOST": "redis",
    "REDIS_PORT": "6379",
    "REDIS_DB": "0",
    "SMTP_HOST": "mailpit",
    "SMTP_PORT": "1025",
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_FROM_EMAIL": "test@example.com",
    "SMTP_FROM_NAME": "Restaurant Platform Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "restaurant_platform",
}

os.environ.update(DEV_ENV)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.audit_event import AuditEvent  # noqa: E402
from backend.app.models.business import (  # noqa: E402
    BusinessSpecialDate,
    BusinessSpecialDateSlot,
    BusinessWeeklyHours,
)
from backend.app.services.business_service import (  # noqa: E402
    apply_singleton_update,
    effective_schedule_for_date,
    get_business_profile,
    get_business_settings,
    is_open_at,
)

# 2026-07-04 es sábado (weekday 5); 2026-07-05 domingo (weekday 6).
SATURDAY = date(2026, 7, 4)
SUNDAY = date(2026, 7, 5)


def _sqlite_engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


class ScheduleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _sqlite_engine()

    def _session(self) -> Session:
        return Session(self.engine)

    def _add_saturday_overnight(self, session: Session) -> None:
        # Sábado 17:00–01:00: cruza medianoche hacia el domingo.
        session.add(
            BusinessWeeklyHours(
                day_of_week=5, slot_number=1, opens_at=time(17, 0), closes_at=time(1, 0)
            )
        )
        session.commit()

    def test_no_schedule_means_closed(self) -> None:
        with self._session() as session:
            self.assertEqual(effective_schedule_for_date(session, SATURDAY).source, "none")
            self.assertFalse(is_open_at(session, datetime(2026, 7, 4, 18, 0)))

    def test_weekly_slot_opens_and_closes(self) -> None:
        with self._session() as session:
            session.add(
                BusinessWeeklyHours(
                    day_of_week=5, slot_number=1, opens_at=time(12, 0), closes_at=time(17, 0)
                )
            )
            session.commit()
            self.assertTrue(is_open_at(session, datetime(2026, 7, 4, 12, 0)))
            self.assertTrue(is_open_at(session, datetime(2026, 7, 4, 16, 59)))
            self.assertFalse(is_open_at(session, datetime(2026, 7, 4, 17, 0)))
            self.assertFalse(is_open_at(session, datetime(2026, 7, 4, 11, 59)))

    def test_overnight_slot_covers_tail_of_next_day(self) -> None:
        with self._session() as session:
            self._add_saturday_overnight(session)
            self.assertTrue(is_open_at(session, datetime(2026, 7, 4, 18, 0)))
            # Domingo 00:30: cola del slot del sábado.
            self.assertTrue(is_open_at(session, datetime(2026, 7, 5, 0, 30)))
            self.assertFalse(is_open_at(session, datetime(2026, 7, 5, 2, 0)))
            self.assertFalse(is_open_at(session, datetime(2026, 7, 4, 12, 0)))

    def test_special_closed_overrides_weekly(self) -> None:
        with self._session() as session:
            self._add_saturday_overnight(session)
            session.add(BusinessSpecialDate(calendar_date=SATURDAY, is_closed=True))
            session.commit()
            self.assertEqual(effective_schedule_for_date(session, SATURDAY).source, "special")
            self.assertFalse(is_open_at(session, datetime(2026, 7, 4, 18, 0)))

    def test_special_slots_override_weekly(self) -> None:
        with self._session() as session:
            self._add_saturday_overnight(session)
            special = BusinessSpecialDate(calendar_date=SATURDAY, is_closed=False)
            session.add(special)
            session.commit()
            session.add(
                BusinessSpecialDateSlot(
                    special_date_id=special.id,
                    slot_number=1,
                    opens_at=time(12, 0),
                    closes_at=time(15, 0),
                )
            )
            session.commit()
            schedule = effective_schedule_for_date(session, SATURDAY)
            self.assertEqual(schedule.source, "special")
            self.assertTrue(is_open_at(session, datetime(2026, 7, 4, 13, 0)))
            # El horario semanal del sábado (17:00–01:00) queda anulado ese día.
            self.assertFalse(is_open_at(session, datetime(2026, 7, 4, 18, 0)))

    def test_special_without_slots_falls_back_to_weekly(self) -> None:
        with self._session() as session:
            self._add_saturday_overnight(session)
            session.add(
                BusinessSpecialDate(calendar_date=SATURDAY, is_closed=False, reason="Nota")
            )
            session.commit()
            schedule = effective_schedule_for_date(session, SATURDAY)
            self.assertEqual(schedule.source, "weekly")
            self.assertTrue(is_open_at(session, datetime(2026, 7, 4, 18, 0)))


class SingletonTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _sqlite_engine()

    def test_get_or_create_singletons(self) -> None:
        with Session(self.engine) as session:
            profile = get_business_profile(session)
            settings_row = get_business_settings(session)
            self.assertEqual(profile.id, 1)
            self.assertEqual(profile.trade_name, "Mi Restaurante")
            self.assertEqual(settings_row.id, 1)
            self.assertTrue(settings_row.require_registered_user_for_checkout)
            # Segunda llamada: misma fila, no duplica.
            self.assertIs(get_business_profile(session), profile)

    def test_update_is_audited_with_field_names_only(self) -> None:
        with Session(self.engine) as session:
            profile = get_business_profile(session)
            changed = apply_singleton_update(
                session,
                profile,
                {"trade_name": "Sabor Norteño", "slogan": "El mejor"},
                actor_user_id=None,
            )
            session.commit()
            self.assertEqual(sorted(changed), ["slogan", "trade_name"])

            events = session.exec(select(AuditEvent)).all()
            self.assertEqual(len(events), 1)
            event = events[0]
            self.assertEqual(event.entity_type, "business_profile")
            self.assertEqual(event.action, "update")

    def test_update_without_changes_does_not_audit(self) -> None:
        with Session(self.engine) as session:
            profile = get_business_profile(session)
            session.commit()
            changed = apply_singleton_update(
                session, profile, {"trade_name": profile.trade_name}, actor_user_id=None
            )
            session.commit()
            self.assertEqual(changed, [])
            self.assertEqual(len(session.exec(select(AuditEvent)).all()), 0)


class BusinessRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _sqlite_engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_openapi_exposes_business_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        self.assertIn("/api/v1/business/profile", paths)
        self.assertIn("/api/v1/business/settings", paths)
        self.assertIn("/api/v1/business/phones", paths)
        self.assertIn("/api/v1/business/weekly-hours", paths)
        self.assertIn("/api/v1/business/special-dates", paths)
        self.assertIn("/api/v1/public/business", paths)
        self.assertIn("/api/v1/users/me/addresses", paths)

    def test_public_business_needs_no_session(self) -> None:
        response = self.client.get("/api/v1/public/business")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["trade_name"], "Mi Restaurante")
        self.assertFalse(body["is_open_now"])  # sin horario configurado = cerrado
        self.assertEqual(body["phones"], [])
        self.assertTrue(body["is_accepting_orders"])

    def test_internal_business_routes_require_authentication(self) -> None:
        self.assertEqual(self.client.get("/api/v1/business/profile").status_code, 401)
        self.assertEqual(
            self.client.patch("/api/v1/business/profile", json={}).status_code, 401
        )
        self.assertEqual(self.client.get("/api/v1/users/me/addresses").status_code, 401)


if __name__ == "__main__":
    unittest.main()
