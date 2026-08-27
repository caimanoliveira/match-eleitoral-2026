import { match, bussola, ranquear, PULOU } from "./match.js";
import { cor, selo, iniciais } from "./partidos.js";
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
  "2": { rotulo: "Como votou no Congresso", inferida: false },
  "5": { rotulo: "Posição da bancada do partido", inferida: true },
};

const app = document.getElementById("app");
const estado = {
  uf: null,
  meta: null,
  versaoTeses: null,
  teses: [],
  respostas: {},
  indice: 0,
  candidatos: {},   // cargo -> array
  cargoAtivo: null,
  escolhas: {},     // cargo -> id do candidato
};

// ---------------------------------------------------------------- utilidades

const tpl = (id) => document.getElementById(id).content.cloneNode(true);
const pct = (n) => `${Math.round(n * 100)}%`;

function mostrar(node) {
  app.replaceChildren(node);
  window.scrollTo(0, 0);
}

// Carimbo do build, anexado a toda URL de dados. Sem isso o navegador (ou um
// CDN) pode servir um shard de ontem junto do teses.json de hoje — e como
// `pos`/`src` são posicionais contra a lista de teses, a leitura sai
// desalinhada sem erro nenhum, mostrando a posição de uma tese no lugar de
// outra. Mesmo problema que a versão na URL resolve para links compartilhados,
// agora na camada de cache HTTP.
let carimbo = "";

async function carregarJSON(caminho, semCache = false) {
  const url = semCache
    ? `${caminho}?t=${Date.now()}`
    : carimbo
      ? `${caminho}?v=${carimbo}`
      : caminho;
  const r = await fetch(url, semCache ? { cache: "no-store" } : undefined);
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.json();
}

// Todas as teses valem para todos os cargos, e isso é uma escolha, não um
// descuido: a evidência sobre um candidato a deputado estadual vem da bancada
// federal do partido dele, que serve como indicador de posição ideológica e não
// como previsão dos votos que ele dará na assembleia. O campo `esfera` fica em
// theses.toml para a curadoria, mas não filtra o quiz. Está explicado na
// metodologia — se um dia deixar de valer, o filtro entra aqui.
const tesesDoEleitor = () => estado.teses;

// ------------------------------------------------------------------- estado
// A colinha vive na URL para que o link compartilhado reabra a mesma escolha,
// sem backend e sem localStorage.

function salvarNaURL() {
  const ids = CARGOS.map(([c]) => estado.escolhas[c] || "").join(".");
  const respostas = estado.teses
    .map((t) => {
      const r = estado.respostas[t.id];
      if (!r || r.valor === PULOU) return "x";
      return { "1": "c", "0": "n", "-1": "d" }[String(r.valor)] + (r.importante ? "!" : "");
    })
    .join("");
  history.replaceState(
    null, "", `#/r/${estado.versaoTeses}/${estado.uf}/${respostas}/${ids}`);
}

function lerDaURL() {
  const m = location.hash.match(/^#\/r\/([a-f0-9]{6})\/([A-Z]{2})\/([cndx!]*)\/(.*)$/);
  if (!m) return false;
  const [, versao, uf, respostas, ids] = m;

  // As respostas são posicionais. Um link gerado com outro conjunto de teses
  // seria decodificado contra as perguntas erradas — e o eleitor veria um
  // resultado plausível, porém falso. Melhor refazer o teste.
  if (versao !== estado.versaoTeses) {
    console.warn("link de outra versão do questionário; recomeçando");
    return false;
  }
  estado.uf = uf;

  let i = 0;
  for (const tese of estado.teses) {
    const ch = respostas[i++];
    if (ch === "x" || ch === undefined) continue;
    const importante = respostas[i] === "!";
    if (importante) i++;
    estado.respostas[tese.id] = {
      valor: { c: 1, n: 0, d: -1 }[ch],
      importante,
    };
  }
  ids.split(".").forEach((id, k) => {
    if (id) estado.escolhas[CARGOS[k][0]] = id;
  });
  return Object.keys(estado.respostas).length > 0;
}

// -------------------------------------------------------------------- telas

function telaInicio() {
  const node = tpl("tpl-inicio");
  const sel = node.getElementById("uf");
  sel.append(new Option("Selecione…", ""));
  UFS.forEach((uf) => sel.append(new Option(uf, uf)));

  node.getElementById("comecar").onclick = async (ev) => {
    if (!sel.value) {
      sel.focus();
      return;
    }
    ev.target.disabled = true;
    ev.target.textContent = "Carregando…";
    estado.uf = sel.value;
    await carregarCandidatos();
    estado.indice = 0;
    telaQuiz();
  };
  mostrar(node);
}

async function carregarCandidatos() {
  const cargos = CARGOS.filter(([c]) =>
    c === "presidente" ? true : c === "deputado-distrital" ? estado.uf === "DF" :
    c === "deputado-estadual" ? estado.uf !== "DF" : true);

  const pares = await Promise.all(
    cargos.map(async ([cargo]) => {
      const uf = cargo === "presidente" ? "BR" : estado.uf;
      try {
        return [cargo, await carregarJSON(`data/${cargo}-${uf}.json`)];
      } catch {
        return [cargo, []]; // UF sem disputa para este cargo (ex.: governador no DF)
      }
    })
  );
  estado.candidatos = Object.fromEntries(pares.filter(([, v]) => v.length));
  estado.cargoAtivo = Object.keys(estado.candidatos)[0];
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

  const ctx = node.querySelector(".contexto");
  if (tese.contexto) ctx.querySelector("p").textContent = tese.contexto;
  else ctx.remove();

  const check = node.querySelector(".importante input");
  const anterior = estado.respostas[tese.id];
  check.checked = anterior?.importante || false;

  node.querySelectorAll(".resp").forEach((btn) => {
    const valor = Number(btn.dataset.valor);
    if (anterior && anterior.valor === valor) btn.classList.add("escolhida");
    btn.onclick = () => {
      estado.respostas[tese.id] = { valor, importante: check.checked };
      estado.indice++;
      telaQuiz();
    };
  });

  const voltar = node.getElementById("voltar");
  voltar.disabled = estado.indice === 0;
  voltar.onclick = () => {
    estado.indice--;
    telaQuiz();
  };
  node.getElementById("pular").onclick = () => {
    estado.respostas[tese.id] = { valor: PULOU, importante: false };
    estado.indice++;
    telaQuiz();
  };

  mostrar(node);
}

function telaResultado() {
  salvarNaURL();
  const node = tpl("tpl-resultado");
  node.getElementById("bussola").append(desenharBussola());

  const abas = node.getElementById("abas");
  for (const [cargo, rotulo] of CARGOS) {
    if (!estado.candidatos[cargo]?.length) continue;
    const b = document.createElement("button");
    b.textContent = rotulo;
    b.className = cargo === estado.cargoAtivo ? "aba ativa" : "aba";
    b.onclick = () => {
      estado.cargoAtivo = cargo;
      telaResultado();
    };
    abas.append(b);
  }

  const lista = node.getElementById("lista");
  const teses = tesesDoEleitor();
  const ranking = ranquear(estado.respostas, teses, estado.candidatos[estado.cargoAtivo] || []);

  // Quantos candidatos do mesmo partido estão na disputa: é o tamanho do grupo
  // que herda exatamente a mesma posição quando não há voto próprio.
  const porPartido = {};
  ranking.forEach((r) => {
    porPartido[r.candidato.p] = (porPartido[r.candidato.p] || 0) + 1;
  });

  const empatados = ranking.filter((r) => r.score === ranking[0]?.score).length;
  if (empatados > 3) {
    const aviso = document.createElement("p");
    aviso.className = "empate";
    aviso.innerHTML =
      `<b>${empatados} candidatos empatam no primeiro lugar.</b> Para a maioria deles ` +
      `a posição vem da bancada do partido, não de voto individual — então candidatos ` +
      `do mesmo partido ficam idênticos aqui. A ordem entre empatados é sorteada, e ` +
      `não é uma recomendação. Abra “por quê” para ver de onde vem cada posição.`;
    lista.before(aviso);
  }

  ranking.slice(0, 30).forEach((r) => lista.append(itemCandidato(r, porPartido)));

  const total = estado.candidatos[estado.cargoAtivo]?.length || 0;
  const mostrados = Math.min(30, ranking.length);
  const semDados = total - ranking.length;
  node.getElementById("rodape-fonte").textContent = [
    total > mostrados
      ? `Mostrando ${mostrados} de ${total} candidatos ao cargo.`
      : `${total} candidatos ao cargo.`,
    semDados > 0
      ? `${semDados} ficaram de fora por não haver registro de posição sobre nenhum tema.`
      : "",
    idadeDaFonte(),
  ].filter(Boolean).join(" ");

  node.getElementById("ver-colinha").onclick = telaColinha;
  mostrar(node);
}

/** Candidatura muda até a véspera: dizer a data da fonte é parte do produto. */
function idadeDaFonte() {
  const iso = estado.meta?.fonte_tse_em;
  if (!iso) return "";
  const dias = (Date.now() - new Date(iso)) / 86400000;
  const data = new Date(iso).toLocaleDateString("pt-BR");
  return dias > 2
    ? `Lista de candidatos do TSE de ${data} — pode estar desatualizada; confira no site do TSE.`
    : `Lista de candidatos do TSE de ${data}.`;
}

function itemCandidato({ candidato, score, detalhe, respondidas }, porPartido = {}) {
  const li = document.createElement("li");
  li.className = "candidato";

  // Sem nenhum voto próprio, este percentual é o do partido — e é idêntico
  // para todos os colegas de legenda. Dizer isso na lista, e não só na quebra
  // por tese, evita que o ranking pareça distinguir pessoas quando distingue
  // partidos.
  const soPartido = [...candidato.src].every((c) => c === "5" || c === "?");

  const topo = document.createElement("div");
  topo.className = "topo";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.background = cor(candidato.p);
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
    `<b>${candidato.n}</b><span class="numero">${candidato.num}</span>` +
    `<small>${candidato.p}</small>`;

  const barra = document.createElement("div");
  barra.className = "score";
  barra.innerHTML =
    `<div class="score-barra"><i style="width:${pct(score)}"></i></div>` +
    `<b>${pct(score)}</b>`;

  topo.append(avatar, nome, selo(candidato.p, candidato.pn), barra);

  if (candidato.numDisputado) {
    const alerta = document.createElement("p");
    alerta.className = "num-disputado";
    alerta.textContent =
      `Atenção: o número ${candidato.num} está registrado para mais de uma ` +
      `candidatura — há substituição pendente de julgamento no TSE. Confira ` +
      `antes de votar.`;
    topo.append(alerta);
  }

  let origem = null;
  if (soPartido) {
    origem = document.createElement("p");
    origem.className = "origem-partido";
    const n = porPartido[candidato.p] || 0;
    origem.textContent =
      n > 1
        ? `Posição do partido, não deste candidato — idêntica aos outros ${n - 1} do ${candidato.p}.`
        : `Posição do partido, não deste candidato.`;
  }

  const det = document.createElement("details");
  det.className = "quebra";
  det.innerHTML = `<summary>Por que ${pct(score)}? (${respondidas} temas)</summary>`;
  det.append(quebraPorTese(detalhe));

  const fixar = document.createElement("button");
  const jaEscolhido = estado.escolhas[estado.cargoAtivo] === candidato.id;
  fixar.className = jaEscolhido ? "fixar fixado" : "fixar";
  fixar.textContent = jaEscolhido ? "✓ Na minha colinha" : "+ Colocar na colinha";
  fixar.onclick = () => {
    if (jaEscolhido) delete estado.escolhas[estado.cargoAtivo];
    else estado.escolhas[estado.cargoAtivo] = candidato.id;
    telaResultado();
  };

  li.append(topo, ...(origem ? [origem] : []), det, fixar);
  return li;
}

function quebraPorTese(detalhe) {
  const ul = document.createElement("ul");
  ul.className = "temas";
  for (const d of detalhe) {
    const li = document.createElement("li");
    if (d.posicao === null) {
      li.className = "tema sem-dado";
      li.innerHTML = `<span class="marca">—</span><span>${d.tese.texto}
        <em>Não há registro de posição.</em></span>`;
    } else {
      const fonte = FONTES[d.fonte] || { rotulo: "", inferida: true };
      li.className = d.concorda ? "tema ok" : "tema nao";
      li.innerHTML =
        `<span class="marca">${d.concorda ? "✓" : "✕"}</span>` +
        `<span>${d.tese.texto}` +
        `<em class="${fonte.inferida ? "inferida" : ""}">${fonte.rotulo}` +
        (d.tese.fontes?.[0]
          ? ` · <a href="${d.tese.fontes[0].url}" target="_blank" rel="noopener">ver votação</a>`
          : "") +
        `</em></span>`;
    }
    ul.append(li);
  }
  return ul;
}

function desenharBussola() {
  const p = bussola(estado.respostas, tesesDoEleitor());
  // 42, não 45: com poucas teses o eleitor satura em ±1 com facilidade, e um
  // raio maior joga o marcador para cima da borda do quadro.
  const x = 50 + p.economico * 42;
  const y = 50 - p.social * 42;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "bussola");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `Sua posição: eixo econômico ${p.economico.toFixed(2)}, eixo social ${p.social.toFixed(2)}`);
  svg.innerHTML = `
    <rect x="2" y="2" width="96" height="96" rx="4" class="b-fundo"/>
    <line x1="50" y1="4" x2="50" y2="96" class="b-eixo"/>
    <line x1="4" y1="50" x2="96" y2="50" class="b-eixo"/>
    <text x="50" y="10" class="b-rot">conservador</text>
    <text x="50" y="95" class="b-rot">progressista</text>
    <text x="7"  y="52" class="b-rot b-esq">estatista</text>
    <text x="93" y="52" class="b-rot b-dir">mercado</text>
    <circle cx="${x}" cy="${y}" r="4.5" class="b-voce"/>`;
  return svg;
}

function telaColinha() {
  const node = tpl("tpl-colinha");
  salvarNaURL();

  const escolhidos = CARGOS.map(([cargo, rotulo]) => {
    const id = estado.escolhas[cargo];
    if (!id) return null;
    const c = (estado.candidatos[cargo] || []).find((x) => x.id === id);
    return c && { cargo, rotulo, candidato: c };
  }).filter(Boolean);

  const cartao = node.getElementById("cartao");
  if (!escolhidos.length) {
    cartao.innerHTML =
      `<p class="vazio">Você ainda não escolheu ninguém. Volte ao resultado e
       toque em <b>“Colocar na colinha”</b> nos candidatos que quiser levar.</p>`;
    node.getElementById("compartilhar").disabled = true;
  } else {
    escolhidos.forEach(({ rotulo, candidato }) => {
      const linha = document.createElement("div");
      linha.className = "linha-colinha";

      const av = document.createElement("div");
      av.className = "avatar";
      av.style.background = cor(candidato.p);
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
        `<span class="num">${candidato.num}</span>` +
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

    node.getElementById("compartilhar").onclick = async (ev) => {
      ev.target.disabled = true;
      try {
        const blob = await desenharColinha(escolhidos);
        await compartilhar(blob);
      } finally {
        ev.target.disabled = false;
      }
    };
  }

  node.getElementById("voltar-resultado").onclick = telaResultado;
  mostrar(node);
}

// -------------------------------------------------------------------- start

(async function iniciar() {
  try {
    // meta primeiro, sem cache: é ele que define o carimbo de todo o resto.
    estado.meta = await carregarJSON("data/meta.json", true).catch(() => null);
    carimbo = (estado.meta?.gerado_em || "").replace(/\D/g, "").slice(0, 14);

    const arquivo = await carregarJSON("data/teses.json");
    estado.teses = arquivo.teses;
    estado.versaoTeses = arquivo.versao;
  } catch (e) {
    app.innerHTML = `<p class="erro">Não consegui carregar as perguntas (${e.message}).
      Rode <code>python3 pipeline/build.py</code> antes de abrir o site.</p>`;
    return;
  }
  if (lerDaURL()) {
    await carregarCandidatos();
    telaResultado();
  } else {
    telaInicio();
  }
})();
