import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

test("quiz mostra voltar antes da pergunta", () => {
  const quiz = html.slice(html.indexOf('<template id="tpl-quiz">'), html.indexOf('<template id="tpl-resultado">'));
  assert.ok(quiz.indexOf('id="voltar"') < quiz.indexOf('class="tese"'));
});

test("resultado mostra ranking antes do mapa secundário", () => {
  const resultado = html.slice(html.indexOf('<template id="tpl-resultado">'), html.indexOf('<template id="tpl-chegada">'));
  assert.ok(resultado.indexOf('id="ranking-titulo"') < resultado.indexOf('id="bussola"'));
  assert.match(resultado, /<details class="explorar">[\s\S]*id="bussola"/);
});
