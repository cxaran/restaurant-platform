export type ApiErrorItem = {
  field?: string | null;
  message: string;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  errors?: ApiErrorItem[] | null;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

export function normalizeApiError(status: number, value: unknown): ApiErrorBody {
  if (isApiErrorBody(value)) {
    return value;
  }

  // Un 413 fuera del envelope viene de un proxy (nginx) que cortó la subida
  // antes de llegar al backend: el mensaje genérico confunde ("no se pudo
  // procesar la respuesta") cuando el problema real es el tamaño del archivo.
  if (status === 413) {
    return {
      code: "http_413",
      message: "El archivo supera el tamaño máximo que acepta el servidor",
    };
  }

  return {
    code: `http_${status}`,
    message: "No se pudo procesar la respuesta del servidor",
  };
}

export function networkApiError(): ApiErrorBody {
  return {
    code: "network_error",
    message: "No se pudo conectar con el servidor",
  };
}
