# Agentes do projeto

## Divisão de trabalho

- Codex é o implementador principal.
- Use `gpt-5.6-terra` no trabalho cotidiano.
- Suba para `gpt-5.6-sol` apenas em arquitetura, bugs difíceis ou mudanças amplas.
- Use `gpt-5.6-luna` apenas em tarefas mecânicas, repetitivas e de baixo risco.
- Claude Code é o revisor padrão com `sonnet`.
- Use `opus` apenas em investigação difícil ou revisão crítica final.

Um agente implementa e o outro revisa. Não edite o mesmo escopo simultaneamente em
dois agentes. Antes de alterar código, leia `MASTER.md` e as instruções mais específicas
do diretório afetado.

## Handoff por falta de contexto

Não existe um contador confiável de tokens restantes. Faça handoff preventivo quando
houver aviso de compactação, perda perceptível de contexto ou quando a próxima etapa não
couber com implementação e validação completas.

Antes do handoff:

1. Atualize `HANDOFF.md` sem apagar informação ainda relevante.
2. Registre objetivo, estado, decisões, arquivos alterados, validação, riscos e próxima ação.
3. Salve o trabalho em estado executável sempre que possível.
4. Transfira ao outro agente pelo Orca e pare; não continue editando em paralelo.

No Orca, prefira um terminal do outro agente no worktree atual. Leia primeiro a referência
atual com `orca skills get orca-cli`; a sintaxe da CLI pode mudar. Se não houver terminal
do destinatário, crie um com o modelo padrão deste arquivo e envie um prompt mandando ler
`AGENTS.md`, `MASTER.md` e `HANDOFF.md` antes de continuar.

