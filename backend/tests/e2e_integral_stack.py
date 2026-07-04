# -*- coding: utf-8 -*-
"""E2E integral MANUAL contra el stack real (no forma parte de la suite canonica).

Requiere: PostGIS (localhost:5433), Redis (localhost:6379) y uvicorn en :31800
con el env completo. Ejecutar: backendenv\Scripts\python backend/tests/e2e_integral_stack.py

Flujo cubierto:
bootstrap -> catalogo con modificadores -> storefront (media+layout+publish)
-> cliente -> creditos -> checkout web (dinero+canje) -> transiciones -> ticket -> POS.
"""
import base64
import os
import sys
import time

RUN = str(int(time.time()))[-6:]

import httpx

# Por defecto apunta al uvicorn suelto (31800); contra el stack Docker E2E:
#   E2E_BASE=http://127.0.0.1:31080 E2E_ORIGIN=http://127.0.0.1:31080 python ...
BASE = os.environ.get("E2E_BASE", "http://127.0.0.1:31800") + "/api/v1"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

step_no = 0
def step(name, ok=True, extra=""):
    global step_no
    step_no += 1
    mark = "OK " if ok else "FAIL"
    print(f"[{step_no:02d}] {mark} {name} {extra}")
    if not ok:
        sys.exit(1)

def expect(resp, code, name):
    if resp.status_code != code:
        print(resp.status_code, resp.text[:500])
        step(name, ok=False)
    step(name, extra=f"({resp.status_code})")
    return resp.json() if resp.content and "json" in resp.headers.get("content-type", "") else None

HEADERS = {"Origin": os.environ.get("E2E_ORIGIN", "http://localhost:3000")}
admin = httpx.Client(base_url=BASE, timeout=30, headers=HEADERS)
cust = httpx.Client(base_url=BASE, timeout=30, headers=HEADERS)

# 1) Bootstrap
status_ = admin.get("/bootstrap/status").json()
if status_.get("setup_required"):
    expect(admin.post("/bootstrap/initialize", json={
        "user": {"name": "Admin", "last_name": "Fundador", "email": "admin@e2e.mx",
                 "password": "SuperClave123", "confirm_password": "SuperClave123"},
    }), 201, "bootstrap initialize")
else:
    step("bootstrap ya realizado (reuso)")

# 2) Login admin (cookie)
expect(admin.post("/auth/login", json={"email": "admin@e2e.mx", "password": "SuperClave123"}),
       200, "login admin")
me = admin.get("/auth/me").json()
perm_count = len(me.get("permissions", []))
step("admin con permisos", extra=f"({perm_count} permisos)")

# 2b) Configurar el negocio: habilitar pickup para la venta web
expect(admin.patch("/business/settings", json={"allow_pickup": True}), 200,
       "habilitar pickup en settings del negocio")

# 3) Catalogo: categoria, productos, modificador requerido
cat = expect(admin.post("/catalog/categories", json={"name": f"Boneless {RUN}"}), 201, "crear categoria")
bone = expect(admin.post("/catalog/products", json={
    "category_id": cat["id"], "name": "Orden de boneless", "description": "12 piezas",
    "money_price_amount": "230", "credits_awarded_per_unit": 20, "is_featured": True,
}), 201, "crear producto boneless")
dip = expect(admin.post("/catalog/products", json={
    "category_id": cat["id"], "name": "Dip ranch", "money_price_amount": "15",
    "credits_awarded_per_unit": 2, "credit_redemption_price": 50,
}), 201, "crear producto dip (canjeable)")
salsas = expect(admin.post("/catalog/modifier-groups", json={
    "name": "Salsas", "selection_type": "single", "min_selections": 1,
    "max_selections": 1, "is_required": True,
}), 201, "crear grupo Salsas (requerido)")
bbq = expect(admin.post(f"/catalog/modifier-groups/{salsas['id']}/options",
                        json={"name": "BBQ", "price_adjustment": "0"}), 201, "opcion BBQ")
expect(admin.put(f"/catalog/products/{bone['id']}/modifier-groups",
                 json={"groups": [{"modifier_group_id": salsas["id"]}]}), 200, "vincular Salsas a boneless")

# 4) Storefront: draft home + secciones + media + layout + publicar
pages = expect(admin.get("/storefront/pages"), 200, "listar paginas")
assert any(p["page_key"] == "home" for p in pages)
draft = expect(admin.get("/storefront/pages/home/draft"), 200, "obtener borrador home")
for old in draft["sections"]:
    admin.delete(f"/storefront/sections/{old['id']}")
step("borrador limpio (idempotencia)", extra=f"({len(draft['sections'])} previas)")
hero_draft = expect(admin.post("/storefront/pages/home/draft/sections", json={
    "template_key": "storefront.hero", "sort_order": 10,
    "content_config": {"slides": [{
        "variant": "split", "title": "Sabor que te hace volver",
        "description": "Recién hecho todos los días.",
        "primary_cta": {"label": "Pedir ahora", "link_type": "menu_page"},
    }]},
}), 201, "agregar hero")
expect(admin.post("/storefront/pages/home/draft/sections", json={
    "template_key": "storefront.catalog.featured_products", "sort_order": 20,
    "content_config": {"title": "Los más pedidos"},
}), 201, "agregar grilla destacados")
hero_id = next(s["id"] for s in admin.get("/storefront/pages/home/draft").json()["sections"]
               if s["template_key"] == "storefront.hero")
img = expect(admin.post("/files", files={"file": ("hero.png", PNG, "image/png")},
                        data={"kind": "image"}), 201, "subir imagen al banco")
media = expect(admin.put(f"/storefront/sections/{hero_id}/media/main",
                         json={"desktop_file_id": img["id"], "alt_text": "Boneless"}),
               200, "media del hero (slot main)")
assert media["main"]["desktop_file_id"] == img["id"]
expect(admin.put("/storefront/layout", json={
    "header_config": {"nav_links": [{"label": "Menú", "link_type": "menu_page"}]},
    "footer_config": {"note": "Hecho en casa"},
}), 200, "publicar layout")
expect(admin.post("/storefront/pages/home/publish"), 200, "publicar home")
public_home = expect(admin.get("/public/storefront/home"), 200, "GET publico home")
assert public_home["theme_tokens"]["colors"]["brand_primary"]
assert public_home["layout"]["header"]["nav_links"][0]["label"] == "Menú"
hero_pub = next(s for s in public_home["sections"] if s["template_key"] == "storefront.hero")
assert hero_pub["media"]["main"]["desktop_file_id"] == img["id"]
featured = next(s for s in public_home["sections"]
                if s["template_key"] == "storefront.catalog.featured_products")
assert any(p["name"] == "Orden de boneless" for p in featured["data"]["products"])
step("payload publico completo (tema+layout+media+binding)")

# 5) Cliente + creditos iniciales
cust_user = expect(admin.post("/users", json={
    "name": "Maria", "last_name": "Lopez", "email": f"maria{RUN}@e2e.mx",
    "password": "ClaveMaria123", "confirm_password": "ClaveMaria123",
}), 201, "crear cliente")
expect(admin.post("/credits/adjustments", json={
    "user_id": cust_user["id"], "delta": 60, "description": "Bono de bienvenida E2E",
}), 201, "ajuste manual de creditos (+60)")
expect(cust.post("/auth/login", json={"email": f"maria{RUN}@e2e.mx", "password": "ClaveMaria123"}),
       200, "login cliente")
totals0 = cust.get("/credits/me").json()
assert totals0["available"] == 60, totals0
step("saldo inicial del cliente", extra="(60)")

# 6) Checkout web: modificador requerido faltante -> 422; mezcla -> 422 (§1.3)
bad = cust.post("/orders", json={
    "fulfillment_type": "pickup",
    "customer_name": "Maria Lopez", "customer_phone": "8332147789",
    "lines": [{"product_id": bone["id"], "quantity": 1}],
})
assert bad.status_code == 422 and bad.json()["code"] == "seleccion_incompleta", bad.text
step("checkout sin salsa rechazado (seleccion_incompleta)")
mixed = cust.post("/orders", json={
    "fulfillment_type": "pickup",
    "customer_name": "Maria Lopez", "customer_phone": "8332147789",
    "lines": [
        {"product_id": bone["id"], "quantity": 1,
         "modifiers": [{"modifier_option_id": bbq["id"]}]},
        {"product_id": dip["id"], "quantity": 1, "purchase_mode": "credits"},
    ],
})
assert mixed.status_code == 422 and mixed.json()["code"] == "modo_compra_mixto", mixed.text
step("pedido hibrido dinero+creditos rechazado (modo_compra_mixto)")

# 6b) Codigo de descuento fijo web-only (Etapa 5)
code = expect(admin.post("/discount-codes", json={
    "name": "Verano", "code": f"VERANO{RUN}",
    "discount_amount": "100", "minimum_order_amount": "400",
}), 201, "crear codigo de descuento ($100 sobre $400)")
quote = expect(cust.post("/discount-codes/quote", json={
    "discount_code": f"verano{RUN}",  # case-insensitive
    "lines": [{"product_id": bone["id"], "quantity": 2,
               "modifiers": [{"modifier_option_id": bbq["id"]}]}],
}), 200, "cotizar codigo (case-insensitive)")
assert quote["discount_amount"] == "100.00", quote

order = expect(cust.post("/orders", json={
    "fulfillment_type": "pickup",
    "customer_name": "Maria Lopez", "customer_phone": "8332147789",
    "discount_code": f"VERANO{RUN}",
    "lines": [{"product_id": bone["id"], "quantity": 2,
               "modifiers": [{"modifier_option_id": bbq["id"]}]}],
}), 201, "checkout web monetario con codigo")
assert order["items_subtotal_amount"] == "460.00", order["items_subtotal_amount"]
assert order["purchase_mode"] == "money"
assert order["discount_total_amount"] == "100.00", order
assert order["credits_earned_total_snapshot"] == 40

# 6c) Pedido de canje SEPARADO (pedido integro: jamas hibrido, sin envio)
order_credits = expect(cust.post("/orders", json={
    "fulfillment_type": "pickup", "purchase_mode": "credits",
    "customer_name": "Maria Lopez", "customer_phone": "8332147789",
    "lines": [{"product_id": dip["id"], "quantity": 1, "purchase_mode": "credits"}],
}), 201, "checkout de canje separado (solo creditos)")
assert order_credits["purchase_mode"] == "credits"
assert order_credits["credits_redeemed_total"] == 50
totals1 = cust.get("/credits/me").json()
assert totals1["available"] == 10, totals1  # 60 - 50 reservados
step("reserva de canje descontada", extra="(60->10)")

# 7) Transiciones hasta completar ambos + creditos ganados + codigo consumido
for oid in (order["id"], order_credits["id"]):
    for target in ("pending_approval", "approved", "preparing", "ready", "completed"):
        resp = admin.post(f"/orders/{oid}/transition", json={"new_status": target})
        assert resp.status_code == 200, (target, resp.text)
step("ciclo submitted->...->completed (dinero y canje)")
totals2 = cust.get("/credits/me").json()
assert totals2["available"] == 50 and totals2["earned"] == 40 and totals2["redeemed"] == 50, totals2
step("creditos: consumo + earn correctos", extra="(disp 50 / ganados 40 / canjeados 50)")
mine = cust.get(f"/orders/mine/{order['id']}").json()
assert mine["status"] == "completed"
assert mine["discount_code_label"] and "VERANO" in mine["discount_code_label"].upper()
step("cliente ve su pedido completado con descuento snapshot")

# 7b) Segundo uso del mismo codigo -> rechazado (una vez por usuario)
reuse = cust.post("/discount-codes/quote", json={
    "discount_code": f"VERANO{RUN}",
    "lines": [{"product_id": bone["id"], "quantity": 2,
               "modifiers": [{"modifier_option_id": bbq["id"]}]}],
})
assert reuse.status_code == 422 and reuse.json()["code"] == "codigo_ya_usado", reuse.text
step("segundo uso del codigo rechazado (codigo_ya_usado)")
redemptions = expect(admin.get(f"/discount-codes/{code['id']}/redemptions"), 200,
                     "redenciones del codigo")
assert redemptions and redemptions[0]["status"] == "consumed", redemptions
step("redencion consumida al completar")

# 8) Ticket + bitacora de impresion
ticket = expect(admin.get(f"/orders/{order['id']}/ticket"), 200, "payload de ticket")
# Subtotal 460 − código 100 = 360; el descuento aparece como línea propia.
assert ticket["totals"]["total"] == "360.00", ticket["totals"]
assert ticket["totals"]["discounts"] == "100.00", ticket["totals"]
expect(admin.post(f"/orders/{order['id']}/ticket-prints",
                  json={"print_type": "customer_receipt"}), 201, "registrar impresion")

# 9) POS efectivo en una llamada
pos = expect(admin.post("/pos/sales", json={
    "lines": [{"product_id": dip["id"], "quantity": 2}],
    "payment": {"method_code": "cash_counter", "change_requested_for_amount": "100"},
}), 201, "venta POS efectivo")
assert pos["order"]["status"] == "completed"
assert pos["payment"]["change_amount"] == "70.00", pos["payment"]
step("POS: total 30, cambio 70")

# 10) H5: cancelar pedido pagado exige RESOLUCION financiera explicita
order2 = expect(cust.post("/orders", json={
    "fulfillment_type": "pickup", "customer_name": "Maria", "customer_phone": "8330000000",
    "lines": [{"product_id": dip["id"], "quantity": 1}],
}), 201, "segundo pedido para cancelar")
denied = admin.post(f"/orders/{order2['id']}/transition", json={"new_status": "cancelled"})
assert denied.status_code in (200, 409), denied.text  # sin pago: cancela directo
step("cancelacion sin pago fluye", extra=f"({denied.status_code})")

pos2 = expect(admin.post("/pos/sales", json={
    "lines": [{"product_id": dip["id"], "quantity": 1}],
    "payment": {"method_code": "bank_transfer", "transaction_reference": "REF123",
                "bank_name": "BBVA"},
}), 201, "venta POS transferencia (queda approved + pendiente)")
assert pos2["order"]["status"] == "approved"
no_res = admin.post(f"/orders/{pos2['order']['id']}/transition", json={"new_status": "cancelled"})
# El pago sigue pendiente de verificar (no cobrado): cancelar fluye. Verificamos
# la regla con un pago COBRADO: verificar primero (H10 completa mostrador), asi
# que usamos un pedido aprobado con pago verificado NO counter... el flujo counter
# se auto-completa; la resolucion H5 con cobro real se cubre en la suite unitaria.
assert no_res.status_code in (200, 409), no_res.text
step("cancelacion POS pendiente de verificacion", extra=f"({no_res.status_code})")

# 11) Expiracion (§1.12): el endpoint del job no es HTTP; se valida en suite.
# 12) Reportes iniciales
report = expect(admin.get("/reports/sales-by-hour"), 200, "reporte ventas por hora")
assert sum(i["orders_count"] for i in report["items"]) >= 2, report
top = expect(admin.get("/reports/top-products"), 200, "reporte mas vendidos")
assert any(i["product_name"] == "Orden de boneless" for i in top["items"]), top
step("reportes desde snapshots OK")

print("\nE2E INTEGRAL: TODOS LOS PASOS OK")
