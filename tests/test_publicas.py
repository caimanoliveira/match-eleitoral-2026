import sys
import tempfile
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "pipeline"))
try:
    import publicas
except ModuleNotFoundError:
    publicas = None


class PublicasTest(unittest.TestCase):
    def test_carrega_somente_evidencia_conferida_e_preserva_nivel(self):
        self.assertIsNotNone(publicas, "falta o carregador de evidências públicas")
        with tempfile.TemporaryDirectory() as pasta:
            csv = Path(pasta) / "publicas.csv"
            csv.write_text(
                "sq_candidato,tese_id,resposta,nivel,fonte,publicado_em,conferido_por\n"
                "renan,correios-sem-licitacao,discordo,4,https://exemplo.test/a,2026-08-30,caiman\n"
                "renan,licenciamento-ambiental-simplificado,concordo,3,https://exemplo.test/b,2026-08-30,caiman\n"
                "renan,marco-temporal,concordo,4,https://exemplo.test/c,2026-08-30,\n",
                encoding="utf-8",
            )

            resultado = publicas.carregar(
                {"correios-sem-licitacao", "licenciamento-ambiental-simplificado", "marco-temporal"},
                csv,
            )

        self.assertEqual(resultado, {"renan": {
            "correios-sem-licitacao": ("-", "4", "https://exemplo.test/a"),
            "licenciamento-ambiental-simplificado": ("+", "3", "https://exemplo.test/b"),
        }})

    def test_plano_prevalece_sobre_declaracao_independente_da_ordem_do_csv(self):
        with tempfile.TemporaryDirectory() as pasta:
            csv = Path(pasta) / "publicas.csv"
            csv.write_text(
                "sq_candidato,tese_id,resposta,nivel,fonte,publicado_em,conferido_por\n"
                "renan,tese,concordo,3,https://exemplo.test/plano,2026-08-30,caiman\n"
                "renan,tese,discordo,4,https://exemplo.test/fala,2026-08-30,caiman\n",
                encoding="utf-8",
            )
            resultado = publicas.carregar({"tese"}, csv)

        self.assertEqual(resultado["renan"]["tese"],
                         ("+", "3", "https://exemplo.test/plano"))


if __name__ == "__main__":
    unittest.main()
