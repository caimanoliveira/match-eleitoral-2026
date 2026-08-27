"""Aplica a cascata de evidência e gera os shards que o site consome.

    python3 build.py            # grava em web/data/
    python3 build.py --dry-run  # só o relatório de cobertura

Cascata (a primeira fonte disponível vence):
    1 questionário respondido pelo candidato   [fase 3]
    2 voto nominal do próprio candidato        <- aqui
    3 proposta no plano de governo             [fase 3]
    4 declaração pública                       [fase 3]
    5 posição da bancada do partido            <- aqui

Codificação dos shards: duas strings paralelas de 1 char por tese, na ordem de
`teses.json`. `pos` em "+-0?" (concorda / discorda / neutro / sem dado) e `src`
com o nível da cascata ("?" quando não há evidência). Duas strings de 40 chars
por candidato mantêm o payload de uma UF grande na casa das dezenas de KB.
"""

import argparse
import collections
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import congresso
import teses as teses_mod
import tse
from fetch import CACHE

RAIZ = Path(__file__).resolve().parent.parent
# Dentro de web/ para que a pasta seja publicável sozinha: servir a raiz do
# repositório exporia pipeline/ e .cache/.
DATA = RAIZ / "web" / "data"

SEM_DADO = "?"


def _posicao(votos_por_votacao: list[tuple[str, int]]) -> str:
    """Agrega votos ('Sim'/'Não' + direção da tese) em +, - ou 0."""
    soma = 0
    for voto, direcao in votos_por_votacao:
        if voto == "Sim":
            soma += direcao
        elif voto == "Não":
            soma -= direcao
    if soma > 0:
        return "+"
    if soma < 0:
        return "-"
    return "0"


def posicoes_partido(ts: list[dict], banc: dict) -> dict[str, dict[str, str]]:
    """PARTIDO -> {tese_id: '+'|'-'|'0'} a partir do voto da bancada."""
    out: dict[str, dict[str, str]] = {}
    partidos = {p for v in banc.values() for p in v}
    for partido in partidos:
        for t in ts:
            votos = [
                (banc[v["id"]][partido]["voto"], v["direcao"])
                for v in t["votacoes"]
                if v["id"] in banc and partido in banc[v["id"]]
            ]
            if votos:
                out.setdefault(partido, {})[t["id"]] = _posicao(votos)
    return out


def posicoes_deputado(ts: list[dict], votos: dict) -> dict[int, dict[str, str]]:
    """id do deputado -> {tese_id: posição} a partir do voto nominal dele."""
    out: dict[int, dict[str, str]] = {}
    for t in ts:
        for v in t["votacoes"]:
            for dep_id, voto in votos.get(v["id"], {}).items():
                if voto in ("Sim", "Não"):
                    out.setdefault(dep_id, {}).setdefault(t["id"], []).append(
                        (voto, v["direcao"])
                    )
    return {
        dep: {tid: _posicao(vs) for tid, vs in tsi.items()} for dep, tsi in out.items()
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    ts = teses_mod.carregar()
    todas = teses_mod.carregar_todas()
    if not ts:
        raise SystemExit("nenhuma tese verificada — nada a construir")
    print(f"teses: {len(ts)} verificadas de {len(todas)}")

    candidatos = tse.candidatos()
    deputados = congresso.deputados()
    banc = congresso.bancadas()
    votos = congresso.votos()

    por_partido = posicoes_partido(ts, banc)
    por_deputado = posicoes_deputado(ts, votos)
    cpf_para_dep = {d["cpf"]: d for d in deputados}
    print(f"candidatos: {len(candidatos)} | partidos com posição: {len(por_partido)}")
    print(f"deputados com voto: {len(por_deputado)} | CPFs mapeados: {len(cpf_para_dep)}")

    cobertura = collections.Counter()
    shards: dict[str, list] = collections.defaultdict(list)
    incumbentes = 0

    # Números de urna reivindicados por mais de uma candidatura na mesma
    # disputa. Acontece em substituição de candidato: o substituto herda o
    # número e os dois registros convivem no arquivo enquanto a Justiça
    # Eleitoral não julga. Como a colinha existe para o eleitor digitar esse
    # número, ele precisa saber que ali há disputa — escolher um por conta
    # própria mandaria alguém votar na pessoa errada.
    numeros = collections.Counter((c["cargo"], c["uf"], c["numero"]) for c in candidatos)
    disputados = {k for k, n in numeros.items() if n > 1}

    for c in candidatos:
        dep = cpf_para_dep.get(c["cpf"])
        proprios = por_deputado.get(dep["id"], {}) if dep else {}
        if proprios:
            incumbentes += 1
        do_partido = por_partido.get(c["partido"].upper(), {})

        pos, src = [], []
        for t in ts:
            if t["id"] in proprios:  # nível 2: como o próprio votou
                pos.append(proprios[t["id"]])
                src.append("2")
                cobertura[2] += 1
            elif t["id"] in do_partido:  # nível 5: como a bancada votou
                pos.append(do_partido[t["id"]])
                src.append("5")
                cobertura[5] += 1
            else:
                pos.append(SEM_DADO)
                src.append(SEM_DADO)
                cobertura[0] += 1

        registro = {
            "id": c["id"],
            "n": c["nome"],
            "num": c["numero"],
            "p": c["partido"],
            "pn": c["partido_numero"],
            "pos": "".join(pos),
            "src": "".join(src),
        }
        if (c["cargo"], c["uf"], c["numero"]) in disputados:
            registro["numDisputado"] = True
        if dep:
            registro["dep"] = dep["id"]  # para linkar o voto real na UI
            # Foto oficial da Câmara: URL pública e estável, cobre os deputados
            # em exercício. O padrão equivalente no TSE, que cobriria todos os
            # candidatos, ainda não foi confirmado — sem ele a UI cai no avatar
            # de iniciais.
            registro["foto"] = (
                f"https://www.camara.leg.br/internet/deputado/bandep/{dep['id']}.jpg"
            )
        shards[f"{c['cargo']}-{c['uf']}"].append(registro)

    total = sum(cobertura.values())
    print("\ncobertura das células (candidato x tese):")
    for nivel, rotulo in ((2, "voto do próprio"), (5, "bancada do partido"), (0, "sem dado")):
        n = cobertura[nivel]
        print(f"  nível {nivel} {rotulo:<20} {n:>8} ({100 * n / total:5.1f}%)")
    print(f"\ncandidatos com voto próprio: {incumbentes}")
    if disputados:
        print(f"números de urna em disputa (substituição pendente): {len(disputados)}")
    sem_nada = sum(1 for cs in shards.values() for c in cs if set(c["src"]) == {SEM_DADO})
    print(f"candidatos sem evidência alguma: {sem_nada} "
          f"({100 * sem_nada / len(candidatos):.1f}%)")

    if args.dry_run:
        return

    zip_tse = CACHE / "consulta_cand_2026.zip"
    fonte_tse = (
        datetime.fromtimestamp(zip_tse.stat().st_mtime, timezone.utc).isoformat()
        if zip_tse.exists()
        else None
    )
    idade_h = (
        (datetime.now(timezone.utc) - datetime.fromisoformat(fonte_tse)).total_seconds() / 3600
        if fonte_tse
        else None
    )
    if idade_h and idade_h > 48:
        print(f"\n  ! dados do TSE têm {idade_h:.0f}h — o site vai avisar o eleitor")

    DATA.mkdir(parents=True, exist_ok=True)
    for nome, lista in shards.items():
        # Ordem alfabética é ordem estável; o desempate visual fica na UI.
        lista.sort(key=lambda c: c["n"])
        (DATA / f"{nome}.json").write_text(
            json.dumps(lista, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )

    # As respostas viajam na URL por POSIÇÃO. Se o conjunto de teses mudar, um
    # link antigo passaria a ser lido contra as teses erradas, sem erro visível.
    # Esta versão sela o conjunto: o site recusa restaurar uma URL de outra safra.
    versao = hashlib.sha256(
        "|".join(t["id"] for t in ts).encode("utf-8")
    ).hexdigest()[:6]

    (DATA / "teses.json").write_text(
        json.dumps(
            {
              "versao": versao,
              "teses": [
                {
                    "id": t["id"],
                    "texto": t["texto"],
                    "contexto": t.get("contexto", ""),
                    "esfera": t["esfera"],
                    "eixo": t["eixo"],
                    "fontes": [
                        {"id": v["id"], "url": f"https://www.camara.leg.br/votacoes/{v['id']}"}
                        for v in t["votacoes"]
                    ],
                }
                for t in ts
              ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (DATA / "partidos.json").write_text(
        json.dumps(por_partido, ensure_ascii=False), encoding="utf-8"
    )
    (DATA / "meta.json").write_text(
        json.dumps(
            {
                "gerado_em": datetime.now(timezone.utc).isoformat(),
                # Quando o TSE foi lido de fato. Pode ser bem mais antigo que
                # `gerado_em` se o WAF recusou e o build caiu no cache — e o
                # eleitor precisa saber disso, porque candidatura é indeferida
                # e candidato renuncia.
                "fonte_tse_em": fonte_tse,
                "eleicao": "2026-10-04",
                "teses": len(ts),
                "versao_teses": versao,
                "teses_pendentes": len(todas) - len(ts),
                "candidatos": len(candidatos),
                "shards": sorted(shards),
                "cobertura": {str(k): v for k, v in cobertura.items()},
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    kb = sum(f.stat().st_size for f in DATA.glob("*.json")) / 1024
    maior = max(DATA.glob("*.json"), key=lambda f: f.stat().st_size)
    print(f"\n{len(shards) + 3} arquivos em web/data/ ({kb:.0f} KB no total)")
    print(f"maior shard: {maior.name} ({maior.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
