import { test } from "node:test";
import assert from "node:assert/strict";

test("preserva respostas parciais na URL", async () => {
  const q = await import("../web/questionario.js").catch(() => ({}));
  assert.equal(typeof q.codificarValor, "function", "falta o codec do questionário");
  for (const [valor, codigo] of [[1, "c"], [0.5, "u"], [0, "n"], [-0.5, "v"], [-1, "d"]]) {
    assert.equal(q.codificarValor(valor), codigo);
    assert.equal(q.decodificarValor(codigo), valor);
  }
});

test("modo principal usa 34 teses e aprofundado usa as 60", async () => {
  const q = await import("../web/questionario.js").catch(() => ({}));
  const teses = Array.from({ length: 60 }, (_, i) => ({ id: String(i), aprofundada: i >= 34 }));
  assert.equal(q.tesesDoModo(teses, "completo").length, 34);
  assert.equal(q.tesesDoModo(teses, "aprofundado").length, 60);
});
