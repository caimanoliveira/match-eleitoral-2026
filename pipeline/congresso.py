"""Votações nominais da Câmara dos Deputados.

Duas camadas de evidência saem daqui:
  - voto nominal do próprio parlamentar (nível 2 da cascata)
  - orientação de bancada do partido/federação (nível 5, cobre todo candidato)

O join com o TSE é por CPF, que a API expõe em /deputados/{id}.
"""

import json

from fetch import get_json

API = "https://dadosabertos.camara.leg.br/api/v2"
ARQ = "https://dadosabertos.camara.leg.br/arquivos"
LEGISLATURA = 57  # 2023-2027
ANOS = (2023, 2024, 2025, 2026)


def _dados(url: str, cache: str, max_age: float = 86400):
    d = get_json(url, cache, max_age)
    return d["dados"] if isinstance(d, dict) and "dados" in d else d


def deputados() -> list[dict]:
    """Deputados da legislatura atual, com CPF para o join com o TSE."""
    ids = []
    pagina = 1
    while True:
        d = _dados(
            f"{API}/deputados?idLegislatura={LEGISLATURA}&itens=100&pagina={pagina}",
            f"deputados-{LEGISLATURA}-p{pagina}.json",
            max_age=7 * 86400,
        )
        if not d:
            break
        ids += [x["id"] for x in d]
        pagina += 1

    out = []
    for i, dep_id in enumerate(sorted(set(ids))):
        if i % 100 == 0:
            print(f"  deputados {i}/{len(set(ids))}")
        d = _dados(f"{API}/deputados/{dep_id}", f"dep-{dep_id}.json", max_age=30 * 86400)
        status = d.get("ultimoStatus") or {}
        out.append(
            {
                "id": d["id"],
                "cpf": (d.get("cpf") or "").strip(),
                "nome": status.get("nomeEleitoral") or d.get("nomeCivil", ""),
                "partido": status.get("siglaPartido", ""),
                "uf": status.get("siglaUf", ""),
                "redes": d.get("redeSocial") or [],
            }
        )
    return [d for d in out if d["cpf"]]


def _arquivo(tipo: str, ano: int) -> list[dict]:
    return _dados(
        f"{ARQ}/{tipo}/json/{tipo}-{ano}.json", f"{tipo}-{ano}.json", max_age=6 * 3600
    )


def votacoes(anos=ANOS) -> dict[str, dict]:
    """id da votação -> metadados (para curar as teses e citar a fonte)."""
    out = {}
    for ano in anos:
        for v in _arquivo("votacoes", ano):
            prop = v.get("ultimaApresentacaoProposicao") or {}
            out[v["id"]] = {
                "id": v["id"],
                "data": v.get("data", ""),
                "orgao": v.get("siglaOrgao", ""),
                "descricao": (v.get("descricao") or "").strip(),
                # Do que a votação trata; `descricao` é só o rito processual.
                "proposicao": (prop.get("descricao") or "").strip(),
                "id_proposicao": prop.get("idProposicao"),
                "aprovacao": v.get("aprovacao"),
                "uri": f"https://www.camara.leg.br/presenca-comissoes/votacao-portal?reuniao={v['id']}",
            }
    return out


def votos(anos=ANOS) -> dict[str, dict[int, str]]:
    """id da votação -> {id do deputado: 'Sim'|'Não'|'Abstenção'|...}"""
    out: dict[str, dict[int, str]] = {}
    for ano in anos:
        for v in _arquivo("votacoesVotos", ano):
            voto = (v.get("voto") or "").strip()
            dep = (v.get("deputado_") or {}).get("id")
            if voto and dep:
                out.setdefault(v["idVotacao"], {})[int(dep)] = voto
    return out


def proposicoes(anos=ANOS) -> dict[str, dict]:
    """id da votação -> proposição em pauta (título + ementa).

    `votacoes.descricao` só descreve o rito ("Aprovado o Parecer"). É aqui que
    está o assunto, que é o que se cita para o eleitor.
    """
    out = {}
    for ano in anos:
        for p in _arquivo("votacoesProposicoes", ano):
            prop = p.get("proposicao_") or {}
            if prop.get("titulo"):
                out[p["idVotacao"]] = {
                    "titulo": prop["titulo"],
                    "ementa": (prop.get("ementa") or "").strip(),
                    "id": prop.get("id"),
                }
    return out


def bancadas(anos=ANOS) -> dict[str, dict[str, dict]]:
    """id da votação -> {PARTIDO: {'voto': 'Sim'|'Não', 'coesao': 0..1, 'n': int}}

    Posição do partido derivada do voto real da sua bancada, não do rótulo de
    orientação do líder. A orientação vem rotulada por bloco parlamentar, com
    siglas truncadas na origem ('Bl AvanSolidPrd...') e grafia inconsistente
    ('NOVO'/'Novo', 'PODE'/'Podemos'); o voto do deputado traz o partido dele
    de forma limpa e sempre presente. Também rende a coesão de graça.
    """
    out: dict[str, dict[str, dict]] = {}
    for ano in anos:
        contagem: dict[str, dict[str, dict[str, int]]] = {}
        for v in _arquivo("votacoesVotos", ano):
            voto = (v.get("voto") or "").strip()
            partido = ((v.get("deputado_") or {}).get("siglaPartido") or "").strip().upper()
            if voto in ("Sim", "Não") and partido:
                contagem.setdefault(v["idVotacao"], {}).setdefault(
                    partido, {"Sim": 0, "Não": 0}
                )[voto] += 1
        for vid, partidos in contagem.items():
            for partido, c in partidos.items():
                n = c["Sim"] + c["Não"]
                if n < 3:  # bancada pequena demais para falar em posição
                    continue
                voto = "Sim" if c["Sim"] > c["Não"] else "Não"
                if c["Sim"] == c["Não"]:  # bancada rachada ao meio: sem posição
                    continue
                out.setdefault(vid, {})[partido] = {
                    "voto": voto,
                    "coesao": round(max(c["Sim"], c["Não"]) / n, 3),
                    "n": n,
                }
    return out


def orientacoes(anos=ANOS) -> dict[str, dict[str, str]]:
    """id da votação -> {sigla da bancada: orientação}

    A bancada pode ser um partido (PT), uma federação (PSOL/REDE) ou um bloco
    conceitual (Governo, Minoria) — estes últimos são descartados no build.
    """
    out: dict[str, dict[str, str]] = {}
    for ano in anos:
        for o in _arquivo("votacoesOrientacoes", ano):
            sigla = (o.get("siglaBancada") or "").strip()
            orient = (o.get("orientacao") or "").strip()
            if sigla and orient:
                out.setdefault(o["idVotacao"], {})[sigla] = orient
    return out


if __name__ == "__main__":
    import sys

    if "--deputados" in sys.argv:
        d = deputados()
        print(f"{len(d)} deputados com CPF")
        print(json.dumps(d[0], ensure_ascii=False))
    else:
        vs, ors, vt = votacoes(), orientacoes(), votos()
        print(f"{len(vs)} votações, {len(ors)} com orientação, {len(vt)} com votos nominais")
        nominais = [v for v in vs if v in vt]
        print(f"{len(nominais)} votações nominais em plenário/comissão")
        ex = sorted(nominais, key=lambda i: len(vt[i]), reverse=True)[:3]
        for i in ex:
            print(f"\n  {i} ({len(vt[i])} votos) {vs[i]['data']}")
            print(f"    {vs[i]['descricao'][:150]}")
            print(f"    bancadas: {len(ors.get(i, {}))}")
