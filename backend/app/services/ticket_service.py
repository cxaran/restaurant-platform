"""Armado del ticket (§20): 100% desde snapshots; nunca duplica la venta.

El render (58 mm) es del frontend; aquí sólo se compone el payload con todo lo
que el ticket debe incluir: negocio, folio, tipo, cliente, dirección, líneas
con salsas/extras, totales, pagos y estado. Los precios provienen de los
snapshots del pedido — reimprimir un ticket años después muestra EXACTAMENTE
lo vendido (§15).
"""

from typing import Optional

from sqlmodel import Session

from backend.app.models.orders import Order
from backend.app.models.payments import Payment
from backend.app.models.user import User
from backend.app.services.business_service import get_business_profile, get_business_settings
from backend.app.services.order_service import public_status
from sqlmodel import select


def build_ticket_payload(session: Session, order: Order) -> dict:
    profile = get_business_profile(session)
    settings_row = get_business_settings(session)
    payments = session.exec(select(Payment).where(Payment.order_id == order.id)).all()

    attended_by: Optional[str] = None
    if order.created_by is not None:
        employee = session.get(User, order.created_by)
        if employee is not None:
            attended_by = f"{employee.name} {employee.last_name}".strip()

    delivery = order.delivery
    return {
        "business": {
            "trade_name": profile.trade_name,
            "slogan": profile.slogan,
            "logo_file_id": profile.logo_file_id,
            "footer_text": settings_row.ticket_footer_text,
        },
        "public_code": order.public_code,
        "created_at": order.created_at,
        "source": order.source,
        "fulfillment_type": order.fulfillment_type,
        "status": order.status,
        "status_label": public_status(order.status),
        "attended_by": attended_by,
        "customer": {
            "name": order.customer_name_snapshot,
            "phone": order.customer_phone_snapshot,
        },
        "delivery": (
            {
                "street": delivery.street,
                "external_number": delivery.external_number,
                "internal_number": delivery.internal_number,
                "neighborhood": delivery.neighborhood,
                "city": delivery.city,
                "references": delivery.references,
            }
            if delivery is not None
            else None
        ),
        "lines": [
            {
                "name": line.product_name_snapshot,
                "quantity": line.quantity,
                "purchase_mode": line.purchase_mode,
                "unit_price": line.money_unit_price_snapshot,
                "line_total": line.money_line_total_amount,
                "customer_note": line.customer_note,
                "credits_redeemed": line.credits_redeemed_total,
                "modifiers": [
                    {
                        "group": modifier.group_name_snapshot,
                        "option": modifier.option_name_snapshot,
                        "quantity": modifier.quantity,
                        "total": modifier.total_amount,
                    }
                    for modifier in line.modifiers
                ],
            }
            for line in sorted(order.lines, key=lambda l: l.sort_order)
        ],
        "totals": {
            "items_subtotal": order.items_subtotal_amount,
            "discounts": order.discount_total_amount,
            "shipping": order.shipping_total_amount,
            "total": order.total_money_amount,
            "credits_earned": order.credits_earned_total_snapshot,
            "credits_redeemed": order.credits_redeemed_total,
        },
        "payments": [
            {
                "method": payment.payment_method_name_snapshot,
                "status": payment.status,
                "expected_amount": payment.expected_amount,
                "change_requested_for_amount": payment.change_requested_for_amount,
                "change_amount": payment.change_amount,
            }
            for payment in payments
        ],
    }
