# E-mail às campanhas — pronto para disparar

Remetente: **Caiman Oliveira**, do seu Gmail pessoal. Ferramenta: o **Mail
Merge nativo do Gmail** (Google Sheets → Gmail, "Enviar e-mail em massa" no
menu ⋮ do rascunho; disponível em contas pessoais desde 2023, sem extensão).

Campos da planilha (`disparo-deputados.csv`, importar no Sheets): `email`,
`nome`, `primeiro_nome`, `partido`, `uf`, `cargo`, `numero`, `temas_proprios`,
`temas_partido`, `link_responder`, `lote`, `gancho`.

## Limite do Gmail pessoal

~500 e-mails por dia. São 495 destinatários: **cabe, mas sem margem**, e se o
Gmail bloquear no meio você fica com metade enviada e a conta travada por 24h.
Por isso a coluna `lote`: filtre `lote = 1` no dia 1 (250) e `lote = 2` no dia
2 (245). Dois dias, zero risco.

## Assunto

```
Seu percentual no Colinha vem do partido. Quer que venha de você?
```

## Corpo

```
Olá, equipe de {{primeiro_nome}}.

Me chamo Caiman Oliveira e criei o Colinha (colinha.app.br), um site
independente que ajuda o eleitor a escolher em quem votar comparando as
posições dele com as de cada candidato — a partir de votações nominais da
Câmara e do Senado, com link para cada uma.

{{gancho}}

A campanha pode mudar isso respondendo diretamente às 34 afirmações. As
respostas aparecem como "declarado pelo candidato", com prioridade sobre
tudo o mais, e o histórico fica público. Leva uns dez minutos, e o link já
vem com o candidato certo:

{{link_responder}}

Duas coisas para deixar claras. Não somos ligados a partido, candidatura,
governo, nem ao TSE — é um projeto independente, a metodologia está toda em
colinha.app.br/metodologia.html. E não há nada a pagar: o site é gratuito
para o eleitor e para a campanha.

Se preferir responder por este e-mail mesmo, ou tiver qualquer dúvida sobre
como o percentual é calculado, é só responder aqui.

Caiman Oliveira
colinha.app.br
```

Por que este texto e não outro:

- **Abre com o número dele, e o argumento muda com o número.** A coluna
  `gancho` já vem escrita por faixa (o merge do Gmail não tem condicional):
  - **≥ 25 temas com voto próprio** (a maioria: mediana 27): o incentivo não
    é "o partido fala por você" — é "o site mostra como você votou; se foi
    acordo de bancada ou você mudou, só respondendo dá para dizer".
  - **1–24**: "nos outros N o site usa o partido, e diz isso ao eleitor".
  - **0** (suplentes recém-empossados): "seu percentual é idêntico ao de
    todo colega de partido".
- **"Não há nada a pagar"** antes que perguntem. Assessoria recebe oferta
  paga todo dia; a primeira suspeita é essa.
- **"Não somos ligados ao TSE"** porque o site tem uma urna eletrônica no
  hero e usa dados do TSE. Sem isso, alguém acha que é oficial e alguém acha
  que é golpe.
- Sem pedir divulgação. Se a campanha achar o site justo, ela divulga sozinha
  — e "muita gente usou" é a meta. Pedir soa a troca.

## Antes de apertar enviar

1. `colinha.app.br` registrado e o site respondendo nele (senão o link do
   e-mail é um 404, e não há segunda chance de primeira impressão).
2. `respostas@colinha.app.br` redirecionando para o seu Gmail — via ImprovMX
   (grátis; registros MX/TXT no README). O formulário do site manda para
   esse endereço. Teste mandando um e-mail para ele antes do disparo.
3. Mandar **um e-mail de teste para você mesmo** pelo merge, abrir no celular,
   clicar no link, e ver a página do candidato carregar com o nome certo.
4. Lote 1 num dia útil de manhã (terça a quinta, 9h–11h: assessoria lê
   e-mail de manhã e a semana ainda tem tempo para responder).

## Depois de disparar

- Respostas chegam no seu Gmail, pelo `responder.html` (assunto começa com
  `[Colinha] Respostas —`) ou como reply.
- Para cada uma: conferir que o remetente é plausível para aquela campanha
  (domínio do partido, e-mail institucional, ou reply ao seu próprio
  disparo). Na dúvida, responder pedindo confirmação.
- Transcrever para `respostas.csv` com `conferido_por` preenchido, commitar,
  e o rebuild das 6h publica. O card passa a mostrar "declarado pelo
  candidato".
- Uma semana depois, **um** lembrete só para quem não respondeu — e nunca um
  terceiro. Assessoria que recebeu dois e não respondeu, decidiu.
