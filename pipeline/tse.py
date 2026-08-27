"""Candidaturas 2026 do portal de dados abertos do TSE.

Fonte: cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
Atualizado pelo TSE a cada 60 min. CSV latin-1, separador ';'.
"""

import csv
import io
import zipfile

from fetch import get

URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"

# Cargos que o eleitor escolhe na urna. Vice e suplente entram na chapa do
# titular, não são votados separadamente — ficam fora do quiz.
CARGOS = {
    "1": "presidente",
    "3": "governador",
    "5": "senador",
    "6": "deputado-federal",
    "7": "deputado-estadual",
    "8": "deputado-distrital",
}

# Candidaturas indeferidas/renunciadas não vão para a urna. O TSE ainda não
# julgou a maioria dos registros (situação '#NE'), então nesta fase só
# descartamos o que já foi explicitamente barrado.
SITUACAO_FORA = {"INDEFERIDO", "RENÚNCIA", "CASSADO", "FALECIDO", "INDEFERIDO COM RECURSO"}

NULO = {"", "#NULO", "#NE", "NÃO DIVULGÁVEL", "-1"}


def _clean(v: str) -> str:
    v = (v or "").strip()
    return "" if v.upper() in NULO else v


def candidatos(offline: bool = False) -> list[dict]:
    """Todos os candidatos votáveis de 2026, normalizados.

    `offline=True` lê só o cache. O WAF do TSE bloqueia por volume — testes e
    inspeções não têm por que consumir cota de rede que o build precisa.
    """
    # 6h, não 1h: o TSE atualiza a cada 60 min, mas a lista de candidaturas
    # muda devagar e cada download é ~3 MB atrás de um WAF sensível a volume.
    raw = get(URL, "consulta_cand_2026.zip", max_age=float("inf") if offline else 6 * 3600)
    zf = zipfile.ZipFile(io.BytesIO(raw))

    out, vistos = [], set()
    # BRASIL traz estaduais + federais; BR traz a chapa presidencial.
    for nome in ("consulta_cand_2026_BRASIL.csv", "consulta_cand_2026_BR.csv"):
        text = zf.read(nome).decode("latin-1")
        for r in csv.DictReader(io.StringIO(text), delimiter=";"):
            cargo = CARGOS.get(r["CD_CARGO"])
            if not cargo:
                continue
            if _clean(r["DS_SITUACAO_CANDIDATURA"]).upper() in SITUACAO_FORA:
                continue
            sq = r["SQ_CANDIDATO"]
            if sq in vistos:  # presidente aparece nos dois arquivos
                continue
            vistos.add(sq)

            uf = r["SG_UF"] if cargo != "presidente" else "BR"
            federacao = _clean(r["SG_FEDERACAO"])
            out.append(
                {
                    "id": sq,
                    "cargo": cargo,
                    "uf": uf,
                    "numero": r["NR_CANDIDATO"],
                    "nome": _clean(r["NM_URNA_CANDIDATO"]) or r["NM_CANDIDATO"].title(),
                    "nome_completo": r["NM_CANDIDATO"].title(),
                    "cpf": _clean(r["NR_CPF_CANDIDATO"]),
                    "partido": r["SG_PARTIDO"],
                    "partido_numero": r["NR_PARTIDO"],
                    # A orientação de bancada na Câmara é registrada pela
                    # federação quando ela existe, não pelo partido isolado.
                    "federacao": federacao,
                    "coligacao": _clean(r["DS_COMPOSICAO_COLIGACAO"]),
                    "foto": f"https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2026/{sq}",
                }
            )
    return _sem_duplicatas(out)


def _sem_duplicatas(cands: list[dict]) -> list[dict]:
    """Remove registros repetidos da mesma pessoa no mesmo cargo e UF.

    O arquivo do TSE guarda registros substituídos junto com os válidos — a
    situação de todos ainda é '#NE' (não julgada), então não dá para filtrar
    por status. Aparecem como o mesmo CPF duas vezes no mesmo cargo, às vezes
    com número de urna diferente porque houve troca. Fica o SQ_CANDIDATO mais
    alto, que é o registro mais recente.

    Não mexe em quem está inscrito em DOIS cargos distintos: a lei proíbe, o
    TSE vai indeferir um deles, mas qual é decisão da Justiça Eleitoral e não
    nossa — mostrar os dois é mais honesto que escolher no chute.
    """
    melhor: dict[tuple, dict] = {}
    for c in cands:
        chave = (c["cpf"], c["cargo"], c["uf"])
        anterior = melhor.get(chave)
        if anterior is None or int(c["id"]) > int(anterior["id"]):
            melhor[chave] = c
    return list(melhor.values())


if __name__ == "__main__":
    import collections

    cs = candidatos()
    print(f"{len(cs)} candidatos votáveis")
    for cargo, n in sorted(collections.Counter(c["cargo"] for c in cs).items()):
        print(f"  {cargo:<20} {n:>6}")
    sem_cpf = sum(1 for c in cs if not c["cpf"])
    print(f"sem CPF: {sem_cpf}")
    print(f"partidos: {len(set(c['partido'] for c in cs))}")
