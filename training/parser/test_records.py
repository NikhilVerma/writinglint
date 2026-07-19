import unittest

from records import offsets, parsed
from structures import Sentence


class RecordsTest(unittest.TestCase):
    def test_offsets_are_utf16_indices(self) -> None:
        self.assertEqual(
            offsets("A 😀 test.", ["A", "😀", "test", "."]), [(0, 1), (2, 4), (5, 9), (9, 10)]
        )

    def test_parsed_rejects_misaligned_word_fields(self) -> None:
        sentence = Sentence(
            text="One test.",
            family="fixture",
            words=["One", "test", "."],
            lemmas=["one", "test", "."],
            upos=["NUM", "NOUN", "PUNCT"],
            heads=[2, 0, 2],
            relations=["nummod", "root", "punct"],
            rule_weights=[1.0, 1.0, 1.0],
        )

        with self.assertRaisesRegex(ValueError, "Mismatched word-level fields"):
            parsed(sentence, [0], sentence.relations, sentence.upos)

    def test_parsed_uses_sentence_metadata(self) -> None:
        sentence = Sentence(
            text="😀 works.",
            family="emoji",
            words=["😀", "works", "."],
            lemmas=["😀", "work", "."],
            upos=["SYM", "VERB", "PUNCT"],
            heads=[2, 0, 2],
            relations=["nsubj", "root", "punct"],
            rule_weights=[1.0, 1.0, 1.0],
        )

        result = parsed(sentence, sentence.heads, sentence.relations, sentence.upos)

        self.assertEqual(result["end"], 9)
        self.assertEqual(result["tokens"][0]["start"], 0)
        self.assertEqual(result["tokens"][0]["end"], 2)
        self.assertEqual(result["tokens"][1]["start"], 3)


if __name__ == "__main__":
    unittest.main()
