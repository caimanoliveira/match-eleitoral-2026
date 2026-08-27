// Gera a colinha como PNG para o eleitor levar no celular.
//
// Canvas puro em vez de html2canvas: o layout é fixo (uma linha por cargo), e
// a biblioteca custaria ~200 KB para desenhar cinco retângulos e texto.

import { cor, iniciais } from "./partidos.js";

const L = 820;                 // largura do cartão
const TOPO = 132;
const LINHA = 128;
const RODAPE = 68;
const ESCALA = 2;              // exporta em 2x para não borrar em tela retina

const TINTA = "#12161c";
const PAPEL = "#ffffff";
const SUAVE = "#6b7280";
const ALERTA = "#b42318";

/** @returns {Promise<Blob>} PNG da colinha */
export async function desenharColinha(escolhidos) {
  const altura = TOPO + escolhidos.length * LINHA + RODAPE;
  const cv = document.createElement("canvas");
  cv.width = L * ESCALA;
  cv.height = altura * ESCALA;
  const ctx = cv.getContext("2d");
  ctx.scale(ESCALA, ESCALA);

  ctx.fillStyle = PAPEL;
  ctx.fillRect(0, 0, L, altura);

  ctx.fillStyle = TINTA;
  ctx.font = "700 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("MINHA COLINHA", 48, 66);
  ctx.fillStyle = SUAVE;
  ctx.font = "400 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Eleições de 4 de outubro de 2026", 48, 100);

  const fotos = await Promise.all(escolhidos.map((e) => carregarFoto(e.candidato.foto)));

  escolhidos.forEach(({ rotulo, candidato }, i) => {
    const y = TOPO + i * LINHA;

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, y - 12);
    ctx.lineTo(L - 48, y - 12);
    ctx.stroke();

    // avatar
    const foto = fotos[i];
    ctx.save();
    ctx.beginPath();
    ctx.arc(84, y + 46, 36, 0, Math.PI * 2);
    ctx.clip();
    if (foto) {
      ctx.drawImage(foto, 48, y + 10, 72, 72);
    } else {
      ctx.fillStyle = cor(candidato.p);
      ctx.fillRect(48, y + 10, 72, 72);
      ctx.fillStyle = "#fff";
      ctx.font = "700 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(iniciais(candidato.n), 84, y + 56);
      ctx.textAlign = "left";
    }
    ctx.restore();

    ctx.fillStyle = SUAVE;
    ctx.font = "600 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(rotulo.toUpperCase(), 142, y + 28);

    // O número é o que se digita na urna — é o maior elemento da linha.
    ctx.fillStyle = TINTA;
    ctx.font = "800 54px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(candidato.num, 142, y + 82);

    const larguraNumero = ctx.measureText(candidato.num).width;
    ctx.font = "600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(cortar(ctx, candidato.n, L - 260 - larguraNumero),
                 142 + larguraNumero + 22, y + 80);

    // selo do partido
    ctx.fillStyle = cor(candidato.p);
    arredondado(ctx, L - 116, y + 26, 68, 40, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(candidato.pn || candidato.p.slice(0, 3), L - 82, y + 53);
    ctx.textAlign = "left";
  });

  const ambiguos = escolhidos.filter((e) => e.candidato.numDisputado);
  ctx.font = "400 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  if (ambiguos.length) {
    // O PNG é o que vai junto para a urna: o aviso tem de viajar com ele.
    ctx.fillStyle = ALERTA;
    ctx.fillText(
      `⚠ ${ambiguos.map((e) => e.candidato.num).join(", ")}: substituição pendente no TSE — confira.`,
      48, altura - 26);
  } else {
    ctx.fillStyle = SUAVE;
    ctx.fillText("Confira os números no site do TSE antes de votar.", 48, altura - 26);
  }

  return new Promise((resolve) => cv.toBlob(resolve, "image/png"));
}

function cortar(ctx, texto, max) {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function arredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

const TIMEOUT_FOTO = 4000;

function carregarFoto(url) {
  // Sem crossOrigin a foto contamina o canvas e toBlob() lança SecurityError,
  // derrubando a colinha inteira. Se o servidor não mandar CORS, cai no avatar.
  //
  // O timeout não é zelo excessivo: onload/onerror não cobrem a requisição que
  // simplesmente pendura, e sem ele o Promise.all abaixo nunca resolve — a
  // colinha jamais apareceria, por causa de uma foto num servidor de terceiro.
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    let pronto = false;
    const fim = (v) => { if (!pronto) { pronto = true; resolve(v); } };
    img.crossOrigin = "anonymous";
    img.onload = () => fim(img);
    img.onerror = () => fim(null);
    setTimeout(() => fim(null), TIMEOUT_FOTO);
    img.src = url;
  });
}

/** Web Share no celular; download no desktop. */
export async function compartilhar(blob) {
  const arquivo = new File([blob], "minha-colinha-2026.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: "Minha colinha 2026" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // o eleitor cancelou
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
