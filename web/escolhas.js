const VAGAS = { senador: 2 };

export const vagas = (cargo) => VAGAS[cargo] || 1;

export const slotsVazios = (cargo, ids) =>
  Array.from({ length: Math.max(0, vagas(cargo) - ids.length) }, (_, i) => ids.length + i);

export const candidatosDaChapa = (escolhido, universo) => {
  const chave = escolhido.f || escolhido.p;
  return universo.filter((c) => c.id !== escolhido.id && (c.f || c.p) === chave);
};
