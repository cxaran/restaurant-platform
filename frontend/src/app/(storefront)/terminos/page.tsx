import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getPublicAnalyticsConfig } from "@/core/restaurant-api/analytics";
import type { PublicLegalCoupon } from "@/core/restaurant-api/legal";
import { getPublicLegalTerms } from "@/core/restaurant-api/legal";
import { formatMoney } from "@/core/restaurant-api/theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
};

// Documento legal AUTOGENERADO (Turno posterior a 11): datos del negocio +
// cláusulas de los cupones vigentes + secciones opcionales que el administrador
// edita en su perfil (terms_extra / privacy_extra). El footer enlaza aquí.

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function couponValidity(coupon: PublicLegalCoupon): string {
  const from = coupon.valid_from ? formatDate(coupon.valid_from) : null;
  const until = coupon.valid_until ? formatDate(coupon.valid_until) : null;
  if (from && until) return `Válido del ${from} al ${until}.`;
  if (until) return `Válido hasta el ${until}.`;
  if (from) return `Válido a partir del ${from}.`;
  return "Vigente mientras el negocio lo mantenga activo.";
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
      <h2 className="sf-display" style={{ fontSize: 22, margin: 0 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function TerminosPage() {
  const [terms, analytics] = await Promise.all([
    getPublicLegalTerms(),
    getPublicAnalyticsConfig(),
  ]);

  if (terms === null) {
    return (
      <div className="sf-container" style={{ paddingBlock: 48, maxWidth: 820 }}>
        <h1 className="sf-display" style={{ fontSize: 30, margin: 0 }}>
          Términos y Condiciones
        </h1>
        <p className="sf-muted" style={{ marginTop: 10, fontSize: 15 }}>
          El documento aún no está disponible. Vuelve pronto.
        </p>
      </div>
    );
  }

  const name = terms.legal_name ?? terms.trade_name;
  const contactPhones = (terms.phones ?? []).filter((phone) => phone.phone);
  const coupons = terms.coupons ?? [];
  const deliveryModalities =
    terms.allow_delivery && terms.allow_pickup
      ? "Ofrecemos entrega a domicilio y recolección en tienda."
      : terms.allow_delivery
        ? "Ofrecemos entrega a domicilio."
        : terms.allow_pickup
          ? "Ofrecemos recolección en tienda."
          : "Las modalidades de entrega se informan al realizar el pedido.";
  const hasDeliveryAmounts =
    terms.minimum_delivery_order_amount != null ||
    terms.free_shipping_global_from_amount != null;

  return (
    <div className="sf-container" style={{ paddingBlock: 32, maxWidth: 820, lineHeight: 1.6 }}>
      <h1 className="sf-display" style={{ fontSize: 32, margin: 0 }}>
        Términos y Condiciones
      </h1>
      <p className="sf-muted" style={{ marginTop: 8, fontSize: 14 }}>
        {terms.trade_name}
        {terms.legal_name ? ` · ${terms.legal_name}` : ""} · Última actualización:{" "}
        {formatDate(terms.generated_at)}.
      </p>

      <Section title="Identificación del negocio">
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>
            <strong>Nombre:</strong> {name}
          </li>
          {terms.main_address ? (
            <li>
              <strong>Domicilio:</strong> {terms.main_address}
            </li>
          ) : null}
          {terms.email ? (
            <li>
              <strong>Correo:</strong> {terms.email}
            </li>
          ) : null}
          {contactPhones.length > 0 ? (
            <li>
              <strong>Teléfonos:</strong>{" "}
              {contactPhones
                .map((phone) => `${phone.phone}${phone.is_whatsapp ? " (WhatsApp)" : ""}`)
                .join(" · ")}
            </li>
          ) : null}
          <li>
            <strong>Moneda de operación:</strong> {terms.currency_code}
          </li>
        </ul>
      </Section>

      <Section title="Cuenta de cliente">
        <p style={{ margin: 0 }}>
          Para realizar pedidos en línea necesitas una cuenta. Eres responsable de la
          veracidad de los datos que proporcionas y de mantener la confidencialidad de
          tu contraseña; los pedidos hechos desde tu cuenta se consideran realizados
          por ti. Puedes solicitar la baja de tu cuenta contactando al negocio por los
          medios indicados en este documento.
        </p>
      </Section>

      <Section title="Pedidos y pagos">
        <p style={{ margin: 0 }}>
          Los pedidos se realizan a través de este sitio y quedan sujetos a
          confirmación y aprobación por parte de {name}. Los precios se muestran en{" "}
          {terms.currency_code} e incluyen los impuestos aplicables. La confirmación
          de un pago no equivale a la conclusión del pedido: un pedido se considera{" "}
          <strong>completado</strong> únicamente cuando se realiza la entrega o la
          recolección efectiva. Los productos y precios están sujetos a disponibilidad
          y pueden cambiar sin previo aviso.
        </p>
      </Section>

      <Section title="Entregas y recolección">
        <p style={{ margin: 0 }}>
          {deliveryModalities}
          {terms.allow_delivery
            ? " El costo de envío depende de la zona de entrega y se informa antes de" +
              " confirmar el pedido; las entregas a domicilio solo están disponibles" +
              " dentro de las zonas de cobertura del negocio."
            : ""}
        </p>
        {hasDeliveryAmounts ? (
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            {terms.minimum_delivery_order_amount != null ? (
              <li>
                La compra mínima para entrega a domicilio es{" "}
                {formatMoney(terms.minimum_delivery_order_amount)} (sin contar el envío).
              </li>
            ) : null}
            {terms.free_shipping_global_from_amount != null ? (
              <li>
                El envío a domicilio es gratuito a partir de{" "}
                {formatMoney(terms.free_shipping_global_from_amount)} de compra.
              </li>
            ) : null}
          </ul>
        ) : null}
      </Section>

      <Section title="Cancelaciones y reembolsos">
        <p style={{ margin: 0 }}>
          Puedes solicitar la cancelación de un pedido antes de que sea preparado o
          entregado contactando al negocio. Cuando proceda un reembolso, se realizará
          por el mismo medio de pago utilizado; los pedidos pagados con créditos se
          reembolsan en créditos. Si un pedido reembolsado había otorgado créditos,
          éstos se ajustan en consecuencia.
        </p>
      </Section>

      {terms.credits_enabled ? (
        <Section title="Programa de créditos">
          <p style={{ margin: 0 }}>
            Algunos productos otorgan créditos al comprarlos. Los créditos son un
            beneficio de lealtad canjeable únicamente por productos del menú del propio
            negocio; no tienen valor monetario, no son transferibles y no son
            canjeables por dinero. Un pedido se paga en su totalidad con dinero o en su
            totalidad con créditos, nunca de forma mixta.
          </p>
        </Section>
      ) : null}

      <Section title="Cupones y códigos de descuento vigentes">
        {coupons.length === 0 ? (
          <p className="sf-muted" style={{ margin: 0 }}>
            Actualmente no hay cupones de descuento vigentes.
          </p>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              Los siguientes códigos aplican <strong>solo en pedidos en línea pagados
              con dinero</strong>. Cada código descuenta un monto fijo cuando el
              subtotal de productos y modificadores alcanza o supera el mínimo
              indicado; el envío no cuenta para ese mínimo. Se permite{" "}
              <strong>un uso por cliente</strong> y un solo código por pedido; no son
              acumulables ni aplican a pedidos con créditos.
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {coupons.map((coupon) => (
                <li key={coupon.code}>
                  <strong>{coupon.code.toUpperCase()}</strong> — {coupon.name}:{" "}
                  {formatMoney(coupon.discount_amount)} de descuento en compras desde{" "}
                  {formatMoney(coupon.minimum_order_amount)}. {couponValidity(coupon)}
                  {coupon.description ? ` ${coupon.description}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {terms.terms_extra ? (
        <Section title="Condiciones adicionales">
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{terms.terms_extra}</p>
        </Section>
      ) : null}

      <Section title="Vigencia y cambios">
        <p style={{ margin: 0 }}>
          {name} puede actualizar estos Términos y Condiciones y el Aviso de Privacidad
          en cualquier momento. La versión vigente es la publicada en esta página y su
          fecha de última actualización se indica al inicio del documento; el uso
          continuado del sitio implica la aceptación de la versión vigente.
        </p>
      </Section>

      <Section title="Aviso de Privacidad">
        <p style={{ margin: 0 }}>
          {name} trata tus datos personales (nombre, teléfono o WhatsApp, correo,
          domicilio de entrega e historial de pedidos) con la finalidad de procesar,
          entregar y dar seguimiento a tus pedidos
          {terms.credits_enabled ? ", así como para operar el programa de créditos" : ""}.
          Tus datos no se comercializan con terceros; sólo se comparte con el
          repartidor la información necesaria para entregar tu pedido mientras está en
          curso. Puedes ejercer tus derechos de acceso, rectificación, cancelación u
          oposición contactando al negocio por los medios indicados en este documento.
        </p>
        {terms.privacy_extra ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{terms.privacy_extra}</p>
        ) : null}
      </Section>

      {analytics?.enabled ? (
        <Section title="Cookies y analítica">
          <p style={{ margin: 0 }}>
            Este sitio usa una cookie de sesión <strong>necesaria</strong> para
            mantener tu cuenta iniciada; no depende de tu consentimiento. Además,
            usamos <strong>cookies analíticas</strong> (Google Analytics) para
            entender de forma agregada cómo se usa el sitio y mejorarlo
            {analytics.require_consent
              ? "; solo se activan si las aceptas en el aviso de cookies y puedes cambiar tu preferencia en cualquier momento desde el enlace «Cookies» al pie de la página"
              : ""}
            . La medición no incluye tu nombre, teléfono, correo, dirección ni el
            contenido de tus pedidos.
          </p>
        </Section>
      ) : null}
    </div>
  );
}
