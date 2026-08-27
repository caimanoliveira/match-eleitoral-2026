"""Nível 1 da cascata: a posição declarada pelo próprio candidato.

Único nível que separa dois candidatos do mesmo partido. Lê respostas em
CSV — formato deliberadamente simples, para a coleta poder chegar por
qualquer meio (formulário, e-mail, planilha da assessoria, WhatsApp
transcrito) e ser conferida à mão antes de entrar.

Arquivo: pipeline/respostas/respostas.csv, uma linha por candidato:

    sq_candidato,tese_id,resposta,fonte,recebido_em,conferido_por
    250002541303,marco-temporal,concordo,email 2026-09-02,2026-09-02,caiman

`resposta` em {concordo, discordo, neutro}. `conferido_por` vazio = não entra:
resposta que ninguém verificou que veio da assessoria é boato com carimbo.

Nunca se infere. Se a assessoria pulou uma afirmação, aquela célula fica com
o nível 2 ou 5 — e a UI diz de onde veio.
"""

import csv
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parent / "respostas" / "respostas.csv"
VALOR = {"concordo": "+", "discordo": "-", "neutro": "0"}


def carregar(teses_validas: set[str]) -> dict[str, dict[str, str]]:
    """SQ_CANDIDATO -> {tese_id: '+'|'-'|'0'}, só respostas conferidas."""
    if not ARQUIVO.exists():
        return {}
    out: dict[str, dict[str, str]] = {}
    ignoradas = 0
    with open(ARQUIVO, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if not (r.get("conferido_por") or "").strip():
                ignoradas += 1
                continue
            tid = (r.get("tese_id") or "").strip()
            resp = (r.get("resposta") or "").strip().lower()
            if tid not in teses_validas or resp not in VALOR:
                ignoradas += 1
                continue
            out.setdefault(r["sq_candidato"].strip(), {})[tid] = VALOR[resp]
    if ignoradas:
        print(f"  survey: {ignoradas} linhas ignoradas (não conferidas ou inválidas)")
    return out


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import teses as tm
    ids = {t["id"] for t in tm.carregar()}
    d = carregar(ids)
    print(f"{len(d)} candidatos com resposta própria conferida")
    for sq, r in list(d.items())[:5]:
        print(f"  {sq}: {len(r)} afirmações")
