// Medição anônima de uso (d8a, servidores na UE). Conta páginas e passos do
// funil — nunca respostas, UF, candidatos ou qualquer coisa que identifique.
// Respeita "Não rastrear" do navegador: com DNT ligado, nada é carregado.
(function () {
  var dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1";
  window.medir = function () {};
  if (dnt || location.hostname === "localhost") return;
  window.d8aLayer = window.d8aLayer || [];
  window.d8a = window.d8a || function () { d8aLayer.push(arguments); };
  d8a("js", new Date());
  d8a("config", "985b4abf-555b-4e99-87cd-716cd4bf46b0", {
    server_container_url: "https://global.t.d8a.tech/985b4abf-555b-4e99-87cd-716cd4bf46b0/d/c",
    send_page_view: false
  });
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://cdn.jsdelivr.net/npm/@d8a-tech/wt/dist/wt.min.js";
  document.head.appendChild(s);
  var via = new URLSearchParams(location.search).get("via") || "";
  // medir("nome", {chave: valor}) — só nomes de passo e origem, nada pessoal.
  window.medir = function (nome, dados) {
    try { d8a("event", nome, Object.assign({ via: via }, dados || {})); } catch (e) { /* medição nunca quebra o site */ }
  };
  window.medir("page_view", { page_path: location.pathname + (location.hash.split("/")[1] ? "#/" + location.hash.split("/")[1] : "") });
})();
