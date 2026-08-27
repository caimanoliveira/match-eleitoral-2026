Logos partidários entram aqui como `{SIGLA}.svg` — por exemplo `PT.svg`,
`UNIÃO.svg` — e a sigla precisa ser listada em `logos.json`:

    ["PT", "UNIÃO", "PL"]

Sem `logos.json` o site não faz requisição nenhuma por logo. Isso é deliberado:
sondar cada arquivo disparava um 404 por candidato da lista, e a lista é
redesenhada a cada tecla da busca.

O repositório não distribui os arquivos: são marcas registradas dos partidos, e
redistribuí-las exige avaliação de uso próprio. Sem o logo, `partidos.js` cai no
número de urna sobre a cor do partido, que é a informação que o eleitor usa na
urna de qualquer forma.
