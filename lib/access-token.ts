import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function isAccessToken(value: string) {
  return TOKEN_PATTERN.test(value);
}

export function hashAccessToken(value: string) {
  if (!isAccessToken(value)) throw new Error("Link de acesso inválido.");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function postgresBytea(hex: string) {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("Hash de acesso inválido.");
  return `\\x${hex}`;
}
