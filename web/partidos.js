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

/** Selo do partido: <img> do logo quando existe, senão o número na cor. */
export function selo(sigla, numeroPartido, tamanho = 28) {
  const el = document.createElement("span");
  el.className = "selo";
  el.style.cssText =
    `width:${tamanho}px;height:${tamanho}px;background:${cor(sigla)};` +
    `font-size:${Math.round(tamanho * 0.46)}px`;
  el.textContent = numeroPartido || (sigla || "").slice(0, 3);
  el.title = sigla;

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
