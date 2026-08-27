# Match Eleitoral 2026

Quiz que compara as posições do eleitor com as dos candidatos às eleições de
**4 de outubro de 2026**, e devolve uma colinha para levar à urna.

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

## Rebuild diário

`.github/workflows/rebuild.yml` roda às 06:17 (Brasília) num runner limpo do
GitHub, refaz `web/data/` e commita se mudou. Três travas impedem publicar
dado ruim:

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
- Logos de partido: `web/partidos/{SIGLA}.svg` se alguém obtiver autorização de
  uso. Sem o arquivo, o selo cai no número de urna sobre a cor do partido.
