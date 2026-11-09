"""Punto de entrada de la CLI (operaciones desde el chat)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from salud.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
