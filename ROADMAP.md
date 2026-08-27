# O que fazer a seguir

Escrito em 27/08/2026. Eleição em **04/10/2026** — restam ~5 semanas.

## Onde o projeto está

34 afirmações verificadas, 19.867 candidatos, 85% com alguma evidência de
posição, 568 com voto nominal próprio. Site estático, sem backend, testado no
celular em 390px e 320px.

Dois reviews adversariais rodaram — 5 lentes sobre o código e 4 sobre a própria
reescrita —, com cada achado reproduzido por um segundo agente antes de entrar.
62 achados confirmados, 48 defeitos distintos corrigidos. Vale registrar que o
segundo review existiu porque o primeiro me fez reescrever `app.js` inteiro, e
a reescrita introduziu regressões próprias: uma delas reintroduziu, no mesmo
commit que dizia corrigi-lo, o bug de cache que o carimbo existe para impedir.

## O diagnóstico que importa

Medindo o ranking de deputado federal em SP com um perfil ideológico definido:
**63 candidatos empatam no topo, 25 dos 30 primeiros são de um único partido, e
nenhum deles tem voto próprio.**

Isso não é bug — é o limite da evidência disponível. Dos cinco níveis da cascata,
só dois rodam:

| Nível | Fonte | Estado |
|---|---|---|
| 1 | Questionário respondido pelo candidato | **não existe** |
| 2 | Voto nominal do próprio candidato | roda — 568 candidatos |
| 3 | Plano de governo registrado no TSE | **não existe** |
| 4 | Declaração pública | **não existe** |
| 5 | Posição da bancada do partido | roda — cobre o resto |

A consequência é que, para ~97% dos candidatos, o site ordena **partidos** e
sorteia dentro. A interface diz isso com todas as letras, o que é honesto, mas
não resolve.

**Daí a prioridade contraintuitiva: acrescentar afirmações tem retorno
decrescente; acrescentar níveis de evidência tem retorno crescente.** Uma 35ª
tese não distingue dois candidatos do mesmo partido — nada no nível 5 distingue.
Só os níveis 1, 3 e 4 distinguem.

---

## 1. Coesão da bancada (barato, alto valor, dá para fazer já)

`congresso.bancadas()` já calcula a coesão de cada bancada em cada votação, e o
build **joga fora**. Medindo nas 34 teses, sobre 622 pares (partido × tese):

| Coesão | Pares |
|---|---|
| 100% | 268 |
| 90–99% | 123 |
| 70–89% | 141 |
| **abaixo de 70%** | **90 (14,5%)** |

Ou seja: **em 14,5% dos casos a posição herdada vem de uma bancada rachada**, e o
site a apresenta com a mesma firmeza de uma votação unânime. Um candidato do PP
recebe "seu partido é contra" quando 45% da bancada votou a favor.

O que fazer: gravar a coesão junto da posição, exibir na quebra por tese
("PL votou Não, com 94% da bancada"), e quando ela for baixa dizer que a
inferência é fraca — ou não atribuir posição. Custo: uma tarde. É a melhor
relação valor/esforço que sobrou.

## 2. Senado (médio esforço, desbloqueia os cargos majoritários)

`legis.senado.leg.br` responde normalmente e **fica fora do WAF que bloqueia o
TSE**. São 81 senadores em exercício, e boa parte dos 527 candidatos a
presidente, governador e senador ou é senador hoje ou foi.

Hoje esses candidatos só têm evidência se passaram pela Câmara na legislatura 57
— é assim que Marina Silva, Ricardo Salles e Guilherme Derrite têm voto próprio.
Quem veio pelo Senado não tem nada.

O que fazer: espelhar o modelo de `congresso.py` para o Senado, casar por CPF
como já se faz com a Câmara, e vincular as teses existentes às votações
equivalentes no Senado (a maioria dos projetos passou pelas duas casas).

## 3. Questionário ao candidato (o que de fato resolve, e o mais caro)

É o único nível que distingue dois candidatos do mesmo partido. Padrão
Wahl-O-Mat e smartvote.

O obstáculo é operacional, não técnico: o TSE marca `DS_EMAIL` como "NÃO
DIVULGÁVEL" para a maioria. Caminhos reais de contato: as redes sociais que a
API da Câmara devolve em `/deputados/{id}` (`redeSocial`), assessorias de
bancada, e imprensa.

Com 5 semanas, cobrir 19.867 candidatos é fantasia. Cobrir os ~527 majoritários
e os deputados federais em exercício que disputam reeleição é realista, e é onde
o eleitor mais olha. `pipeline/survey.py` (previsto no plano original, nunca
escrito) leria um CSV de respostas — formato simples, para a coleta poder
acontecer por qualquer meio.

## 4. Espelho dos dados do TSE (impede o projeto de congelar)

O CDN do TSE bloqueia por IP quando o volume sobe, e o bloqueio pega o domínio
inteiro — aconteceu durante o desenvolvimento e ainda está ativo. `fetch.py` já
não repete 4xx e cai no cache com aviso de idade, mas isso só adia o problema.

Candidatura muda até a véspera: indeferimento, renúncia, substituição. Um site
que não atualiza vai mandar gente votar em quem saiu da disputa. Sem espelho
próprio do `consulta_cand`, não há rebuild diário.

## 5. Revisão humana das 34 afirmações (antes de qualquer divulgação)

As 34 foram levantadas e verificadas por agentes. A verificação foi séria —
derrubou 11 de 43, incluindo uma que chamava fuzil de "arma de uso proibido"
(é de uso restrito) e outra cujo corte partidário se repetia idêntico em 85
votações de assunto alheio. Mas **nenhuma pessoa leu as 34.**

Numa ferramenta eleitoral, uma afirmação com a direção invertida entrega ao
eleitor exatamente o candidato oposto ao que ele quis, e isso vira notícia, não
bug. Cada afirmação tem em `theses.toml` a votação, a nota do verificador e o
link para o portal da Câmara. Ler as 34 leva umas duas horas.

## 6. Botão voltar do navegador (adiado de propósito)

Dentro da app, o voltar do celular ainda sai do site em vez de recuar uma tela.
O roteador de `hashchange` já existe, mas as trocas de tela usam
`replaceState`, então há uma entrada de histórico só.

A correção é `pushState` nas trocas de tela mantendo `replaceState` na gravação
a cada resposta. Não fiz porque o roteador acabou de nascer e um review já
alertou para o risco de laço de re-render (rotear → telaX → salvarNaURL →
hashchange → rotear). Severidade baixa, risco desproporcional na véspera —
merece ser feito com calma e com teste próprio.

## 7. Publicar (decisão, não tarefa)

O repositório é público; o site não está no ar. GitHub Pages serve a raiz ou
`/docs`, não `/web` — precisa de uma Action ou de reestruturação.

Antes de publicar, além do item 5: decidir se o projeto assina como veículo
independente, quem responde por ele, e como recebe contestação de candidato. A
página de metodologia já promete correção com histórico público; alguém precisa
existir do outro lado dessa promessa.

---

## Ideias que não entraram, e por quê

**Mais afirmações.** Retorno decrescente, pelo motivo do diagnóstico. Só vale
depois que os níveis 1/3/4 existirem — aí cada nova tese distingue pessoas.

**Derivar os eixos por PCA das votações.** No Congresso brasileiro o primeiro
componente de roll-call é governismo, não ideologia; o mapa mudaria de
significado a cada troca de governo. Os pesos curados à mão ficam.

**Plano de governo (nível 3).** Parece óbvio, mas só existe para cargos
majoritários — exatamente onde a cobertura já é boa (Lula, Flávio, Zema, Caiado,
Haddad, Tarcísio, Salles, Tebet e Marina já têm 34 temas). Os que faltam ali são
de partidos sem bancada, e para eles o plano de governo resolveria — mas são
poucos votos. Fica atrás do Senado e do questionário.

**Assembleias legislativas.** Daria voto próprio a deputados estaduais em
reeleição, que é a maior lacuna em número de candidatos. Mas são 27 sistemas
diferentes, quase todos sem API. Esforço alto, prazo curto.
