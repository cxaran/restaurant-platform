import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  test,
  expect,
  request as pwRequest,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// ---------------------------------------------------------------------------
// Spec de dominio del Release Candidate contra el stack Docker E2E aislado.
// Preparación vía API (rápida, cookie + Origin confiable) y FLUJOS DE USUARIO
// vía UI real. Los datos usan un sufijo de corrida (RUN) para poder re-ejecutar
// sin bajar el stack; los emails cumplen el patrón *.rc@example.com y son
// FIJOS (la creación de usuarios es idempotente entre corridas).
// ---------------------------------------------------------------------------

const appBaseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:31080";
const RUN = Date.now().toString(36).slice(-5).toUpperCase();

const adminEmail = "admin.rc@example.com";
const adminPassword = "Rc-admin-123";
const clienteEmail = "cliente.rc@example.com";
const clientePassword = "Rc-cliente-123";
const cajeroEmail = "cajero.rc@example.com";
const cajeroPassword = "Rc-cajero-123";
const cocinaEmail = "cocina.rc@example.com";
const cocinaPassword = "Rc-cocina-123";
const repartidorEmail = "repartidor.rc@example.com";
const repartidorPassword = "Rc-repartidor-123";

const burgerName = `Hamburguesa RC ${RUN}`;
const dessertName = `Postre RC ${RUN}`;
const waterName = `Agua RC ${RUN}`;
const groupName = `Término RC ${RUN}`;
const discountCode = `RCPROMO${RUN}`;
const heroTitle = `Sabor RC ${RUN}`;
const heroTitleV2 = `Nuevo sabor RC ${RUN}`;

// ---------------------------------------------------------------------------
// Helpers de API. Toda mutación autenticada por cookie exige un header Origin
// confiable (CSRF); el contexto admin lo lleva global, los contextos de
// navegador lo pasan por request.
// ---------------------------------------------------------------------------

const ORIGIN = { Origin: appBaseUrl };

// Limpia SOLO las claves de rate limit del Redis E2E (mismo patrón que el spec
// de bootstrap): las corridas repetidas contra el mismo stack agotan el bucket
// de checkout y el backend responde «Demasiados intentos».
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

// Normaliza el estado del storefront entre corridas: programar una revisión
// la saca de "draft" (el editor auto-crea OTRO borrador) y cancelar la
// programación la regresa a "draft" — quedan borradores huérfanos de corridas
// previas. Se archivan para que el borrador que la preparación edita y publica
// sea siempre el único vigente.
function archiveStaleStorefrontDrafts() {
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "platform",
      "-d",
      "restaurant_platform_e2e_test",
      "-c",
      "update storefront_page_revisions set status='archived', scheduled_publish_at=null where status in ('draft','scheduled');",
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

// Estado compartido entre escenarios (serial: mismo worker).
let admin: APIRequestContext;
let clienteId = "";
let burgerId = "";
let dessertId = "";
let waterId = "";
let optionMediaId = "";
let discountCodeId = "";
let creditsBase = 0; // saldo del cliente tras el ajuste de +100
let orderAId = ""; // pedido web monetario con código (escenario A)
let orderACode = "";
let orderCId = ""; // pedido de canje (escenario C)
let orderDId = ""; // pedido delivery capturado (escenario D)
let orderDCode = "";
let orderECaptureId = ""; // pedido phone+pickup pagado por transferencia (E)
let orderECaptureCode = "";

let customerContext: BrowserContext;
let customerPage: Page;
let cajeroContext: BrowserContext;
let cajeroPage: Page;
let cocinaContext: BrowserContext;
let cocinaPage: Page;
let repartidorContext: BrowserContext;
let repartidorPage: Page;
let adminContext: BrowserContext;
let adminPage: Page;

async function adminTransition(orderId: string, statuses: string[]) {
  for (const newStatus of statuses) {
    await expectStatus(
      await admin.post(`/api/v1/orders/${orderId}/transition`, {
        data: { new_status: newStatus },
      }),
      200,
    );
  }
}

// Crea un usuario admin→cliente/staff de forma idempotente (reruns del spec).
async function ensureUser(
  name: string,
  lastName: string,
  email: string,
  password: string,
): Promise<string> {
  const created = await admin.post("/api/v1/users", {
    data: {
      name,
      last_name: lastName,
      email,
      password,
      confirm_password: password,
      is_active: true,
    },
  });
  if (created.status() === 201) return (await created.json()).id as string;
  // Ya existía (corrida previa): lo localizamos en el listado admin.
  const listed = await expectStatus(await admin.get("/api/v1/users?limit=100"), 200);
  const found = (listed.items ?? []).find(
    (item: { email?: string }) => item.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!found) {
    throw new Error(`No se pudo crear ni localizar al usuario ${email}: ${await created.text()}`);
  }
  return found.id as string;
}

test.describe.serial("Release Candidate: dominio de restaurante end-to-end", () => {
  test.beforeEach(() => {
    clearRateLimitKeys();
  });

  test.afterAll(async () => {
    // NO bajamos el stack; solo cerramos contextos del navegador.
    for (const context of [
      customerContext,
      cajeroContext,
      cocinaContext,
      repartidorContext,
      adminContext,
    ]) {
      await context?.close().catch(() => {});
    }
    await admin?.dispose().catch(() => {});
  });

  test("Preparación vía API: bootstrap, catálogo, storefront, personal", async () => {
    test.setTimeout(360_000);
    console.log(`RC RUN=${RUN}`);

    admin = await pwRequest.newContext({
      baseURL: appBaseUrl,
      extraHTTPHeaders: ORIGIN,
    });

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

    await test.step("Bootstrap del stack virgen (si aplica) y login admin", async () => {
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

    await test.step("Configuración del negocio: pickup, delivery y mostrador", async () => {
      await expectStatus(
        await admin.patch("/api/v1/business/settings", {
          data: { allow_pickup: true, allow_delivery: true, allow_counter_sales: true },
        }),
        200,
      );
    });

    await test.step("Catálogo: categoría, productos y grupo requerido", async () => {
      const category = await expectStatus(
        await admin.post("/api/v1/catalog/categories", { data: { name: `Cocina RC ${RUN}` } }),
        201,
      );
      const burger = await expectStatus(
        await admin.post("/api/v1/catalog/products", {
          data: {
            category_id: category.id,
            name: burgerName,
            description: "Hamburguesa de la casa",
            money_price_amount: "150",
            credits_awarded_per_unit: 10,
            is_featured: true,
          },
        }),
        201,
      );
      burgerId = burger.id;
      const dessert = await expectStatus(
        await admin.post("/api/v1/catalog/products", {
          data: {
            category_id: category.id,
            name: dessertName,
            money_price_amount: "50",
            credits_awarded_per_unit: 0,
            credit_redemption_price: 40,
          },
        }),
        201,
      );
      dessertId = dessert.id;
      const water = await expectStatus(
        await admin.post("/api/v1/catalog/products", {
          data: {
            category_id: category.id,
            name: waterName,
            money_price_amount: "20",
            credits_awarded_per_unit: 0,
          },
        }),
        201,
      );
      waterId = water.id;

      const group = await expectStatus(
        await admin.post("/api/v1/catalog/modifier-groups", {
          data: {
            name: groupName,
            selection_type: "single",
            min_selections: 1,
            max_selections: 1,
            is_required: true,
          },
        }),
        201,
      );
      const media = await expectStatus(
        await admin.post(`/api/v1/catalog/modifier-groups/${group.id}/options`, {
          data: { name: "Media", price_adjustment: "0" },
        }),
        201,
      );
      optionMediaId = media.id;
      await expectStatus(
        await admin.post(`/api/v1/catalog/modifier-groups/${group.id}/options`, {
          data: { name: "Bien cocida", price_adjustment: "0" },
        }),
        201,
      );
      await expectStatus(
        await admin.put(`/api/v1/catalog/products/${burgerId}/modifier-groups`, {
          data: { groups: [{ modifier_group_id: group.id }] },
        }),
        200,
      );
    });

    await test.step("Storefront: borrador home con hero + featured, layout y publicación", async () => {
      archiveStaleStorefrontDrafts();
      const draft = await expectStatus(
        await admin.get("/api/v1/storefront/pages/home/draft"),
        200,
      );
      for (const section of draft.sections ?? []) {
        await admin.delete(`/api/v1/storefront/sections/${section.id}`);
      }
      await expectStatus(
        await admin.post("/api/v1/storefront/pages/home/draft/sections", {
          data: {
            template_key: "storefront.hero",
            sort_order: 10,
            content_config: {
              slides: [
                {
                  variant: "split",
                  title: heroTitle,
                  description: "Recién hecho todos los días.",
                  primary_cta: { label: "Pedir ahora", link_type: "menu_page" },
                },
              ],
            },
          },
        }),
        201,
      );
      await expectStatus(
        await admin.post("/api/v1/storefront/pages/home/draft/sections", {
          data: {
            template_key: "storefront.catalog.featured_products",
            sort_order: 20,
            content_config: { title: "Los más pedidos" },
          },
        }),
        201,
      );
      await expectStatus(
        await admin.put("/api/v1/storefront/layout", {
          data: {
            header_config: { nav_links: [{ label: "Menú", link_type: "menu_page" }] },
            footer_config: { note: "Hecho en casa RC" },
          },
        }),
        200,
      );
      await expectStatus(await admin.post("/api/v1/storefront/pages/home/publish"), 200);
      const publicHome = await expectStatus(
        await admin.get("/api/v1/public/storefront/home"),
        200,
      );
      const hero = publicHome.sections.find(
        (section: { template_key: string }) => section.template_key === "storefront.hero",
      );
      expect(hero.content.slides[0].title).toBe(heroTitle);
    });

    await test.step("Cliente con +100 créditos y código de descuento", async () => {
      clienteId = await ensureUser("Cliente", "Erceprueba", clienteEmail, clientePassword);
      await expectStatus(
        await admin.post("/api/v1/credits/adjustments", {
          data: { user_id: clienteId, delta: 100, description: "Bono de bienvenida RC" },
        }),
        201,
      );
      const totals = await expectStatus(
        await admin.get(`/api/v1/credits/users/${clienteId}`),
        200,
      );
      creditsBase = totals.available;

      const code = await expectStatus(
        await admin.post("/api/v1/discount-codes", {
          data: {
            name: `Promo RC ${RUN}`,
            code: discountCode,
            discount_amount: "50",
            minimum_order_amount: "100",
          },
        }),
        201,
      );
      discountCodeId = code.id;
    });

    await test.step("Personal: roles con permisos y usuarios asignados", async () => {
      // Nota: al rol Cajero se le agregan payments:verify (el escenario E
      // verifica transferencias como cajero) y deliveries:read (el escenario D
      // revisa la cola de /panel/entregas como cajero).
      const cajeroRole = await expectStatus(
        await admin.post("/api/v1/roles", {
          data: {
            name: `Cajero RC ${RUN}`,
            description: "Cajero del RC",
            permissions: [
              "orders:read",
              "orders:capture",
              "orders:transition",
              "orders:approve",
              "orders:cancel",
              "payments:read",
              "payments:record",
              "payments:verify",
              "tickets:print",
              "deliveries:read",
            ],
          },
        }),
        201,
      );
      const cocinaRole = await expectStatus(
        await admin.post("/api/v1/roles", {
          data: {
            name: `Cocina RC ${RUN}`,
            description: "Cocina del RC",
            permissions: ["orders:read", "orders:transition"],
          },
        }),
        201,
      );
      const repartidorRole = await expectStatus(
        await admin.post("/api/v1/roles", {
          data: {
            name: `Repartidor RC ${RUN}`,
            description: "Repartidor del RC",
            permissions: ["deliveries:self_assign", "deliveries:read"],
          },
        }),
        201,
      );

      const cajeroId = await ensureUser("Cajero", "Prueba", cajeroEmail, cajeroPassword);
      const cocinaId = await ensureUser("Cocina", "Prueba", cocinaEmail, cocinaPassword);
      const repartidorId = await ensureUser(
        "Repartidor",
        "Prueba",
        repartidorEmail,
        repartidorPassword,
      );
      await expectStatus(
        await admin.put(`/api/v1/users/${cajeroId}/roles`, {
          data: { role_ids: [cajeroRole.id] },
        }),
        200,
      );
      await expectStatus(
        await admin.put(`/api/v1/users/${cocinaId}/roles`, {
          data: { role_ids: [cocinaRole.id] },
        }),
        200,
      );
      await expectStatus(
        await admin.put(`/api/v1/users/${repartidorId}/roles`, {
          data: { role_ids: [repartidorRole.id] },
        }),
        200,
      );
      await expectStatus(
        await admin.put(`/api/v1/profiles/staff/${repartidorId}`, {
          data: { display_name: "Repartidor RC", can_deliver: true },
        }),
        200,
      );
    });
  });

  test("A. Portada y pedido monetario configurable (UI cliente)", async ({ browser }) => {
    test.setTimeout(240_000);
    customerContext = await browser.newContext({ baseURL: appBaseUrl });
    customerPage = await customerContext.newPage();
    const page = customerPage;

    await test.step("La portada publicada muestra el hero", async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: heroTitle })).toBeVisible();
    });

    await test.step("El producto con grupo requerido abre el configurador", async () => {
      await page.goto("/menu");
      await expect(page.getByRole("heading", { name: "Menú" })).toBeVisible();
      const burgerCard = page.locator("article").filter({ hasText: burgerName });
      await burgerCard.getByRole("button", { name: "Agregar" }).click();
      const dialog = page.getByRole("dialog", { name: burgerName });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("radio", { name: "Media" }).check();
      await dialog.getByRole("button", { name: /Agregar al carrito/ }).click();
      await expect(dialog).toBeHidden();
    });

    await test.step("El producto simple se agrega directo", async () => {
      const waterCard = page.locator("article").filter({ hasText: waterName });
      await waterCard.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByRole("link", { name: /Carrito, 2 productos/ })).toBeVisible();
    });

    await test.step("El carrito muestra 2 líneas y el modificador", async () => {
      await page.goto("/carrito");
      await expect(page.getByRole("heading", { name: "Tu carrito" })).toBeVisible();
      const lines = page.locator('ul[aria-live="polite"] > li');
      await expect(lines).toHaveCount(2);
      await expect(lines.filter({ hasText: burgerName })).toContainText("Media");
      await expect(lines.filter({ hasText: waterName })).toBeVisible();
      await page.getByRole("link", { name: "Continuar" }).click();
    });

    await test.step("Checkout exige sesión y el carrito sobrevive al login", async () => {
      await expect(page.getByText("Confirma tus datos para continuar")).toBeVisible();
      await page.getByRole("main").getByRole("link", { name: "Iniciar sesión" }).click();
      await expect(page).toHaveURL(/\/login\?next=%2Fcheckout|\/login\?next=\/checkout/);
      await page.getByLabel("Correo electrónico").fill(clienteEmail);
      await page.getByLabel("Contraseña", { exact: true }).fill(clientePassword);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page).toHaveURL(/\/checkout$/);
      await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
    });

    await test.step("Aplicar RCPROMO muestra el descuento de $50", async () => {
      await expect(
        page.getByRole("button", { name: "Recoger en tienda", pressed: true }),
      ).toBeVisible();
      await page.getByLabel("Teléfono").fill("5550001111");
      await page.getByLabel("¿Tienes un código de descuento?").fill(discountCode);
      await page.getByRole("button", { name: "Aplicar" }).click();
      await expect(page.getByText(`Código ${discountCode} · descuento de`)).toBeVisible();
      await expect(page.getByText(/descuento de\s*\$\s*50/)).toBeVisible();
    });

    await test.step("Enviar pedido pickup redirige al seguimiento con el descuento", async () => {
      await page.getByRole("button", { name: /Enviar pedido/ }).click();
      await page.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/);
      orderAId = page.url().split("/pedidos/")[1];
      await expect(page.getByRole("heading", { name: /Pedido / })).toBeVisible();
      await expect(page.getByText("Pedido recibido")).toBeVisible();
      // Línea de descuento visible (signo menos Unicode U+2212).
      await expect(page.getByText(/−\s*\$\s*50/)).toBeVisible();

      const mine = await expectStatus(
        await page.request.get(`/api/v1/orders/mine/${orderAId}`),
        200,
      );
      orderACode = mine.public_code;
      expect(mine.discount_total_amount).toBe("50.00");
      expect(mine.purchase_mode).toBe("money");
    });
  });

  test("B. El panel opera el pedido y el código queda consumido", async ({ browser }) => {
    test.setTimeout(240_000);
    cajeroContext = await browser.newContext({ baseURL: appBaseUrl });
    await loginContext(cajeroContext, cajeroEmail, cajeroPassword);
    cajeroPage = await cajeroContext.newPage();
    cocinaContext = await browser.newContext({ baseURL: appBaseUrl });
    await loginContext(cocinaContext, cocinaEmail, cocinaPassword);
    cocinaPage = await cocinaContext.newPage();

    const cajeroCard = cajeroPage.getByRole("listitem").filter({ hasText: orderACode });
    const cocinaCard = cocinaPage.getByRole("listitem").filter({ hasText: orderACode });

    await test.step("Cajero: Tomar y Aprobar", async () => {
      await cajeroPage.goto("/panel/pedidos");
      await expect(cajeroPage.getByRole("heading", { name: "Pedidos" })).toBeVisible();
      await expect(cajeroCard).toContainText("Nuevo");
      await cajeroCard.getByRole("button", { name: "Tomar" }).click();
      await expect(cajeroCard).toContainText("Por aprobar");
      await cajeroCard.getByRole("button", { name: "Aprobar" }).click();
      await expect(cajeroCard).toContainText("Aprobado");
    });

    await test.step("Cocina: A cocina y Listo", async () => {
      await cocinaPage.goto("/panel/pedidos");
      await expect(cocinaPage.getByRole("heading", { name: "Pedidos" })).toBeVisible();
      await cocinaCard.getByRole("button", { name: "A cocina" }).click();
      await expect(cocinaCard).toContainText("En preparación");
      await cocinaCard.getByRole("button", { name: "Listo" }).click();
      await expect(cocinaCard).toContainText(/Listo/);
    });

    await test.step("Cajero: Entregado (pickup) y el cliente lo ve Entregado", async () => {
      await cajeroPage.goto("/panel/pedidos");
      await cajeroCard.getByRole("button", { name: "Entregado" }).click();
      await expect(cajeroCard).toContainText("Entregado");

      await customerPage.goto(`/pedidos/${orderAId}`);
      await expect(customerPage.getByText("Entregado")).toBeVisible();
    });

    await test.step("La redención quedó consumida y un segundo uso da 422", async () => {
      const redemptions = await expectStatus(
        await admin.get(`/api/v1/discount-codes/${discountCodeId}/redemptions`),
        200,
      );
      const mine = redemptions.find(
        (item: { order_id: string }) => item.order_id === orderAId,
      );
      expect(mine?.status).toBe("consumed");

      const reuse = await customerContext.request.post("/api/v1/discount-codes/quote", {
        headers: ORIGIN,
        data: {
          discount_code: discountCode,
          lines: [{ product_id: waterId, quantity: 10 }],
        },
      });
      expect(reuse.status()).toBe(422);
      expect((await reuse.json()).code).toBe("codigo_ya_usado");
    });
  });

  test("C. Créditos sin mezcla: canje íntegro y saldo exacto", async () => {
    test.setTimeout(240_000);
    const page = customerPage;

    await test.step("Modo créditos: la hamburguesa queda bloqueada, el postre muestra créditos", async () => {
      await page.goto("/menu");
      await page.getByRole("button", { name: "Canjear créditos" }).click();
      await expect(
        page.getByRole("button", { name: "Canjear créditos", pressed: true }),
      ).toBeVisible();
      const burgerCard = page.locator("article").filter({ hasText: burgerName });
      await expect(burgerCard.getByText("Solo con dinero — crea un pedido separado")).toBeVisible();
      await expect(burgerCard.getByRole("button", { name: "Agregar" })).toHaveCount(0);

      const dessertCard = page.locator("article").filter({ hasText: dessertName });
      await expect(dessertCard.getByText("40 créditos")).toBeVisible();
      await dessertCard.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByRole("link", { name: /Carrito, 1 productos?/ })).toBeVisible();
    });

    await test.step("Checkout en modo créditos: solo pickup y botón de canje", async () => {
      await page.goto("/checkout");
      await expect(page.getByRole("heading", { name: "Finalizar pedido" })).toBeVisible();
      // En canje no hay elección de entrega: solo el chip fijo de pickup.
      await expect(page.getByText("Recoger en tienda", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "A domicilio" })).toHaveCount(0);
      await expect(page.getByLabel("¿Tienes un código de descuento?")).toHaveCount(0);
      await page.getByLabel("Teléfono").fill("5550001111");
      await page.getByRole("button", { name: "Canjear pedido con créditos" }).click();
      await page.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/);
      orderCId = page.url().split("/pedidos/")[1];
      const mine = await expectStatus(
        await page.request.get(`/api/v1/orders/mine/${orderCId}`),
        200,
      );
      expect(mine.purchase_mode).toBe("credits");
      expect(mine.credits_redeemed_total).toBe(40);
    });

    await test.step("Transiciones API hasta completed y saldo exacto en /creditos", async () => {
      await adminTransition(orderCId, [
        "pending_approval",
        "approved",
        "preparing",
        "ready",
        "completed",
      ]);
      // base + 10 (Hamburguesa del pedido A al completarse) − 40 (canje).
      const expected = creditsBase + 10 - 40;
      const totals = await expectStatus(
        await customerContext.request.get("/api/v1/credits/me"),
        200,
      );
      expect(totals.available).toBe(expected);

      await page.goto("/creditos");
      await expect(page.getByRole("heading", { name: "Mis créditos" })).toBeVisible();
      const availableCard = page
        .locator(".sf-card")
        .filter({ hasText: "Disponibles" });
      await expect(availableCard).toHaveText(new RegExp(`^\\s*${expected}\\s*Disponibles\\s*$`));
    });

    await test.step("Mezcla money+credits → 422 modo_compra_mixto", async () => {
      const mixed = await customerContext.request.post("/api/v1/orders", {
        headers: ORIGIN,
        data: {
          fulfillment_type: "pickup",
          customer_name: "Cliente RC",
          customer_phone: "5550001111",
          lines: [
            {
              product_id: burgerId,
              quantity: 1,
              modifiers: [{ modifier_option_id: optionMediaId }],
            },
            { product_id: dessertId, quantity: 1, purchase_mode: "credits" },
          ],
        },
      });
      expect(mixed.status()).toBe(422);
      expect((await mixed.json()).code).toBe("modo_compra_mixto");
    });

    await test.step("Canje con envío → 422 canje_sin_envio", async () => {
      const shipped = await customerContext.request.post("/api/v1/orders", {
        headers: ORIGIN,
        data: {
          fulfillment_type: "delivery",
          purchase_mode: "credits",
          customer_name: "Cliente RC",
          customer_phone: "5550001111",
          lines: [{ product_id: dessertId, quantity: 1, purchase_mode: "credits" }],
          delivery: { street: "Calle RC 1" },
        },
      });
      expect(shipped.status()).toBe(422);
      expect((await shipped.json()).code).toBe("canje_sin_envio");
    });
  });

  test("D. Reparto: cola, entrega en curso que sobrevive recargas", async ({ browser }) => {
    test.setTimeout(240_000);

    await test.step("Capturar pedido delivery telefónico y finalizar envío manual", async () => {
      const captured = await expectStatus(
        await admin.post("/api/v1/orders/capture", {
          data: {
            source: "phone",
            fulfillment_type: "delivery",
            purchase_mode: "money",
            customer_user_id: clienteId,
            customer_name: "Cliente RC",
            customer_phone: "5550001111",
            lines: [{ product_id: waterId, quantity: 2 }],
            delivery: {
              street: "Calle RC 123",
              neighborhood: "Centro RC",
              references: "Portón azul",
            },
          },
        }),
        201,
      );
      orderDId = captured.id;
      orderDCode = captured.public_code;
      // Sin zonas: el envío queda pendiente de revisión y se finaliza manual.
      expect(captured.shipping?.calculation_status).toBe("pending_review");
      await expectStatus(
        await admin.put(`/api/v1/orders/${orderDId}/shipping`, {
          data: { final_amount: "30", reason: "Zona fuera de polígonos RC" },
        }),
        200,
      );
      await adminTransition(orderDId, ["approved", "preparing", "ready"]);
    });

    await test.step("Repartidor: disponible, toma de la cola y sale a entregar", async () => {
      repartidorContext = await browser.newContext({ baseURL: appBaseUrl });
      await loginContext(repartidorContext, repartidorEmail, repartidorPassword);
      repartidorPage = await repartidorContext.newPage();
      const page = repartidorPage;
      await page.goto("/panel/reparto");
      await expect(page.getByRole("heading", { name: "Reparto" })).toBeVisible();
      await page.getByRole("button", { name: "Ponerme disponible" }).click();
      await expect(page.getByRole("button", { name: "Disponible", pressed: true })).toBeVisible();

      const queueItem = page
        .locator("section", { has: page.getByRole("heading", { name: "Listos para salir" }) })
        .locator("div")
        .filter({ hasText: orderDCode });
      await expect(queueItem.first()).toBeVisible();
      await page.getByRole("button", { name: "Tomar" }).click();
      await expect(page.getByText(`${orderDCode} · Asignada`)).toBeVisible();
      await page.getByRole("button", { name: "Salir a entregar" }).click();
      await expect(page.getByText(`${orderDCode} · En camino`)).toBeVisible();
    });

    await test.step("La entrega en curso sobrevive a la recarga (endpoint real)", async () => {
      await repartidorPage.reload();
      await expect(repartidorPage.getByText(`${orderDCode} · En camino`)).toBeVisible();
    });

    await test.step("Cobro en efectivo registrado y entrega completada", async () => {
      // El envío cobra en efectivo al repartidor: el pago se registra vía API
      // antes de completar (el complete de UI no captura dinero).
      await expectStatus(
        await admin.post(`/api/v1/orders/${orderDId}/payments`, {
          data: { method_code: "cash_delivery" },
        }),
        201,
      );
      const page = repartidorPage;
      await page.getByPlaceholder("¿Quién recibió? (opcional)").fill("Cliente RC");
      await page.getByRole("button", { name: "Marcar como entregado" }).click();
      await expect(page.getByText(`${orderDCode} · En camino`)).toHaveCount(0);
      await expect(page.getByText("Sin envíos en cola.")).toBeVisible();
      await expect(page.getByText("entregas hoy")).toBeVisible();

      const order = await expectStatus(await admin.get(`/api/v1/orders/${orderDId}`), 200);
      expect(order.status).toBe("completed");
    });

    await test.step("Cajero ve la cola de entregas vacía", async () => {
      await cajeroPage.goto("/panel/entregas");
      await expect(cajeroPage.getByRole("heading", { name: "Entregas" })).toBeVisible();
      await expect(cajeroPage.getByText("Sin envíos esperando repartidor.")).toBeVisible();
    });
  });

  test("E. Verificar un pago no completa pedidos operativos (y H5 al cancelar)", async () => {
    test.setTimeout(240_000);
    const cajero = cajeroContext.request;

    await test.step("POS transferencia: verificar SÍ completa la venta de mostrador (H10)", async () => {
      const sale = await expectStatus(
        await cajero.post("/api/v1/pos/sales", {
          headers: ORIGIN,
          data: {
            lines: [{ product_id: waterId, quantity: 1 }],
            payment: {
              method_code: "bank_transfer",
              transaction_reference: `REF-RC-${RUN}-1`,
              bank_name: "BBVA",
            },
          },
        }),
        201,
      );
      expect(sale.order.status).toBe("approved");
      await expectStatus(
        await cajero.post(`/api/v1/payments/${sale.payment.id}/verify`, {
          headers: ORIGIN,
          data: { approve: true },
        }),
        200,
      );
      const after = await expectStatus(
        await cajero.get(`/api/v1/orders/${sale.order.id}`),
        200,
      );
      // H10: venta counter aprobada y pagada se auto-completa al verificar.
      expect(after.status).toBe("completed");
      expect(after.payment_status).toBe("paid");
    });

    await test.step("Pedido telefónico pickup: verificar NO completa", async () => {
      const captured = await expectStatus(
        await cajero.post("/api/v1/orders/capture", {
          headers: ORIGIN,
          data: {
            source: "phone",
            fulfillment_type: "pickup",
            customer_name: "Teléfono RC",
            customer_phone: "5550002222",
            lines: [{ product_id: dessertId, quantity: 1 }],
          },
        }),
        201,
      );
      orderECaptureId = captured.id;
      orderECaptureCode = captured.public_code;
      await expectStatus(
        await cajero.post(`/api/v1/orders/${orderECaptureId}/transition`, {
          headers: ORIGIN,
          data: { new_status: "approved" },
        }),
        200,
      );
      const payment = await expectStatus(
        await cajero.post(`/api/v1/orders/${orderECaptureId}/payments`, {
          headers: ORIGIN,
          data: {
            method_code: "bank_transfer",
            transaction_reference: `REF-RC-${RUN}-2`,
            bank_name: "Santander",
          },
        }),
        201,
      );
      await expectStatus(
        await cajero.post(`/api/v1/payments/${payment.id}/verify`, {
          headers: ORIGIN,
          data: { approve: true },
        }),
        200,
      );
      const after = await expectStatus(
        await cajero.get(`/api/v1/orders/${orderECaptureId}`),
        200,
      );
      expect(after.status).toBe("approved"); // NO completed
      expect(after.payment_status).toBe("paid");
    });

    await test.step("UI cajero: pagado y Aprobado; cancelar exige resolución (H5)", async () => {
      await cajeroPage.goto("/panel/pedidos");
      const card = cajeroPage.getByRole("listitem").filter({ hasText: orderECaptureCode });
      await expect(card).toContainText("Pago: paid");
      await expect(card).toContainText("Aprobado");

      await card.getByRole("button", { name: "Cancelar", exact: true }).click();
      const dialog = cajeroPage.getByRole("dialog", {
        name: `Cancelar pedido ${orderECaptureCode}`,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("Este pedido tiene pagos registrados. ¿Qué pasa con el cobro?"),
      ).toBeVisible();
      await dialog.getByRole("radio", { name: /Reembolso pendiente de procesar/ }).check();
      await dialog.getByRole("button", { name: "Cancelar pedido" }).click();
      await expect(dialog).toBeHidden();

      // El cancelado sale de "Activos"; en "Todos" aparece como Cancelado.
      await cajeroPage.getByRole("button", { name: "Todos" }).click();
      await expect(card).toContainText("Cancelado");
    });

    await test.step("El bloque «Cancelados con cobro» muestra el pedido", async () => {
      await cajeroPage.reload();
      const block = cajeroPage.locator(
        'section[aria-label="Cancelados con cobro pendiente de devolver"]',
      );
      await expect(block).toBeVisible();
      await expect(
        block.getByRole("heading", { name: /Cancelados con cobro pendiente de devolver/ }),
      ).toBeVisible();
      await expect(block).toContainText(orderECaptureCode);
      await expect(block).toContainText("Reembolso pendiente");
    });
  });

  test("F. Storefront admin: editar hero, publicar, preview firmado y programación", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    adminContext = await browser.newContext({ baseURL: appBaseUrl });
    await loginContext(adminContext, adminEmail, adminPassword);
    adminPage = await adminContext.newPage();
    const page = adminPage;

    await test.step("Cambiar el título del hero, guardar y publicar", async () => {
      await page.goto("/admin/storefront");
      await expect(page.getByRole("heading", { name: "Sitio público" })).toBeVisible();
      await page.getByRole("button", { name: "Hero de portada (con rotación)" }).click();
      // El formulario se genera del JSON Schema del backend: el campo del
      // título del slide se titula "Title" y contiene el valor publicado.
      const titleInput = page.getByLabel("Title", { exact: true });
      await expect(titleInput).toHaveValue(heroTitle);
      await titleInput.fill(heroTitleV2);
      // El guardado y la publicación se sincronizan con sus respuestas HTTP:
      // el estado busy de React no alcanza a deshabilitar el botón antes del
      // siguiente click y publicaría el borrador sin el cambio.
      const [saveResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/v1/storefront/sections/") &&
            response.request().method() === "PUT",
        ),
        page.getByRole("button", { name: "Guardar sección" }).click(),
      ]);
      expect(saveResponse.ok()).toBeTruthy();
      const [publishResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/v1/storefront/pages/home/publish") &&
            response.request().method() === "POST",
        ),
        page.getByRole("button", { name: "Publicar ahora" }).click(),
      ]);
      expect(publishResponse.ok()).toBeTruthy();
      await expect(
        page.getByText("Revisión publicada: el sitio ya la muestra."),
      ).toBeVisible();
    });

    await test.step("El sitio público refleja el nuevo hero", async () => {
      await customerPage.goto("/");
      await expect(
        customerPage.getByRole("heading", { level: 1, name: heroTitleV2 }),
      ).toBeVisible();
    });

    await test.step("Enlace de preview firmado accesible SIN sesión (JSON 200)", async () => {
      await page.getByRole("button", { name: "Enlace de preview" }).click();
      const codeElement = page.locator("code");
      await expect(codeElement).toBeVisible();
      const previewUrl = (await codeElement.textContent())!.trim();
      expect(previewUrl).toContain("/api/v1/public/storefront/preview/");

      const anonymous = await pwRequest.newContext();
      const response = await anonymous.get(previewUrl);
      expect(response.status()).toBe(200);
      const payload = await response.json();
      expect(payload.page_key).toBe("home");
      expect(Array.isArray(payload.sections)).toBe(true);
      await anonymous.dispose();
    });

    await test.step("Programar publicación (+10 min), ver Programada y cancelarla", async () => {
      // Tras publicar, el editor recarga y auto-crea el borrador siguiente.
      await expect(page.getByText(/Borrador · revisión #/)).toBeVisible();
      const publishAt = new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16);
      await page.getByLabel("Programar publicación").fill(publishAt);
      await page.getByRole("button", { name: "Programar", exact: true }).click();
      await expect(
        page.getByText("Publicación programada: la ejecutará el servidor a la hora indicada."),
      ).toBeVisible();
      await expect(page.getByText(/Programada para /)).toBeVisible();

      await page.getByRole("button", { name: "Cancelar prog." }).click();
      await expect(page.getByText("Programación cancelada.", { exact: true })).toBeVisible();
      await expect(page.getByText(/Programada para /)).toHaveCount(0);
      // El borrador sigue ahí, sin programación (estado de borrador).
      await expect(page.getByText(/Borrador · revisión #/)).toBeVisible();
    });
  });

  test("G. Seguridad de roles: cliente, cocina y cajero en sus límites", async () => {
    test.setTimeout(240_000);

    await test.step("Cliente en /panel: sin módulos operativos", async () => {
      await customerPage.goto("/panel");
      await expect(
        customerPage.getByRole("heading", { name: "Panel de operación" }),
      ).toBeVisible();
      await expect(
        customerPage.getByText("Tu cuenta no tiene módulos operativos asignados."),
      ).toBeVisible();
    });

    await test.step("Cliente en /admin: shell vacío sin módulos administrativos", async () => {
      await customerPage.goto("/admin");
      await expect(customerPage.getByRole("link", { name: "Inicio" })).toBeVisible();
      await expect(customerPage.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
      await expect(customerPage.getByRole("link", { name: "Roles" })).toHaveCount(0);
    });

    await test.step("Cocina no ve /admin/codigos-descuento (404)", async () => {
      const response = await cocinaPage.goto("/admin/codigos-descuento");
      expect(response?.status()).toBe(404);
    });

    await test.step("Cajero no puede administrar permisos de roles (403)", async () => {
      const roles = await expectStatus(await admin.get("/api/v1/roles?limit=100"), 200);
      const roleId = (roles.items ?? roles)[0].id;
      const forbidden = await cajeroContext.request.put(`/api/v1/roles/${roleId}/permissions`, {
        headers: ORIGIN,
        data: { permissions: ["orders:read"] },
      });
      expect(forbidden.status()).toBe(403);
    });

    await test.step("Cliente no puede listar pedidos del panel (403)", async () => {
      const forbidden = await customerContext.request.get("/api/v1/orders");
      expect(forbidden.status()).toBe(403);
    });

    await test.step("Un pedido ajeno vía /orders/mine/{id} da 404", async () => {
      // El pedido E fue capturado sin cliente asociado: no es del cliente.
      const foreign = await customerContext.request.get(
        `/api/v1/orders/mine/${orderECaptureId}`,
      );
      expect(foreign.status()).toBe(404);
    });
  });
});
