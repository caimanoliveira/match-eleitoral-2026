"""Índice de todas as votações nominais, em JSONL, para curadoria.

Carregar os arquivos de votos da Câmara custa ~290 MB de JSON e cerca de um
minuto. Quem está curando tese precisa buscar dezenas de vezes — então isso é
feito uma vez e o resultado vira um arquivo que se lê com grep.

    python3 pipeline/indice.py        # gera .cache/indice-votacoes.jsonl
"""

import json
import re

import congresso
from fetch import CACHE
from shortlist import poder_discriminante

SAIDA = CACHE / "indice-votacoes.jsonl"


def main() -> None:
    vs, props, banc = congresso.votacoes(), congresso.proposicoes(), congresso.bancadas()

    linhas = []
    for vid, b in banc.items():
        meta = vs.get(vid)
        if not meta:
            continue
        prop = props.get(vid) or {}
        sim = sorted(p for p, d in b.items() if d["voto"] == "Sim")
        nao = sorted(p for p, d in b.items() if d["voto"] == "Não")
        linhas.append(
            {
                "id": vid,
                "data": meta["data"],
                "orgao": meta["orgao"],
                "titulo": prop.get("titulo", ""),
                "ementa": re.sub(r"\s+", " ", prop.get("ementa", ""))[:600],
                # O rito é o que foi decidido ("Mantido o texto", "Aprovada a
                # Emenda nº 3"). Sozinho não revela a direção — daí a
                # verificação humana — mas é o ponto de partida.
                "rito": re.sub(r"\s+", " ", meta["descricao"])[:400],
                "discriminante": round(poder_discriminante(b), 3),
                "dep_sim": sum(b[p]["n"] for p in sim),
                "dep_nao": sum(b[p]["n"] for p in nao),
                "sim": sim,
                "nao": nao,
                "url": f"https://www.camara.leg.br/propostas-legislativas/{vid.split('-')[0]}",
                "api": f"https://dadosabertos.camara.leg.br/api/v2/votacoes/{vid}",
            }
        )

    linhas.sort(key=lambda x: (-x["discriminante"], x["data"]))
    SAIDA.write_text(
        "\n".join(json.dumps(l, ensure_ascii=False) for l in linhas), encoding="utf-8"
    )
    print(f"{len(linhas)} votações -> {SAIDA} ({SAIDA.stat().st_size / 1024:.0f} KB)")
    print(f"discriminantes (score > 0): {sum(1 for l in linhas if l['discriminante'])}")


if __name__ == "__main__":
    main()
