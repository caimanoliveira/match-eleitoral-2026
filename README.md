# Colinha

Vá votar, e vá sabendo em quem. Compara as posições do eleitor com as dos
candidatos às eleições de **4 de outubro de 2026** e devolve a colinha com os
números para digitar na urna.

O diferencial não é o presidente — é o deputado. Cobrimos os **19.867 candidatos
votáveis**, incluindo deputado federal e estadual, que é onde o eleitor decide
no escuro.

Estado atual: **34 afirmações verificadas**, 85% dos candidatos com alguma
evidência de posição, 611 com voto nominal próprio na Câmara ou no Senado.

## Rodar

```sh
python3 -m http.server 8000     # abrir http://localhost:8000/web/index.html
npm test                        # fórmula do match + integridade dos dados
```

Os dados já vêm no repositório (`web/data/`), então o site roda sem build.
Para regerar a partir das fontes:

```sh
python3 pipeline/build.py       # baixa TSE + Câmara, aplica a cascata
```

Sem dependências: Python só de stdlib (`urllib`, `tomllib`, `csv`, `zipfile`),
front em ES modules sem bundler.

## Publicar

`web/` é autocontido — publique **essa pasta** como raiz do site (GitHub Pages,
Cloudflare Pages, Netlify). Não publique a raiz do repositório: exporia
`pipeline/` e `.cache/`.

## Onde está o quê

| Caminho | O que é |
|---|---|
| `theses.toml` | as afirmações do quiz e a votação vinculada a cada uma — o coração editorial |
| `pipeline/indice.py` | dump de todas as votações nominais em JSONL, para curadoria com grep |
| `pipeline/shortlist.py` | acha votações que discriminam partidos (`--busca`, `--todas`) |
| `pipeline/verificar.py` | dossiê de uma votação, para confirmar o que "Sim" significou |
| `pipeline/build.py` | aplica a cascata de evidência e gera `web/data/` |
| `web/match.js` | o cálculo, testado em `tests/match.test.js` |
| `web/metodologia.html` | como tudo funciona, em português, para o leitor |

## Regras que o projeto se impôs

- **Tese não verificada não vai ao ar.** A descrição oficial de uma votação diz
  "Mantido o texto", não o que o texto dizia. Inverter uma tese entrega ao eleitor
  o candidato oposto ao que ele quis. `build.py` descarta tese sem `verificado = true`.
- **Fonte inferida nunca se disfarça de declarada.** A lista avisa quando o
  percentual veio da bancada do partido e é idêntico para todos os colegas de
  legenda — nesses casos o ranking ordena partidos, não pessoas.
- **Número de urna nunca é inferido.** 43 números estão registrados para duas
  candidaturas (substituição pendente no TSE). Não escolhemos qual vale: marcamos
  em vermelho na lista e dentro do PNG da colinha.
- **Nada de LLM em runtime.** A Res. TSE 23.755/2026 §1º-C proíbe provedor de
  sistema de IA de ranquear ou recomendar candidaturas, mesmo a pedido do usuário.
  LLM só na etapa offline de extração, com revisão humana; o browser faz aritmética.
- **Nenhuma resposta do eleitor é coletada.** Sem backend, sem cookie, sem
  agregado publicado — o que também mantém o projeto fora do enquadramento de
  pesquisa eleitoral (Res. TSE 23.600).

## Fontes

- Candidaturas: [dados abertos do TSE](https://dadosabertos.tse.jus.br), `consulta_cand_2026`
- Votações nominais, votos e orientações: [dados abertos da Câmara](https://dadosabertos.camara.leg.br)
- Votações nominais do Senado: [dados abertos do Senado](https://legis.senado.leg.br/dadosabertos), endpoint `/votacao?ano=`

Join TSE ↔ Câmara por CPF, exposto em `/deputados/{id}`. Join TSE ↔ Senado por
nome completo normalizado (a API do Senado não expõe CPF); só entra quando casa
com exatamente um candidato.

## Site no ar

**https://colinha.app.br** (enquanto o DNS não propaga:
https://caimanoliveira.github.io/match-eleitoral-2026/)

Registro.br, R$ 40/ano. O domínio é servido pelo GitHub Pages via `web/CNAME`.
No painel de DNS do Registro.br, criar:

```
colinha.app.br.      A      185.199.108.153
colinha.app.br.      A      185.199.109.153
colinha.app.br.      A      185.199.110.153
colinha.app.br.      A      185.199.111.153
www.colinha.app.br.  CNAME  caimanoliveira.github.io.
```

Depois, em Settings → Pages do repositório, marcar "Enforce HTTPS" (o
certificado leva alguns minutos para emitir após o DNS propagar).

**E-mail do projeto.** `respostas@colinha.app.br` recebe as respostas das
campanhas (é o destino do formulário `responder.html`). Não precisa de
provedor de e-mail, só de encaminhamento: o Registro.br **não** faz isso (só
redireciona URL), então usa-se o ImprovMX (improvmx.com, grátis para um
domínio). Lá, alias `respostas` → o Gmail pessoal de quem opera o projeto, e
na zona DNS do Registro.br:

```
colinha.app.br.  MX   10 mx1.improvmx.com.
colinha.app.br.  MX   20 mx2.improvmx.com.
colinha.app.br.  TXT  "v=spf1 include:spf.improvmx.com ~all"
```

O disparo às campanhas sai do Gmail — ver `pipeline/respostas/EMAIL.md`.

Publicado pelo próprio rebuild diário (abaixo). As fotos dos candidatos (~70 MB,
dataset oficial do TSE) não ficam no repositório: só existem no runner que as
baixou, então o Pages é gerado pelo mesmo run — publicar num workflow separado
subiria o site sem fotos. `publicar.yml` cobre um push manual em `web/` (CSS,
texto) e baixa as fotos antes, pelo cache.

## Rebuild diário

`.github/workflows/rebuild.yml` roda às 06:17 (Brasília) num runner limpo do
GitHub, refaz `web/data/` e `web/fotos/`, commita os dados se mudaram e
publica o site. Três travas impedem publicar dado ruim:

- `--exigir-tse-fresco 12`: se a lista do TSE tiver mais de 12 h, o job falha
  sem escrever nada. O commit anterior fica valendo — e ele já declara ao
  eleitor a data real da fonte (`meta.json: fonte_tse_em`).
- Votações do Senado listadas em `theses.toml` precisam existir no build;
  senão, não publica. Evita que os 8 governadores-senadores regridam a "só a
  bancada" em silêncio.
- Nenhum CPF pode aparecer em `web/data/` (checado a cada run).

**O que cada fonte faz com IP de datacenter**, medido nos primeiros runs: o
CDN do TSE bloqueia por IP quando o volume sobe (pegou a máquina de
desenvolvimento por dias); a Câmara entrega, mas corta conexões longas
(`IncompleteRead`, com retry); o Senado estoura timeout repetidamente em
JSONs de 2 MB que respondem em 0,5 s de uma conexão doméstica. Por isso
`pipeline/semente/` versiona os JSONs do Senado — um runner limpo nunca
depende do Senado ao vivo — e `.cache/` da Câmara é preservado entre runs
pelo `actions/cache`.

## O que falta

- Níveis 1, 3 e 4 da cascata: questionário ao candidato, plano de governo
  registrado no TSE, declarações públicas. Hoje só rodam os níveis 2 e 5.
- 5 afirmações rejeitadas na verificação, marcadas como recuperáveis com o texto
  reescrito — ver as notas em `theses.toml` e o histórico de curadoria.
- Logos de partido: o site aponta para o `urlLogo` da API oficial da Câmara —
  não copia nem redistribui. Cobre 12 dos 22 partidos com bancada; PL, MDB,
  NOVO, REPUBLICANOS e UNIÃO estão entre os que a Câmara não serve, e ficam
  com o selo do número de urna.
