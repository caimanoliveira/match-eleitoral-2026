// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { match, bussola, ranquear } from "../web/match.js";

const TESES = [
  { id: "a", eixo: { economico: 1, social: 0 } },
  { id: "b", eixo: { economico: 0, social: 1 } },
  { id: "c", eixo: { economico: -1, social: 0 } },
];

const resp = (...vs) =>
  Object.fromEntries(vs.map((v, i) => [TESES[i].id, { valor: v, importante: false }]));

const cand = (pos, src = "555") => ({ id: "x", pos, src });

test("igual em tudo = 100%", () => {
  assert.equal(match(resp(1, 1, 1), TESES, cand("+++")).score, 1);
  assert.equal(match(resp(-1, -1, -1), TESES, cand("---")).score, 1);
});

test("oposto em tudo = 0%", () => {
  assert.equal(match(resp(1, 1, 1), TESES, cand("---")).score, 0);
});

test("neutro do candidato fica a meio caminho", () => {
  assert.equal(match(resp(1, 1, 1), TESES, cand("000")).score, 0.5);
});

test("tese sem dado não conta nem a favor nem contra", () => {
  // Concorda com as duas comparáveis; a terceira não tem evidência.
  const r = match(resp(1, 1, 1), TESES, cand("++?"));
  assert.equal(r.score, 1);
  assert.equal(r.respondidas, 2);
});

test("marcar como importante dobra o peso da tese", () => {
  const teses = TESES.slice(0, 2);
  const normal = { a: { valor: 1, importante: false }, b: { valor: 1, importante: false } };
  const pesada = { a: { valor: 1, importante: true }, b: { valor: 1, importante: false } };
  // Discorda em 'a', concorda em 'b'.
  assert.equal(match(normal, teses, cand("-+")).score, 0.5);
  // Com 'a' valendo o dobro, o erro pesa mais: 4 de distância em 6 possíveis.
  assert.equal(match(pesada, teses, cand("-+")).score.toFixed(4), (1 / 3).toFixed(4));
});

test("pular a tese a remove do cálculo", () => {
  const r = match({ a: { valor: null }, b: { valor: 1, importante: false } }, TESES, cand("-+"));
  assert.equal(r.score, 1);
  assert.equal(r.respondidas, 1);
});

test("sem nenhuma tese comparável devolve null, não 0%", () => {
  // 0% significaria "discorda de tudo"; ausência de dado não é discordância.
  assert.equal(match(resp(1, 1, 1), TESES, cand("???")), null);
  assert.equal(match({}, TESES, cand("+++")), null);
});

test("bússola posiciona nos dois eixos", () => {
  // Concorda com 'a' (econ +1) e discorda de 'c' (econ -1): ambos empurram
  // para a direita econômica.
  const b = bussola(resp(1, 0, -1), TESES);
  assert.equal(b.economico, 1);
  assert.equal(b.social, 0);

  const centro = bussola(resp(1, 0, 1), TESES);
  assert.equal(centro.economico, 0);
});

test("ranking ordena por score e não devolve quem não dá para comparar", () => {
  const cs = [
    { id: "ruim", pos: "---", src: "555" },
    { id: "otimo", pos: "+++", src: "555" },
    { id: "meio", pos: "+0-", src: "555" },
    { id: "vazio", pos: "???", src: "???" },
  ];
  const r = ranquear(resp(1, 1, 1), TESES, cs);
  assert.deepEqual(r.map((x) => x.candidato.id), ["otimo", "meio", "ruim"]);
});

test("empate não segue ordem alfabética nem de entrada", () => {
  // 40 candidatos idênticos: se o desempate fosse estável por ordem, o
  // primeiro alfabético venceria sempre.
  const cs = Array.from({ length: 40 }, (_, i) => ({
    id: `cand-${String(i).padStart(2, "0")}`,
    pos: "+++",
    src: "555",
  }));
  const ordem = ranquear(resp(1, 1, 1), TESES, cs).map((x) => x.candidato.id);
  assert.equal(ordem.length, 40);
  assert.notDeepEqual(ordem, cs.map((c) => c.id));
  // ...mas é estável entre execuções, senão a colinha mudaria ao recarregar.
  assert.deepEqual(ordem, ranquear(resp(1, 1, 1), TESES, cs).map((x) => x.candidato.id));
});

// Regressão: pos/src são posicionais sobre a lista COMPLETA de teses. Passar
// um subconjunto (quiz rápido) desalinhava o match e o ranking saía errado.
test("ranquear com subconjunto de teses lê posições erradas; com a lista completa acerta", () => {
  const teses = ["a", "b", "c", "d"].map((id) => ({ id, eixo: {} }));
  const cand = { id: "x", pos: "--+-", src: "5555" };
  const respostas = { c: { valor: 1, importante: false }, d: { valor: -1, importante: false } };
  const certo = ranquear(respostas, teses, [cand])[0].score;
  assert.equal(certo, 1);
  const errado = ranquear(respostas, [teses[2], teses[3]], [cand])[0].score;
  assert.notEqual(errado, 1);
});
