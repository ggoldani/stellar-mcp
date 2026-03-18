export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class StellarProtocolError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "StellarProtocolError";
  }
}

export function mapUnknownError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error("Unexpected non-error exception thrown.");
}
