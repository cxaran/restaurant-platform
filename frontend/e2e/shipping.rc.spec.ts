import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  test,
  expect,
  request as pwRequest,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

// ---------------------------------------------------------------------------
// Spec de zonas de entrega y cotización de envío contra el stack Docker E2E
// (compose.e2e.yml, PostGIS real). Mismo patrón que restaurant.rc.spec.ts:
// preparación vía API + FLUJOS DE USUARIO vía UI real. Cubre:
//   · /admin/zona-entrega: crear zona dibujando en el mapa, tarifas, edición,
//     activar/desactivar y solape por prioridad;
//   · cotización backend: dentro de zona, envío gratis, mínimo no cumplido,
//     fuera de zona, zona sin tarifa (API directa = autoridad);
//   · checkout web: ubicación OBLIGATORIA (pin/GPS/dirección guardada),
//     recotización al cambiar pin y subtotal, calculated vs pending_review
//     sin total falso, y verificación de que el frontend NO envía montos;
//   · /cuenta: alta de dirección guardada con coordenadas;
//   · POS: captura interna con el mismo selector/cotización;
//   · viewports mobile/tablet/desktop.
// ---------------------------------------------------------------------------

const appBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:31080";
const RUN = Date.now().toString(36).slice(-5).toUpperCase();

const adminEmail = "admin.rc@example.com";
const adminPassword = "Rc-admin-123";
const clienteEmail = "cliente.envio.rc@example.com";
const clientePassword = "Rc-cliente-123";
const cajeroEmail = "cajero.envio.rc@example.com";
const cajeroPassword = "Rc-cajero-123";

const productName = `Taco Envío RC ${RUN}`;
const zoneCentroCode = `centro-${RUN.toLowerCase()}`;
const zoneCentroName = `Centro RC ${RUN}`;
const zoneVipCode = `vip-${RUN.toLowerCase()}`;
const zoneVipName = `VIP RC ${RUN}`;
const zoneSinTarifaCode = `sintarifa-${RUN.toLowerCase()}`;
const zoneSinTarifaName = `Sin tarifa RC ${RUN}`;

// Centro por defecto de los mapas del frontend (leaflet-loader DEFAULT_CENTER).
const CENTER = { longitude: -99.1332, latitude: 19.4326 };
// Punto fuera de TODA zona (≈21 km al oeste) — usado por la geolocalización
// simulada del navegador y por las cotizaciones API de "fuera de zona".
const OUTSIDE = { longitude: -99.3332, latitude: 19.4326 };
// Zona sin tarifa: cuadrado alrededor de un punto a ~21 km al este.
const SIN_TARIFA_CENTER = { longitude: -98.9332, latitude: 19.4326 };

function squareAround(center: { longitude: number; latitude: number }, delta: number) {
  const { longitude: lon, latitude: lat } = center;
  return {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [lon - delta, lat - delta],
          [lon + delta, lat - delta],
          [lon + delta, lat + delta],
          [lon - delta, lat + delta],
          [lon - delta, lat - delta],
        ],
      ],
    ],
  };
}

const ORIGIN = { Origin: appBaseUrl };
const repoRoot = resolve(process.cwd(), "..");
const composeFile = resolve(repoRoot, "compose.e2e.yml");

function clearRateLimitKeys() {
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "exec",
      "-T",
      "redis",
      "sh",
      "-c",
      "redis-cli --scan --pattern 'restaurant-platform:rate-limit:*' | xargs -r redis-cli del",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

// Payloads del backend consumidos de forma dinámica en el arnés E2E.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function expectStatus(response: APIResponse, status: number): Promise<any> {
  if (response.status() !== status) {
    throw new Error(
      `${response.url()} → ${response.status()} (esperaba ${status}): ${await response.text()}`,
    );
  }
  const type = response.headers()["content-type"] ?? "";
  return type.includes("json") ? response.json() : null;
}

async function loginContext(context: BrowserContext, email: string, password: string) {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { email, password },
  });
  await expectStatus(response, 200);
}

/** Cotización pública directa (la autoridad que la UI solo refleja). */
async function apiQuote(
  subtotal: string,
  point: { longitude: number; latitude: number } | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const response = await admin.post("/api/v1/public/shipping-quote", {
    data: {
      subtotal,
      location: point
        ? { type: "Point", coordinates: [point.longitude, point.latitude] }
        : null,
    },
  });
  return expectStatus(response, 200);
}

/** Espera a que Leaflet monte el mapa (agrega .leaflet-container al div). */
async function waitForMap(page: Page, testId: string): Promise<Locator> {
  const map = page.locator(`[data-testid="${testId}"]`);
  await expect(map).toHaveClass(/leaflet-container/, { timeout: 20_000 });
  return map;
}

/** Claves con nombre de monto/costo de envío que el frontend JAMÁS debe enviar. */
function collectForbiddenMoneyKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => collectForbiddenMoneyKeys(item, `${path}[${i}]`));
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const where = path ? `${path}.${key}` : key;
    const forbidden = /shipping|amount|fee|total/i.test(key) ? [where] : [];
    return [...forbidden, ...collectForbiddenMoneyKeys(child, where)];
  });
}

// Estado compartido entre escenarios (serial: mismo worker).
let admin: APIRequestContext;
let productId = "";
let zoneCentroId = "";
let zoneVipId = "";
let posPendingOrderId = ""; // captura POS sin coordenadas (pending_review)
let posPendingOrderCode = "";

let customerContext: BrowserContext;
let customerPage: Page;
let adminContext: BrowserContext;
let adminPage: Page;
let cajeroContext: BrowserContext;
let cajeroPage: Page;

test.describe.serial("Zonas de entrega y cotización de envío end-to-end", () => {
  test.beforeEach(() => {
    clearRateLimitKeys();
  });

  test.afterAll(async () => {
    for (const context of [customerContext, adminContext, cajeroContext]) {
      await context?.close().catch(() => {});
    }
    await admin?.dispose().catch(() => {});
  });

  test("Preparación vía API: bootstrap, catálogo, usuarios y limpieza de zonas", async () => {
    test.setTimeout(360_000);
    console.log(`SHIPPING RUN=${RUN}`);

    admin = await pwRequest.newContext({ baseURL: appBaseUrl, extraHTTPHeaders: ORIGIN });

    await test.step("El stack responde /api/health", async () => {
      await expect
        .poll(
          async () => {
            try {
              return (await admin.get("/api/health")).status();
            } catch {
              return 0;
            }
          },
          { timeout: 300_000, intervals: [2_000] },
        )
        .toBe(200);
    });

    await test.step("Bootstrap (si aplica) y login admin", async () => {
      const status = await expectStatus(await admin.get("/api/v1/bootstrap/status"), 200);
      if (status.setup_required) {
        await expectStatus(
          await admin.post("/api/v1/bootstrap/initialize", {
            data: {
              user: {
                name: "Admin",
                last_name: "Fundador",
                email: adminEmail,
                password: adminPassword,
                confirm_password: adminPassword,
              },
            },
          }),
          201,
        );
      }
      await expectStatus(
        await admin.post("/api/v1/auth/login", {
          data: { email: adminEmail, password: adminPassword },
        }),
        200,
      );
    });

    await test.step("Negocio permite pickup, delivery y mostrador", async () => {
      await expectStatus(
        await admin.patch("/api/v1/business/settings", {
          data: { allow_pickup: true, allow_delivery: true, allow_counter_sales: true },
        }),
        200,
      );
    });

    await test.step("Zonas de corridas previas quedan inactivas (cotización determinista)", async () => {
      const page = await expectStatus(await admin.get("/api/v1/shipping/zones?limit=100"), 200);
      for (const zone of page.items ?? []) {
        if (zone.is_active) {
          await expectStatus(
            await admin.patch(`/api/v1/shipping/zones/${zone.id}`, {
              data: { is_active: false },
            }),
            200,
          );
        }
      }
    });

    await test.step("Catálogo: producto simple de $100", async () => {
      const category = await expectStatus(
        await admin.post("/api/v1/catalog/categories", { data: { name: `Envíos RC ${RUN}` } }),
        201,
      );
      const product = await expectStatus(
        await admin.post("/api/v1/catalog/products", {
          data: {
            category_id: category.id,
            name: productName,
            money_price_amount: "100",
            credits_awarded_per_unit: 0,
          },
        }),
        201,
      );
      productId = product.id;
      expect(productId).toBeTruthy();
    });

    await test.step("Cliente y cajero existen con sus roles", async () => {
      const cliente = await admin.post("/api/v1/users", {
        data: {
          name: "Cliente",
          last_name: "Envios",
          email: clienteEmail,
          password: clientePassword,
          confirm_password: clientePassword,
          is_active: true,
        },
      });
      if (cliente.status() !== 201) await expectStatus(cliente, 409).catch(() => {});

      const cajeroRole = await expectStatus(
        await admin.post("/api/v1/roles", {
          data: {
            name: `Cajero Envíos RC ${RUN}`,
            description: "Cajero del spec de envíos",
            permissions: [
              "orders:read",
              "orders:capture",
              "orders:transition",
              "payments:read",
              "payments:record",
            ],
          },
        }),
        201,
      );
      const createdCajero = await admin.post("/api/v1/users", {
        data: {
          name: "Cajero",
          last_name: "Envios",
          email: cajeroEmail,
          password: cajeroPassword,
          confirm_password: cajeroPassword,
          is_active: true,
        },
      });
      let cajeroId: string;
      if (createdCajero.status() === 201) {
        cajeroId = (await createdCajero.json()).id;
      } else {
        const listed = await expectStatus(await admin.get("/api/v1/users?limit=100"), 200);
        cajeroId = (listed.items ?? []).find(
          (item: { email?: string }) => item.email?.toLowerCase() === cajeroEmail,
        )?.id;
      }
      await expectStatus(
        await admin.put(`/api/v1/users/${cajeroId}/roles`, {
          data: { role_ids: [cajeroRole.id] },
        }),
        200,
      );
    });
  });

  test("B. /admin/zona-entrega: crear zona dibujando en el mapa + tarifa (UI)", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    adminContext = await browser.newContext({ baseURL: appBaseUrl });
    await loginContext(adminContext, adminEmail, adminPassword);
    adminPage = await adminContext.newPage();
    const page = adminPage;

    await test.step("La navegación contract-driven muestra el módulo", async () => {
      await page.goto("/admin");
      await expect(
        page.getByRole("link", { name: "Zonas de entrega" }).first(),
      ).toBeVisible({ timeout: 20_000 });
    });

    await test.step("Dibujar la cobertura de la zona Centro alrededor del centro", async () => {
      await page.goto("/admin/zona-entrega");
      await page.getByTestId("zone-new").click();
      await page.getByTestId("zone-code").fill(zoneCentroCode);
      await page.getByTestId("zone-name").fill(zoneCentroName);
      await page.getByTestId("zone-description").fill("Zona dibujada por el E2E");

      const map = await waitForMap(page, "zone-map-editor-map");
      const box = await map.boundingBox();
      if (!box) throw new Error("El mapa del editor no tiene boundingBox");
      const cx = box.width / 2;
      const cy = box.height / 2;

      await page.getByTestId("zone-map-editor-draw").click();
      // Cuadrado ~±100 px alrededor del centro (contiene DEFAULT_CENTER).
      for (const [dx, dy] of [
        [-100, 80],
        [100, 80],
        [100, -80],
        [-100, -80],
      ] as const) {
        await map.click({ position: { x: cx + dx, y: cy + dy } });
      }
      await expect(page.getByTestId("zone-map-editor-close-polygon")).toContainText("4 vértices");
      await page.getByTestId("zone-map-editor-close-polygon").click();
      await page.getByTestId("zone-save").click();
      await expect(page.getByTestId(`zone-item-${zoneCentroCode}`)).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step("El backend persistió un MultiPolygon que cubre el centro", async () => {
      const zonesPage = await expectStatus(
        await admin.get("/api/v1/shipping/zones?limit=100"),
        200,
      );
      const zone = (zonesPage.items ?? []).find(
        (item: { code?: string }) => item.code === zoneCentroCode,
      );
      expect(zone).toBeTruthy();
      zoneCentroId = zone.id;
      const detail = await expectStatus(
        await admin.get(`/api/v1/shipping/zones/${zoneCentroId}`),
        200,
      );
      expect(detail.coverage?.type).toBe("MultiPolygon");
    });

    await test.step("Crear la tarifa Base por UI (min 50, gratis desde 500)", async () => {
      await adminPage.getByTestId(`zone-item-${zoneCentroCode}`).click();
      await adminPage.getByTestId("rate-new").click();
      await adminPage.getByTestId("rate-name").fill(`Base RC ${RUN}`);
      await adminPage.getByTestId("rate-base-fee").fill("35");
      await adminPage.getByTestId("rate-minimum").fill("50");
      await adminPage.getByTestId("rate-free-from").fill("500");
      await adminPage.getByTestId("rate-minutes").fill("40");
      await adminPage.getByTestId("rate-save").click();
      await expect(adminPage.getByTestId(`rate-row-Base RC ${RUN}`)).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step("Editar la tarifa por UI (40 → 45 minutos)", async () => {
      await adminPage
        .getByTestId(`rate-row-Base RC ${RUN}`)
        .getByRole("button", { name: "Editar" })
        .click();
      await adminPage.getByTestId("rate-minutes").fill("45");
      await adminPage.getByTestId("rate-save").click();
      await expect(adminPage.getByTestId(`rate-row-Base RC ${RUN}`)).toContainText("~45 min");
    });
  });

  test("C. Cotización backend: dentro, gratis, mínimo, fuera y zona sin tarifa (API)", async () => {
    test.setTimeout(120_000);

    await test.step("Dentro de zona con mínimo cumplido → calculated 35", async () => {
      const quote = await apiQuote("100", CENTER);
      expect(quote.status).toBe("calculated");
      expect(quote.zone_name).toBe(zoneCentroName);
      expect(Number.parseFloat(quote.amount)).toBe(35);
      expect(quote.is_free_shipping).toBe(false);
      expect(quote.estimated_minutes).toBe(45);
    });

    await test.step("Mínimo NO cumplido (subtotal 30 < 50) → pending_review", async () => {
      const quote = await apiQuote("30", CENTER);
      expect(quote.status).toBe("pending_review");
      expect(quote.amount).toBeNull();
    });

    await test.step("Envío gratis (subtotal 600 ≥ 500) → calculated 0 gratis", async () => {
      const quote = await apiQuote("600", CENTER);
      expect(quote.status).toBe("calculated");
      expect(Number.parseFloat(quote.amount)).toBe(0);
      expect(quote.is_free_shipping).toBe(true);
    });

    await test.step("Fuera de toda zona → pending_review sin zona", async () => {
      const quote = await apiQuote("100", OUTSIDE);
      expect(quote.status).toBe("pending_review");
      expect(quote.zone_name).toBeNull();
    });

    await test.step("Sin ubicación → pending_review (el pedido se recibe igual)", async () => {
      const quote = await apiQuote("100", null);
      expect(quote.status).toBe("pending_review");
    });

    await test.step("Zona sin tarifa: cubre el punto pero no cotiza", async () => {
      const zone = await expectStatus(
        await admin.post("/api/v1/shipping/zones", {
          data: {
            code: zoneSinTarifaCode,
            name: zoneSinTarifaName,
            coverage: squareAround(SIN_TARIFA_CENTER, 0.05),
            priority: 0,
          },
        }),
        201,
      );
      expect(zone.id).toBeTruthy();
      const quote = await apiQuote("100", SIN_TARIFA_CENTER);
      expect(quote.status).toBe("pending_review");
      expect(quote.zone_name).toBe(zoneSinTarifaName);
    });
  });

  test("D. Solape por prioridad + edición y desactivación por UI", async () => {
    test.setTimeout(180_000);

    await test.step("Zona VIP solapada con prioridad 10 y tarifa 20 (API)", async () => {
      const vip = await expectStatus(
        await admin.post("/api/v1/shipping/zones", {
          data: {
            code: zoneVipCode,
            name: zoneVipName,
            coverage: squareAround(CENTER, 0.01),
            priority: 10,
          },
        }),
        201,
      );
      zoneVipId = vip.id;
      await expectStatus(
        await admin.post(`/api/v1/shipping/zones/${zoneVipId}/rates`, {
          data: { name: `VIP RC ${RUN}`, base_fee: "20" },
        }),
        201,
      );
    });

    await test.step("En el solape gana la prioridad MAYOR (VIP 20)", async () => {
      const quote = await apiQuote("100", CENTER);
      expect(quote.status).toBe("calculated");
      expect(quote.zone_name).toBe(zoneVipName);
      expect(Number.parseFloat(quote.amount)).toBe(20);
    });

    await test.step("Editar la prioridad de Centro por UI (0 → 1) sigue sin ganar", async () => {
      await adminPage.goto("/admin/zona-entrega");
      await adminPage.getByTestId(`zone-item-${zoneCentroCode}`).click();
      await adminPage.getByTestId("zone-priority").fill("1");
      await adminPage.getByTestId("zone-save").click();
      await expect(adminPage.getByText("Zona guardada.")).toBeVisible({ timeout: 20_000 });
      const quote = await apiQuote("100", CENTER);
      expect(quote.zone_name).toBe(zoneVipName); // 10 > 1
    });

    await test.step("Desactivar VIP por UI → vuelve a cotizar Centro (35)", async () => {
      await adminPage.getByTestId(`zone-item-${zoneVipCode}`).click();
      await adminPage.getByTestId("zone-toggle-active").click();
      await expect(
        adminPage.getByTestId(`zone-item-${zoneVipCode}`).getByText("Inactiva"),
      ).toBeVisible({ timeout: 20_000 });
      const quote = await apiQuote("100", CENTER);
      expect(quote.zone_name).toBe(zoneCentroName);
      expect(Number.parseFloat(quote.amount)).toBe(35);
    });
  });

  test("E. Cliente: dirección guardada con pin en /cuenta (UI)", async ({ browser }) => {
    test.setTimeout(240_000);
    // Geolocalización SIMULADA fuera de toda zona: el botón "Usar mi
    // ubicación" debe producir pending_review en el checkout.
    customerContext = await browser.newContext({
      baseURL: appBaseUrl,
      geolocation: { longitude: OUTSIDE.longitude, latitude: OUTSIDE.latitude },
      permissions: ["geolocation"],
    });
    await loginContext(customerContext, clienteEmail, clientePassword);
    customerPage = await customerContext.newPage();
    const page = customerPage;

    await test.step("Alta de dirección con pin en el centro del mapa", async () => {
      await page.goto("/cuenta");
      await page.getByTestId("address-new").click();
      await page.locator("#ad-street").fill(`Calle Envío RC ${RUN}`);
      await page.locator("#ad-ext").fill("12");
      await page.locator("#ad-col").fill("Centro");
      const map = await waitForMap(page, "address-location-map");
      const box = await map.boundingBox();
      if (!box) throw new Error("El mapa de dirección no tiene boundingBox");
      await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(page.getByTestId("address-location-coords")).toContainText("Pin:");
      await page.getByTestId("address-save").click();
      await expect(
        page.locator(".sf-rowlist-row").filter({ hasText: `Calle Envío RC ${RUN}` }),
      ).toBeVisible({ timeout: 20_000 });
    });

    await test.step("La dirección guardó coordenadas (API)", async () => {
      const listed = await customerContext.request.get("/api/v1/users/me/addresses");
      const addresses = await expectStatus(listed, 200);
      const saved = addresses.find(
        (item: { street?: string }) => item.street === `Calle Envío RC ${RUN}`,
      );
      expect(saved?.location?.coordinates).toHaveLength(2);
    });
  });

  test("F. Carrito + checkout delivery: dirección recordada, punto obligatorio, GPS y recotización (UI)", async () => {
    test.setTimeout(300_000);
    const page = customerPage;

    await test.step("Segunda dirección SIN ubicación (API, para cambiar en el carrito)", async () => {
      await expectStatus(
        await customerContext.request.post("/api/v1/users/me/addresses", {
          headers: ORIGIN,
          data: { street: `Calle SinMapa RC ${RUN}` },
        }),
        201,
      );
    });

    await test.step("Carrito: la dirección sin ubicación no puede calcular; cambiarla estima $35", async () => {
      await page.goto("/menu");
      const card = page.locator("article").filter({ hasText: productName });
      await card.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByRole("link", { name: /Carrito, 1 producto/ })).toBeVisible();
      await page.goto("/carrito");
      // Sin selección recordada gana la más reciente (SinMapa): no cotiza.
      await expect(page.getByTestId("cart-shipping-estimate")).toHaveText("No se puede calcular");
      await expect(page.getByTestId("cart-total-estimate")).toContainText("+ envío");
      // Cambiar a la dirección con coordenadas estima $35 y total $135.
      await page.getByTestId(`cart-address-Calle Envío RC ${RUN}`).click();
      await expect(page.getByTestId("cart-shipping-estimate")).toHaveText("$35", {
        timeout: 15_000,
      });
      await expect(page.getByTestId("cart-total-estimate")).toHaveText("$135");
      await expect(page.getByRole("link", { name: /Finalizar pedido/ })).toContainText("$135");
    });

    await test.step("El checkout precarga la dirección recordada y cotiza solo", async () => {
      await page.goto("/checkout");
      await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
      await page.getByRole("button", { name: "A domicilio" }).click();
      await page.getByLabel("Teléfono").fill("5550002222");
      await expect(page.getByTestId("checkout-saved-address")).toHaveValue(/.+/);
      await expect(page.getByTestId("checkout-shipping-quote")).toContainText(/Envío\s*\$35/, {
        timeout: 15_000,
      });
      await expect(page.getByTestId("checkout-shipping-quote")).toContainText(zoneCentroName);
      await expect(page.getByRole("button", { name: /Confirmar pedido/ })).toContainText(
        "incl. envío",
      );
    });

    await test.step("Sin punto: confirmar está bloqueado con explicación", async () => {
      await page
        .getByTestId("checkout-saved-address")
        .selectOption({ label: "Capturar otra dirección" });
      await page.getByLabel("Calle").fill(`Calle Manual RC ${RUN}`);
      await waitForMap(page, "checkout-location-map");
      await page.getByTestId("checkout-location-clear").click();
      await expect(page.getByTestId("checkout-shipping-quote")).toContainText(
        "Coloca tu ubicación",
      );
      await expect(page.getByRole("button", { name: /Confirmar pedido/ })).toBeDisabled();
      await expect(
        page.getByText("Para confirmar una entrega a domicilio coloca tu ubicación"),
      ).toBeVisible();
    });

    await test.step("GPS explícito (fuera de zona) → pending_review sin total falso", async () => {
      await page.getByTestId("checkout-location-locate").click();
      await expect(page.getByTestId("checkout-location-coords")).toContainText("Pin:");
      await expect(page.getByTestId("checkout-shipping-quote")).toContainText(
        "Costo de envío por confirmar",
        { timeout: 15_000 },
      );
      const submit = page.getByRole("button", { name: /Confirmar pedido/ });
      await expect(submit).toBeEnabled();
      await expect(submit).toContainText("+ envío por confirmar");
    });

    await test.step("Volver a la dirección guardada → recotiza $35 (cambio de pin)", async () => {
      await page
        .getByTestId("checkout-saved-address")
        .selectOption({ label: `Calle Envío RC ${RUN}` });
      await expect(page.getByTestId("checkout-shipping-quote")).toContainText(/Envío\s*\$35/, {
        timeout: 15_000,
      });
    });

    await test.step("Recotización por subtotal: 6 unidades ($600) → envío gratis", async () => {
      await page.goto("/menu");
      const card = page.locator("article").filter({ hasText: productName });
      for (let i = 0; i < 5; i += 1) {
        await card.getByRole("button", { name: "Agregar" }).click();
      }
      await expect(page.getByRole("link", { name: /Carrito, 6 productos/ })).toBeVisible();
      // El carrito también recotiza con el nuevo subtotal: envío Gratis.
      await page.goto("/carrito");
      await expect(page.getByTestId("cart-shipping-estimate")).toHaveText("Gratis", {
        timeout: 15_000,
      });
      await page.goto("/checkout");
      await page.getByRole("button", { name: "A domicilio" }).click();
      await page.getByLabel("Teléfono").fill("5550002222");
      // La dirección recordada se precarga; con $600 el backend cotiza gratis.
      await expect(page.getByTestId("checkout-shipping-quote")).toContainText("Envío gratis", {
        timeout: 15_000,
      });
    });

    await test.step("Confirmar: el payload lleva punto y NINGÚN monto; el backend fija 0", async () => {
      const [request, response] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === "POST" && req.url().endsWith("/api/v1/orders"),
        ),
        page.waitForResponse(
          (res) =>
            res.request().method() === "POST" && res.url().endsWith("/api/v1/orders"),
        ),
        page.getByRole("button", { name: /Confirmar pedido/ }).click(),
      ]);
      const payload = request.postDataJSON() as Record<string, unknown>;
      const delivery = payload.delivery as Record<string, unknown>;
      expect((delivery.location as { coordinates: number[] }).coordinates).toHaveLength(2);
      expect(delivery.user_address_id).toBeTruthy();
      // El frontend JAMÁS envía montos de envío/total como verdad económica.
      expect(collectForbiddenMoneyKeys(payload)).toEqual([]);

      const order = await response.json();
      await expect(page).toHaveURL(new RegExp(`/pedidos/${order.id}`), { timeout: 20_000 });

      const detail = await expectStatus(await admin.get(`/api/v1/orders/${order.id}`), 200);
      expect(detail.shipping.calculation_status).toBe("calculated");
      expect(detail.shipping.is_free_shipping).toBe(true);
      expect(Number.parseFloat(detail.shipping.final_amount)).toBe(0);
      expect(detail.shipping.calculation_source).toBe("free_shipping_rule");
      expect(detail.delivery.location_source).toBe("customer_selected");
    });

    await test.step("Una dirección NUEVA capturada a mano se guarda en la libreta", async () => {
      await page.goto("/menu");
      await page
        .locator("article")
        .filter({ hasText: productName })
        .getByRole("button", { name: "Agregar" })
        .click();
      await page.goto("/checkout");
      await page.getByRole("button", { name: "A domicilio" }).click();
      await page.getByLabel("Teléfono").fill("5550002222");
      // Las guardadas van primero (preseleccionada); capturar OTRA dirección
      // conserva el pin y muestra la casilla de guardado (activada).
      await page
        .getByTestId("checkout-saved-address")
        .selectOption({ label: "Capturar otra dirección" });
      await page.getByLabel("Calle").fill(`Calle Nueva RC ${RUN}`);
      await page.getByLabel("Número").fill("7");
      await expect(page.getByTestId("checkout-save-address")).toBeChecked();
      await expect(page.getByTestId("checkout-shipping-quote")).toContainText(/Envío\s*\$35/, {
        timeout: 15_000,
      });
      await Promise.all([
        page.waitForResponse(
          (res) => res.request().method() === "POST" && res.url().endsWith("/api/v1/orders"),
        ),
        page.getByRole("button", { name: /Confirmar pedido/ }).click(),
      ]);
      await expect(page).toHaveURL(/\/pedidos\//, { timeout: 20_000 });
      // La libreta del cliente ahora incluye la dirección nueva CON coordenadas.
      await expect
        .poll(
          async () => {
            const listed = await customerContext.request.get("/api/v1/users/me/addresses");
            const items = await listed.json();
            const saved = (items as { street?: string; location?: unknown }[]).find(
              (item) => item.street === `Calle Nueva RC ${RUN}`,
            );
            return saved?.location ? "guardada-con-ubicacion" : saved ? "sin-ubicacion" : "no";
          },
          { timeout: 15_000 },
        )
        .toBe("guardada-con-ubicacion");
    });
  });

  test("G. POS: captura interna con el mismo selector y cotización backend (UI)", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    cajeroContext = await browser.newContext({ baseURL: appBaseUrl });
    await loginContext(cajeroContext, cajeroEmail, cajeroPassword);
    cajeroPage = await cajeroContext.newPage();
    const page = cajeroPage;

    async function fillDeliveryCapture() {
      await page.getByRole("button", { name: "Llamada" }).click();
      await page.getByRole("button", { name: "A domicilio" }).click();
      await page.getByLabel("Nombre del cliente").fill("Cliente Telefónico");
      await page.getByLabel("Teléfono del cliente").fill("5550003333");
      await page.getByLabel("Calle", { exact: true }).fill(`Calle POS RC ${RUN}`);
    }

    await test.step("Sin coordenadas: el envío queda por confirmar (pending_review)", async () => {
      await page.goto("/panel/pos");
      await page.getByRole("button", { name: new RegExp(productName) }).click();
      await fillDeliveryCapture();
      await expect(page.getByTestId("pos-shipping-quote")).toContainText(
        "Sin ubicación el envío queda por confirmar",
      );
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.request().method() === "POST" && res.url().includes("/orders/capture"),
        ),
        page.getByRole("button", { name: "Registrar pedido" }).click(),
      ]);
      const order = await response.json();
      posPendingOrderId = order.id;
      posPendingOrderCode = order.public_code;
      const detail = await expectStatus(await admin.get(`/api/v1/orders/${order.id}`), 200);
      expect(detail.shipping.calculation_status).toBe("pending_review");
      expect(detail.shipping.final_amount).toBeNull();
    });

    await test.step("Con pin en zona: cotiza $35 y el backend lo fija al capturar", async () => {
      await page.getByRole("button", { name: new RegExp(productName) }).click();
      await fillDeliveryCapture();
      const map = await waitForMap(page, "pos-location-map");
      const box = await map.boundingBox();
      if (!box) throw new Error("El mapa del POS no tiene boundingBox");
      await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(page.getByTestId("pos-shipping-quote")).toContainText(/Envío estimado:\s*\$35/, {
        timeout: 15_000,
      });
      const [request, response] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === "POST" && req.url().includes("/orders/capture"),
        ),
        page.waitForResponse(
          (res) => res.request().method() === "POST" && res.url().includes("/orders/capture"),
        ),
        page.getByRole("button", { name: "Registrar pedido" }).click(),
      ]);
      const payload = request.postDataJSON() as Record<string, unknown>;
      expect(collectForbiddenMoneyKeys(payload)).toEqual([]);
      const order = await response.json();
      const detail = await expectStatus(await admin.get(`/api/v1/orders/${order.id}`), 200);
      expect(detail.shipping.calculation_status).toBe("calculated");
      expect(Number.parseFloat(detail.shipping.final_amount)).toBe(35);
      expect(detail.shipping.calculation_source).toBe("polygon_auto");
      expect(detail.delivery.location_source).toBe("employee_selected");
    });
  });

  test("H. Panel de pedidos: resolver envío con pin/manual y aprobar (UI)", async () => {
    test.setTimeout(300_000);
    const page = adminPage;

    await test.step("El pedido POS sin coordenadas bloquea Aprobar con explicación", async () => {
      await page.goto("/panel/pedidos");
      await page.getByRole("button", { name: new RegExp(posPendingOrderCode) }).first().click();
      // "Revisar pedido" (empleado) lo pasa a por-aprobar; el repartidor NO
      // participa aquí (toma envíos en /panel/reparto después de aprobar).
      await page.getByRole("button", { name: "Revisar pedido" }).click();
      await expect(page.getByTestId("shipping-blocks-approval")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: "Aprobar pedido" })).toBeDisabled();
    });

    await test.step("Pin en zona → Aplicar cotización fija $35 (recotizado en backend)", async () => {
      await page.getByTestId("shipping-resolve-open").click();
      const map = await waitForMap(page, "order-shipping-location-map");
      const box = await map.boundingBox();
      if (!box) throw new Error("El mapa del detalle no tiene boundingBox");
      await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(page.getByTestId("order-shipping-quote")).toContainText(/\$35/, {
        timeout: 15_000,
      });
      await page.getByTestId("shipping-apply-quote").click();
      await expect(page.getByTestId("shipping-blocks-approval")).toBeHidden({
        timeout: 20_000,
      });
      const detail = await expectStatus(
        await admin.get(`/api/v1/orders/${posPendingOrderId}`),
        200,
      );
      expect(detail.shipping.calculation_status).toBe("finalized");
      expect(Number.parseFloat(detail.shipping.final_amount)).toBe(35);
      expect(detail.shipping.calculation_source).toBe("polygon_auto");
      expect(detail.delivery.location_source).toBe("employee_selected");
      expect(detail.delivery.location?.coordinates).toHaveLength(2);
    });

    await test.step("Con el costo fijado, Aprobar procede (con su diálogo)", async () => {
      const approve = page.getByRole("button", { name: "Aprobar pedido" });
      await expect(approve).toBeEnabled();
      await approve.click();
      // Aprobar abre un diálogo de confirmación (aclaración/nota opcionales):
      // se confirma sin notas y el badge del DETALLE pasa a APROBADO.
      await expect(page.getByText("Aprobar congela los totales")).toBeVisible();
      await page.getByRole("button", { name: "Aprobar pedido" }).last().click();
      await expect(page.getByText("Aprobar congela los totales")).toBeHidden({
        timeout: 20_000,
      });
      await expect(
        page
          .locator(`section[aria-label="Detalle del pedido ${posPendingOrderCode}"]`)
          .getByText("APROBADO", { exact: true }),
      ).toBeVisible({ timeout: 20_000 });
    });

    await test.step("Imprimir ticket es DIRECTO y registra la bitácora (sin /panel/tickets)", async () => {
      await page.getByTestId("ticket-print").click();
      await expect(page.getByTestId("ticket-print-note")).toContainText(
        /Ticket impreso|Reimpresión/,
        { timeout: 20_000 },
      );
      const prints = await expectStatus(
        await admin.get(`/api/v1/orders/${posPendingOrderId}/ticket-prints`),
        200,
      );
      expect(prints.length).toBeGreaterThanOrEqual(1);
      expect(prints[0].print_type).toBe("customer_receipt");
      // La página vieja ya no existe: no hay vista previa intermedia.
      const gone = await page.request.get("/panel/tickets");
      expect(gone.status()).toBe(404);
    });

    await test.step("Fuera de zona el backend exige manual (422 fuera_de_zona)", async () => {
      const captured = await expectStatus(
        await admin.post("/api/v1/orders/capture", {
          data: {
            source: "phone",
            fulfillment_type: "delivery",
            purchase_mode: "money",
            lines: [{ product_id: productId, quantity: 1, purchase_mode: "money" }],
            customer_name: "Cliente Manual RC",
            customer_phone: "5550004444",
            delivery: { street: `Calle Panel RC ${RUN}` },
          },
        }),
        201,
      );
      const rejected = await admin.put(`/api/v1/orders/${captured.id}/shipping`, {
        data: {
          location: { type: "Point", coordinates: [OUTSIDE.longitude, OUTSIDE.latitude] },
        },
      });
      expect(rejected.status()).toBe(422);
      expect((await rejected.json()).code).toBe("fuera_de_zona");

      // El empleado SIEMPRE puede fijar el costo manual (con o sin pin).
      await page.goto("/panel/pedidos");
      await page
        .getByRole("button", { name: new RegExp(captured.public_code) })
        .first()
        .click();
      await page.getByTestId("shipping-resolve-open").click();
      await page.getByLabel("Monto de envío").fill("42");
      await page.getByLabel("Motivo del ajuste").fill("Zona sin tarifa: acuerdo telefónico");
      await page.getByTestId("shipping-apply-manual").click();
      await expect(page.getByTestId("shipping-blocks-approval")).toBeHidden({
        timeout: 20_000,
      });
      const detail = await expectStatus(await admin.get(`/api/v1/orders/${captured.id}`), 200);
      expect(detail.shipping.calculation_status).toBe("finalized");
      expect(Number.parseFloat(detail.shipping.final_amount)).toBe(42);
      expect(detail.shipping.calculation_source).toBe("employee_manual_override");
    });
  });

  test("I. Responsive: mobile, tablet y desktop", async () => {
    test.setTimeout(180_000);

    await test.step("Checkout en mobile (390×844) muestra mapa y cotización", async () => {
      const page = customerPage;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/menu");
      await page
        .locator("article")
        .filter({ hasText: productName })
        .getByRole("button", { name: "Agregar" })
        .click();
      await page.goto("/checkout");
      await page.getByRole("button", { name: "A domicilio" }).click();
      await waitForMap(page, "checkout-location-map");
      await expect(page.getByTestId("checkout-shipping-quote")).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    await test.step("/admin/zona-entrega usable en tablet (820×1180)", async () => {
      const page = adminPage;
      await page.setViewportSize({ width: 820, height: 1180 });
      await page.goto("/admin/zona-entrega");
      await expect(page.getByTestId(`zone-item-${zoneCentroCode}`)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId("preview-subtotal")).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    await test.step("Cotización de prueba del admin en desktop", async () => {
      const page = adminPage;
      await page.goto("/admin/zona-entrega");
      const map = await waitForMap(page, "preview-picker-map");
      const box = await map.boundingBox();
      if (!box) throw new Error("El mapa de la cotización de prueba no tiene boundingBox");
      await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(page.getByTestId("preview-result")).toContainText(/\$35|Cotiza/, {
        timeout: 15_000,
      });
    });
  });
});
