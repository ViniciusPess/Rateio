import "server-only";

import { ValidationError } from "@/lib/domain";

export function errorResponse(error: unknown): Response {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Não foi possível concluir esta operação.";
  return Response.json({ error: message }, { status: error instanceof ValidationError ? 400 : 500 });
}
