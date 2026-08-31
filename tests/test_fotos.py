import json
import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "pipeline"))
import fotos


class FotosTest(unittest.TestCase):
    def test_recupera_ids_com_foto_dos_shards_publicados(self):
        self.assertTrue(hasattr(fotos, "publicadas"), "falta preservar fotos no build local")
        with tempfile.TemporaryDirectory() as pasta:
            data = Path(pasta)
            (data / "presidente-BR.json").write_text(json.dumps([
                {"id": "com", "foto": "fotos/com.jpg"},
                {"id": "externa", "foto": "https://exemplo.test/foto.jpg"},
                {"id": "sem"},
            ]))
            (data / "meta.json").write_text("{}")
            self.assertEqual(fotos.publicadas(data), {"com"})


if __name__ == "__main__":
    unittest.main()
