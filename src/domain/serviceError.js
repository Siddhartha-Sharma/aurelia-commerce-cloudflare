export class ServiceError extends Error {
  constructor(message, { code = "SERVICE_ERROR", status = 500, details } = {}) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function requireValue(condition, message, code = "INVALID_INPUT") {
  if (!condition) throw new ServiceError(message, { code, status: 400 });
}
