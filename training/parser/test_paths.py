import unittest
from pathlib import Path

from paths import portable_reference


class PathsTest(unittest.TestCase):
    def test_preserves_relative_references(self) -> None:
        self.assertEqual(portable_reference(Path("artifacts/model")), "artifacts/model")

    def test_relativizes_paths_below_the_working_directory(self) -> None:
        self.assertEqual(
            portable_reference(Path("/workspace/artifacts/model"), Path("/workspace")),
            "artifacts/model",
        )

    def test_reduces_external_absolute_paths_to_a_basename(self) -> None:
        self.assertEqual(
            portable_reference(Path("/private/training/model"), Path("/workspace")),
            "model",
        )


if __name__ == "__main__":
    unittest.main()
