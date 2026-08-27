# Respostas das campanhas — estratégia

Escrito em 28/08/2026. Eleição em 04/10.

## O problema, medido

O TSE marca `DS_EMAIL` como "NÃO DIVULGÁVEL" para **todos os 19.867
candidatos**. E-mail em massa não existe como opção. Canal direto só há para
os **575 que são deputados em exercício** (e-mail institucional da Câmara), o
que é 3% do total — mas é 100% de quem disputa reeleição à Câmara, que é onde
o eleitor mais precisa de ajuda.

## A estratégia: puxão, não empurrão

Não dá para chegar a 19.867 campanhas. Dá para fazer com que **elas cheguem
até nós**:

1. **Todo card de candidato tem o botão "É da campanha? Responda pelo
   candidato".** Assessoria olha o próprio candidato no site — sempre olha —,
   vê "posição do partido, não deste candidato", e tem a saída a um toque. O
   incentivo é dela: responder é a única forma de o percentual virar *dele*.

2. **Disparo para os 575 deputados** pelo e-mail institucional. É o único
   canal que existe, e é o grupo de maior alavancagem: quem responde ganha
   nível 1, e o exemplo puxa os colegas de bancada.

3. **Partidos.** 30 partidos, cada um com secretaria de comunicação. Um e-mail
   por partido pedindo que repassem o link às campanhas. Custo: 30 e-mails.
   Alcance potencial: todos.

4. **O eleitor como emissário.** Quando o eleitor vê "idêntica à de outros 46
   do PL", há um botão de compartilhar o card. Ele manda para a campanha
   perguntando "por que você não respondeu?". É o mecanismo do Wahl-O-Mat:
   campanha que não responde parece que tem o que esconder.

## O formulário

`web/responder.html#SQ_CANDIDATO`. Estático, sem backend: as 34 afirmações,
três botões cada, nome e e-mail da campanha, e um botão que abre o programa
de e-mail com as respostas já escritas, para `respostas@colinha.app.br`.

Por que `mailto:` e não um formulário que grava: (a) não há backend e não
vai haver; (b) o e-mail vindo do domínio da campanha É a verificação —
formulário anônimo aceita qualquer um respondendo por qualquer candidato;
(c) a campanha vê exatamente o que está mandando.

## Recebimento e publicação

1. Chega e-mail. Confere-se que o remetente é plausível para aquela campanha
   (domínio do partido, e-mail institucional, ou resposta a um contato
   anterior). Na dúvida, responde-se pedindo confirmação por outro canal.
2. Transcreve-se para `respostas.csv`, com `conferido_por` preenchido.
   **Linha sem `conferido_por` não entra no build** — `survey.py` ignora.
3. Commit com mensagem "Respostas: NOME (PARTIDO-UF), N afirmações". O
   histórico é público; a campanha pode conferir o que foi publicado.
4. O rebuild diário publica. O card passa a mostrar "declarado pelo candidato".

Correções seguem o mesmo caminho: novo e-mail, nova linha, novo commit.

## O e-mail de disparo

Assunto: **Seu percentual no Colinha vem do partido. Quer que venha de você?**

> Olá, equipe de [NOME].
>
> O Colinha (colinha.app.br) é um site independente que compara as posições
> do eleitor com as dos candidatos, a partir de votações nominais da Câmara.
> Hoje [NOME] aparece com voto próprio em N temas e, nos demais, com a
> posição da bancada do [PARTIDO].
>
> A campanha pode responder diretamente às 34 afirmações. As respostas
> aparecem como "declarado pelo candidato", com prioridade sobre tudo o mais,
> e o histórico fica público. Leva uns 10 minutos:
>
> [LINK]
>
> Não somos ligados a partido, candidatura, governo, nem ao TSE. A
> metodologia está em colinha.app.br/metodologia.html.
>
> — Colinha

O `[LINK]` é `responder.html#SQ`, individual por candidato. A lista com
e-mail, SQ e link está em `disparo-deputados.csv`.

## O que precisa existir antes do disparo

- A caixa `respostas@colinha.app.br`. Sem ela, o `mailto:` cai no vazio.
  (Domínio ainda não registrado — é o primeiro passo.)
- Uma pessoa lendo essa caixa e transcrevendo. É trabalho humano; não há
  como automatizar a verificação sem virar o formulário anônimo que se
  rejeitou acima.
- O disparo em si: 575 e-mails individuais, com link único. Ferramenta de
  mala direta ou script — mas **de uma conta de e-mail real, com SPF/DKIM**,
  senão vai para o spam de todo mundo.

## O que NÃO fazer

- Não mandar para e-mail pessoal de candidato obtido por fora (redes,
  vazamento). Só canal institucional ou público.
- Não publicar resposta sem conferir o remetente. Um adversário respondendo
  pelo candidato é o pior cenário possível — e é trivial de tentar.
- Não inferir posição a partir de resposta parcial.
