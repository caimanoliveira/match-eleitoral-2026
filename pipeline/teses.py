"""Leitura e validação de theses.toml."""

import tomllib
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parent.parent / "theses.toml"
ESFERAS = {"federal", "estadual", "ambas"}


def carregar_todas() -> list[dict]:
    """Todas as teses, verificadas ou não."""
    with open(ARQUIVO, "rb") as f:
        teses = tomllib.load(f)["tese"]

    vistos = set()
    for t in teses:
        for campo in ("id", "texto", "esfera", "eixo", "votacoes"):
            if campo not in t:
                raise ValueError(f"tese {t.get('id', '?')}: falta '{campo}'")
        if t["id"] in vistos:
            raise ValueError(f"tese {t['id']}: id duplicado")
        vistos.add(t["id"])
        if t["esfera"] not in ESFERAS:
            raise ValueError(f"tese {t['id']}: esfera inválida {t['esfera']!r}")
        for eixo in ("economico", "social"):
            v = t["eixo"].get(eixo)
            if not isinstance(v, (int, float)) or not -1 <= v <= 1:
                raise ValueError(f"tese {t['id']}: eixo.{eixo} deve estar entre -1 e 1")
        for v in t["votacoes"]:
            if v.get("direcao") not in (1, -1):
                raise ValueError(f"tese {t['id']}: direcao deve ser 1 ou -1")
    return teses


def carregar() -> list[dict]:
    """Só as teses verificadas — as que podem ir ao ar.

    Uma tese com a direção invertida entrega ao eleitor o candidato oposto ao
    que ele quis. Por isso o padrão é excluir, não incluir.
    """
    return [t for t in carregar_todas() if t.get("verificado")]


if __name__ == "__main__":
    todas = carregar_todas()
    ok = carregar()
    print(f"{len(todas)} teses no arquivo, {len(ok)} verificadas")
    for t in todas:
        marca = "ok " if t.get("verificado") else "PEND"
        print(f"  [{marca}] {t['id']:<38} {t['esfera']:<9} "
              f"econ={t['eixo']['economico']:+.1f} soc={t['eixo']['social']:+.1f}")
