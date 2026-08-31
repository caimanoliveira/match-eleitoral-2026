"""Fotos oficiais dos candidatos, do dataset do TSE.

Caminho real (o CKAN do TSE é a fonte da verdade; chutar deu 404 por um dia):
  cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_{UF}_div.zip

Dentro: F{UF}{SQ_CANDIDATO}_div.jpg, ~3,4 KB cada. São ~70 MB no total para
19.870 candidatos — por isso NÃO entram no repositório. Vão para web/fotos/
no runner do rebuild e sobem com o artefato do Pages. Não há URL direta por
candidato no DivulgaCand (404/403), então o zip é o único caminho.

Roda só no runner: a máquina de desenvolvimento está bloqueada pelo WAF do TSE.
"""

import io
import json
import re
import zipfile
from pathlib import Path

from fetch import get

BASE = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/"
UFS = ("AC AL AM AP BA BR CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR "
       "RS SC SE SP TO").split()
DESTINO = Path(__file__).resolve().parent.parent / "web" / "fotos"
NOME = re.compile(r"F[A-Z]{2}(\d+)_div\.jpg$")


def publicadas(data: Path) -> set[str]:
    """IDs cujas fotos locais já constam dos shards publicados."""
    ids = set()
    for arquivo in data.glob("*.json"):
        if arquivo.stem in {"teses", "partidos", "meta"}:
            continue
        for candidato in json.loads(arquivo.read_text(encoding="utf-8")):
            if (candidato.get("foto") or "").startswith("fotos/"):
                ids.add(candidato["id"])
    return ids


def baixar(ufs=UFS, max_age: float = 6 * 3600) -> set[str]:
    """Extrai as fotos para web/fotos/{SQ}.jpg e devolve os SQ_CANDIDATO que
    têm foto. Um zip que falhar não derruba os outros: a foto é acessório, a
    lista do TSE é o produto."""
    DESTINO.mkdir(parents=True, exist_ok=True)
    com_foto: set[str] = set()
    for uf in ufs:
        try:
            raw = get(f"{BASE}foto_cand2026_{uf}_div.zip", f"foto_cand2026_{uf}.zip", max_age=max_age)
        except RuntimeError as exc:
            print(f"  ! fotos {uf}: {exc}")
            continue
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile:
            print(f"  ! fotos {uf}: zip corrompido")
            continue
        n = 0
        for info in zf.infolist():
            m = NOME.search(info.filename)
            if not m:
                continue
            sq = m.group(1)
            alvo = DESTINO / f"{sq}.jpg"
            if not alvo.exists() or alvo.stat().st_size != info.file_size:
                alvo.write_bytes(zf.read(info))
            com_foto.add(sq)
            n += 1
        print(f"  fotos {uf}: {n}")
    return com_foto


if __name__ == "__main__":
    s = baixar()
    print(f"{len(s)} candidatos com foto em {DESTINO}")
