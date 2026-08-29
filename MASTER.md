# Design system — Colinha

Fonte única de verdade para cor, tipo, espaço e movimento. Todo valor em
`web/style.css` vem daqui; nenhum hex solto no código.

## Teses

**Mundo: "Painel de voto"** (29/08/2026; substitui o fresco-cívico e a rodada
Nexo). Referências: NYT Upshot / FT (data desk) + Linear / Stripe (app).
Preto, branco e **um** acento. O **dado é a imagem**: o mapa das bancadas,
sobre preto, é o hero da landing e o topo do resultado — não há ilustração.
Uma família (Inter) com contraste de peso agressivo; números sempre
tabulares; mono só para número de urna. Raio 6px em tudo; nada de pílula.
Sombra zero em repouso; hover é borda preta, não elevação. Resultado é
painel denso: uma linha por candidato com foto 32px, nome, nº, partido,
barra fina + %, e dois botões quadrados (＋ colinha, ☆ favorito).

**Interação.** 120–220 ms, `cubic-bezier(0.2,0,0,1)`. Uma animação autoral:
os pontos do mapa se assentam ao entrar (escalonado 28 ms, ease-out
exponencial). Sem parallax, sem flutuação, sem revelação por scroll além do
"como funciona"; tudo congela sob `prefers-reduced-motion`.

## Cor

| Token | Valor | Uso |
|---|---|---|
| `--papel` | `#FFFFFF` | fundo |
| `--veu` | `#F4F4F5` | fundo de chip/ícone, barra vazia |
| `--tinta` | `#0A0A0A` | texto, botão primário padrão, barra cheia |
| `--suave` | `#6B6B70` | texto secundário (4.9:1 sobre branco) |
| `--linha` | `#E4E4E7` | bordas de 1px (a única "sombra") |
| `--acao` | `#0E9F5B` | CTA principal, ✓ concorda, foco (3.2:1 — só em texto grande/branco sobre ele) |
| `--acao-escuro` | `#3DDC84` | acento sobre preto (hero, "você" no mapa) |
| `--contra` | `#C2410C` | ✕ discorda, alerta |
| `--preto` / `--preto-tinta` / `--preto-suave` / `--preto-linha` | `#0A0A0A` / `#FFF` / `#A1A1AA` / `#27272A` | faixas escuras: hero, faixa de fatos, mapa |

Regras: verde só significa "concorda / sua posição / ação principal";
vermelho só "discorda / alerta". Cores de partido são dado, não design.
Nenhuma outra cor saturada existe.

## Tipografia

**IBM Plex Sans** (400/500/600/700) com `font-feature-settings: "tnum"`.
Fallback `system-ui`. Mono: IBM Plex Mono 600/700 para número de urna.
(Inter foi descartada: cara de template; Plex tem o mesmo rigor de dado com voz própria.)

| Papel | Tamanho | Peso | Tracking |
|---|---|---|---|
| display (hero) | `clamp(2.4rem, 6.5vw, 4rem)` / 1.0 | 700 | −0.04em |
| h1 | `clamp(1.7rem, 4.6vw, 2.2rem)` / 1.1 | 700 | −0.03em |
| h2 | `1.25rem` | 700 | −0.02em |
| afirmação do quiz | `clamp(1.4rem, 4.4vw, 1.75rem)` / 1.25 | 700 | −0.025em |
| corpo | `1rem` (16px) / 1.55 | 400 | 0 |
| rótulo | `0.7rem` | 600 | +0.12em, caixa alta, `--suave` |
| número grande (faixa) | `2.4rem` | 700 | −0.04em, tabular |
| número de urna | `1.7rem` mono | 700 | −0.02em |

## Espaço

Base 8. Escala: 4, 8, 12, 16, 24, 32, 48, 64, 96.
Padding de página: 20px no celular, 32px acima de 48rem.
Gap entre cartões: 12. Entre seções da landing: 48 (celular) / 64.

## Forma

| Token | Valor | Uso |
|---|---|---|
| `--raio-pill` | `999px` | botões, chips, abas, busca |
| `--raio` | `16px` | cartões |
| `--raio-sm` | `8px` | selos, avisos inline |

Cartões **sem borda**: separam-se do fundo por `--superficie` + sombra.

## Elevação

| Token | Valor |
|---|---|
| `--sombra-1` | `0 1px 2px rgb(20 32 27 / .06), 0 4px 12px rgb(20 32 27 / .05)` |
| `--sombra-2` | `0 2px 4px rgb(20 32 27 / .08), 0 12px 32px rgb(20 32 27 / .10)` |
| `--sombra-cta` | `0 8px 24px rgb(8 122 84 / .28)` |

No tema escuro as sombras somem e a separação vem de `--superficie`.

## Movimento

| Token | Valor | Uso |
|---|---|---|
| `--rapido` | `150ms` | hover, foco, toggle |
| `--normal` | `250ms` | troca de tela, revelação |
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` | tudo que entra ou muda |
| `--ease-sai` | `ease-in` | tudo que sai |
| ambiente | `6s ease-in-out infinite alternate` | só a urna do hero |

Proibido: bounce, elastic, parallax, animar `width/height/top/left`.
Hover só dentro de `@media (hover: hover) and (pointer: fine)`.
`@media (prefers-reduced-motion: reduce)` zera duração e desliga o ambiente.

## Componentes

**CTA primário** — pill, `--acao` sobre `--acao-tinta`, `--sombra-cta`, 56px de
altura no celular. Estados: hover eleva 2px e escurece 6%; foco anel de 3px
`--acao` com offset 3px; ativo scale .98; desabilitado opacidade .5.

**Botão secundário** — pill, fundo `--superficie`, texto `--tinta`, sombra-1.

**Cartão de candidato** — `--superficie`, `--raio`, `--sombra-1`, padding 16.
Hover (desktop): `--sombra-2`.

**Chip / aba** — pill, `--veu` inativo, `--tinta` sobre `--papel` ativo.

**Urna (hero)** — a urna eletrônica brasileira em CSS: terminal cinza
inclinado (`rotateX 28° / rotateY −18°`), tela verde-escura à esquerda com um
número sendo digitado, teclado 3×4 com BRANCO, CORRIGE (laranja) e CONFIRMA
(`--acao`). As cores do terminal são as do objeto real, não da paleta — são
dado, como as cores de partido. Flutua 6 s; sob reduced-motion fica parada
com o número já digitado.

## Logo

Marca tipográfica: "Colinha" 800 + ".app.br" 500 em itálico, Manrope, `--tinta`. Ícone: a
urna eletrônica em traço — terminal com tela à esquerda, quatro teclas à
direita e o CONFIRMA em `--acao`. SVG inline em `web/logo.svg`; favicon é o ícone sozinho.
