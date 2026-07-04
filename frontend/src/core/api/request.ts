import { ApiRequestError, networkApiError, normalizeApiError } from "./api-error";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: JsonValue | FormData | BodyInit | null;
};

function hasJsonBody(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

function buildRequestInit(init: ApiRequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  let body = init.body as BodyInit | null | undefined;

  if (
    init.body !== undefined &&
    init.body !== null &&
    !(init.body instanceof FormData) &&
    typeof init.body !== "string" &&
    !(init.body instanceof Blob) &&
    !(init.body instanceof ArrayBuffer) &&
    !(init.body instanceof URLSearchParams)
  ) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }

  return {
    ...init,
    headers,
    body,
  };
}

// Un 204 (u otra respuesta sin cuerpo) puede llegar con content-type JSON
// (FastAPI lo emite así): parsear con .json() lanzaría SyntaxError y una
// operación exitosa se mostraría como error. Se lee el texto y solo se parsea
// si hay contenido.
async function parseJsonBody(response: Response): Promise<unknown> {
  if (response.status === 204 || !hasJsonBody(response)) return null;
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export async function requestJson<T>(url: string, init: ApiRequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, buildRequestInit(init));
  } catch {
    throw new ApiRequestError(0, networkApiError());
  }

  const payload = await parseJsonBody(response);

  if (!response.ok) {
    throw new ApiRequestError(response.status, normalizeApiError(response.status, payload));
  }

  return payload as T;
}
