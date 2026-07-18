import random
import unittest

from decode import decode_tree, valid_tree


class DecodeTreeTest(unittest.TestCase):
    def test_empty_and_single_token(self) -> None:
        self.assertEqual(decode_tree([]), [])
        self.assertEqual(decode_tree([[10.0, 99.0]]), [0])

    def test_preserves_valid_constrained_greedy_tree(self) -> None:
        scores = [
            [9.0, -99.0, 1.0, 0.0],
            [0.0, 8.0, -99.0, 1.0],
            [0.0, 1.0, 8.0, -99.0],
        ]
        self.assertEqual(decode_tree(scores), [0, 1, 2])

    def test_selects_one_best_root(self) -> None:
        scores = [
            [10.0, -99.0, 9.0],
            [8.0, 10.0, -99.0],
        ]
        self.assertEqual(decode_tree(scores), [0, 1])

    def test_repairs_cycle_with_lowest_loss_edge(self) -> None:
        scores = [
            [10.0, -99.0, 0.0, 0.0],
            [0.0, 0.0, -99.0, 9.0],
            [0.0, 8.0, 10.0, -99.0],
        ]
        self.assertEqual(decode_tree(scores), [0, 3, 1])

    def test_random_scores_always_produce_valid_tree(self) -> None:
        generator = random.Random(13)
        for size in range(1, 40):
            for _ in range(25):
                scores = [[generator.uniform(-10, 10) for _ in range(size + 1)] for _ in range(size)]
                for dependent in range(1, size + 1):
                    scores[dependent - 1][dependent] = float("-inf")
                self.assertTrue(valid_tree(decode_tree(scores)))

    def test_rejects_malformed_matrices(self) -> None:
        with self.assertRaises(ValueError):
            decode_tree([[1.0], [2.0]])


if __name__ == "__main__":
    unittest.main()
