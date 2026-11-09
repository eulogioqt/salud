"""Punto de entrada del servidor web local."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from salud.server import main  # noqa: E402

if __name__ == "__main__":
    main()
