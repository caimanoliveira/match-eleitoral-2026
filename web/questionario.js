const CODIGOS = new Map([[1, "c"], [0.5, "u"], [0, "n"], [-0.5, "v"], [-1, "d"]]);

export const codificarValor = (valor) => CODIGOS.get(valor);
export const decodificarValor = (codigo) =>
  [...CODIGOS].find(([, c]) => c === codigo)?.[0];
export const tesesDoModo = (teses, modo) =>
  modo === "aprofundado" ? teses : teses.filter((t) => !t.aprofundada);
