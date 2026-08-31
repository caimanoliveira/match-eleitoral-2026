import { test } from "node:test";
import assert from "node:assert/strict";

test("a colinha reserva os dois votos de senador", async () => {
  const modulo = await import("../web/escolhas.js").catch(() => ({}));
  assert.equal(typeof modulo.slotsVazios, "function", "falta calcular vagas vazias por cargo");
  assert.deepEqual(modulo.slotsVazios("senador", []), [0, 1]);
  assert.deepEqual(modulo.slotsVazios("senador", ["primeiro"]), [1]);
  assert.deepEqual(modulo.slotsVazios("senador", ["primeiro", "segundo"]), []);
  assert.deepEqual(modulo.slotsVazios("presidente", []), [0]);
});
