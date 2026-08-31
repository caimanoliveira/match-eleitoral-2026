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

test("a colinha reúne os outros candidatos da mesma federação ou partido", async () => {
  const { candidatosDaChapa } = await import("../web/escolhas.js");
  const universo = [
    { id: "a", p: "PT", f: "PT/PC do B/PV" },
    { id: "b", p: "PV", f: "PT/PC do B/PV" },
    { id: "c", p: "PL" },
    { id: "d", p: "PL" },
  ];
  assert.deepEqual(candidatosDaChapa(universo[0], universo).map((c) => c.id), ["b"]);
  assert.deepEqual(candidatosDaChapa(universo[2], universo).map((c) => c.id), ["d"]);
});
