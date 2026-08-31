"""Níveis 3 e 4: plano de governo e declaração pública conferidos."""

import csv
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parent / "respostas" / "publicas.csv"
VALOR = {"concordo": "+", "discordo": "-", "neutro": "0"}
NIVEIS = {"3", "4"}


def carregar(teses_validas: set[str], arquivo: Path = ARQUIVO) -> dict[str, dict[str, tuple[str, str, str]]]:
    """SQ -> tese -> (posição, nível, URL), apenas registros conferidos."""
    if not arquivo.exists():
        return {}
    out = {}
    with open(arquivo, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            tese = (r.get("tese_id") or "").strip()
            resposta = (r.get("resposta") or "").strip().lower()
            nivel = (r.get("nivel") or "").strip()
            fonte = (r.get("fonte") or "").strip()
            conferido = (r.get("conferido_por") or "").strip()
            if tese not in teses_validas or resposta not in VALOR or nivel not in NIVEIS:
                continue
            if not conferido or not fonte.startswith(("https://", "http://")):
                continue
            por_tese = out.setdefault(r["sq_candidato"].strip(), {})
            atual = por_tese.get(tese)
            if atual and int(atual[1]) < int(nivel):
                continue
            por_tese[tese] = (VALOR[resposta], nivel, fonte)
    return out
