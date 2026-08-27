// Cálculo do match. Determinístico e roda inteiro no browser: nenhuma resposta
// do eleitor sai do dispositivo.
//
// Escala Wahl-O-Mat: o eleitor responde +1 (concorda), 0 (neutro) ou -1
// (discorda), e pode marcar a tese como importante, o que dobra o peso.

export const CONCORDA = 1;
export const NEUTRO = 0;
export const DISCORDA = -1;
export const PULOU = null;

export const SEM_DADO = "?";

const POSICAO = { "+": 1, "-": -1, "0": 0 };

/**
 * @param respostas  {[teseId]: {valor: -1|0|1|null, importante: boolean}}
 * @param teses      array de teses na MESMA ordem das strings pos/src
 * @param candidato  {pos, src} do shard
 * @returns {score: 0..1, respondidas: n, detalhe: [...]} ou null se não dá para comparar
 */
export function match(respostas, teses, candidato) {
  let distancia = 0;
  let maximo = 0;
  const detalhe = [];

  for (let i = 0; i < teses.length; i++) {
    const tese = teses[i];
    const resposta = respostas[tese.id];
    // `== null` pega null E undefined: uma hash malformada produzia
    // {valor: undefined}, que passava por `!== PULOU` e contaminava a
    // distância com NaN — todos os percentuais viravam NaN em silêncio.
    if (!resposta || resposta.valor == null) continue;

    const bruta = candidato.pos[i];
    if (bruta === SEM_DADO) {
      detalhe.push({ tese, fonte: null, posicao: null, resposta: resposta.valor });
      continue;
    }

    const posicao = POSICAO[bruta];
    const peso = resposta.importante ? 2 : 1;
    // |a - b| em {-1,0,1} vale 0, 1 ou 2 — daí o 2 no denominador.
    distancia += peso * Math.abs(resposta.valor - posicao);
    maximo += peso * 2;
    detalhe.push({
      tese,
      posicao,
      resposta: resposta.valor,
      fonte: candidato.src[i],
      concorda: resposta.valor === posicao,
    });
  }

  // Sem nenhuma tese comparável não existe match — devolver 0% seria mentira,
  // porque 0% significa "discorda de tudo", não "não sabemos".
  if (maximo === 0) return null;

  return {
    score: 1 - distancia / maximo,
    respondidas: detalhe.filter((d) => d.posicao !== null).length,
    detalhe,
  };
}

/** Posição do eleitor no mapa 2D, em -1..+1 nos dois eixos. */
export function bussola(respostas, teses) {
  const eixos = { economico: 0, social: 0 };
  const pesos = { economico: 0, social: 0 };

  for (const tese of teses) {
    const resposta = respostas[tese.id];
    if (!resposta || resposta.valor == null) continue;
    const peso = resposta.importante ? 2 : 1;
    for (const eixo of ["economico", "social"]) {
      const w = tese.eixo[eixo];
      if (!w) continue;
      eixos[eixo] += resposta.valor * w * peso;
      pesos[eixo] += Math.abs(w) * peso;
    }
  }

  // Os pesos vão junto: sem eles a UI desenharia um ponto exato no centro
  // para quem não respondeu nada, declarando centrista quem não disse nada.
  return {
    economico: pesos.economico ? eixos.economico / pesos.economico : 0,
    social: pesos.social ? eixos.social / pesos.social : 0,
    pesos,
  };
}

/**
 * Ranking de candidatos. Empates são embaralhados por um sorteio estável
 * derivado da semente, para não privilegiar quem vem antes no alfabeto ou
 * tem o menor número — vantagem que o site não tem o direito de distribuir.
 */
export function ranquear(respostas, teses, candidatos, semente = 0) {
  return candidatos
    .map((c) => {
      const r = match(respostas, teses, c);
      return r && { candidato: c, ...r };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const d = b.score - a.score;
      if (Math.abs(d) > 1e-9) return d;
      return desempate(a.candidato.id, semente) - desempate(b.candidato.id, semente);
    });
}

function desempate(id, semente) {
  // xorshift sobre o id — estável entre recarregamentos, mas sem relação com
  // ordem alfabética ou número na urna.
  let h = semente ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) {
    h = (h ^ id.charCodeAt(i)) >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return h;
}
