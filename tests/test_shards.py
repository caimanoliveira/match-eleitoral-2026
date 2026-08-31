"""Integridade dos shards gerados. Roda depois de `python3 pipeline/build.py`.

    python3 tests/test_shards.py

Sem framework: são asserts sobre os arquivos que o site consome. O que se quer
pegar aqui é dessincronia entre theses.json e as strings pos/src — um shard
gerado com um número de teses diferente do atual faria o site ler a posição de
uma tese no lugar de outra, silenciosamente.
"""

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "web" / "data"
sys.path.insert(0, str(RAIZ / "pipeline"))

POSICOES = set("+-0?")
NIVEIS = set("12345?")  # níveis da cascata em uso + sem dado


def main() -> None:
    if not DATA.exists():
        sys.exit("web/data/ não existe — rode `python3 pipeline/build.py` antes")

    arquivo = json.loads((DATA / "teses.json").read_text(encoding="utf-8"))
    teses = arquivo["teses"]
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    n = len(teses)
    assert arquivo["versao"] == meta["versao_teses"], (
        "versao do conjunto de teses diverge entre teses.json e meta.json"
    )
    assert n, "nenhuma tese publicada"
    assert meta["teses"] == n, f"meta.json diz {meta['teses']} teses, teses.json tem {n}"

    ids_tese = [t["id"] for t in teses]
    assert len(set(ids_tese)) == n, "id de tese duplicado"
    for t in teses:
        assert t["texto"].strip(), f"tese {t['id']} sem texto"
        assert t["fontes"], f"tese {t['id']} sem votação de origem"
        for eixo in ("economico", "social"):
            assert -1 <= t["eixo"][eixo] <= 1, f"tese {t['id']}: eixo {eixo} fora de -1..1"

    shards = sorted(p for p in DATA.glob("*.json")
                    if p.stem not in {"teses", "partidos", "meta"})
    assert shards, "nenhum shard de candidato"

    total, vistos, com_evidencia = 0, set(), 0
    for shard in shards:
        candidatos = json.loads(shard.read_text(encoding="utf-8"))
        assert candidatos, f"{shard.name} vazio"
        numeros_vistos: set = set()
        for c in candidatos:
            total += 1
            assert c["id"] not in vistos, f"candidato {c['id']} em mais de um shard"
            vistos.add(c["id"])

            # O alinhamento posicional é o ponto frágil de toda a codificação.
            assert len(c["pos"]) == n, (
                f"{shard.name}/{c['id']}: pos tem {len(c['pos'])} chars, "
                f"esperado {n} — shard desatualizado em relação a teses.json"
            )
            assert len(c["src"]) == n, f"{shard.name}/{c['id']}: src fora de sincronia"
            assert set(c["pos"]) <= POSICOES, f"{shard.name}/{c['id']}: pos inválido"
            assert set(c["src"]) <= NIVEIS, f"{shard.name}/{c['id']}: src inválido"
            for i, nivel in enumerate(c["src"]):
                if nivel in "34":
                    assert (c.get("ref") or {}).get(str(i), "").startswith("http"), (
                        f"{shard.name}/{c['id']}: fonte pública sem URL na tese {i}"
                    )

            # Posição e fonte têm de existir juntas: uma sem a outra vira
            # afirmação sem procedência na tela.
            for p, s in zip(c["pos"], c["src"]):
                assert (p == "?") == (s == "?"), (
                    f"{shard.name}/{c['id']}: posição e fonte discordam ({p!r},{s!r})"
                )

            assert c["num"].isdigit(), f"{shard.name}/{c['id']}: número de urna inválido"
            # Registro substituído do TSE aparecendo duas vezes no mesmo cargo
            # colocaria a mesma pessoa duas vezes no ranking.
            # Número repetido na mesma disputa é estado real do TSE durante
            # substituição de candidato — mas então TEM de estar sinalizado,
            # senão a colinha manda o eleitor digitar um número ambíguo.
            if c["num"] in numeros_vistos:
                assert c.get("numDisputado"), (
                    f"{shard.name}: nº {c['num']} repetido sem marca numDisputado"
                )
            numeros_vistos.add(c["num"])
            assert c["n"].strip(), f"{shard.name}/{c['id']}: sem nome de urna"
            if set(c["src"]) != {"?"}:
                com_evidencia += 1

    import tse

    # offline: o teste confere os shards contra o mesmo insumo que os gerou,
    # sem gastar requisição no TSE.
    esperado = len(tse.candidatos(offline=True))
    assert total == esperado, f"{total} candidatos nos shards, {esperado} no TSE"

    # Coerência mapa × ranking: quem responde exatamente como a bancada tem
    # de ver o candidato dessa bancada em 100%. Pegou um bug real (29/08):
    # o quiz rápido passava um subconjunto de teses e o match lia posições
    # desalinhadas. Aqui a conta é a mesma do web/match.js.
    bancadas = json.loads((DATA / "partidos.json").read_text(encoding="utf-8"))
    valor = {"+": 1, "-": -1, "0": 0}
    presidentes = json.loads((DATA / "presidente-BR.json").read_text(encoding="utf-8"))
    conferidos = 0
    for c in presidentes:
        if set(c["src"]) - {"5", "?"}:
            continue  # tem voto próprio: a bancada não é a referência
        bancada = bancadas.get(c["p"], {})
        respostas = {t["id"]: valor[bancada[t["id"]]["pos"]] for t in teses if t["id"] in bancada}
        if not respostas:
            continue
        dist = maximo = 0
        for i, t in enumerate(teses):
            if t["id"] not in respostas or c["pos"][i] == "?":
                continue
            assert c["src"][i] == "5", f"{c['n']}: src {c['src'][i]} onde a bancada tem posição"
            assert c["pos"][i] == bancada[t["id"]]["pos"], (
                f"{c['n']} ({c['p']}): pos '{c['pos'][i]}' em {t['id']}, bancada '{bancada[t['id']]['pos']}'"
            )
            dist += abs(respostas[t["id"]] - valor[c["pos"][i]])
            maximo += 2
        assert maximo and 1 - dist / maximo == 1.0, f"{c['n']}: eleitor igual à bancada não deu 100%"
        conferidos += 1
    assert conferidos, "nenhum presidenciável herdando bancada para conferir"
    print(f"ok — {conferidos} presidenciáveis com match 100% contra a própria bancada")

    print(f"ok — {len(shards)} shards, {total} candidatos, {n} teses")
    print(f"     {com_evidencia} candidatos com evidência ({100 * com_evidencia / total:.1f}%)")


if __name__ == "__main__":
    main()
