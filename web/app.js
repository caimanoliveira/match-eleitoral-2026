import { match, bussola, ranquear, PULOU } from "./match.js";
import { cor, tinta, selo, iniciais, logosDisponiveis } from "./partidos.js";
import { desenharColinha, compartilhar } from "./colinha.js";

const CARGOS = [
  ["presidente", "Presidente"],
  ["governador", "Governador"],
  ["senador", "Senador"],
  ["deputado-federal", "Dep. Federal"],
  ["deputado-estadual", "Dep. Estadual"],
  ["deputado-distrital", "Dep. Distrital"],
];

const UFS = ("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR " +
  "RS SC SE SP TO").split(" ");

const FONTES = {
  "1": { rotulo: "Declarado pelo próprio candidato", inferida: false },
  "2": { rotulo: "Como votou no Congresso", inferida: false },
  "5": { rotulo: "Posição da bancada do partido", inferida: true },
};

const POR_PAGINA = 30;

// Quantos o eleitor leva para a urna por cargo. Em 2026 renovam-se dois terços
// do Senado: cada eleitor digita DOIS números para senador.
const VAGAS = { senador: 2 };
const vagas = (cargo) => VAGAS[cargo] || 1;

const CHAVE_FAVORITOS = "colinha:favoritos";
const CHAVE_UF = "colinha:uf";
// Hashes dos resultados gerados NESTE aparelho: abrir o próprio link em outra
// aba (ou depois de fechar o navegador) não passa pela tela "É o seu?".
const CHAVE_MEUS = "colinha:meus";
const lerMeus = () => { try { return JSON.parse(localStorage.getItem(CHAVE_MEUS) || "[]"); } catch { return []; } };
function guardarMeu(hash) {
  const meus = lerMeus().filter((h) => h !== hash);
  // ponytail: uma entrada por sessão (modo/versão/UF) — cada resposta muda o
  // hash, e sem isto um quiz de 34 respostas expulsava os 20 anteriores.
  const sessao = hash.split("/").slice(0, 4).join("/");
  if (meus.length && meus[meus.length - 1].startsWith(sessao + "/")) meus.pop();
  meus.push(hash);
  try { localStorage.setItem(CHAVE_MEUS, JSON.stringify(meus.slice(-20))); } catch { /* sem storage */ }
}
function lerFavoritos() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_FAVORITOS) || "[]")); }
  catch { return new Set(); }
}

// Semente do desempate: sorteada por sessão. Fixa por candidato, o mesmo
// nome ganharia o empate para todo eleitor do país — vantagem sistemática.
const SEMENTE = (() => {
  try {
    let v = sessionStorage.getItem("colinha:semente");
    if (!v) { v = String(Math.floor(Math.random() * 2 ** 31)); sessionStorage.setItem("colinha:semente", v); }
    return Number(v);
  } catch { return Math.floor(Math.random() * 2 ** 31); }
})();

const app = document.getElementById("app");
const estado = {
  uf: null,
  meta: null,
  versaoTeses: null,
  teses: [],
  partidos: {},     // sigla -> {tese_id: posição da bancada}
  respostas: {},
  // Peso marcado ANTES de responder, por tese: sobrevive a Pular/Voltar.
  rascunhoImportante: {},
  indice: 0,
  // Carregados juntos e trocados de uma vez só: se `uf` e `porCargo` puderem
  // descolar, a colinha carimba a UF de um estado sobre o número de outro.
  dados: { uf: null, porCargo: {}, falhas: {} },
  geracao: 0,       // descarta o resultado de uma carga que foi ultrapassada
  cargoAtivo: null,
  escolhas: {},     // cargo -> ids dos candidatos, unidos por "+" (Senado tem 2)
  busca: "",
  limite: POR_PAGINA,
  // Favoritos são do eleitor, não do link: ficam no aparelho (localStorage) e
  // nunca entram na URL compartilhada. Chave é o SQ, único no país.
  favoritos: lerFavoritos(),
  soFavoritos: false,
  soImportantes: false,
  // Camadas do mapa. No celular partidos começam desligados: 30 siglas em
  // 350px é ruído; o eleitor liga se quiser.
  // Legenda seletora do mapa: cada partido e cada presidenciável pode ser
  // ligado/desligado. Começa com partidos desligados no celular.
  mapa: { ocultos: new Set(), partidosOff: matchMedia("(max-width: 480px)").matches },
  // "completo" (34 afirmações → resultado → colinha), "rapido" (10, só
  // resultado) ou "colinha" (sem quiz: busca por nome/número e fixa). Três
  // produtos; o rápido nunca mostra colinha, a colinha nunca mostra percentual.
  modo: "completo",
};

const idsEscolhidos = (cargo) => (estado.escolhas[cargo] || "").split("+").filter(Boolean);
const estaNaColinha = (cargo, id) => idsEscolhidos(cargo).includes(id);
function gravarEscolha(cargo, ids) {
  if (ids.length) estado.escolhas[cargo] = ids.join("+");
  else delete estado.escolhas[cargo];
}
/** Põe ou tira da colinha. Cheio, o mais antigo sai. Devolve o id que saiu. */
function alternarEscolha(cargo, id) {
  let ids = idsEscolhidos(cargo);
  let saiu = null;
  if (ids.includes(id)) ids = ids.filter((x) => x !== id);
  else {
    if (ids.length >= vagas(cargo)) saiu = ids.shift();
    ids.push(id);
  }
  gravarEscolha(cargo, ids);
  return saiu;
}
function alternarFavorito(id) {
  if (!estado.favoritos.delete(id)) estado.favoritos.add(id);
  try { localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify([...estado.favoritos])); }
  catch { /* modo privado ou cota: o favorito vale até fechar a aba */ }
}

// ---------------------------------------------------------------- utilidades

const tpl = (id) => document.getElementById(id).content.cloneNode(true);
const pct = (n) => `${Math.round(n * 100)}%`;

const normalizar = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const rotuloCargo = (c) => (CARGOS.find(([k]) => k === c) || [, c])[1];

/** "Dep. Federal — RJ". O mesmo número pertence a pessoas diferentes em cada
 *  estado (2288 é Carlos Jordy no RJ e Major Mecca em SP), então a UF precisa
 *  viajar junto de qualquer coisa que mostre um número. Presidente é nacional. */
const rotuloComUF = (c) => {
  if (!c) return "";
  // A UF vem do lote de dados carregado, não de estado.uf: durante uma troca
  // de estado as duas divergem, e o rótulo mentiria sobre de quem é o número.
  const uf = estado.dados.uf;
  return c === "presidente" || !uf ? rotuloCargo(c) : `${rotuloCargo(c)} — ${uf}`;
};

let soltarTeclado = null;

function mostrar(node, { rolar = true } = {}) {
  // Toda troca de tela passa por aqui, então é aqui que o atalho de teclado da
  // tela anterior morre. Sem isso o ← do quiz continuaria ativo no resultado e
  // devolveria o eleitor ao questionário sem ele pedir.
  if (soltarTeclado) {
    document.removeEventListener("keydown", soltarTeclado);
    soltarTeclado = null;
  }
  // replaceChildren esvazia o <main> por um instante: a altura do documento
  // colapsa e o navegador trunca o scroll para o novo máximo. Guardar e
  // restaurar é o que de fato preserva a posição — só omitir o scrollTo não
  // basta.
  const y = window.scrollY;
  // Nome da tela antes de esvaziar o fragmento (depois do append ele fica vazio).
  const telaNome = ((node.firstElementChild || {}).className || "").replace("tela ", "").split(" ")[0];
  app.replaceChildren(node);
  if (rolar && telaNome) medir("page_view", { page_path: "/#" + telaNome });
  // `rolar: false` nas re-renderizações que não trocam de tela. Fixar um
  // candidato no 20º lugar não pode jogar o eleitor de volta ao topo.
  if (rolar) window.scrollTo(0, 0);
  else window.scrollTo(0, y);
  // Mandar o foco ao título da tela: sem isso o foco cai no <body> a cada
  // ação e quem navega por teclado ou leitor de tela recomeça do cabeçalho.
  // Só em troca real de tela: com `rolar: false` a re-renderização é local, e
  // mandar o foco ao <h1> tirava o eleitor do lugar onde ele estava agindo.
  if (rolar) {
    const titulo = app.querySelector("h1, h2");
    if (titulo) {
      titulo.setAttribute("tabindex", "-1");
      titulo.focus({ preventScroll: true });
    }
  }
}

/** Região viva pequena e dedicada. O <main> inteiro como aria-live faria o
 *  leitor de tela reler a página toda a cada resposta. */
function anunciar(texto) {
  let regiao = document.getElementById("anuncio");
  if (!regiao) {
    regiao = document.createElement("p");
    regiao.id = "anuncio";
    regiao.className = "sr";
    regiao.setAttribute("aria-live", "polite");
    document.body.append(regiao);
  }
  regiao.textContent = texto;
}

/** Atalhos da tela atual. `mostrar()` derruba o anterior a cada troca. */
function teclado(handler) {
  if (soltarTeclado) document.removeEventListener("keydown", soltarTeclado);
  soltarTeclado = (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const alvo = ev.target;
    if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "SELECT")) return;
    if (handler(ev)) ev.preventDefault();
  };
  document.addEventListener("keydown", soltarTeclado);
}

// Carimbo do build, anexado a toda URL de dados. Sem isso o navegador (ou um
// CDN) pode servir um shard de ontem junto do teses.json de hoje — e como
// `pos`/`src` são posicionais contra a lista de teses, a leitura sai
// desalinhada sem erro nenhum, mostrando a posição de uma tese no lugar de
// outra. Mesmo problema que a versão na URL resolve para links compartilhados,
// agora na camada de cache HTTP.
let carimbo = "";

class HttpErro extends Error {
  constructor(caminho, status) {
    super(`${caminho}: ${status}`);
    this.status = status;
  }
}

async function carregarJSON(caminho, semCache = false) {
  const url = semCache
    ? `${caminho}?t=${Date.now()}`
    : carimbo
      ? `${caminho}?v=${carimbo}`
      : caminho;
  const r = await fetch(url, semCache ? { cache: "no-store" } : undefined);
  // `status` distingue "esta UF não elege esse cargo" (404) de "a rede caiu"
  // (fetch rejeita, ou 5xx). Tratar os dois igual fazia um cargo inteiro
  // desaparecer em silêncio quando a conexão oscilava.
  if (!r.ok) throw new HttpErro(caminho, r.status);
  return r.json();
}

// Todas as teses valem para todos os cargos, e isso é uma escolha, não um
// descuido: a evidência sobre um candidato a deputado estadual vem da bancada
// federal do partido dele, que serve como indicador de posição ideológica e não
// como previsão dos votos que ele dará na assembleia. O campo `esfera` fica em
// theses.toml para a curadoria, mas não filtra o quiz. Está explicado na
// metodologia — se um dia deixar de valer, o filtro entra aqui.
// Quiz rápido: as 10 afirmações de maior peso nos eixos (5 puxadas pelo
// econômico, 5 pelo social), para quem chegou por link de WhatsApp. A ORDEM
// de teses.json não muda — a URL é posicional sobre ela; o rápido é um
// subconjunto, o completo é a lista inteira na ordem original.
const RAPIDAS = 10;
let rapidas = null;
const tesesRapidas = () => {
  if (rapidas && rapidas.length && estado.teses.length) return rapidas;
  const peso = (t, e) => Math.abs((t.eixo || {})[e] || 0);
  const porEco = [...estado.teses].sort((a, b) => peso(b, "economico") - peso(a, "economico"));
  const porSoc = [...estado.teses].sort((a, b) => peso(b, "social") - peso(a, "social"));
  const sel = [];
  for (let i = 0; sel.length < Math.min(RAPIDAS, estado.teses.length); i++) {
    for (const t of [porEco[i], porSoc[i]]) {
      if (t && !sel.includes(t) && sel.length < RAPIDAS) sel.push(t);
    }
  }
  // Na ordem de teses.json, para o quiz não parecer embaralhado.
  rapidas = estado.teses.filter((t) => sel.includes(t));
  return rapidas;
};
// Quem completa a partir do rápido continua com as 10 na frente (começa na
// 11ª); quem começou pelo completo vê a ordem do arquivo. Só em memória: ao
// reabrir o link, a ordem do arquivo vale e o índice cai na primeira sem
// resposta.
let continuouDoRapido = false;
const tesesDoEleitor = () => {
  if (estado.modo === "rapido") return tesesRapidas();
  if (!continuouDoRapido) return estado.teses;
  const r = tesesRapidas();
  return [...r, ...estado.teses.filter((t) => !r.includes(t))];
};

const respondidas = () =>
  Object.values(estado.respostas).filter((r) => r && r.valor != null).length;

// ------------------------------------------------------------------- estado
// O estado vive na URL para que o link compartilhado reabra a mesma escolha,
// sem backend e sem localStorage.

function salvarNaURL() {
  const ids = CARGOS.map(([c]) => estado.escolhas[c] || "").join(".");
  const respostas = estado.teses
    .map((t) => {
      const r = estado.respostas[t.id];
      if (!r) return "x";                      // ainda não chegou nesta
      if (r.valor === PULOU) return "p";       // pulou de propósito
      return { "1": "c", "0": "n", "-1": "d" }[String(r.valor)] + (r.importante ? "!" : "");
    })
    .join("");
  history.replaceState(
    null, "", `#/${{ rapido: "q", colinha: "c" }[estado.modo] || "r"}/${estado.versaoTeses}/${estado.uf}/${respostas}/${ids}`);
  if (respondidas() > 0) guardarMeu(location.hash);
}

function lerDaURL() {
  const m = location.hash.match(/^#\/(r|q|c)\/([a-f0-9]{6})\/([A-Z]{2})\/([cndxp!]*)\/(.*)$/);
  if (!m) return false;
  const [, modoChar, versao, uf, respostas, ids] = m;
  const modo = { q: "rapido", c: "colinha" }[modoChar] || "completo";

  // As respostas são posicionais. Um link gerado com outro conjunto de teses
  // seria decodificado contra as perguntas erradas — e o eleitor veria um
  // resultado plausível, porém falso. Melhor refazer o teste.
  if (versao !== estado.versaoTeses) {
    console.warn("link de outra versão do questionário; recomeçando");
    return false;
  }
  if (!UFS.includes(uf)) return false;

  const lidas = {};
  let i = 0;
  let primeiraSemResposta = null;
  estado.teses.forEach((tese, k) => {
    const ch = respostas[i++];
    if (ch === undefined || ch === "x") {
      if (primeiraSemResposta === null) primeiraSemResposta = k;
      return;
    }
    if (ch === "p") {
      lidas[tese.id] = { valor: PULOU, importante: false };
      return;
    }
    const valor = { c: 1, n: 0, d: -1 }[ch];
    // Hash corrompida não vira resultado plausível: sem isto, `undefined`
    // escorria para o cálculo e todos os percentuais viravam NaN.
    if (valor === undefined) throw new RangeError("resposta inválida na URL");
    const importante = respostas[i] === "!";
    if (importante) i++;
    lidas[tese.id] = { valor, importante };
  });

  // Reconstrói a sessão inteira. Antes só `respostas` era substituído e
  // `escolhas` era mesclado: abrir um segundo link na mesma aba somava a
  // colinha antiga à nova, produzindo uma combinação de números que nenhum dos
  // dois links jamais carregou.
  const escolhas = {};
  ids.split(".").forEach((id, k) => {
    if (id) escolhas[CARGOS[k][0]] = id;
  });
  // O índice é na ORDEM DO QUIZ, não na de teses.json.
  estado.modo = modo;
  const semResposta = tesesDoEleitor().findIndex((t) => !lidas[t.id]);
  void primeiraSemResposta;
  Object.assign(estado, {
    uf, escolhas, respostas: lidas,
    indice: semResposta === -1 ? estado.teses.length : semResposta,
    busca: "", limite: POR_PAGINA, cargoAtivo: null,
  });
  // A colinha montada à mão não tem resposta nenhuma — e é válida assim.
  return modo === "colinha" || Object.keys(lidas).length > 0;
}

// -------------------------------------------------------------------- telas

/** Volta ao ponto zero. Sem isto, "#/" mostrava a tela inicial mas o estado
 *  anterior continuava vivo, e o eleitor que "recomeçava" recebia o resultado
 *  velho. */
function zerarSessao() {
  Object.assign(estado, {
    uf: null, respostas: {}, rascunhoImportante: {}, indice: 0, escolhas: {},
    dados: { uf: null, porCargo: {}, falhas: {} },
    cargoAtivo: null, busca: "", limite: POR_PAGINA,
  });
  estado.geracao++; // invalida carga em voo
  continuouDoRapido = false;
}

function telaInicio(motivo = "", modo = "completo") {
  zerarSessao();
  estado.modo = modo;
  const node = tpl("tpl-inicio");
  const sel = node.getElementById("uf");
  sel.append(new Option("Selecione…", ""));
  UFS.forEach((uf) => sel.append(new Option(uf, uf)));
  try {
    const salva = localStorage.getItem(CHAVE_UF);
    if (UFS.includes(salva)) sel.value = salva;
  } catch { /* sem storage */ }

  const erro = node.getElementById("erro-uf");
  // Link recusado (outra versão do questionário, hash corrompida) era
  // descartado sem uma palavra: o eleitor via a tela inicial sem saber por quê.
  if (motivo) erro.textContent = motivo;
  sel.onchange = () => {
    erro.textContent = "";
    sel.removeAttribute("aria-invalid");
  };
  // O rápido é a opção B, oferecida aqui — não um CTA próprio na landing.
  const rapidoBtn = node.getElementById("comecar-rapido");
  if (modo === "completo") {
    rapidoBtn.hidden = false;
    rapidoBtn.onclick = () => {
      // Só troca o modo depois de validar: antes, um toque sem UF deixava
      // "rapido" gravado e o "Começar" seguinte abria o quiz errado.
      if (!sel.value) { document.getElementById("comecar").click(); return; }
      estado.modo = "rapido";
      document.getElementById("comecar").click();
    };
  }
  node.getElementById("comecar").onclick = async (ev) => {
    if (!sel.value) {
      // Antes o botão só dava focus() e nada aparecia: o eleitor tocava,
      // nada acontecia, e ele não tinha como saber por quê.
      erro.textContent = "Escolha seu estado para começar.";
      sel.setAttribute("aria-invalid", "true");
      sel.focus();
      return;
    }
    ev.target.disabled = true;
    ev.target.textContent = "Carregando candidatos…";
    estado.uf = sel.value;
    try { localStorage.setItem(CHAVE_UF, sel.value); } catch { /* sem storage */ }
    await carregarCandidatos();
    // Engolir a falha aqui fazia o eleitor responder 34 afirmações para só
    // então descobrir que não havia candidato nenhum para comparar.
    if (!Object.keys(estado.dados.porCargo).length) {
      erro.textContent =
        "Não consegui carregar os candidatos. Verifique sua conexão e tente de novo.";
      ev.target.disabled = false;
      ev.target.textContent = "Começar";
      return;
    }
    estado.indice = 0;
    medir("quiz_inicio", { modo: estado.modo });
    if (estado.modo === "colinha") telaResultado(); else telaQuiz();
  };
  mostrar(node);
}

async function carregarCandidatos() {
  const geracao = ++estado.geracao;
  const uf = estado.uf;
  const cargos = CARGOS.filter(([c]) =>
    c === "presidente" ? true : c === "deputado-distrital" ? uf === "DF" :
    c === "deputado-estadual" ? uf !== "DF" : true);

  // meta.json lista os shards que o build gerou. Ele, e não o status HTTP, é a
  // fonte da verdade sobre o que existe: tratar 404 como "esta UF não elege o
  // cargo" fazia um cargo sumir em silêncio quando o arquivo simplesmente não
  // tinha sido publicado.
  const existentes = new Set(estado.meta?.shards || []);
  const falhas = {};
  const pares = await Promise.all(
    cargos.map(async ([cargo]) => {
      const ufShard = cargo === "presidente" ? "BR" : uf;
      const nome = `${cargo}-${ufShard}`;
      if (existentes.size && !existentes.has(nome)) return [cargo, []];
      try {
        return [cargo, await carregarJSON(`data/${nome}.json`)];
      } catch (e) {
        falhas[cargo] = e.message;
        return [cargo, []];
      }
    })
  );

  // Outra carga começou enquanto esta esperava: descartar. Sem isto, a resposta
  // lenta de uma UF antiga sobrescreve a nova e o rótulo passa a mentir.
  if (geracao !== estado.geracao) return;

  const porCargo = Object.fromEntries(pares.filter(([, v]) => v.length));
  estado.dados = { uf, porCargo, falhas };
  if (!porCargo[estado.cargoAtivo]) {
    estado.cargoAtivo = Object.keys(porCargo)[0] || null;
  }
}

function telaQuiz() {
  const teses = tesesDoEleitor();
  if (estado.indice >= teses.length) return telaResultado();

  const tese = teses[estado.indice];
  const node = tpl("tpl-quiz");

  node.querySelector(".barra").style.transform =
    `scaleX(${estado.indice / teses.length})`;
  node.querySelector(".contador").textContent =
    `Afirmação ${estado.indice + 1} de ${teses.length}`;
  node.querySelector(".tese").textContent = tese.texto;
  // Em palavras simples, sempre visível: quem entende tudo já sabe em quem
  // vota; o site existe para quem não entende ainda.
  const simples = node.querySelector(".simples");
  simples.textContent = tese.simples || "";
  simples.hidden = !tese.simples;

  // "Saber mais": no desktop vira um bloco à direita da pergunta, aberto;
  // no celular fica dobrado abaixo dela.
  const ctx = node.querySelector(".contexto");
  ctx.querySelector(".contexto-simples").textContent = tese.simples || "";
  ctx.querySelector(".contexto-texto").textContent = tese.contexto || "";
  if (!tese.contexto && !tese.simples) ctx.remove();
  else ctx.open = matchMedia("(min-width: 60rem)").matches;

  const check = node.querySelector(".importante input");
  const anterior = estado.respostas[tese.id];
  check.checked = anterior?.importante || estado.rascunhoImportante[tese.id] || false;
  // Gravar no próprio change: antes o peso só era lido no clique da resposta,
  // então marcar "muito importante" depois de responder — ou antes de usar
  // Voltar/Pular — não surtia efeito nenhum.
  check.onchange = () => {
    estado.rascunhoImportante[tese.id] = check.checked;
    const r = estado.respostas[tese.id];
    if (r) {
      r.importante = check.checked;
      salvarNaURL();
    }
  };

  node.querySelectorAll(".resp").forEach((btn) => {
    const valor = Number(btn.dataset.valor);
    const escolhida = anterior && anterior.valor === valor;
    if (escolhida) btn.classList.add("escolhida");
    btn.setAttribute("aria-pressed", escolhida ? "true" : "false");
    btn.onclick = () => {
      marcarMeu();
      estado.respostas[tese.id] = { valor, importante: check.checked };
      estado.indice++;
      salvarNaURL();
      telaQuiz();
    };
  });

  // Com 34 afirmações, obrigar a responder tudo antes de ver qualquer coisa é
  // o caminho mais curto para o eleitor desistir no meio.
  const n = respondidas();
  const parcial = node.getElementById("ver-parcial");
  if (n >= 5 && estado.indice < teses.length - 1) {
    parcial.hidden = false;
    parcial.textContent = `Ver meus candidatos agora (${n} de ${teses.length} respondidas)`;
    parcial.onclick = telaResultado;
  }

  const voltar = node.getElementById("voltar");
  voltar.disabled = estado.indice === 0;
  voltar.onclick = () => {
    estado.indice--;
    telaQuiz();
  };

  const pular = node.getElementById("pular");
  // "Pular" apagava em silêncio uma resposta já dada. Se há resposta, o botão
  // só avança.
  pular.textContent = anterior && anterior.valor !== PULOU ? "Avançar" : "Não sei / pular";
  pular.setAttribute("aria-pressed", String(!!anterior && anterior.valor === PULOU));
  pular.onclick = () => {
    if (!anterior || anterior.valor === PULOU) {
      estado.respostas[tese.id] = { valor: PULOU, importante: false };
    }
    estado.indice++;
    salvarNaURL();
    telaQuiz();
  };

  mostrar(node);
  anunciar(`Afirmação ${estado.indice + 1} de ${teses.length}. ${tese.texto}`);

  // Responder 34 afirmações a mouse é lento. As teclas seguem a ordem visual
  // dos botões, então não há nada a decorar.
  // Consultar o documento, não `node`: mostrar() move os filhos do fragmento
  // para o DOM e o fragmento fica vazio — querySelector nele devolveria null.
  teclado((ev) => {
    const porTecla = { 1: "1", 2: "0", 3: "-1" };
    if (porTecla[ev.key]) {
      document.querySelector(`.resp[data-valor="${porTecla[ev.key]}"]`)?.click();
      return true;
    }
    if (ev.key === "ArrowLeft" && estado.indice > 0) {
      estado.indice--;
      telaQuiz();
      return true;
    }
    if (ev.key === "4" || ev.key === "ArrowRight") {
      document.getElementById("pular")?.click();
      return true;
    }
    return false;
  });
}

function telaResultado({ rolar = true } = {}) {
  salvarNaURL();
  const node = tpl("tpl-resultado");
  const montando = estado.modo === "colinha";
  node.querySelector(".resultado").classList.toggle("modo-colinha", montando);
  if (!montando) node.getElementById("bussola").append(painelVisoes());
  if (!estado.mediuResultado) { estado.mediuResultado = true; medir("quiz_resultado", { modo: estado.modo, respondidas: respondidas() }); }

  const teses = tesesDoEleitor();
  const faltam = teses.length - respondidas();
  const cabecalho = node.querySelector("h1");
  const rapido = estado.modo === "rapido";
  node.querySelector(".resultado").classList.toggle("modo-rapido", rapido);
  if (!montando && respondidas() > 0) {
    const p = bussola(estado.respostas, teses);
    if (p.pesos.economico || p.pesos.social) {
      const rot = document.createElement("p");
      rot.className = "voce-e";
      rot.innerHTML = `Pelo que você respondeu, você é <b>${esc(nomeDaPosicao(p))}</b>. <small>É a sua posição nos dois eixos do mapa, não um rótulo de partido.</small>`;
      cabecalho.after(rot);
      // Quadrante vazio é dado, não bug: o Congresso ocupa mal alguns cantos.
      // Dizer isso na tela poupa o "fiquei sozinho" (feedback de 30/08).
      const vizinhos = quadranteVazio(p);
      if (vizinhos) {
        const s = document.createElement("small");
        s.textContent = ` Nenhuma bancada de partido cai no seu quadrante; as mais próximas no mapa são ${vizinhos.join(" e ")}. O ranking abaixo continua valendo: ele compara tema a tema, não a distância no mapa.`;
        rot.querySelector("small").append(s);
      }
    }
  }
  if (montando) {
    cabecalho.textContent = "Monte sua colinha";
    const nota = node.getElementById("nota-parcial");
    nota.hidden = false;
    nota.textContent = "Busque por nome ou número em cada cargo e toque em “+ Colinha”. Sem percentual: aqui é só a sua escolha.";
  }
  if (rapido) {
    cabecalho.textContent = "Seus candidatos — quiz rápido";
    const nota = node.getElementById("nota-parcial");
    nota.hidden = false;
    nota.textContent = `Prévia com ${teses.length} afirmações: os percentuais ficam grosseiros e muitos candidatos empatam. Abra “ver quais” para conferir tema a tema, e responda as outras ${estado.teses.length - teses.length} para afinar.`;
    // O rápido não monta colinha: o convite é completar as 34 e montar.
    const completar = node.getElementById("completar");
    completar.hidden = false;
    completar.textContent = `Responder as outras ${estado.teses.length - teses.length} e montar minha colinha`;
    completar.onclick = () => {
      estado.modo = "completo";
      continuouDoRapido = true;
      const todas = tesesDoEleitor();
      const i = todas.findIndex((t) => { const r = estado.respostas[t.id]; return !r || r.valor == null; });
      estado.indice = i === -1 ? 0 : i;
      salvarNaURL();
      telaQuiz();
    };
  }
  if (faltam > 0 && !rapido && !montando && respondidas() === 0) {
    cabecalho.textContent = "Você pulou todas";
    const nota = node.getElementById("nota-parcial");
    nota.hidden = false;
    nota.textContent = "Sem nenhuma resposta não há o que comparar. Responda pelo menos algumas.";
    const continuar = node.getElementById("continuar");
    continuar.hidden = false;
    continuar.textContent = "Responder de novo";
    continuar.onclick = () => { estado.indice = 0; telaQuiz(); };
  } else if (faltam > 0 && !rapido && !montando) {
    cabecalho.textContent = "Seus candidatos — resultado parcial";
    const nota = node.getElementById("nota-parcial");
    nota.hidden = false;
    nota.textContent =
      `Baseado em ${respondidas()} de ${teses.length} afirmações. ` +
      `Quanto mais você responder, mais o resultado separa os candidatos.`;
    const continuar = node.getElementById("continuar");
    continuar.hidden = false;
    continuar.textContent = `Continuar respondendo (faltam ${faltam})`;
    continuar.onclick = () => {
      // Mesmo critério de `faltam`: uma tese pulada TEM entrada, então o
      // findIndex antigo devolvia -1 e o botão voltava para a afirmação 1.
      const i = teses.findIndex((t) => {
        const r = estado.respostas[t.id];
        return !r || r.valor == null;
      });
      estado.indice = i === -1 ? 0 : i;
      telaQuiz();
    };
  }

  const abas = node.getElementById("abas");
  let abaAtiva = null;
  for (const [cargo] of CARGOS) {
    if (!estado.dados.porCargo[cargo]?.length) continue;
    const b = document.createElement("button");
    b.dataset.cargo = cargo;
    b.textContent = rotuloAba(cargo);
    b.className = cargo === estado.cargoAtivo ? "aba ativa" : "aba";
    b.setAttribute("aria-current", cargo === estado.cargoAtivo ? "true" : "false");
    if (cargo === estado.cargoAtivo) abaAtiva = b;
    b.onclick = () => {
      estado.cargoAtivo = cargo;
      estado.busca = "";
      estado.limite = POR_PAGINA;
      telaResultado();
    };
    abas.append(b);
  }

  // Cargo que não carregou não pode simplesmente sumir: o eleitor não teria
  // como saber que existem candidatos fora da tela.
  const falhou = Object.keys(estado.dados.falhas);
  if (falhou.length) {
    const aviso = node.getElementById("falha-carga");
    aviso.hidden = false;
    aviso.textContent =
      `Não consegui carregar ${falhou.map(rotuloComUF).join(", ")}. ` +
      `Sua conexão pode ter oscilado.`;
    const tentar = document.createElement("button");
    tentar.className = "secundario";
    tentar.textContent = "Tentar de novo";
    tentar.onclick = async () => {
      tentar.disabled = true;
      tentar.textContent = "Carregando…";
      await carregarCandidatos();
      telaResultado();
    };
    aviso.append(document.createElement("br"), tentar);
  }

  const campo = node.getElementById("busca");
  campo.value = estado.busca;
  // A caixa fica de fora do que é redesenhado: antes ela era recriada a cada
  // tecla e o cursor pulava para o fim do texto.
  campo.oninput = () => {
    estado.busca = campo.value;
    estado.limite = POR_PAGINA;
    renderLista();
  };

  const filtroFav = node.getElementById("so-favoritos");
  filtroFav.onclick = () => {
    estado.soFavoritos = !estado.soFavoritos;
    estado.limite = POR_PAGINA;
    renderLista();
  };
  // Pedido de testador (30/08): "% só com o que marquei como muito
  // importante". Mesma conta, sobre o subconjunto — e a tela diz sobre
  // quantos temas, porque com 3 respostas o percentual vira degrau.
  const filtroImp = node.getElementById("so-importantes");
  const notaImp = node.getElementById("nota-importantes");
  const importantes = () => Object.fromEntries(
    Object.entries(estado.respostas).filter(([, r]) => r.importante && r.valor !== PULOU));
  filtroImp.onclick = () => {
    estado.soImportantes = !estado.soImportantes;
    estado.limite = POR_PAGINA;
    renderLista();
  };

  const lista = node.getElementById("lista");
  const mais = node.getElementById("mais");
  const rodape = node.getElementById("rodape-fonte");
  const avisos = node.getElementById("avisos-lista");
  const legendaHerdada = node.getElementById("legenda-herdada");

  function renderLista() {
    if (!estado.cargoAtivo) {
      // Sem cargo carregado não há o que listar, e montar a frase produzia
      // "0 candidatos a null — RJ" na cara do eleitor.
      lista.replaceChildren();
      avisos.replaceChildren();
      mais.hidden = true;
      campo.disabled = true;
      legendaHerdada.hidden = true;
      rodape.innerHTML = idadeDaFonte();
      return;
    }
    const universo = estado.dados.porCargo[estado.cargoAtivo] || [];
    // Montando à mão não há percentual: ordem alfabética, e o card sem barra.
    const completo = montando
      ? [...universo].sort((a, b) => a.n.localeCompare(b.n, "pt-BR"))
          .map((c) => ({ candidato: c, score: null, detalhe: [], respondidas: 0 }))
      // SEMPRE estado.teses: pos/src são posicionais sobre a lista completa.
      // Passar o subconjunto do quiz rápido desalinhava tudo (bug real).
      : ranquear(estado.soImportantes ? importantes() : estado.respostas, estado.teses, universo, SEMENTE);
    const nImp = Object.keys(importantes()).length;
    filtroImp.disabled = !nImp || montando;
    filtroImp.hidden = montando;
    if (!nImp) estado.soImportantes = false;
    filtroImp.textContent = nImp ? `Só o muito importante (${nImp})` : "Só o muito importante";
    filtroImp.setAttribute("aria-pressed", estado.soImportantes ? "true" : "false");
    filtroImp.classList.toggle("ativo", estado.soImportantes);
    notaImp.hidden = !estado.soImportantes;
    notaImp.textContent = `Percentual calculado só sobre ${nImp === 1 ? "o 1 tema" : `os ${nImp} temas`} que você marcou como muito importante — com poucos temas, muita gente empata.`;

    const alvo = normalizar(estado.busca);
    let visiveis = alvo
      ? completo.filter(
          (r) => normalizar(r.candidato.n).includes(alvo) || r.candidato.num.startsWith(alvo)
        )
      : completo;
    const favoritosAqui = completo.filter((r) => estado.favoritos.has(r.candidato.id)).length;
    if (estado.soFavoritos) visiveis = visiveis.filter((r) => estado.favoritos.has(r.candidato.id));
    filtroFav.textContent = favoritosAqui ? `★ Favoritos (${favoritosAqui})` : "★ Favoritos";
    filtroFav.setAttribute("aria-pressed", estado.soFavoritos ? "true" : "false");
    filtroFav.classList.toggle("ativo", estado.soFavoritos);

    // Contagens SEMPRE sobre o universo do cargo, nunca sobre o filtro da
    // busca. Calculá-las sobre a lista filtrada fazia buscar um candidato
    // apagar justamente os dois avisos que dizem que o percentual é do
    // partido — o oposto do que o projeto promete.
    const porPartido = {};
    for (const r of completo) {
      if (soPosicaoDoPartido(r.detalhe)) {
        porPartido[r.candidato.p] = (porPartido[r.candidato.p] || 0) + 1;
      }
    }
    const empatados = completo.filter((r) => r.score === completo[0]?.score).length;

    avisos.replaceChildren();
    if (vagas(estado.cargoAtivo) > 1) {
      const dica = document.createElement("p");
      dica.className = "aviso dica-vagas";
      const n = idsEscolhidos(estado.cargoAtivo).length;
      dica.innerHTML =
        `Nesta eleição você vota em <b>${vagas(estado.cargoAtivo)} para o Senado</b>. ` +
        `Coloque até dois na colinha` + (n ? ` — ${n} de 2 escolhidos.` : `.`);
      avisos.append(dica);
    }
    if (estado.soFavoritos && !favoritosAqui) {
      const p = document.createElement("p");
      p.className = "aviso";
      p.textContent = `Nenhum favorito em ${rotuloComUF(estado.cargoAtivo)} ainda. Toque em ☆ nos candidatos que quiser guardar.`;
      avisos.append(p);
    } else if (empatados > 3 && !montando) {
      const aviso = document.createElement("p");
      aviso.className = "empate";
      aviso.innerHTML =
        `<b>${empatados} candidatos empatam no primeiro lugar.</b> Para a maioria deles ` +
        `a posição vem da bancada do partido, não de voto individual — então candidatos ` +
        `do mesmo partido ficam idênticos aqui. A ordem entre empatados é sorteada, e ` +
        `não é uma recomendação. Abra “por quê” para ver de onde vem cada posição.`;
      avisos.append(aviso);
    }
    if (!visiveis.length && !(estado.soFavoritos && !favoritosAqui)) {
      const vazio = document.createElement("p");
      vazio.className = "aviso";
      vazio.textContent = montando
        ? `Nenhum candidato a ${rotuloComUF(estado.cargoAtivo)} com “${estado.busca}”.`
        : respondidas() === 0
        ? `Você ainda não respondeu nenhuma afirmação, então não há como comparar ` +
          `você com ninguém. Volte e responda pelo menos algumas.`
        : alvo
          ? `Nenhum candidato a ${rotuloComUF(estado.cargoAtivo)} com “${estado.busca}” ` +
            `pôde ser comparado com suas respostas. Ele pode estar concorrendo por um ` +
            `partido sem registro de posição, ou em outro cargo.`
          : `Nenhum candidato a ${rotuloComUF(estado.cargoAtivo)} tem registro de ` +
            `posição nas afirmações que você respondeu.`;
      avisos.append(vazio);
    }

    lista.replaceChildren();
    const pagina = visiveis.slice(0, estado.limite);
    pagina.forEach((r) => lista.append(itemCandidato(r, porPartido)));
    // A explicação do "≈" fica uma vez, acima da lista, e só quando há card
    // com posição herdada — não repetida em cada card.
    legendaHerdada.hidden = !pagina.some((r) => soPosicaoDoPartido(r.detalhe));

    const restam = visiveis.length - estado.limite;
    mais.hidden = restam <= 0;
    if (restam > 0) {
      mais.textContent = `Mostrar mais ${Math.min(POR_PAGINA, restam)} (de ${restam} restantes)`;
      mais.onclick = () => {
        estado.limite += POR_PAGINA;
        renderLista();
      };
    }

    // Duas causas distintas para um candidato ficar de fora, e antes o rodapé
    // culpava sempre a falta de dados — inclusive quando quem não respondeu
    // foi o eleitor.
    const semRegistroAlgum = universo.filter((c) => [...c.src].every((s) => s === "?")).length;
    const semTeseEmComum = universo.length - completo.length - semRegistroAlgum;
    const contagens = [
      alvo
        ? `${visiveis.length} de ${universo.length} candidatos a ` +
          `${rotuloComUF(estado.cargoAtivo)} para “${esc(estado.busca)}”.`
        : visiveis.length > estado.limite
          ? `Mostrando ${estado.limite} de ${universo.length} candidatos a ${rotuloComUF(estado.cargoAtivo)}.`
          : `${universo.length} candidatos a ${rotuloComUF(estado.cargoAtivo)}.`,
      semRegistroAlgum > 0 && !montando
        ? `${semRegistroAlgum} não têm registro de posição sobre nenhum tema.`
        : "",
      semTeseEmComum > 0 && !montando
        ? `${semTeseEmComum} não puderam ser comparados com as afirmações que você respondeu.`
        : "",
      !montando && empatados > 1
        ? "Empatados aparecem em ordem sorteada a cada visita — não por número nem por nome."
        : "",
    ].filter(Boolean).join(" ");
    rodape.innerHTML = [contagens, idadeDaFonte()].filter(Boolean)
      .map((t) => `<span>${t}</span>`).join("");

    if (alvo) anunciar(`${visiveis.length} candidatos encontrados.`);
  }

  renderLista();
  node.getElementById("ver-colinha").onclick = telaColinha;
  node.getElementById("barra-colinha").onclick = telaColinha;
  atualizarBotaoColinha(node);
  const base = `${location.origin}${location.pathname}`;
  node.getElementById("mandar-quiz").onclick = () =>
    medir("share_quiz") || mandar("Comparei o que penso com o voto real dos candidatos, em 2 minutos. Faz o seu:", `${base}?via=wa#/rapido`);
  node.getElementById("mandar-resultado").onclick = () =>
    medir("share_resultado") || mandar("Olha o meu resultado no Colinha — e o seu, dá quanto?", `${base}?via=wa${location.hash}`);
  mostrar(node, { rolar });

  // A aba selecionada pode estar fora da faixa visível num celular: sem isto o
  // eleitor toca "Dep. Estadual", a lista troca e ele continua vendo só
  // "Presidente" e "Governador", sem nenhuma marca de onde está.
  // scrollLeft direto, e não scrollIntoView: este último também rola a PÁGINA
  // na vertical para trazer a faixa à vista, desfazendo o `rolar: false`.
  const faixa = document.querySelector(".abas");
  if (faixa && abaAtiva) {
    faixa.scrollLeft = Math.max(
      0, abaAtiva.offsetLeft - (faixa.clientWidth - abaAtiva.offsetWidth) / 2
    );
  }
  marcarRolagem(faixa);
}

/** Teses em que o candidato votou DIFERENTE da bancada do próprio partido.
 *  Só conta o que entrou no match: um voto divergente numa tese que o eleitor
 *  não respondeu não tem por que aparecer no percentual dele.
 *
 *  É a informação que separa a pessoa da sigla — dois terços dos candidatos
 *  com voto próprio divergem em ao menos um tema — e estava calculada e
 *  escondida desde o começo. */
function divergencias(detalhe, sigla) {
  const bancada = estado.partidos[(sigla || "").toUpperCase()];
  if (!bancada) return [];
  return detalhe.filter(
    (d) =>
      d.fonte === "2" &&
      bancada[d.tese.id] &&
      bancada[d.tese.id].pos !== POSICAO_CHAR[d.posicao]
  );
}

const POSICAO_CHAR = { 1: "+", "-1": "-", 0: "0" };

// Abaixo disto a bancada não tem uma posição, tem uma maioria apertada. São
// 90 das 622 células (14,5%), e até aqui o site as apresentava com a mesma
// firmeza de uma votação unânime.
const COESAO_FRACA = 0.7;

const bancadaNaTese = (sigla, teseId) =>
  estado.partidos[(sigla || "").toUpperCase()]?.[teseId];

/** O percentual veio inteiro da bancada? Olha só as teses que ENTRARAM na
 *  conta: usar a string `src` completa fazia o aviso sumir quando o candidato
 *  tinha um voto próprio numa tese que o eleitor não respondeu. */
const soPosicaoDoPartido = (detalhe) =>
  detalhe.some((d) => d.posicao !== null) &&
  detalhe.every((d) => d.posicao === null || d.fonte === "5");

/** Marca as bordas quando ainda há aba fora da tela, já que a barra de
 *  rolagem está oculta e sem isso não há pista de que a faixa rola. */
function marcarRolagem(el) {
  if (!el) return;
  const atualizar = () => {
    el.classList.toggle("tem-antes", el.scrollLeft > 4);
    el.classList.toggle(
      "tem-depois",
      el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    );
  };
  el.addEventListener("scroll", atualizar, { passive: true });
  atualizar();
}

/** Candidatura muda até a véspera: dizer a data da fonte é parte do produto. */
function idadeDaFonte() {
  const iso = estado.meta?.fonte_tse_em;
  if (!iso) return "";
  const dias = (Date.now() - new Date(iso)) / 86400000;
  const data = new Date(iso).toLocaleDateString("pt-BR");
  const link = `<a href="https://divulgacandcontas.tse.jus.br/" target="_blank" rel="noopener">consultar no TSE</a>`;
  return `Lista de candidatos do TSE de <b>${data}</b>` +
    (dias > 7 ? ` — pode estar desatualizada; ${link}.` : ` · ${link}.`);
}

/** Rótulo da aba: cargo + ✓ quando já há escolha para ele. */
const rotuloAba = (cargo) =>
  rotuloComUF(cargo) + (idsEscolhidos(cargo).length ? " ✓" : "");

function itemCandidato({ candidato, score, detalhe, respondidas: temas }, porPartido = {}) {
  const li = document.createElement("li");
  li.className = "candidato";

  const topo = document.createElement("div");
  topo.className = "topo";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.background = cor(candidato.p);
  avatar.style.color = tinta(candidato.p);
  avatar.textContent = iniciais(candidato.n);
  if (candidato.foto) {
    const img = new Image();
    img.src = candidato.foto;
    img.alt = "";
    img.onload = () => avatar.replaceChildren(img);
  }

  const nome = document.createElement("div");
  nome.className = "nome";
  nome.innerHTML =
    `<b>${candidato.n}</b>` +
    `<span class="numero"><span class="rot">nº na urna</span>${candidato.num}</span>` +
    `<small>${candidato.p}</small>`;

  const barra = document.createElement("div");
  barra.className = "score";
  barra.innerHTML =
    `<div class="score-barra"><i style="width:${pct(score ?? 0)}"></i></div>` +
    `<b>${pct(score ?? 0)}</b>`;

  topo.append(avatar, nome, selo(candidato.p, candidato.pn));
  if (score !== null) topo.append(barra);
  // As ações entram AQUI, antes de qualquer aviso de largura total: depois
  // deles o grid empurrava ＋/☆ para uma linha própria.
  const acoes = document.createElement("div");
  acoes.className = "acoes";
  topo.append(acoes);

  if (candidato.numDisputado) {
    const alerta = document.createElement("p");
    alerta.className = "num-disputado";
    alerta.textContent =
      `Atenção: o número ${candidato.num} está registrado para mais de uma ` +
      `candidatura — há substituição pendente de julgamento no TSE. Confira ` +
      `antes de votar.`;
    topo.append(alerta);
  }

  const divergiu = divergencias(detalhe, candidato.p);
  if (divergiu.length) {
    const p = document.createElement("p");
    p.className = "divergiu";
    p.textContent =
      `Votou diferente da bancada do ${candidato.p} em ` +
      `${divergiu.length} ${divergiu.length === 1 ? "tema" : "temas"} — ` +
      `este percentual é dele, não do partido.`;
    topo.append(p);
  }

  let origem = null;
  if (soPosicaoDoPartido(detalhe)) {
    origem = document.createElement("p");
    origem.className = "origem-partido";
    const n = porPartido[candidato.p] || 0;
    const divididas = detalhe.filter((d) => {
      const b = d.fonte === "5" ? bancadaNaTese(candidato.p, d.tese.id) : null;
      return b && b.coesao < COESAO_FRACA;
    }).length;
    origem.textContent =
      (n > 1
        ? `Posição do partido, não deste candidato — idêntica à de outros ${n - 1} do ${candidato.p}.`
        : `Posição do partido, não deste candidato.`) +
      (divididas
        ? ` Em ${divididas} ${divididas === 1 ? "tema" : "temas"} a bancada estava dividida.`
        : "");
  }

  const det = document.createElement("details");
  det.className = "quebra";
  const concordam = detalhe.filter((d) => d.concorda).length;
  det.innerHTML = `<summary>Concordam em ${concordam} de ${temas} temas respondidos — ver quais</summary>`;
  det.append(quebraPorTese(detalhe, candidato.p, candidato));

  const marcarFixar = (b, on) => {
    b.className = on ? "fixar fixado" : "fixar";
    b.textContent = on ? "✓ Na colinha" : "+ Colinha";
    b.title = on ? "Na sua colinha" : "Colocar na colinha";
    b.setAttribute("aria-label", on ? "Tirar da colinha" : "Colocar na colinha");
    b.setAttribute("aria-pressed", on ? "true" : "false");
  };
  const fixar = document.createElement("button");
  fixar.dataset.id = candidato.id;
  marcarFixar(fixar, estaNaColinha(estado.cargoAtivo, candidato.id));
  fixar.onclick = () => {
    // Cargo cheio: quem entrou por último fica, o mais antigo sai. Antes de
    // redesenhar nada, desmarca só o botão de quem perdeu o lugar.
    const saiu = alternarEscolha(estado.cargoAtivo, candidato.id);
    const agora = estaNaColinha(estado.cargoAtivo, candidato.id);
    if (saiu) {
      const b = document.querySelector(`.fixar[data-id="${saiu}"]`);
      if (b) marcarFixar(b, false);
    }
    marcarFixar(fixar, agora);
    salvarNaURL();
    atualizarBotaoColinha();
    anunciar(
      agora
        ? `${candidato.n}, número ${candidato.num}, na colinha.`
        : `${candidato.n} removido da colinha.`
    );
    // Trocar só o botão, e não a tela inteira: redesenhar fechava os "por quê"
    // que o eleitor tinha aberto e reordenava a lista sob o dedo dele.
  };

  // Convite à assessoria. Todo card tem: é assim que o questionário chega a
  // quem não tem e-mail no TSE — o eleitor manda o link, a assessoria vê o
  // percentual herdado do partido e responde para ter o próprio.
  const responder = document.createElement("a");
  responder.className = "responder";
  responder.href = `responder.html#${encodeURIComponent(candidato.id)}`;
  responder.textContent = detalhe.some((d) => d.fonte === "1")
    ? "Respostas do candidato · atualizar"
    : "É da campanha? Responda pelo candidato";
  const estrela = document.createElement("button");
  const marcarEstrela = (on) => {
    estrela.className = on ? "estrela marcada" : "estrela";
    estrela.textContent = on ? "★" : "☆";
    estrela.setAttribute("aria-pressed", on ? "true" : "false");
    estrela.setAttribute("aria-label", on ? "Tirar dos favoritos" : "Salvar nos favoritos");
    estrela.title = on ? "Favorito" : "Salvar nos favoritos";
  };
  marcarEstrela(estado.favoritos.has(candidato.id));
  estrela.onclick = () => {
    alternarFavorito(candidato.id);
    marcarEstrela(estado.favoritos.has(candidato.id));
    anunciar(estado.favoritos.has(candidato.id)
      ? `${candidato.n} salvo nos favoritos.` : `${candidato.n} tirado dos favoritos.`);
    // Com o filtro ligado, tirar a estrela some com o card — mas só no
    // próximo redesenho, para não puxar a lista debaixo do dedo.
  };
  acoes.append(fixar, estrela);

  li.append(topo, ...(origem ? [origem] : []), ...(score === null ? [] : [det]), responder);
  return li;
}

function quebraPorTese(detalhe, sigla, candidato = {}) {
  const divergiu = new Set(divergencias(detalhe, sigla).map((d) => d.tese.id));
  // src "2" é voto próprio em qualquer casa. Quem é senador e não deputado
  // (governador vindo do Senado, por exemplo) votou no Senado — e a tese só
  // tem voto dele se lista uma votação do Senado.
  const votouNoSenado = (tese) =>
    candidato.sen && !candidato.dep && (tese.fontes || []).some((f) => f.casa === "senado");
  const ul = document.createElement("ul");
  ul.className = "temas";
  for (const d of detalhe) {
    const li = document.createElement("li");
    if (d.posicao === null) {
      li.className = "tema sem-dado";
      li.innerHTML = `<span class="marca" aria-hidden="true">—</span><span>${d.tese.texto}
        <em>Não há registro de posição.</em></span>`;
    } else {
      const fonte = d.fonte === "2" && votouNoSenado(d.tese)
        ? { rotulo: "Como votou no Senado", inferida: false }
        : FONTES[d.fonte] || { rotulo: "", inferida: true };
      const rompeu = divergiu.has(d.tese.id);
      // Quanto da bancada de fato votou assim. "O PP é contra" e "o PP é
      // contra por 55% a 45%" não podem sair na tela com o mesmo peso.
      const b = d.fonte === "5" ? bancadaNaTese(sigla, d.tese.id) : null;
      const fraca = b && b.coesao < COESAO_FRACA;
      const detalheBancada = b
        ? fraca
          ? ` — <b>bancada dividida</b>, ${Math.round(b.coesao * 100)}% votaram assim`
          : ` — ${Math.round(b.coesao * 100)}% da bancada votou assim`
        : "";
      li.className = d.concorda ? "tema ok" : "tema nao";
      li.innerHTML =
        `<span class="marca" aria-hidden="true">${d.concorda ? "✓" : "✕"}</span>` +
        `<span><span class="sr">${d.concorda ? "Concorda com você:" : "Discorda de você:"}</span> ` +
        `${d.tese.texto}` +
        `<em class="${fonte.inferida ? "inferida" : ""}${rompeu ? " rompeu" : ""}` +
        `${fraca ? " fraca" : ""}">` +
        `${b ? `Posição da bancada do ${sigla}` : fonte.rotulo}` +
        `${rompeu ? ` — <b>diferente da bancada do ${sigla}</b>` : ""}${detalheBancada}` +
        ((() => {
          const casa = d.fonte === "2" && votouNoSenado(d.tese) ? "senado" : "camara";
          const f = (d.tese.fontes || []).find((x) => x.casa === casa) || d.tese.fontes?.[0];
          return f ? ` · <a href="${f.url}" target="_blank" rel="noopener">ver a proposta na Câmara</a>` : "";
        })()) +
        `</em></span>`;
    }
    ul.append(li);
  }
  return ul;
}

// 42, não 45: com poucas teses o eleitor satura em ±1 com facilidade, e um
// raio maior joga o marcador para cima da borda do quadro.
const RAIO_MAPA = 42;
const noMapa = (p) => ({ x: 50 + p.economico * RAIO_MAPA, y: 50 - p.social * RAIO_MAPA });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Seis temas para o radar, curadoria sobre os ids de theses.toml.
const TEMAS = {
  "Segurança e justiça": ["aumentar-penas-furto-roubo", "castracao-quimica-pedofilia", "flexibilizar-acesso-armas", "pena-dura-arma-uso-proibido", "progressao-80-por-cento-hediondos", "medida-protetiva-mesmo-com-consentimento"],
  "Economia e impostos": ["imposto-grandes-fortunas", "tributar-aplicacoes-financeiras", "limite-gastos-receita-extra", "pre-sal-fora-do-teto-saude-educacao", "recursos-esquecidos-tesouro", "crime-preco-abusivo", "correios-sem-licitacao", "desconto-antecipacao-bancaria-inss"],
  "Trabalho e social": ["compra-alimentos-agricultura-familiar", "cancelamento-online-contribuicao-sindical", "desoneracao-com-contrapartida-de-emprego", "multa-cota-jovem-aprendiz", "primeiro-emprego-encargos-reduzidos", "vale-refeicao-entregador-aplicativo"],
  "Meio ambiente e terra": ["marco-temporal", "anular-demarcacoes-indigenas", "agro-fora-do-mercado-de-carbono", "licenciamento-ambiental-simplificado", "reduzir-areas-de-protecao", "silvicultura-atividade-poluidora"],
  "Costumes e direitos": ["aborto-legal-meninas", "regular-redes-sociais", "regras-publicidade-jogos-criancas", "candidatura-coletiva"],
  "Instituições": ["anistia-8-janeiro", "anistia-desaparecimento-forcado", "camara-susta-acao-penal", "foro-privilegiado-presidentes-partido"],
};

/** "progressista de mercado", "conservador estatista", "de centro"… A
 *  posição do próprio eleitor nos dois eixos, em palavras. Não fala de
 *  candidato nenhum. */
function nomeDaPosicao(p) {
  const eco = p.economico > 0.15 ? "de mercado" : p.economico < -0.15 ? "estatista" : "";
  const soc = p.social > 0.15 ? "conservador" : p.social < -0.15 ? "progressista" : "";
  if (!eco && !soc) return "de centro";
  if (!soc) return eco === "estatista" ? "estatista de centro" : "de centro, pró-mercado";
  if (!eco) return `${soc} de centro`;
  return `${soc} ${eco}`;
}

/** Se nenhuma bancada está no quadrante do eleitor, devolve as 2 siglas mais
 *  próximas no mapa; senão null. Eixo perto de zero conta como "sem quadrante". */
function quadranteVazio(p) {
  if (Math.abs(p.economico) < 0.15 && Math.abs(p.social) < 0.15) return null;
  const pts = Object.entries(estado.partidos)
    .map(([sigla, bancada]) => ({ sigla, p: pontoDePosicoes((t) => bancada[t.id]?.pos) }))
    .filter((x) => x.p);
  if (!pts.length) return null;
  const mesmo = (a, b) => Math.sign(a.economico) === Math.sign(b.economico) && Math.sign(a.social) === Math.sign(b.social);
  if (pts.some((x) => mesmo(x.p, p))) return null;
  const d = (x) => Math.hypot(x.p.economico - p.economico, x.p.social - p.social);
  return pts.sort((a, b) => d(a) - d(b)).slice(0, 2).map((x) => x.sigla);
}

/** Radar (smartspider): concordância entre o eleitor e cada candidato por
 *  tema, 0–100%, com os mesmos detalhes que o percentual geral usa. */
function desenharRadar(candidatos) {
  const temas = Object.keys(TEMAS);
  const n = temas.length;
  const teses = tesesDoEleitor();
  const porTema = (detalhe) => temas.map((t) => {
    const ids = new Set(TEMAS[t]);
    const ds = detalhe.filter((d) => ids.has(d.tese.id) && d.posicao !== null);
    return ds.length ? ds.filter((d) => d.concorda).length / ds.length : null;
  });
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [50 + Math.cos(ang(i)) * r * 40, 50 + Math.sin(ang(i)) * r * 40];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-28 -6 156 112");
  svg.setAttribute("class", "radar");
  svg.setAttribute("role", "img");
  let html = "";
  for (const r of [0.25, 0.5, 0.75, 1]) html += `<polygon points="${temas.map((_, i) => pt(i, r).join(",")).join(" ")}" class="r-anel"/>`;
  temas.forEach((t, i) => {
    const [x, y] = pt(i, 1); const [lx, ly] = pt(i, 1.22);
    html += `<line x1="50" y1="50" x2="${x}" y2="${y}" class="r-eixo"/>` +
      `<text x="${lx}" y="${ly}" class="r-rot" text-anchor="${lx < 45 ? "end" : lx > 55 ? "start" : "middle"}">${esc(t)}</text>`;
  });
  const series = [];
  candidatos.forEach((c, k) => {
    const r = match(estado.respostas, estado.teses, c.candidato);
    if (!r) return;
    const vals = porTema(r.detalhe);
    const pts = vals.map((v, i) => pt(i, v ?? 0));
    html += `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" class="r-serie" style="stroke:${cor(c.candidato.p)};fill:${cor(c.candidato.p)}"/>` +
      pts.map((p, i) => vals[i] === null ? "" : `<circle cx="${p[0]}" cy="${p[1]}" r="1.4" style="fill:${cor(c.candidato.p)}"><title>${esc(c.candidato.n)} · ${esc(temas[i])}: ${Math.round(vals[i] * 100)}%</title></circle>`).join("");
    series.push({ nome: c.candidato.n, sigla: c.candidato.p, vals });
  });
  svg.innerHTML = html;
  svg.setAttribute("aria-label", series.map((s) => `${s.nome}: ` + s.vals.map((v, i) => `${temas[i]} ${v === null ? "sem dado" : Math.round(v * 100) + "%"}`).join(", ")).join(". "));
  return svg;
}

/** Painel do resultado: abas Mapa / Radar. O radar compara o eleitor com até
 *  3 candidatos do cargo ativo (os 3 primeiros do ranking, por padrão). */
function painelVisoes() {
  const caixa = document.createElement("div");
  caixa.className = "visoes";
  const abas = document.createElement("div");
  abas.className = "visoes-abas";
  const corpo = document.createElement("div");
  estado.visao = estado.visao || "mapa";
  const render = () => {
    corpo.replaceChildren();
    abas.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === estado.visao; b.className = on ? "filtro ativo" : "filtro"; b.setAttribute("aria-pressed", on); });
    if (estado.visao === "mapa") { corpo.append(desenharBussola()); return; }
    const universo = estado.dados.porCargo[estado.cargoAtivo] || [];
    const rank = ranquear(estado.respostas, estado.teses, universo, SEMENTE);
    if (!rank.length) { corpo.innerHTML = `<p class="aviso">Responda algumas afirmações para ver o radar.</p>`; return; }
    estado.radar = (estado.radar || []).filter((id) => rank.some((r) => r.candidato.id === id));
    if (!estado.radar.length) estado.radar = rank.slice(0, 3).map((r) => r.candidato.id);
    const escolhidos = rank.filter((r) => estado.radar.includes(r.candidato.id));
    corpo.append(desenharRadar(escolhidos));
    const leg = document.createElement("div");
    leg.className = "radar-legenda";
    leg.innerHTML = `<p class="aviso" style="margin:.2rem 0 .6rem">Quanto você e cada candidato concordam por tema, em % das afirmações respondidas. Até 3 de ${rotuloComUF(estado.cargoAtivo)}.</p>`;
    escolhidos.forEach((r) => {
      const b = document.createElement("span"); b.className = "radar-item";
      b.innerHTML = `<i class="seletor-cor" style="background:${cor(r.candidato.p)}"></i>${esc(r.candidato.n)} <small>${pct(r.score)}</small>`;
      leg.append(b);
    });
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", "Trocar candidato no radar");
    sel.innerHTML = `<option value="">Trocar um candidato…</option>` + rank.slice(0, 30).map((r) => `<option value="${esc(r.candidato.id)}"${estado.radar.includes(r.candidato.id) ? " disabled" : ""}>${esc(r.candidato.n)} (${esc(r.candidato.p)}) · ${pct(r.score)}</option>`).join("");
    sel.onchange = () => { if (!sel.value) return; estado.radar = [...estado.radar.slice(-2), sel.value]; render(); };
    leg.append(sel);
    corpo.append(leg);
  };
  for (const [v, rot] of [["mapa", "Mapa"], ["radar", "Radar por tema"]]) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.v = v; b.textContent = rot;
    b.onclick = () => { estado.visao = v; render(); };
    abas.append(b);
  }
  caixa.append(abas, corpo);
  render();
  return caixa;
}

/** Posição de uma bancada ou de um candidato no mapa, pela MESMA conta do
 *  eleitor: as posições viram "respostas" (peso 1) e passam pela bússola.
 *  Nada de novo entra aqui — é a aritmética já publicada na metodologia. */
function pontoDePosicoes(posicaoDaTese) {
  const respostas = {};
  estado.teses.forEach((t, i) => {
    const ch = posicaoDaTese(t, i);
    const valor = { "+": 1, "-": -1, "0": 0 }[ch];
    if (valor !== undefined) respostas[t.id] = { valor, importante: false };
  });
  const p = bussola(respostas, estado.teses);
  return p.pesos.economico && p.pesos.social ? p : null;
}

function desenharBussola({ hero = false } = {}) {
  const p = bussola(estado.respostas, tesesDoEleitor());
  const semLastro = !p.pesos.economico && !p.pesos.social;
  const voce = noMapa(p);

  const partidosTodos = Object.entries(estado.partidos)
    .map(([sigla, bancada]) => ({ sigla, p: pontoDePosicoes((t) => bancada[t.id]?.pos) }))
    .filter((x) => x.p);
  const presTodos = (estado.dados.porCargo.presidente || [])
    .map((c) => ({ nome: c.n, sigla: c.p, foto: c.foto, id: c.id, p: pontoDePosicoes((t, i) => c.pos[i]),
      // No resultado, o percentual vai junto do nome: proximidade no mapa e
      // concordância tema a tema são medidas diferentes, e as duas ficam à vista.
      pct: hero ? null : (match(estado.respostas, estado.teses, c) || {}).score ?? null }))
    .filter((x) => x.p);
  // Hero: só as 6 maiores bancadas (pela maior contagem de votos registrada).
  const tamanho = (sigla) => Math.max(0, ...Object.values(estado.partidos[sigla] || {}).map((v) => v.n || 0));
  const maiores = new Set([...partidosTodos].sort((a, b) => tamanho(b.sigla) - tamanho(a.sigla)).slice(0, 6).map((x) => x.sigla));
  if (hero) { for (let i = partidosTodos.length - 1; i >= 0; i--) if (!maiores.has(partidosTodos[i].sigla)) partidosTodos.splice(i, 1); }
  if (estado.mapa.partidosOff) { partidosTodos.forEach((x) => estado.mapa.ocultos.add("p:" + x.sigla)); estado.mapa.partidosOff = false; }
  const oc = estado.mapa.ocultos;
  const partidos = hero ? partidosTodos : partidosTodos.filter((x) => !oc.has("p:" + x.sigla));
  const presidenciaveis = hero ? presTodos : presTodos.filter((x) => !oc.has("c:" + x.nome));

  // Partidos com posição idêntica caem no mesmo ponto exato e viram um só.
  // Quem coincide é aberto num anel pequeno em volta do lugar original.
  const espalhar = (itens) => {
    const grupos = new Map();
    for (const it of itens) {
      const k = `${it.x.toFixed(1)},${it.y.toFixed(1)}`;
      (grupos.get(k) || grupos.set(k, []).get(k)).push(it);
    }
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      g.forEach((it, i) => {
        const a = (i / g.length) * 2 * Math.PI;
        const raio = Math.max(2.4, ...g.map((x) => x.r)) + 0.6;
        it.x += Math.cos(a) * raio;
        it.y += Math.sin(a) * raio;
      });
    }
  };

  // Rótulo não pode cair em cima de outro: tenta à direita do ponto, depois à
  // esquerda, depois subindo e descendo em degraus. Greedy, e chega para ~30
  // siglas. Quem não acha lugar fica só com o ponto — e o nome no toque.
  const ocupados = [];
  const lugar = (x, y, larg, off = 2.4) => {
    for (const dy of [0, -3.4, 3.4, -6.8, 6.8]) {
      for (const lado of [1, -1]) {
        const cx = Math.min(Math.max(lado > 0 ? x + off : x - off - larg, 3), 97 - larg);
        const cy = Math.min(Math.max(y + dy + 1, 7), 95);
        const c = cx + larg / 2;
        const livre = !ocupados.some((o) =>
          Math.abs(o.c - c) < (o.w + larg) / 2 + 1 && Math.abs(o.y - cy) < 3.2);
        // e não pode cobrir o próprio ponto
        if (livre && (cx > x + 1.5 || cx + larg < x - 1.5 || Math.abs(cy - 1 - y) > 3)) {
          ocupados.push({ c, y: cy, w: larg });
          return { x: cx, y: cy };
        }
      }
    }
    return null;
  };

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", hero ? "bussola bussola-hero" : "bussola");
  svg.setAttribute("role", hero ? "img" : "group");
  svg.setAttribute("aria-label", (semLastro
    ? "Mapa de posições, ainda sem respostas suficientes para posicionar você."
    : `Sua posição: eixo econômico ${p.economico.toFixed(2)} de -1 (estatista) a ` +
      `+1 (mercado); eixo social ${p.social.toFixed(2)} de -1 (progressista) a ` +
      `+1 (conservador).`) +
    ` O mapa também mostra ${partidos.length} bancadas de partido e ` +
    `${presidenciaveis.length} candidatos a presidente.`);

  // Presidenciáveis escolhem lugar primeiro (são poucos e importam mais);
  // siglas se encaixam no que sobrou. Bolinhas todas antes, textos todos
  // depois: rótulo nunca fica debaixo de um ponto.
  const itens = [
    ...presidenciaveis.map((c) => { const texto = c.pct == null ? c.nome : `${c.nome} · ${Math.round(c.pct * 100)}%`; return { ...c, ...noMapa(c.p), cls: "pres", r: hero ? 4.2 : 3.4,
      texto, larg: texto.length * 1.8, titulo: `${c.nome} (${c.sigla}), candidato a presidente${c.pct == null ? "" : `, ${Math.round(c.pct * 100)}% de concordância com você`}` }; }),
    ...partidos.map((c) => ({ ...c, ...noMapa(c.p), cls: "partido", r: 2.2,
      texto: c.sigla, larg: c.sigla.length * 1.6, titulo: `${c.sigla}: bancada na Câmara` })),
  ];
  espalhar(itens);
  // No hero o mapa é ilustração: siglas de partido saem (30 rótulos são
  // ruído ali), ficam só os presidenciáveis e os eixos.
  // Selo de partido se rotula sozinho (a sigla está dentro dele); só o
  // presidenciável ganha o nome ao lado da foto.
  itens.forEach((it) => { it.l = it.cls === "pres" ? lugar(it.x, it.y, it.larg, it.r + 0.8) : null; });
  // Marcadores à la Kieskompas: foto do candidato num círculo, selo com a
  // sigla na cor do partido. Nada de ponto anônimo.
  const pontosSVG = itens.map((it, i) => {
    const attrs = `class="b-item" data-nome="${esc(it.texto)}"${hero ? "" : ` tabindex="0" role="button" aria-label="${esc(it.titulo)}"`} style="--i:${i}"`;
    if (it.cls === "pres") {
      const clip = `clip-${hero ? "h" : "r"}-${i}`;
      return `<g ${attrs}><title>${esc(it.titulo)}</title>` +
        `<clipPath id="${clip}"><circle cx="${it.x}" cy="${it.y}" r="${it.r - 0.4}"/></clipPath>` +
        `<circle cx="${it.x}" cy="${it.y}" r="${it.r}" class="b-pres" style="fill:${cor(it.sigla)}"/>` +
        (it.foto ? `<image href="${esc(it.foto)}" x="${it.x - it.r}" y="${it.y - it.r}" width="${it.r * 2}" height="${it.r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>` : "") +
        `</g>`;
    }
    // Com logo (manifesto da Câmara): cartão branco com o logo dentro. Sem:
    // selo na cor do partido com a sigla.
    const logo = (estado.logos || {})[it.sigla];
    if (logo) {
      const lw = hero ? 7.5 : 6, lh = hero ? 4.6 : 3.7;
      return `<g ${attrs}><title>${esc(it.titulo)}</title>` +
        `<rect x="${it.x - lw / 2}" y="${it.y - lh / 2}" width="${lw}" height="${lh}" rx=".7" class="b-logo-caixa"/>` +
        `<image href="${esc(logo)}" x="${it.x - lw / 2 + 0.4}" y="${it.y - lh / 2 + 0.4}" width="${lw - 0.8}" height="${lh - 0.8}" preserveAspectRatio="xMidYMid meet"/></g>`;
    }
    const w = it.sigla.length * (hero ? 1.55 : 1.3) + 1.4, h = hero ? 3.2 : 2.7;
    return `<g ${attrs}><title>${esc(it.titulo)}</title>` +
      `<rect x="${it.x - w / 2}" y="${it.y - h / 2}" width="${w}" height="${h}" rx=".7" class="b-selo" style="fill:${cor(it.sigla)}"/>` +
      `<text x="${it.x}" y="${it.y + (hero ? 0.85 : 0.7)}" class="b-selo-txt" style="fill:${tinta(it.sigla)};font-size:${hero ? 2.1 : 1.8}px">${esc(it.sigla)}</text></g>`;
  }).join("");
  const rotulosSVG = itens.filter((it) => it.l).map((it, i) =>
    `<text x="${it.l.x}" y="${it.l.y}" class="b-nome" style="--i:${i + 8}">${esc(it.texto)}</text>`).join("");

  svg.innerHTML = `
    <rect x="2" y="2" width="96" height="96" rx="4" class="b-fundo"/>` +
`
    <line x1="50" y1="4" x2="50" y2="96" class="b-eixo"/>
    <line x1="4" y1="50" x2="96" y2="50" class="b-eixo"/>
    <text x="50" y="6.5" class="b-rot">conservador</text>
    <text x="50" y="97" class="b-rot">progressista</text>
    <text x="4"  y="48" class="b-rot b-esq">estatista</text>
    <text x="96" y="48" class="b-rot b-dir">mercado</text>` +
    pontosSVG + rotulosSVG +
    // Sem nenhuma resposta com peso de eixo, desenhar um ponto no centro
    // declararia centrista quem não disse nada. O eleitor é desenhado por
    // último para ficar por cima de tudo.
    (hero ? "" : semLastro
      ? `<text x="50" y="72" class="b-rot">responda para se posicionar</text>`
      : `<g><title>Você</title><circle cx="${voce.x}" cy="${voce.y}" r="4.5" class="b-voce"/>` +
        `<text x="${voce.x}" y="${voce.y - 6}" class="b-voce-rot">você</text></g>`);

  // Toque num ponto mostra o nome em destaque — é o que salva quem ficou sem
  // rótulo no aglomerado, e serve a leitor de tela via <title>.
  const destacar = (ev) => {
    const g = ev.target.closest(".b-item");
    svg.querySelector(".b-destaque")?.remove();
    if (!g) return;
    anunciar(g.getAttribute("aria-label") || g.dataset.nome);
    const c = g.querySelector("circle");
    const x = +c.getAttribute("cx"), y = +c.getAttribute("cy");
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("class", "b-destaque");
    t.setAttribute("x", Math.min(Math.max(x, 12), 88));
    t.setAttribute("y", y < 12 ? y + 6.5 : y - 4);
    t.textContent = g.dataset.nome;
    svg.append(t);
  };
  svg.addEventListener("click", destacar);
  if (hero) {
    // Ilustração sem rótulos: o nome aparece ao passar o mouse.
    svg.addEventListener("pointerover", destacar);
    svg.addEventListener("pointerout", (ev) => { if (!ev.relatedTarget?.closest?.(".b-item")) svg.querySelector(".b-destaque")?.remove(); });
  }
  svg.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); destacar(ev); }
  });

  const caixa = document.createElement("div");
  caixa.className = "mapa";
  if (hero) { caixa.append(svg); return caixa; }
  // Legenda seletora: um checkbox por presidenciável e por partido. Quem
  // desmarca, despolui o próprio mapa; o estado vive na sessão.
  const seletor = document.createElement("div");
  seletor.className = "seletor";
  const grupo = (titulo, itens, chave, rotulo) => {
    const det = document.createElement("details");
    det.className = "seletor-grupo";
    det.open = !matchMedia("(max-width: 48rem)").matches;
    const ativos = itens.filter((x) => !oc.has(chave(x))).length;
    det.innerHTML = `<summary>${titulo} <span class="seletor-n">${ativos}/${itens.length}</span></summary>`;
    const acoes = document.createElement("p");
    acoes.className = "seletor-acoes";
    const todos = document.createElement("button"); todos.type = "button"; todos.className = "link"; todos.textContent = "todos";
    const nenhum = document.createElement("button"); nenhum.type = "button"; nenhum.className = "link"; nenhum.textContent = "nenhum";
    todos.onclick = () => { itens.forEach((x) => oc.delete(chave(x))); caixa.replaceWith(desenharBussola()); };
    nenhum.onclick = () => { itens.forEach((x) => oc.add(chave(x))); caixa.replaceWith(desenharBussola()); };
    acoes.append(todos, " · ", nenhum);
    const ul = document.createElement("ul");
    for (const x of itens) {
      const li = document.createElement("li");
      const lab = document.createElement("label");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !oc.has(chave(x));
      cb.onchange = () => { cb.checked ? oc.delete(chave(x)) : oc.add(chave(x)); caixa.replaceWith(desenharBussola()); };
      const dot = document.createElement("i"); dot.className = "seletor-cor"; dot.style.background = cor(x.sigla);
      lab.append(cb, dot, rotulo(x));
      li.append(lab); ul.append(li);
    }
    det.append(acoes, ul);
    return det;
  };
  seletor.append(
    grupo("Presidenciáveis", presTodos, (x) => "c:" + x.nome, (x) => `${x.nome} (${x.sigla})`),
    grupo("Partidos", [...partidosTodos].sort((a, b) => a.sigla.localeCompare(b.sigla)), (x) => "p:" + x.sigla, (x) => x.sigla),
  );
  const painel = document.createElement("div");
  painel.className = "mapa-painel";
  painel.append(svg, seletor);
  caixa.append(painel);

  const legenda = document.createElement("p");
  legenda.className = "b-legenda";
  const dist = (q) => Math.hypot(q.economico - p.economico, q.social - p.social);
  const perto = semLastro ? [] : [...partidos].sort((a, b) => dist(a.p) - dist(b.p)).slice(0, 3);
  const pertoPres = semLastro ? [] : [...presidenciaveis].sort((a, b) => dist(a.p) - dist(b.p)).slice(0, 2);
  legenda.innerHTML =
    `Cada sigla é a posição média da bancada do partido na Câmara; os pontos maiores são ` +
    `os candidatos a presidente, pelas posições registradas no site. Toque num ponto para ver o nome. ` +
    (perto.length
      ? `<b>Mais perto de você no mapa:</b> ${perto.map((x) => esc(x.sigla)).join(", ")}` +
        (pertoPres.length ? ` e, entre os presidenciáveis, ${pertoPres.map((x) => esc(x.nome)).join(" e ")}.` : ".") +
        ` Proximidade no mapa e percentual são medidas diferentes: o mapa pesa cada afirmação pelos dois eixos; o percentual conta concordância em todas as afirmações, inclusive as sem cor ideológica. Por isso alguém pode estar perto no mapa e ter percentual menor — os dois estão certos.`
      : "");
  caixa.append(legenda);
  return caixa;
}

/** O botão diz quantos já estão na colinha; com zero, fica secundário. */
function atualizarBotaoColinha(raiz = document) {
  const b = raiz.getElementById ? raiz.getElementById("ver-colinha") : raiz.querySelector("#ver-colinha");
  if (!b) return;
  const n = CARGOS.reduce((t, [c]) => t + idsEscolhidos(c).length, 0);
  b.textContent = n ? `Ver minha colinha (${n})` : "Ver minha colinha";
  b.classList.toggle("secundario", !n);
  b.classList.toggle("primario", n > 0);
  // Barra fixa do celular e ✓ nas abas: "N de M cargos" sobre o que carregou.
  const cargos = Object.keys(estado.dados.porCargo);
  const comEscolha = cargos.filter((c) => idsEscolhidos(c).length).length;
  const barra = raiz.getElementById ? raiz.getElementById("barra-colinha") : raiz.querySelector("#barra-colinha");
  if (barra) {
    barra.hidden = !cargos.length;
    barra.textContent = `Colinha: ${comEscolha} de ${cargos.length} cargos · Ver`;
  }
  raiz.querySelectorAll(".aba[data-cargo]").forEach((a) => { a.textContent = rotuloAba(a.dataset.cargo); });
}

function telaColinha() {
  const node = tpl("tpl-colinha");
  salvarNaURL();
  // O voltar do navegador tem de sair da colinha: a URL não muda entre
  // resultado e colinha, então empurra uma entrada no histórico.
  if (!history.state?.colinha) history.pushState({ colinha: true }, "", location.href);
  node.getElementById("voltar-topo").onclick = (ev) => { ev.preventDefault(); history.back(); };

  // Escolha que aponta para um cargo que não carregou não pode sumir em
  // silêncio: o eleitor levaria para a urna uma colinha com uma linha a menos
  // sem nunca saber.
  const escolhidos = [];
  const perdidos = [];
  const orfas = [];
  const incompletos = [];
  for (const [cargo] of CARGOS) {
    const ids = idsEscolhidos(cargo);
    if (ids.length && ids.length < vagas(cargo)) incompletos.push(cargo);
    ids.forEach((id, k) => {
      const c = (estado.dados.porCargo[cargo] || []).find((x) => x.id === id);
      // A urna pede "Senador 1º voto" e "Senador 2º voto": a colinha usa o
      // mesmo rótulo que o eleitor vai ler na tela.
      const rotulo = vagas(cargo) > 1
        ? `${rotuloComUF(cargo)} · ${k + 1}º voto` : rotuloComUF(cargo);
      if (c) escolhidos.push({ cargo, rotulo, candidato: c });
      else if (estado.dados.falhas[cargo]) perdidos.push(cargo);
      else orfas.push({ cargo, id });
    });
  }

  const cartao = node.getElementById("cartao");
  const compartilharBtn = node.getElementById("compartilhar");

  if (!escolhidos.length) {
    cartao.innerHTML =
      `<p class="vazio">Você ainda não escolheu ninguém. Volte ao resultado e
       toque em <b>“+ Colinha”</b> nos candidatos que quiser levar.</p>`;
    compartilharBtn.disabled = true;
  } else {
    escolhidos.forEach(({ rotulo, candidato }) => {
      const linha = document.createElement("div");
      linha.className = "linha-colinha";

      const av = document.createElement("div");
      av.className = "avatar";
      av.style.background = cor(candidato.p);
      av.style.color = tinta(candidato.p);
      av.textContent = iniciais(candidato.n);
      if (candidato.foto) {
        const img = new Image();
        img.src = candidato.foto;
        img.alt = "";
        img.onload = () => av.replaceChildren(img);
      }

      const txt = document.createElement("div");
      txt.className = "txt";
      txt.innerHTML =
        `<span class="cargo">${rotulo}</span>` +
        `<span class="num"><span class="rot">digite</span>${candidato.num}</span>` +
        `<span class="nome">${candidato.n}</span>`;

      linha.append(av, txt, selo(candidato.p, candidato.pn, 34));
      cartao.append(linha);
    });

    // A colinha existe para o eleitor digitar o número. Se o número está em
    // disputa, esse é o aviso mais importante da tela inteira.
    const ambiguos = escolhidos.filter((e) => e.candidato.numDisputado);
    if (ambiguos.length) {
      const alerta = document.createElement("p");
      alerta.className = "num-disputado colinha-alerta";
      alerta.textContent =
        `Atenção: ${ambiguos.map((e) => `o número ${e.candidato.num}`).join(" e ")} ` +
        `${ambiguos.length > 1 ? "estão registrados" : "está registrado"} para mais de ` +
        `uma candidatura — há substituição pendente no TSE. Confira no site do TSE ` +
        `antes de votar.`;
      cartao.after(alerta);
    }

    compartilharBtn.onclick = async (ev) => {
      const btn = ev.currentTarget;
      const rotulo = btn.textContent;
      btn.disabled = true;
      // Gerar o PNG pode levar segundos esperando as fotos; sem sinal o
      // eleitor toca de novo achando que não funcionou.
      btn.textContent = "Gerando imagem…";
      try {
        medir("colinha_gerada", { cargos: escolhidos.length });
        await compartilhar(await desenharColinha(escolhidos, estado.uf));
      } catch (e) {
        anunciar("Não consegui gerar a imagem.");
        alertaInline(btn, `Não consegui gerar a imagem (${e.message}).`);
      } finally {
        btn.disabled = false;
        btn.textContent = rotulo;
      }
    };
  }

  // Cargo carregado e ainda sem escolha entra como linha vazia, com atalho
  // para a aba certa: a colinha diz o que falta, não só o que já tem.
  for (const [cargo] of CARGOS) {
    if (!estado.dados.porCargo[cargo] || idsEscolhidos(cargo).length) continue;
    const linha = document.createElement("div");
    linha.className = "linha-colinha vazia";
    const txt = document.createElement("div");
    txt.className = "txt";
    txt.innerHTML = `<span class="cargo">${rotuloComUF(cargo)}</span><span class="nome">ainda não escolhido</span>`;
    const escolher = document.createElement("button");
    escolher.className = "secundario";
    escolher.textContent = "Escolher";
    escolher.setAttribute("aria-label", `Escolher ${rotuloComUF(cargo)}`);
    escolher.onclick = () => {
      estado.cargoAtivo = cargo;
      estado.busca = "";
      estado.limite = POR_PAGINA;
      telaResultado();
    };
    linha.append(txt, escolher);
    cartao.append(linha);
  }

  const aviso = node.getElementById("colinha-perdidos");
  if (perdidos.length || orfas.length) {
    aviso.hidden = false;
    // Duas causas diferentes: mandar "tentar de novo" numa escolha órfã manda
    // o eleitor repetir uma ação que nunca vai resolver.
    aviso.textContent = [
      perdidos.length
        ? `Não consegui carregar ${perdidos.map(rotuloComUF).join(", ")} agora. ` +
          `Volte ao resultado e tente de novo antes de usar esta colinha.`
        : "",
      orfas.length
        ? `Uma escolha para ${orfas.map((o) => rotuloCargo(o.cargo)).join(", ")} veio de um link de ` +
          `outro estado ou de uma versão anterior dos dados, e foi descartada.`
        : "",
    ].filter(Boolean).join(" ");
  }
  orfas.forEach(({ cargo, id }) =>
    gravarEscolha(cargo, idsEscolhidos(cargo).filter((x) => x !== id)));

  if (incompletos.length && escolhidos.length) {
    const p = document.createElement("p");
    p.className = "aviso dica-vagas";
    p.innerHTML = `Para o Senado você tem <b>dois votos</b> — só um está na colinha.`;
    cartao.after(p);
  }

  // Papel na cabine: copiar os números como texto é o caminho mais curto.
  const copiar = node.getElementById("copiar-numeros");
  copiar.disabled = !escolhidos.length;
  copiar.onclick = async () => {
    const texto = escolhidos.map((e) => `${e.rotulo}: ${e.candidato.num} (${e.candidato.n})`).join("\n");
    try { await navigator.clipboard.writeText(texto); copiar.textContent = "Copiado"; }
    catch { copiar.textContent = "Não deu para copiar"; }
    setTimeout(() => { copiar.textContent = "Copiar números"; }, 2000);
  };
  node.getElementById("voltar-resultado").onclick = () => history.back();
  mostrar(node);
}

function alertaInline(depois, texto) {
  const p = document.createElement("p");
  p.className = "num-disputado";
  p.textContent = texto;
  depois.after(p);
}

// -------------------------------------------------------------------- start

// sessionStorage, não URL: a marca "isto é meu" não pode viajar no link.
const MEU = "colinha:meu";
const ehMeu = () => { try { return sessionStorage.getItem(MEU) === "1"; } catch { return true; } };
const marcarMeu = () => { try { sessionStorage.setItem(MEU, "1"); } catch { /* sem storage: tudo é "meu" */ } };

function telaChegada() {
  const node = tpl("tpl-chegada");
  const topo = ranquear(estado.respostas, estado.teses,
    estado.dados.porCargo.presidente || [])[0];
  if (topo) {
    node.getElementById("chegada-topo").textContent =
      `Este resultado deu ${pct(topo.score)} com ${topo.candidato.n} para presidente.`;
  }
  node.getElementById("chegada-meu").onclick = () => {
    // Mesma UF já vem do link; só as respostas são zeradas. O hash do amigo
    // sai da URL: recarregar não pode devolver o resultado dele como seu.
    const uf = estado.uf, modo = estado.modo;
    zerarSessao();
    estado.uf = uf;
    estado.modo = modo;
    history.replaceState(null, "", location.pathname + "#/comecar");
    carregarCandidatos().then(() => {
      if (Object.keys(estado.dados.porCargo).length) return telaQuiz();
      const topo = document.getElementById("chegada-topo");
      if (!topo) return;
      topo.textContent = "Não consegui carregar os candidatos. Verifique sua conexão e tente de novo.";
      const tentar = document.createElement("button");
      tentar.className = "secundario";
      tentar.textContent = "Tentar de novo";
      tentar.onclick = () => document.getElementById("chegada-meu")?.click();
      topo.append(document.createElement("br"), tentar);
    });
  };
  node.getElementById("chegada-ver").onclick = () => { marcarMeu(); telaResultado(); };
  mostrar(node);
}

/** WhatsApp no celular, Web Share onde houver, clipboard no resto. */
async function mandar(texto, url) {
  if (navigator.share) {
    try { await navigator.share({ text: texto, url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto + " " + url)}`, "_blank", "noopener");
}

function telaLanding() {
  // Voltar do navegador ou o logo caíam aqui e apagavam 20 respostas sem
  // aviso. Com quiz vivo, a landing oferece continuar em vez de zerar.
  const viva = estado.uf && respondidas() > 0 && estado.indice < estado.teses.length;
  if (!viva) zerarSessao();
  const node = tpl("tpl-landing");
  if (viva) {
    const b = document.createElement("a");
    b.className = "primario cta";
    b.href = "#/";
    b.textContent = `Continuar de onde parei (${respondidas()} de ${tesesDoEleitor().length})`;
    b.onclick = (ev) => { ev.preventDefault(); salvarNaURL(); telaQuiz(); };
    node.querySelector(".hero .ctas").prepend(b);
  }
  // Números reais, do build — uma landing eleitoral convence com fato, não
  // com adjetivo. Se meta.json não veio, o travessão fica.
  if (estado.meta) {
    node.getElementById("fato-candidatos").textContent =
      estado.meta.candidatos.toLocaleString("pt-BR");
    node.getElementById("fato-teses").textContent = estado.meta.teses;
  }
  // O mapa das bancadas é a imagem do hero: dado real, sem ilustração. Os
  // presidenciáveis entram quando o shard nacional chega (é pequeno).
  const alvo = node.getElementById("hero-mapa");
  alvo.append(desenharBussola({ hero: true }));
  mostrar(node);
  carregarJSON("data/presidente-BR.json").then((lista) => {
    if (!document.getElementById("hero-mapa")) return;
    estado.dados = { ...estado.dados, porCargo: { ...estado.dados.porCargo, presidente: lista } };
    document.getElementById("hero-mapa").replaceChildren(desenharBussola({ hero: true }));
  }).catch(() => {});
}

async function rotear() {
  // "#/" é a landing: quem chega pelo link raiz precisa entender o que é
  // isto antes de ser perguntado em que estado vota. "#/comecar" é a tela
  // de estado, para onde o CTA aponta e para onde o logo volta.
  if (!location.hash || location.hash === "#/" || location.hash === "#") {
    return telaLanding();
  }
  if (location.hash === "#/comecar") {
    return telaInicio();
  }
  if (location.hash === "#/rapido") {
    return telaInicio("", "rapido");
  }
  if (location.hash === "#/colinha") {
    return telaInicio("", "colinha");
  }
  const geracao = estado.geracao;
  let ok = false;
  let motivo = "";
  try {
    ok = lerDaURL();
    if (!ok) motivo = "Não consegui ler esse link. Refaça o teste.";
  } catch {
    // hash corrompida: recomeça, em vez de mostrar número errado
    motivo = "Esse link parece estar corrompido. Refaça o teste.";
  }
  if (!ok) {
    history.replaceState(null, "", location.pathname + "#/comecar");
    return telaInicio(motivo);
  }
  await carregarCandidatos();
  // Outra rota assumiu enquanto esta carregava.
  if (geracao !== estado.geracao - 1) return;
  // Colinha montada à mão: link com escolhas abre a colinha; sem, o montador.
  if (estado.modo === "colinha") {
    return Object.keys(estado.escolhas).length ? telaColinha() : telaResultado();
  }
  // Link parcial retoma de onde parou em vez de fingir que o teste acabou.
  // Link que veio de fora (o eleitor nunca respondeu nada nesta aba): pode
  // ser de um amigo ou o dele mesmo em outra aba. Perguntar antes de abrir —
  // inclusive quando é um quiz pela metade, que antes retomava como se fosse
  // do eleitor.
  if (!ehMeu() && respondidas() > 0) {
    if (!lerMeus().includes(location.hash)) return telaChegada();
    marcarMeu();
  }
  if (estado.indice < estado.teses.length && respondidas() < 5) return telaQuiz();
  telaResultado();
}

(async function iniciar() {
  try {
    // meta primeiro, sem cache: é ele que define o carimbo de todo o resto.
    estado.meta = await carregarJSON("data/meta.json", true).catch(() => null);
    // O carimbo TEM de existir antes de buscar as teses. Ao introduzir o
    // fallback eu inverti esta ordem e teses.json passou a ser o único arquivo
    // de dados sem carimbo — justamente o que define a ordem posicional de
    // `pos`/`src`. Teses do cache com shards novos desalinham cada caractere,
    // sem erro visível, e `versaoTeses` sairia do arquivo velho, desarmando o
    // guard que deveria barrar isso.
    carimbo = (estado.meta?.gerado_em || "").replace(/\D/g, "").slice(0, 14);
    const arquivo = await carregarJSON("data/teses.json", !carimbo);
    estado.teses = arquivo.teses;
    estado.versaoTeses = arquivo.versao;
    carimbo = carimbo || arquivo.versao;
    // Posições por bancada: é o que permite dizer, na tela, quando o candidato
    // votou diferente do próprio partido. Já era gerado pelo build e ninguém
    // lia. 23 KB.
    estado.partidos = await carregarJSON("data/partidos.json").catch(() => ({}));
    estado.logos = await logosDisponiveis();
  } catch (e) {
    app.innerHTML = `<p class="erro">Não consegui carregar as perguntas (${esc(e.message)}).
      Recarregue a página; se persistir, os dados do site podem estar sendo publicados.</p>`;
    const tentar = document.createElement("button");
    tentar.className = "secundario";
    tentar.textContent = "Tentar de novo";
    tentar.onclick = () => location.reload();
    app.append(tentar);
    return;
  }

  // Sem isto, o link do logo trocava o hash e nada acontecia na tela — o
  // estado sumia da URL sem aviso, e voltar/avançar do navegador eram inertes.
  // O logo voltou a ser link para "#/" agora que existe roteador e que
  // telaInicio() zera a sessão: antes ele trocava o hash e nada acontecia,
  // apagando o estado da URL sem trocar de tela.
  window.addEventListener("hashchange", () => { rotear(); });
  window.addEventListener("popstate", (ev) => {
    // Saiu da entrada "colinha" com o voltar: volta ao resultado, sem rolar.
    if (!ev.state?.colinha && document.querySelector(".tela.colinha")) telaResultado({ rolar: false });
  });
  rotear();
})();
