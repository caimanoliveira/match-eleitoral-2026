"""Dossiê de uma votação, para confirmar o que "Sim" significou antes de
marcar uma tese como verificada.

    python3 verificar.py 345311-276
    python3 verificar.py --teses          # o que ainda falta verificar
"""

import re
import sys
import textwrap

import congresso
from fetch import get_json
from teses import carregar_todas

API = "https://dadosabertos.camara.leg.br/api/v2"


def dossie(vid: str) -> None:
    vs, props, banc = congresso.votacoes(), congresso.proposicoes(), congresso.bancadas()
    meta, prop = vs.get(vid), props.get(vid)
    if not meta:
        sys.exit(f"votação {vid} não encontrada")

    print(f"\n{'=' * 78}\nVOTAÇÃO {vid}   {meta['data']}   {meta['orgao']}\n{'=' * 78}")
    if prop:
        print(f"\nPROPOSIÇÃO: {prop['titulo']}")
        print(textwrap.fill(re.sub(r"\s+", " ", prop["ementa"]), 78, initial_indent="  ",
                            subsequent_indent="  "))
    print("\nRITO (o que foi decidido):")
    print(textwrap.fill(re.sub(r"\s+", " ", meta["descricao"]), 78, initial_indent="  ",
                        subsequent_indent="  "))

    # O objeto da votação diz o que estava em jogo — é aqui que se lê se o
    # "Sim" aprovava o destaque, o substitutivo ou o texto original.
    try:
        det = get_json(f"{API}/votacoes/{vid}", f"votacao-{vid}.json", max_age=30 * 86400)["dados"]
        for campo in ("descricao", "descUltimaAberturaVotacao", "ultimaApresentacaoProposicao"):
            v = det.get(campo)
            if isinstance(v, dict):
                v = v.get("descricao")
            if v:
                print(f"\n{campo.upper()}:")
                print(textwrap.fill(re.sub(r"\s+", " ", str(v)), 78,
                                    initial_indent="  ", subsequent_indent="  "))
        for obj in det.get("objetosPossiveis", [])[:5]:
            print(f"\n  objeto: {obj.get('siglaTipo')} {obj.get('numero')}/{obj.get('ano')}"
                  f" — {(obj.get('ementa') or '')[:160]}")
    except Exception as exc:  # noqa: BLE001 — dossiê é best-effort
        print(f"\n  (detalhe da API indisponível: {exc})")

    b = banc.get(vid, {})
    sim = sorted(p for p, d in b.items() if d["voto"] == "Sim")
    nao = sorted(p for p, d in b.items() if d["voto"] == "Não")
    print(f"\nSIM ({sum(b[p]['n'] for p in sim)} dep): {', '.join(sim)}")
    print(f"NÃO ({sum(b[p]['n'] for p in nao)} dep): {', '.join(nao)}")
    print(f"\nConfira em: https://www.camara.leg.br/votacoes/{vid}\n")


def pendentes() -> None:
    todas = carregar_todas()
    falta = [t for t in todas if not t.get("verificado")]
    print(f"{len(todas) - len(falta)}/{len(todas)} teses verificadas\n")
    for t in falta:
        print(f"  [ ] {t['id']}")
        print(f"      {t.get('nota', '(sem nota)')}")
        for v in t["votacoes"]:
            print(f"      python3 verificar.py {v['id']}")
        print()


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] == "--teses":
        pendentes()
    else:
        dossie(sys.argv[1])
