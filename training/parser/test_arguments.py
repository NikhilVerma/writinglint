import argparse
import unittest

from arguments import (
    nonnegative_float,
    nonnegative_int,
    positive_float,
    positive_int,
    unit_interval,
)


class ArgumentsTest(unittest.TestCase):
    def test_positive_values(self) -> None:
        self.assertEqual(positive_int("2"), 2)
        self.assertEqual(positive_float("0.5"), 0.5)
        with self.assertRaises(argparse.ArgumentTypeError):
            positive_int("0")
        with self.assertRaises(argparse.ArgumentTypeError):
            positive_float("-1")

    def test_nonnegative_values(self) -> None:
        self.assertEqual(nonnegative_int("0"), 0)
        self.assertEqual(nonnegative_float("0"), 0.0)
        with self.assertRaises(argparse.ArgumentTypeError):
            nonnegative_int("-1")
        with self.assertRaises(argparse.ArgumentTypeError):
            nonnegative_float("-0.1")

    def test_unit_interval(self) -> None:
        self.assertEqual(unit_interval("0"), 0.0)
        self.assertEqual(unit_interval("1"), 1.0)
        with self.assertRaises(argparse.ArgumentTypeError):
            unit_interval("1.01")


if __name__ == "__main__":
    unittest.main()
