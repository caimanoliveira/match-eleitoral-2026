const VAGAS = { senador: 2 };

export const vagas = (cargo) => VAGAS[cargo] || 1;

export const slotsVazios = (cargo, ids) =>
  Array.from({ length: Math.max(0, vagas(cargo) - ids.length) }, (_, i) => ids.length + i);
