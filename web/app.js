import { match, bussola, ranquear, PULOU } from "./match.js";
import { cor, tinta, selo, iniciais } from "./partidos.js";
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

const POR_PAGINA = 30;

const app = document.getElementById("app");
const estado = {
  uf: null,
  meta: null,
  versaoTeses: null,
  teses: [],
  partidos: {},     // sigla -> {tese_id: posição da bancada}
  respostas: {},
  indice: 0,
  // Carregados juntos e trocados de uma vez só: se `uf` e `porCargo` puderem
  // descolar, a colinha carimba a UF de um estado sobre o número de outro.
  dados: { uf: null, porCargo: {}, falhas: {} },
  geracao: 0,       // descarta o resultado de uma carga que foi ultrapassada
  cargoAtivo: null,
  escolhas: {},     // cargo -> id do candidato
  busca: "",
  limite: POR_PAGINA,
};

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
  app.replaceChildren(node);
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
const tesesDoEleitor = () => estado.teses;

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
    null, "", `#/r/${estado.versaoTeses}/${estado.uf}/${respostas}/${ids}`);
}

function lerDaURL() {
  const m = location.hash.match(/^#\/r\/([a-f0-9]{6})\/([A-Z]{2})\/([cndxp!]*)\/(.*)$/);
  if (!m) return false;
  const [, versao, uf, respostas, ids] = m;

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
  Object.assign(estado, {
    uf, escolhas, respostas: lidas,
    indice: primeiraSemResposta === null ? estado.teses.length : primeiraSemResposta,
    busca: "", limite: POR_PAGINA, cargoAtivo: null,
  });
  return Object.keys(lidas).length > 0;
}

// -------------------------------------------------------------------- telas

/** Volta ao ponto zero. Sem isto, "#/" mostrava a tela inicial mas o estado
 *  anterior continuava vivo, e o eleitor que "recomeçava" recebia o resultado
 *  velho. */
function zerarSessao() {
  Object.assign(estado, {
    uf: null, respostas: {}, indice: 0, escolhas: {},
    dados: { uf: null, porCargo: {}, falhas: {} },
    cargoAtivo: null, busca: "", limite: POR_PAGINA,
  });
  estado.geracao++; // invalida carga em voo
}

function telaInicio(motivo = "") {
  zerarSessao();
  const node = tpl("tpl-inicio");
  const sel = node.getElementById("uf");
  sel.append(new Option("Selecione…", ""));
  UFS.forEach((uf) => sel.append(new Option(uf, uf)));

  const erro = node.getElementById("erro-uf");
  // Link recusado (outra versão do questionário, hash corrompida) era
  // descartado sem uma palavra: o eleitor via a tela inicial sem saber por quê.
  if (motivo) erro.textContent = motivo;
  sel.onchange = () => {
    erro.textContent = "";
    sel.removeAttribute("aria-invalid");
  };
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
    telaQuiz();
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

  const ctx = node.querySelector(".contexto");
  if (tese.contexto) ctx.querySelector("p").textContent = tese.contexto;
  else ctx.remove();

  const check = node.querySelector(".importante input");
  const anterior = estado.respostas[tese.id];
  check.checked = anterior?.importante || false;
  // Gravar no próprio change: antes o peso só era lido no clique da resposta,
  // então marcar "muito importante" depois de responder — ou antes de usar
  // Voltar/Pular — não surtia efeito nenhum.
  check.onchange = () => {
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
  pular.textContent = anterior && anterior.valor !== PULOU ? "Avançar" : "Pular esta";
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
    if (ev.key === "ArrowRight") {
      document.getElementById("pular")?.click();
      return true;
    }
    return false;
  });
}

function telaResultado({ rolar = true } = {}) {
  salvarNaURL();
  const node = tpl("tpl-resultado");
  node.getElementById("bussola").append(desenharBussola());

  const teses = tesesDoEleitor();
  const faltam = teses.length - respondidas();
  const cabecalho = node.querySelector("h1");
  if (faltam > 0) {
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
    b.textContent = rotuloComUF(cargo);
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

  const lista = node.getElementById("lista");
  const mais = node.getElementById("mais");
  const rodape = node.getElementById("rodape-fonte");
  const avisos = node.getElementById("avisos-lista");

  function renderLista() {
    if (!estado.cargoAtivo) {
      // Sem cargo carregado não há o que listar, e montar a frase produzia
      // "0 candidatos a null — RJ" na cara do eleitor.
      lista.replaceChildren();
      avisos.replaceChildren();
      mais.hidden = true;
      campo.disabled = true;
      rodape.textContent = idadeDaFonte();
      return;
    }
    const universo = estado.dados.porCargo[estado.cargoAtivo] || [];
    const completo = ranquear(estado.respostas, teses, universo);

    const alvo = normalizar(estado.busca);
    const visiveis = alvo
      ? completo.filter(
          (r) => normalizar(r.candidato.n).includes(alvo) || r.candidato.num.startsWith(alvo)
        )
      : completo;

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
    if (empatados > 3) {
      const aviso = document.createElement("p");
      aviso.className = "empate";
      aviso.innerHTML =
        `<b>${empatados} candidatos empatam no primeiro lugar.</b> Para a maioria deles ` +
        `a posição vem da bancada do partido, não de voto individual — então candidatos ` +
        `do mesmo partido ficam idênticos aqui. A ordem entre empatados é sorteada, e ` +
        `não é uma recomendação. Abra “por quê” para ver de onde vem cada posição.`;
      avisos.append(aviso);
    }
    if (!visiveis.length) {
      const vazio = document.createElement("p");
      vazio.className = "aviso";
      vazio.textContent = respondidas() === 0
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
    visiveis.slice(0, estado.limite).forEach((r) => lista.append(itemCandidato(r, porPartido)));

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
    rodape.textContent = [
      alvo
        ? `${visiveis.length} de ${universo.length} candidatos a ` +
          `${rotuloComUF(estado.cargoAtivo)} para “${estado.busca}”.`
        : visiveis.length > estado.limite
          ? `Mostrando ${estado.limite} de ${universo.length} candidatos a ${rotuloComUF(estado.cargoAtivo)}.`
          : `${universo.length} candidatos a ${rotuloComUF(estado.cargoAtivo)}.`,
      semRegistroAlgum > 0
        ? `${semRegistroAlgum} não têm registro de posição sobre nenhum tema.`
        : "",
      semTeseEmComum > 0
        ? `${semTeseEmComum} não puderam ser comparados com as afirmações que você respondeu.`
        : "",
      idadeDaFonte(),
    ].filter(Boolean).join(" ");

    if (alvo) anunciar(`${visiveis.length} candidatos encontrados.`);
  }

  renderLista();
  node.getElementById("ver-colinha").onclick = telaColinha;
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
  return dias > 2
    ? `Lista de candidatos do TSE de ${data} — pode estar desatualizada; confira no site do TSE.`
    : `Lista de candidatos do TSE de ${data}.`;
}

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
  det.innerHTML = `<summary>Por que ${pct(score)}? (${temas} temas)</summary>`;
  det.append(quebraPorTese(detalhe, candidato.p, candidato));

  const fixar = document.createElement("button");
  const jaEscolhido = estado.escolhas[estado.cargoAtivo] === candidato.id;
  fixar.className = jaEscolhido ? "fixar fixado" : "fixar";
  fixar.textContent = jaEscolhido ? "✓ Na minha colinha" : "+ Colocar na colinha";
  fixar.setAttribute("aria-pressed", jaEscolhido ? "true" : "false");
  fixar.onclick = () => {
    const agora = estado.escolhas[estado.cargoAtivo] !== candidato.id;
    // Um cargo tem um slot só: fixar outro troca. Antes de redesenhar nada,
    // desmarca o botão do candidato que perdeu o lugar.
    const anterior = estado.escolhas[estado.cargoAtivo];
    if (agora) estado.escolhas[estado.cargoAtivo] = candidato.id;
    else delete estado.escolhas[estado.cargoAtivo];

    if (anterior && anterior !== candidato.id) {
      document.querySelectorAll(".fixar.fixado").forEach((b) => {
        b.className = "fixar";
        b.textContent = "+ Colocar na colinha";
        b.setAttribute("aria-pressed", "false");
      });
    }
    fixar.className = agora ? "fixar fixado" : "fixar";
    fixar.textContent = agora ? "✓ Na minha colinha" : "+ Colocar na colinha";
    fixar.setAttribute("aria-pressed", agora ? "true" : "false");
    salvarNaURL();
    anunciar(
      agora
        ? `${candidato.n}, número ${candidato.num}, na colinha.`
        : `${candidato.n} removido da colinha.`
    );
    // Trocar só o botão, e não a tela inteira: redesenhar fechava os "por quê"
    // que o eleitor tinha aberto e reordenava a lista sob o dedo dele.
  };

  li.append(topo, ...(origem ? [origem] : []), det, fixar);
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
          return f ? ` · <a href="${f.url}" target="_blank" rel="noopener">ver votação</a>` : "";
        })()) +
        `</em></span>`;
    }
    ul.append(li);
  }
  return ul;
}

function desenharBussola() {
  const p = bussola(estado.respostas, tesesDoEleitor());
  const semLastro = !p.pesos.economico && !p.pesos.social;
  // 42, não 45: com poucas teses o eleitor satura em ±1 com facilidade, e um
  // raio maior joga o marcador para cima da borda do quadro.
  const x = 50 + p.economico * 42;
  const y = 50 - p.social * 42;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "bussola");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", semLastro
    ? "Mapa de posições, ainda sem respostas suficientes para posicionar você."
    : `Sua posição: eixo econômico ${p.economico.toFixed(2)} de -1 (estatista) a ` +
      `+1 (mercado); eixo social ${p.social.toFixed(2)} de -1 (progressista) a ` +
      `+1 (conservador).`);
  svg.innerHTML = `
    <rect x="2" y="2" width="96" height="96" rx="4" class="b-fundo"/>
    <line x1="50" y1="4" x2="50" y2="96" class="b-eixo"/>
    <line x1="4" y1="50" x2="96" y2="50" class="b-eixo"/>
    <text x="50" y="10" class="b-rot">conservador</text>
    <text x="50" y="95" class="b-rot">progressista</text>
    <text x="7"  y="52" class="b-rot b-esq">estatista</text>
    <text x="93" y="52" class="b-rot b-dir">mercado</text>` +
    // Sem nenhuma resposta com peso de eixo, desenhar um ponto no centro
    // declararia centrista quem não disse nada.
    (semLastro
      ? `<text x="50" y="72" class="b-rot">responda para se posicionar</text>`
      : `<circle cx="${x}" cy="${y}" r="4.5" class="b-voce"/>`);
  return svg;
}

function telaColinha() {
  const node = tpl("tpl-colinha");
  salvarNaURL();

  // Escolha que aponta para um cargo que não carregou não pode sumir em
  // silêncio: o eleitor levaria para a urna uma colinha com uma linha a menos
  // sem nunca saber.
  const escolhidos = [];
  const perdidos = [];
  const orfas = [];
  for (const [cargo] of CARGOS) {
    const id = estado.escolhas[cargo];
    if (!id) continue;
    const c = (estado.dados.porCargo[cargo] || []).find((x) => x.id === id);
    if (c) escolhidos.push({ cargo, rotulo: rotuloComUF(cargo), candidato: c });
    else if (estado.dados.falhas[cargo]) perdidos.push(cargo);
    else orfas.push(cargo);
  }

  const cartao = node.getElementById("cartao");
  const compartilharBtn = node.getElementById("compartilhar");

  if (!escolhidos.length) {
    cartao.innerHTML =
      `<p class="vazio">Você ainda não escolheu ninguém. Volte ao resultado e
       toque em <b>“Colocar na colinha”</b> nos candidatos que quiser levar.</p>`;
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
        ? `Uma escolha para ${orfas.map(rotuloCargo).join(", ")} veio de um link de ` +
          `outro estado ou de uma versão anterior dos dados, e foi descartada.`
        : "",
    ].filter(Boolean).join(" ");
  }
  orfas.forEach((cargo) => delete estado.escolhas[cargo]);

  node.getElementById("voltar-resultado").onclick = () => telaResultado();
  mostrar(node);
}

function alertaInline(depois, texto) {
  const p = document.createElement("p");
  p.className = "num-disputado";
  p.textContent = texto;
  depois.after(p);
}

// -------------------------------------------------------------------- start

async function rotear() {
  if (!location.hash || location.hash === "#/" || location.hash === "#") {
    return telaInicio();
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
    history.replaceState(null, "", location.pathname);
    return telaInicio(motivo);
  }
  await carregarCandidatos();
  // Outra rota assumiu enquanto esta carregava.
  if (geracao !== estado.geracao - 1) return;
  // Link parcial retoma de onde parou em vez de fingir que o teste acabou.
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
  } catch (e) {
    app.innerHTML = `<p class="erro">Não consegui carregar as perguntas (${e.message}).
      Recarregue a página; se persistir, os dados do site podem estar sendo publicados.</p>`;
    return;
  }

  // Sem isto, o link do logo trocava o hash e nada acontecia na tela — o
  // estado sumia da URL sem aviso, e voltar/avançar do navegador eram inertes.
  // O logo voltou a ser link para "#/" agora que existe roteador e que
  // telaInicio() zera a sessão: antes ele trocava o hash e nada acontecia,
  // apagando o estado da URL sem trocar de tela.
  window.addEventListener("hashchange", () => { rotear(); });
  rotear();
})();
