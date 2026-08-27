# Design system — Colinha

Fonte única de verdade para cor, tipo, espaço e movimento. Todo valor em
`web/style.css` vem daqui; nenhum hex solto no código.

## Teses

**Visual.** Fundo branco quente com um véu de verde-água muito dessaturado no
hero; sans geométrica (Manrope) em pesos fortes com contraste de tamanho
agressivo; espaçamento arejado em base 8; componentes pill e cartões sem borda,
com sombra suave e uma única cor de ação — verde-cívico — reservada ao CTA e
aos acertos. (`#087A54` e não um verde mais vivo: precisa de 4,5:1 sobre o papel para texto pequeno.)

**Interação.** Rápido e seco (150–250 ms, `cubic-bezier(0.2, 0, 0, 1)`); hover
só em `pointer: fine`, com elevação de 2 px; um único movimento ambiente — a
urna flutuando em 6 s — e revelação por scroll no "como funciona"; sem bounce,
sem parallax, e tudo congela sob `prefers-reduced-motion`.

## Cor

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--papel` | `#FBFBF9` | `#0F1412` | fundo da página (branco quente, não puro) |
| `--veu` | `#E6F4EE` | `#12201A` | véu do hero, fundo de chips |
| `--superficie` | `#FFFFFF` | `#161D1A` | cartões |
| `--tinta` | `#14201B` | `#EAF1ED` | texto principal |
| `--suave` | `#5C6B64` | `#9AAAA2` | texto secundário |
| `--linha` | `#E3EAE6` | `#26302B` | divisores |
| `--acao` | `#087A54` | `#3DCB95` | CTA, ✓ concorda, foco |
| `--acao-tinta` | `#FFFFFF` | `#0F1412` | texto sobre `--acao` |
| `--acao-suave` | `#DCF2E8` | `#173A2C` | fundo de destaque leve |
| `--contra` | `#B4452C` | `#F0836A` | ✕ discorda, alerta de urna |
| `--contra-suave` | `#F8E7E2` | `#3A1E17` | fundo de alerta |

Regras:
- `--acao` é a **única** cor saturada da paleta. Aparece no CTA, no ✓ e no foco.
  Nunca em fundo de seção inteira.
- Verde e vermelho significam só uma coisa: concorda/discorda com o eleitor.
  Divergência da bancada, fonte inferida e afins usam peso de tinta, nunca cor.
- Cores de partido (`partidos.js`) são as dos partidos e ficam fora desta
  paleta — são dado, não design.

## Tipografia

Manrope (Google Fonts), pesos 500/700/800. Fallback: `system-ui, sans-serif`.
Números tabulares em qualquer coluna de dígitos (`font-variant-numeric`).
Mono para número de urna e ids: `ui-monospace, SFMono-Regular, Menlo`.

| Papel | Tamanho | Peso | Tracking |
|---|---|---|---|
| display (hero) | `clamp(2.2rem, 7vw, 3.4rem)` | 800 | −0.03em |
| h1 | `clamp(1.7rem, 5vw, 2.2rem)` | 800 | −0.025em |
| h2 | `1.25rem` | 700 | −0.01em |
| corpo | `1.0625rem` (17px) / 1.6 | 500 | 0 |
| lead | `1.15rem` / 1.55 | 500 | 0 |
| rótulo | `0.75rem` | 700 | +0.08em, caixa alta |
| número de urna | `1.5rem` mono | 800 | −0.02em |

Largura de leitura: 62ch.

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
