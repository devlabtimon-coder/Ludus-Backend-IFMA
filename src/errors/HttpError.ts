import { Response } from "express";

// Erro de regra de negócio com o status HTTP e o código que o cliente recebe.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }

  get body() {
    return this.code ? { error: this.message, code: this.code } : { error: this.message };
  }
}

// Responde um HttpError; qualquer outro erro vira 500 com a mensagem informada.
export function sendError(res: Response, err: unknown, fallbackMessage: string, logLabel: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json(err.body);
  }
  console.error(logLabel, err);
  return res.status(500).json({ error: fallbackMessage });
}
