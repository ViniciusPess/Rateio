import test from "node:test";
import assert from "node:assert/strict";
import { createAccessToken, hashAccessToken, isAccessToken, postgresBytea } from "../lib/access-token.ts";

test("o token público tem 256 bits e formato seguro para URL", () => {
  const token = createAccessToken();
  assert.equal(token.length, 43);
  assert.equal(isAccessToken(token), true);
  assert.equal(Buffer.from(token, "base64url").length, 32);
});

test("tokens novos não se repetem", () => {
  assert.notEqual(createAccessToken(), createAccessToken());
});

test("o banco recebe apenas o SHA-256 do token", () => {
  const token = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const hash = hashAccessToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(postgresBytea(hash), `\\x${hash}`);
  assert.equal(hash.includes(token), false);
});

test("tokens malformados são recusados", () => {
  assert.throws(() => hashAccessToken("curto"), /inválido/);
  assert.equal(isAccessToken("a".repeat(42) + "/"), false);
});
