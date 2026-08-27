"""Ferramenta de curadoria: rankeia votações por poder discriminante.

Uma votação 490x10 não separa candidato nenhum — não serve como tese. O que
serve é votação com quórum alto, placar dividido e partidos em lados opostos.
Este script não entra no build; é o que se lê para escrever `theses.toml`.

    python3 shortlist.py                 # top 40
    python3 shortlist.py --busca aborto  # filtra por palavra na ementa
    python3 shortlist.py --n 100
"""

import argparse
import re

import congresso


def poder_discriminante(bancada: dict) -> float:
    """0 = todos os partidos do mesmo lado; 1 = partidos rachados meio a meio,
    cada um votando coeso."""
    sim = [p for p, d in bancada.items() if d["voto"] == "Sim"]
    nao = [p for p, d in bancada.items() if d["voto"] == "Não"]
    if len(sim) + len(nao) < 8:  # cobertura partidária baixa demais
        return 0.0
    dep_sim = sum(bancada[p]["n"] for p in sim)
    dep_nao = sum(bancada[p]["n"] for p in nao)
    if dep_sim + dep_nao < 300:  # quórum de rito, não de mérito
        return 0.0

    equilibrio = 2 * min(dep_sim, dep_nao) / (dep_sim + dep_nao)
    coesao = sum(d["coesao"] for d in bancada.values()) / len(bancada)
    return equilibrio * coesao


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--busca", default=None, help="palavra na ementa, no título ou no rito")
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument(
        "--todas",
        action="store_true",
        help="ignora o filtro discriminante. Necessário ao buscar por tema: o nome "
        "jornalístico ('marco temporal', 'saidinha') não aparece na ementa legal, e "
        "a votação relevante pode ter sido folgada.",
    )
    args = ap.parse_args()

    vs, props, bancadas = congresso.votacoes(), congresso.proposicoes(), congresso.bancadas()

    linhas = []
    for vid, banc in bancadas.items():
        meta, prop = vs.get(vid), props.get(vid)
        if not meta or not prop:
            continue
        score = poder_discriminante(banc)
        if not score and not args.todas:
            continue
        texto = f"{prop['titulo']} {prop['ementa']} {meta['descricao']}"
        if args.busca and args.busca.lower() not in texto.lower():
            continue
        if args.todas and not score:
            # sem score, ordena por quórum — votação esvaziada informa pouco
            score = sum(d["n"] for d in banc.values()) / 100_000
        linhas.append((score, vid, meta, prop, banc))

    linhas.sort(reverse=True, key=lambda x: x[0])
    print(f"{len(linhas)} votações discriminantes\n")
    for score, vid, meta, prop, banc in linhas[: args.n]:
        sim = sorted(p for p, d in banc.items() if d["voto"] == "Sim")
        nao = sorted(p for p, d in banc.items() if d["voto"] == "Não")
        print(f'[{score:.2f}] id = "{vid}"   {meta["data"]}   {prop["titulo"]}')
        print(f'       {re.sub(r"\\s+", " ", prop["ementa"])[:220]}')
        print(f'       rito: {re.sub(r"\\s+", " ", meta["descricao"])[:150]}')
        print(f"       SIM ({sum(banc[p]['n'] for p in sim)} dep): {', '.join(sim)}")
        print(f"       NÃO ({sum(banc[p]['n'] for p in nao)} dep): {', '.join(nao)}\n")


if __name__ == "__main__":
    main()
