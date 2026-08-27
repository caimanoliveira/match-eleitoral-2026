"""HTTP com cache em disco. O TSE fica atrás de um WAF que só responde a
headers de browser completos — daí a lista abaixo, que foi obtida na tentativa."""

import gzip
import json
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path

CACHE = Path(__file__).resolve().parent.parent / ".cache"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
}


def _decompress(raw: bytes, encoding: str) -> bytes:
    if encoding == "gzip":
        return gzip.decompress(raw)
    if encoding == "deflate":
        return zlib.decompress(raw, -zlib.MAX_WBITS)
    return raw


def get(
    url: str, cache_name: str | None = None, max_age: float = 86400, accept: str | None = None
) -> bytes:
    """GET com cache. `max_age` em segundos; 0 força refetch;
    `float("inf")` usa o cache sem nunca ir à rede."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / (cache_name or url.rsplit("/", 1)[-1].replace("?", "_"))
    fresco = path.exists() and path.stat().st_size and max_age and (
        time.time() - path.stat().st_mtime < max_age
    )
    if fresco:
        return path.read_bytes()
    if max_age == float("inf"):
        raise RuntimeError(f"{url}: modo offline e sem cache — rode o build antes")

    headers = dict(HEADERS)
    if accept:
        headers["Accept"] = accept

    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = _decompress(resp.read(), resp.headers.get("Content-Encoding", ""))
            path.write_bytes(body)
            return body
        except urllib.error.HTTPError as exc:
            last = exc
            # Repetir um 4xx é pedir de novo o que o servidor acabou de recusar.
            # O WAF do TSE responde a volume: insistir num 403 aproxima o
            # bloqueio de IP em vez de contorná-lo. 429 é o único que pede
            # espera, e mesmo assim uma só.
            if exc.code == 429 and attempt == 0:
                time.sleep(float(exc.headers.get("Retry-After") or 60))
                continue
            if 400 <= exc.code < 500:
                break
            time.sleep(5 * 2**attempt)
        except (urllib.error.URLError, OSError) as exc:  # timeout, reset, DNS
            last = exc
            time.sleep(5 * 2**attempt)

    if path.exists() and path.stat().st_size:
        idade = (time.time() - path.stat().st_mtime) / 3600
        print(f"  ! {url}\n    falhou ({last}) — usando cache de {idade:.1f}h atrás")
        return path.read_bytes()
    raise RuntimeError(f"{url}: {last}")


def get_json(url: str, cache_name: str | None = None, max_age: float = 86400):
    # A API da Câmara negocia conteúdo pelo Accept: com o text/html que o WAF do
    # TSE exige, ela responde XML. JSON precisa ser pedido explicitamente.
    return json.loads(get(url, cache_name, max_age, accept="application/json"))
