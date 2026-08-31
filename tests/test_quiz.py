from html.parser import HTMLParser
from pathlib import Path
import unittest


class QuizButtons(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "button" and "resp" in attrs.get("class", "").split() and "data-valor" in attrs:
            self.values.append(float(attrs["data-valor"]))


class QuizTest(unittest.TestCase):
    def test_oferece_cinco_graus_de_concordancia(self):
        parser = QuizButtons()
        parser.feed((Path(__file__).parents[1] / "web/index.html").read_text())
        self.assertEqual(parser.values, [1, 0.5, 0, -0.5, -1])


if __name__ == "__main__":
    unittest.main()
