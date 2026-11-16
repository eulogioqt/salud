import sys, os, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from salud import training as T


class VolumenConDistancia(unittest.TestCase):
    def test_kg_por_metros_como_hevy(self):
        ex = {"name": "Paseo del Granjero", "kind": "cardio",
              "sets": [{"type": "normal", "weight_kg": 48, "reps": None, "distance_m": 128},
                       {"type": "normal", "weight_kg": 48, "reps": None, "distance_m": 96}]}
        self.assertEqual(T._ex_stats(ex)["volume_kg"], 48 * 224)

    def test_cardio_sin_peso_no_suma(self):
        ex = {"name": "Máquina de Remo", "kind": "cardio", "sets": [{"type": "normal", "weight_kg": None, "reps": None, "distance_m": 1000, "seconds": 240}]}
        self.assertEqual(T._ex_stats(ex)["volume_kg"], 0)


if __name__ == "__main__":
    unittest.main()
