// Identidade visual de partido para a colinha e para as listas.
//
// Logo: arquivo em web/partidos/{SIGLA}.svg, carregado sob demanda. Logos
// partidários são marcas registradas — o repositório não os distribui. Sem o
// arquivo, o selo cai no número de urna sobre a cor do partido, que é a
// informação que o eleitor de fato usa.

const CORES = {
  PT: "#c4122e", PL: "#0d3b7a", "UNIÃO": "#1c4b9c", PP: "#1a5fb4", PSD: "#f5a623",
  MDB: "#0f8a3c", REPUBLICANOS: "#0a3d91", PSB: "#e8b800", PSDB: "#0072bb",
  PDT: "#d4001f", PSOL: "#f2c200", PCDOB: "#a80000", PV: "#3aa53a", REDE: "#00a08a",
  NOVO: "#ff6a13", PODE: "#0b8f5a", CIDADANIA: "#e2007a", AVANTE: "#005baa",
  SOLIDARIEDADE: "#e94e1b", PRD: "#1b3a6b", "MISSÃO": "#2d6a4f", DC: "#1f6f3f",
  PRTB: "#0a4d8c", PSTU: "#b00020", PCB: "#8b0000", PCO: "#a01010", UP: "#c1121f",
  AGIR: "#2a6f97", MOBILIZA: "#e07a00", DEMOCRATA: "#123c69", PSC: "#0e7c3a",
};

const PADRAO = "#5a6472";

export const cor = (sigla) => CORES[(sigla || "").toUpperCase()] || PADRAO;

/** Preto ou branco, o que tiver contraste sobre a cor do partido.
 *  Branco fixo dava 1,7:1 em cima do amarelo do PSOL e do PSB — número de urna
 *  ilegível justamente para quem mais precisa lê-lo. */
export function tinta(sigla) {
  const hex = cor(sigla).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Compara o contraste real contra branco e contra preto e fica com o melhor.
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#000" : "#fff";
}

/** Selo do partido: <img> do logo quando existe, senão o número na cor. */
export function selo(sigla, numeroPartido, tamanho = 28) {
  const el = document.createElement("span");
  el.className = "selo";
  el.style.cssText =
    `width:${tamanho}px;height:${tamanho}px;background:${cor(sigla)};` +
    `color:${tinta(sigla)};font-size:${Math.round(tamanho * 0.46)}px`;
  el.textContent = numeroPartido || (sigla || "").slice(0, 3);
  el.title = sigla;
  // Sem isto o leitor de tela anuncia só "18", sem dizer 18 de quê — e o
  // eleitor tem dois números na linha, o do partido e o da urna.
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `Partido ${sigla}, número ${numeroPartido || sigla}`);

  const logo = new Image();
  logo.src = `partidos/${encodeURIComponent((sigla || "").toUpperCase())}.svg`;
  logo.alt = sigla;
  logo.onload = () => {
    el.textContent = "";
    el.style.background = "transparent";
    el.appendChild(logo);
  };
  return el;
}

/** Iniciais para o avatar quando não há foto do candidato. */
export function iniciais(nome) {
  const partes = (nome || "").trim().split(/\s+/).filter((p) => p.length > 2);
  return ((partes[0]?.[0] || "") + (partes.at(-1)?.[0] || "")).toUpperCase() || "?";
}
