"""Votações nominais do Senado Federal.

Segunda fonte de voto próprio (nível 2 da cascata). Cobre os 46 senadores que
são candidatos em 2026 — 9 deles a governador, cargo em que o eleitor hoje só
vê a bancada do partido.

Limites que importam, medidos em 27/08/2026:
- A API não expõe CPF. O join com o TSE é por nome completo normalizado, que
  casou 46 de 103 votantes sem nenhuma ambiguidade; quem não casa fica sem
  Senado, não fica com o Senado de outra pessoa.
- Das 34 teses, só 7 têm rastro no Senado e só 4 medem a mesma pergunta. O
  Senado vota substitutivo inteiro, não o destaque que virou tese na Câmara. Por
  isso uma tese só ganha votação do Senado quando `theses.toml` a lista
  explicitamente em `votacoes_senado`, com a direção conferida — nunca por
  casamento automático de número de proposição.

Endpoint: /dadosabertos/votacao?ano=AAAA — o antigo /senador/{id}/votacoes está
descontinuado desde 02/2026 e ainda responde, mas não por muito tempo.
"""

import unicodedata

from fetch import get_json

API = "https://legis.senado.leg.br/dadosabertos"
ANOS = (2023, 2024, 2025, 2026)


def _normalizar(nome: str) -> str:
    return (
        unicodedata.normalize("NFD", nome or "")
        .encode("ascii", "ignore")
        .decode()
        .upper()
        .strip()
    )


def votacoes(anos=ANOS) -> dict[str, dict]:
    """código da sessão de votação -> {data, identificacao, descricao, votos}

    `votos` é {codigoParlamentar: 'Sim'|'Não'}. Só entram Sim e Não: os demais
    códigos (P-NRV, LS, AP, MIS…) são presença sem voto ou obstrução, e não são
    posição sobre a matéria.
    """
    out = {}
    for ano in anos:
        lista = get_json(f"{API}/votacao?ano={ano}", f"senado-votacoes-{ano}.json",
                         max_age=6 * 3600)
        for v in lista:
            if v.get("votacaoSecreta") == "S":
                continue
            votos = {
                int(x["codigoParlamentar"]): x["siglaVotoParlamentar"]
                for x in v.get("votos", [])
                if x.get("siglaVotoParlamentar") in ("Sim", "Não")
            }
            if not votos:
                continue
            out[str(v["codigoSessaoVotacao"])] = {
                "id": str(v["codigoSessaoVotacao"]),
                "data": v.get("dataSessao", ""),
                "identificacao": v.get("identificacao", ""),
                "descricao": (v.get("descricaoVotacao") or "").strip(),
                "ementa": (v.get("ementa") or "").strip(),
                "resultado": v.get("resultadoVotacao"),
                "votos": votos,
            }
    return out


def senadores(votacoes_: dict) -> list[dict]:
    """Todo mundo que votou no período (inclui suplentes que assumiram), com o
    nome completo que o TSE usa. Uma chamada de detalhe por parlamentar, com
    cache de 30 dias."""
    cods = {c for v in votacoes_.values() for c in v["votos"]}
    out = []
    for cod in sorted(cods):
        try:
            d = get_json(f"{API}/senador/{cod}", f"senador-{cod}.json", max_age=30 * 86400)
            ip = d["DetalheParlamentar"]["Parlamentar"]["IdentificacaoParlamentar"]
        except Exception:  # noqa: BLE001 — um detalhe faltando não derruba o build
            continue
        out.append({
            "id": cod,
            "nome": ip.get("NomeParlamentar", ""),
            "nome_completo": _normalizar(ip.get("NomeCompletoParlamentar", "")),
            "partido": ip.get("SiglaPartidoParlamentar", ""),
            "uf": ip.get("UfParlamentar", ""),
        })
    return out


def casar_com_tse(senadores_: list[dict], candidatos: list[dict]) -> dict[int, str]:
    """codigoParlamentar -> SQ_CANDIDATO, só quando o nome completo casa com
    exatamente um candidato. Ambíguo ou ausente fica de fora: errar aqui daria
    a um candidato o voto de outra pessoa."""
    por_nome: dict[str, list[dict]] = {}
    for c in candidatos:
        por_nome.setdefault(_normalizar(c["nome_completo"]), []).append(c)
    out = {}
    for s in senadores_:
        hits = por_nome.get(s["nome_completo"], [])
        if len(hits) == 1:
            out[s["id"]] = hits[0]["id"]
    return out


if __name__ == "__main__":
    import sys

    vs = votacoes()
    print(f"{len(vs)} votações nominais abertas no Senado, 2023-26")
    if "--dossie" in sys.argv:
        for cod in sys.argv[sys.argv.index("--dossie") + 1:]:
            v = vs.get(cod)
            if not v:
                print(f"\n{cod}: não encontrada")
                continue
            print(f"\n{'=' * 78}\n{cod}  {v['data']}  {v['identificacao']}  resultado={v['resultado']}")
            print(v["descricao"])
            print("ementa:", v["ementa"][:300])
            sim = sum(1 for x in v["votos"].values() if x == "Sim")
            print(f"Sim {sim} x Não {len(v['votos']) - sim}")
    else:
        import tse
        ss = senadores(vs)
        m = casar_com_tse(ss, tse.candidatos(offline=True))
        print(f"{len(ss)} votantes com detalhe, {len(m)} casam com candidato 2026")
