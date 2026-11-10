"""Pruebas del núcleo. Ejecutar:  python -m unittest discover -s app/tests -v
Usan una base de datos temporal: nunca tocan data/salud.db."""
import json
import os
import sys
import tempfile
import unittest
import zipfile
import io

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from salud import core  # noqa: E402
from salud import nutrition as N  # noqa: E402
from salud.api import ApiError, dispatch  # noqa: E402
from salud.db import ClosedDayError, connect  # noqa: E402
from salud.importer import init_db  # noqa: E402

D1, D2 = "2026-11-09", "2026-11-10"


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.conn = connect(os.path.join(self.tmp.name, "t.db"))
        init_db(self.conn)
        core.update_settings(self.conn, {"sexo": "H", "altura_cm": "185", "edad": "23", "peso_estimado_kg": "81.5"}, "test")

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def food(self, ref):
        return core.find_food(self.conn, ref)

    def add(self, ref, qty, unit, d=D1, meal="almuerzo"):
        return core.add_entry(self.conn, {"date": d, "meal": meal, "food_id": self.food(ref)["id"],
                                          "unit_key": unit, "quantity": qty})

    def portion(self, ref, label):
        return next(p for p in N.get_portions(self.conn, self.food(ref)["id"]) if p["label"] == label)


class TestImport(Base):
    def test_34_entries_and_idempotent(self):
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM foods").fetchone()[0], 34)
        self.assertEqual(init_db(self.conn), 0)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM foods").fetchone()[0], 34)
        self.assertIsNone(self.conn.execute("SELECT 1 FROM foods WHERE code='alimento_35'").fetchone())

    def test_nulls_are_unknown_not_zero(self):
        p = self.portion("alimento_01", "30 g (1 scoop)")
        self.assertIsNone(p["kcal"]); self.assertIsNone(p["protein_g"])
        self.assertEqual(self.food("alimento_01")["status"], "pendiente")
        self.assertEqual(self.food("alimento_08")["status"], "pendiente")
        self.assertEqual(self.food("alimento_04")["status"], "provisional")
        s = self.portion("alimento_20", "100 g")
        self.assertEqual(s["kcal"], 421); self.assertIsNone(s["carbs_g"]); self.assertIsNone(s["fat_g"])
        self.assertEqual(self.portion("alimento_27", "ración bebida")["kcal"], 0)

    def test_original_data_preserved(self):
        f = self.food("alimento_04")
        self.assertIn("Blue Chameleon", f["original_name"]); self.assertEqual(f["previous_name"], "Powerking")
        self.assertEqual(self.portion("alimento_04", "250 ml lata clásica")["source_type"], "external_provisional")
        self.assertEqual(len(N.get_portions(self.conn, self.food("alimento_18")["id"])), 0)


class TestCalc(Base):
    def test_grams(self):
        e = self.add("avena", 60, "g")
        self.assertAlmostEqual(e["kcal"], 374 * 0.6); self.assertAlmostEqual(e["protein_g"], 13.5 * 0.6)
        self.assertEqual(e["missing"], [])

    def test_portion_and_label_energy_preserved(self):
        e = self.add("alimento_23", 1, "p:%d" % self.portion("alimento_23", "pack 140 g")["id"])
        self.assertEqual(e["kcal"], 150)  # kcal de etiqueta, no 4P+4C+9G

    def test_partial_macros(self):
        e = self.add("miel", 21, "g", meal="desayuno")
        self.assertIn("protein_g", e["missing"]); self.assertIsNone(e["protein_g"])
        self.add("avena", 100, "g", meal="desayuno")
        st = core.day_state(self.conn, D1)
        self.assertIn("protein_g", st["totals"]["missing"])
        self.assertAlmostEqual(st["totals"]["protein_g"], 13.5)  # mínimo conocido, no 0 añadido en silencio
        self.assertAlmostEqual(st["totals"]["kcal"], 374 + 64, places=0)

    def test_pending_food_logs_unknown(self):
        e = self.add("alimento_01", 1, "p:%d" % self.portion("alimento_01", "30 g (1 scoop)")["id"])
        self.assertEqual(set(e["missing"]), set(N.FIELDS)); self.assertEqual(e["quality"], "pendiente")

    def test_change_quantity(self):
        e = self.add("avena", 60, "g")
        e2 = core.update_entry(self.conn, e["id"], {"quantity": 80})
        self.assertAlmostEqual(e2["kcal"], 374 * 0.8)
        self.assertAlmostEqual(core.day_state(self.conn, D1)["totals"]["kcal"], round(374 * 0.8))

    def test_soft_delete_restore(self):
        e = self.add("avena", 100, "g")
        core.delete_entry(self.conn, e["id"])
        self.assertEqual(core.day_state(self.conn, D1)["totals"]["kcal"], 0)
        core.restore_entry(self.conn, e["id"])
        self.assertEqual(core.day_state(self.conn, D1)["totals"]["kcal"], 374)

    def test_estimate(self):
        e = core.add_estimate(self.conn, {"date": D1, "meal": "cena", "name": "Menú del día", "kcal": 900,
                                          "protein_g": 40, "kcal_min": 750, "kcal_max": 1100})
        self.assertEqual(e["kind"], "estimacion"); self.assertEqual(e["quality"], "estimacion")
        self.assertEqual(set(e["missing"]), {"carbs_g", "fat_g"})


class TestRecipes(Base):
    def make_recipe(self):
        arroz = self.food("arroz en bolsa")
        soja = self.food("soja")
        return core.create_recipe(self.conn, {"name": "Arroz con soja", "recipe_servings": 2, "items": [
            {"food_id": arroz["id"], "unit_key": "p:%d" % self.portion("arroz en bolsa", "bolsa habitual 167 g")["id"], "quantity": 2},
            {"food_id": soja["id"], "unit_key": "g", "quantity": 80}]})

    def test_recipe_math(self):
        r = self.make_recipe()
        rac = next(u for u in r["units"] if u["key"] == "rac")
        self.assertAlmostEqual(rac["per"]["kcal"], (500 + 361 * 0.8) / 2, places=3)
        self.assertAlmostEqual(rac["per"]["protein_g"], (10 + 40) / 2, places=3)

    def test_recipe_edit_does_not_touch_closed_days(self):
        r = self.make_recipe()
        e1 = self.add(r["id"], 1, "rac", d=D1)
        core.close_day(self.conn, D1, force=True)
        e2 = self.add(r["id"], 1, "rac", d=D2)
        items = r["items"]
        new_items = [{"food_id": items[0]["food_id"], "unit_key": items[0]["unit_key"], "quantity": 1},
                     {"food_id": items[1]["food_id"], "unit_key": "g", "quantity": 80}]
        core.update_food(self.conn, r["id"], {"items": new_items})
        self.assertAlmostEqual(core.get_entry(self.conn, e1["id"])["kcal"], e1["kcal"])  # cerrado: intacto
        self.assertAlmostEqual(core.get_entry(self.conn, e2["id"])["kcal"], (250 + 361 * 0.8) / 2, places=3)
        self.assertEqual(json.loads(core.get_entry(self.conn, e1["id"])["snapshot"])["ingredients"][0]["quantity"], 2)

    def test_label_update_refreshes_open_days_only(self):
        hsn = self.food("alimento_01")
        pid = self.portion("alimento_01", "30 g (1 scoop)")["id"]
        e1 = self.add(hsn["id"], 1, "p:%d" % pid, d=D1)
        core.close_day(self.conn, D1, force=True)
        e2 = self.add(hsn["id"], 1, "p:%d" % pid, d=D2)
        core.update_food(self.conn, hsn["id"], {"status": "etiqueta", "portions": [
            {"id": pid, "label": "30 g (1 scoop)", "amount": 30, "unit": "g", "kcal": 115, "protein_g": 23,
             "carbs_g": 2, "fat_g": 1.5, "quality": "etiqueta"}]})
        self.assertIsNone(core.get_entry(self.conn, e1["id"])["kcal"])
        self.assertEqual(core.get_entry(self.conn, e2["id"])["kcal"], 115)

    def test_template_apply_with_override(self):
        av, mi = self.food("avena"), self.food("miel")
        t = core.create_template(self.conn, {"name": "Batido habitual", "meal": "desayuno", "items": [
            {"food_id": av["id"], "unit_key": "g", "quantity": 50},
            {"food_id": mi["id"], "unit_key": "p:%d" % self.portion("miel", "21 g")["id"], "quantity": 1}]})
        it_av = t["items"][0]["id"]
        r = core.apply_template(self.conn, t["id"], {"date": D1, "items": [{"id": it_av, "quantity": 60}]})
        es = core.day_entries(self.conn, D1)
        self.assertEqual(len(r["entry_ids"]), 2)
        self.assertEqual(es[0]["meal"], "desayuno"); self.assertAlmostEqual(es[0]["kcal"], 374 * 0.6)
        self.assertEqual(core.get_template(self.conn, t["id"])["items"][0]["quantity"], 50)  # plantilla intacta


class TestClose(Base):
    def test_close_requires_confirmation_then_protects(self):
        self.add("avena", 60, "g")
        r = core.close_day(self.conn, D1)
        self.assertFalse(r["closed"]); self.assertTrue(r["has_important"])
        codes = {w["code"] for w in r["warnings"]}
        self.assertTrue({"peso", "pasos", "actividad"} <= codes)
        r = core.close_day(self.conn, D1, force=True)
        self.assertTrue(r["closed"])
        with self.assertRaises(ClosedDayError):
            self.add("avena", 10, "g")
        with self.assertRaises(ClosedDayError):
            core.update_day(self.conn, D1, {"weight_kg": 81})
        with self.assertRaises(ApiError) as ctx:
            dispatch(self.conn, "PUT", "/api/days/%s" % D1, {}, {"steps": 1})
        self.assertEqual(ctx.exception.status, 409)
        core.reopen_day(self.conn, D1, "corregir peso")
        core.update_day(self.conn, D1, {"weight_kg": 81.2, "steps": 9000, "rest_day": True})
        r = core.close_day(self.conn, D1)
        self.assertTrue(r["closed"]); self.assertEqual(r["version"], 2)
        snap = core.day_state(self.conn, D1)["closure"]["summary"]
        self.assertEqual(snap["weight_kg"], 81.2)
        old = self.conn.execute("SELECT * FROM closures WHERE date=? AND version=1", (D1,)).fetchone()
        self.assertEqual(old["reopen_reason"], "corregir peso")

    def test_complete_day_closes_directly(self):
        self.add("avena", 60, "g", meal="desayuno"); self.add("avena", 60, "g", meal="almuerzo"); self.add("avena", 60, "g", meal="cena")
        core.update_day(self.conn, D1, {"weight_kg": 81.5, "steps": 8000})
        core.add_activity(self.conn, {"date": D1, "type": "fuerza", "minutes": 70, "intensity": "normal"})
        self.assertTrue(core.close_day(self.conn, D1)["closed"])


class TestEnergy(Base):
    def test_no_double_counting(self):
        core.update_day(self.conn, D1, {"weight_kg": 80, "steps": 10000})
        core.add_activity(self.conn, {"date": D1, "type": "carrera", "minutes": 30, "intensity": "normal",
                                      "steps_in_activity": 4500})
        en = core.energy(self.conn, D1, 2500)
        s = core.settings(self.conn)
        h = float(s["altura_cm"]); age = float(s["edad"])
        self.assertEqual(en["bmr"], round(10 * 80 + 6.25 * h - 5 * age + 5))
        self.assertEqual(en["steps_effective"], 5500)
        stride = h * 0.415 / 100
        self.assertEqual(en["steps_kcal"], round(5500 * stride / 1000 * 80 * 0.5))
        self.assertEqual(en["exercise_kcal"], round((9.8 - 1) * 80 * 0.5))  # neto: MET − 1
        self.assertEqual(en["tef"], 250)
        self.assertEqual(en["total"], round(en["bmr"] + en["tef"] + en["neat"] + en["steps_kcal"] + en["exercise_kcal"]), )

    def test_manual_net_kcal_and_missing_steps(self):
        core.add_activity(self.conn, {"date": D1, "type": "hyrox", "minutes": 60, "kcal_net": 500})
        en = core.energy(self.conn, D1, 0)
        self.assertEqual(en["exercise_kcal"], 500); self.assertFalse(en["complete"]); self.assertIsNone(en["steps_kcal"])
        self.assertFalse(en["weight_measured"])

    def test_moving_average(self):
        for i, w in enumerate([82.0, 81.0, 81.5]):
            core.update_day(self.conn, "2026-11-%02d" % (9 + i), {"weight_kg": w})
        a, n = core.avg7(self.conn, "2026-11-11")
        self.assertAlmostEqual(a, 81.5); self.assertEqual(n, 3)


class TestPersistence(Base):
    def test_rev_and_events(self):
        r0 = core.rev(self.conn) if hasattr(core, "rev") else None
        from salud.db import rev
        r0 = rev(self.conn)
        self.add("avena", 50, "g")
        self.assertEqual(rev(self.conn), r0 + 1)
        ev = core.events(self.conn, D1)
        self.assertEqual(ev[0]["action"], "add_entry")

    def test_backup_and_export(self):
        self.add("avena", 50, "g")
        p = core.backup(self.conn, "test", dest_dir=self.tmp.name)
        self.assertTrue(os.path.exists(p))
        z = zipfile.ZipFile(io.BytesIO(core.export_zip_bytes(self.conn)))
        data = json.loads(z.read("salud_completo.json"))
        self.assertEqual(len(data["foods"]), 34); self.assertEqual(len(data["entries"]), 1)
        self.assertIn("csv/entries.csv", z.namelist())

    def test_reconnect_persists(self):
        self.add("avena", 50, "g")
        path = self.conn.execute("PRAGMA database_list").fetchone()[2]
        self.conn.close()
        self.conn = connect(path)
        self.assertEqual(core.day_state(self.conn, D1)["entry_count"], 1)


class TestTraining(Base):
    W = {"date": D1, "title": "Pecho", "duration_min": 60, "activity_type": "fuerza", "exercises": [
        {"name": "Press Banca (Barra)", "kind": "peso", "sets": [{"type": "W", "weight_kg": 40, "reps": 10},
                                                              {"weight_kg": 70, "reps": 12}, {"weight_kg": 70, "reps": 10}]},
        {"name": "Fondos", "kind": "lastre", "sets": [{"weight_kg": 60, "reps": 13}]}]}

    def test_age_from_birthday(self):
        core.update_settings(self.conn, {"fecha_nacimiento": "2003-05-20"})
        s = core.settings(self.conn)
        self.assertEqual(core.age_on(s, "2026-05-19"), 22)
        self.assertEqual(core.age_on(s, "2026-05-20"), 23)

    def test_hevy_1rm_and_settings(self):
        from salud import training as T
        self.assertAlmostEqual(T.e1rm(75, 10), 100)
        self.assertAlmostEqual(T.e1rm(20, 35), 40)
        self.assertAlmostEqual(T.e1rm(185, 16), 185 / 0.65)
        r = T.set_exercise_settings(self.conn, {"name": "Press de Piernas", "machine_kg": 45, "equipment": "discos"})
        self.assertEqual(r["machine_kg"], 45)
        self.assertEqual(T.exercise_settings(self.conn)["press de piernas"]["equipment"], "discos")
        self.assertEqual(T._norm_ex("Dead Hang"), T._norm_ex("Colgado en barra"))

    def test_workout_creates_activity_and_volume(self):
        from salud import training as T
        w = T.create_workout(self.conn, self.W)
        self.assertEqual(w["sets_count"], 4)  # como Hevy: cuenta el calentamiento
        self.assertEqual(w["work_sets_count"], 3)
        self.assertEqual(w["volume_kg"], round(40 * 10 + 70 * 22 + (81.5 + 60) * 13))  # como Hevy: incluye el calentamiento y, en fondos con lastre, el peso corporal
        acts = core.day_activities(self.conn, D1)
        self.assertEqual(len(acts), 1); self.assertEqual(acts[0]["minutes"], 60)
        self.assertGreater(core.energy(self.conn, D1, 0)["exercise_kcal"], 0)
        T.update_workout(self.conn, w["id"], {"duration_min": 90})
        self.assertEqual(core.day_activities(self.conn, D1)[0]["minutes"], 90)
        T.delete_workout(self.conn, w["id"])
        self.assertEqual(core.day_activities(self.conn, D1), [])

    def test_previous_and_history(self):
        from salud import training as T
        T.create_workout(self.conn, dict(self.W, date="2026-11-02"))
        w = T.create_workout(self.conn, self.W)
        self.assertEqual(w["exercises"][0]["previous"]["date"], "2026-11-02")
        self.assertEqual(len(T.exercise_history(self.conn, "press banca (barra)")), 2)

    def test_merge_exercises(self):
        from salud import training as T
        import copy
        old = copy.deepcopy(self.W); old["date"] = "2026-11-02"
        old["exercises"][0]["name"] = "Press Banca Viejo"
        T.create_workout(self.conn, old)
        T.create_workout(self.conn, self.W)
        self.assertEqual(len(T.exercise_history(self.conn, "press banca (barra)")), 1)
        T.set_exercise_settings(self.conn, {"name": "Press Banca Viejo", "same_as": "Press Banca (Barra)"})
        self.assertEqual(len(T.exercise_history(self.conn, "press banca (barra)")), 2)
        self.assertEqual(len(T.exercise_history(self.conn, "Press Banca Viejo")), 2)
        n = [e for e in T.exercise_names(self.conn) if e["sessions"] == 2]
        self.assertEqual(n[0]["name"], self.W["exercises"][0]["name"])
        self.assertIn("Press Banca Viejo", n[0]["also"])
        with self.assertRaises(core.ValidationError):  # no se puede unir al revés a la vez
            T.set_exercise_settings(self.conn, {"name": "Press Banca (Barra)", "same_as": "Press Banca Viejo"})
        T.set_exercise_settings(self.conn, {"name": "Press Banca Viejo", "same_as": ""})
        self.assertEqual(len(T.exercise_history(self.conn, "press banca (barra)")), 1)

    def test_steps_total(self):
        r = core.ingest_health(self.conn, {"steps": "8123", "date": D1})
        self.assertEqual(r["dias"][0]["pasos"], 8123)
        self.assertEqual(core.get_day_row(self.conn, D1)["steps"], 8123)
        core.ingest_health(self.conn, {"steps": [{"count": 100, "start_time": D1 + "T10:00:00+01:00", "end_time": D1 + "T10:15:00+01:00"}]})
        core.ingest_health(self.conn, {"steps": 9000, "date": D1})  # el total sustituye a los tramos
        self.assertEqual(core.get_day_row(self.conn, D1)["steps"], 9000)

    def test_steps_daily_then_buckets(self):
        core.ingest_health(self.conn, {"steps": [{"count": 500, "start_time": D1 + "T00:00:00+01:00", "end_time": D1 + "T19:48:00+01:00"}]})
        self.assertEqual(core.get_day_row(self.conn, D1)["steps"], 500)
        core.ingest_health(self.conn, {"steps": [{"count": 300, "start_time": D1 + "T19:00:00+01:00", "end_time": D1 + "T19:15:00+01:00"}]})
        self.assertEqual(core.get_day_row(self.conn, D1)["steps"], 300)  # el total del día se sustituye por los tramos

    def test_body_from_phone(self):
        from salud import training as T
        p = {"weight": [{"kilograms": 81.6, "time": D1 + "T08:01:10+01:00"}], "body_fat": [{"percentage": 18.2, "time": D1 + "T08:01:10+01:00"}],
             "basal_metabolic_rate": [{"watts": 85.0, "time": D1 + "T08:01:10+01:00"}]}
        r = core.ingest_health(self.conn, p)
        self.assertTrue(r["bascula"][0]["nuevo"])
        self.assertEqual(core.get_day_row(self.conn, D1)["weight_kg"], 81.6)
        b = self.conn.execute("SELECT * FROM body_metrics WHERE date=?", (D1,)).fetchall()
        self.assertEqual(len(b), 1); self.assertEqual(b[0]["fat_pct"], 18.2); self.assertAlmostEqual(b[0]["bmr_kcal"], 1755.26, 1)
        core.ingest_health(self.conn, p)  # reenviado: no duplica
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM body_metrics WHERE date=?", (D1,)).fetchone()[0], 1)

    def test_note_variant(self):
        from salud import training as T
        self.assertEqual(T.note_variant("Dominada", "A un brazo sin goma"), "Dominada a una mano")
        self.assertEqual(T.note_variant("Dominada", "a una mano con goma morada"), "Dominada a una mano (asistida)")
        self.assertEqual(T.note_variant("Dominada", "A un brazo"), "Dominada a una mano (asistida)")
        self.assertEqual(T.note_variant("Dominada", "agarre ancho"), "Dominada")
        self.assertEqual(T.note_variant("Press Banca (Barra)", "a una mano"), "Press Banca (Barra)")

    def test_closed_day_blocks_workout(self):
        from salud import training as T
        core.close_day(self.conn, D1, force=True)
        with self.assertRaises(ClosedDayError):
            T.create_workout(self.conn, self.W)

    def test_body_metrics(self):
        from salud import training as T
        r = T.add_body(self.conn, {"date": D1, "weight_kg": 81.4, "fat_pct": 18.5, "time": "08:00"})
        self.assertTrue(r["day_weight_updated"])
        self.assertEqual(core.get_day_row(self.conn, D1)["weight_kg"], 81.4)
        r = T.add_body(self.conn, {"date": D1, "weight_kg": 81.0})
        self.assertFalse(r["day_weight_updated"])  # no pisa el peso del día salvo que se pida

    def test_food_image(self):
        from salud import training as T
        T.PHOTO_DIR = os.path.join(self.tmp.name, "fotos")
        png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        r = T.set_food_image(self.conn, self.food("avena")["id"], data_url=png)
        self.assertTrue(os.path.exists(os.path.join(self.tmp.name, r["image"])))
        self.assertEqual(self.food("avena")["image"], r["image"])


class TestHevy(Base):
    def test_sync_maps_workouts(self):
        from salud import hevy as H
        core.set_setting(self.conn, "hevy_api_key", "00000000-0000-0000-0000-000000000000")
        wk = {"id": "abc", "title": "Pecho", "description": "ok", "start_time": "2026-11-09T17:30:00Z", "end_time": "2026-11-09T18:42:00Z",
              "exercises": [{"index": 0, "title": "Bench Press (Barbell)", "exercise_template_id": "T1", "sets": [
                  {"index": 0, "type": "warmup", "weight_kg": 40, "reps": 10}, {"index": 1, "type": "normal", "weight_kg": 70, "reps": 12}]},
                  {"index": 1, "title": "Dips", "exercise_template_id": "T2", "sets": [{"index": 0, "type": "failure", "weight_kg": 20, "reps": 12}]},
                  {"index": 2, "title": "Old", "exercise_template_id": "T3", "sets": []}]}
        old = {"id": "old1", "title": "Espalda", "start_time": "2026-04-01T17:00:00Z", "end_time": "2026-04-01T18:00:00Z", "exercises": []}
        tpls = {"T1": {"type": "weight_reps"}, "T2": {"type": "bodyweight_reps"}, "T3": {"type": "reps_only"}}
        calls = []
        def fake(key, path, params=None):
            calls.append(path)
            if path.startswith("/v1/exercise_templates/"):
                t = path.rsplit("/", 1)[1]
                return {"id": t, "title": t, **tpls[t]}
            return {"page": 1, "page_count": 1, "events": [{"type": "updated", "workout": wk}, {"type": "updated", "workout": old}]}
        H._get = fake
        r = H.sync(self.conn)
        self.assertEqual(r["created"], 2)
        from salud import training as T
        ws = T.list_workouts(self.conn)
        new = [w for w in ws if w["hevy_id"] == "abc"][0]
        self.assertEqual(new["duration_min"], 72)
        self.assertEqual(new["exercises"][1]["kind"], "lastre")
        self.assertEqual(new["exercises"][0]["sets"][0]["type"], "calentamiento")
        self.assertEqual(len(core.day_activities(self.conn, new["date"])), 1)
        self.assertEqual(core.day_activities(self.conn, "2026-04-01"), [])  # histórico: sin gasto ni día
        r = H.sync(self.conn)  # idempotente
        self.assertEqual(r["created"], 0); self.assertEqual(r["updated"], 2)
        self.assertEqual(len(T.list_workouts(self.conn)), 2)


class TestProfileDefaults(unittest.TestCase):
    def test_new_account_has_no_invented_profile(self):
        with tempfile.TemporaryDirectory() as t:
            conn = connect(os.path.join(t, "n.db")); core.ensure_defaults(conn)
            en = core.energy(conn, D1, 0)
            self.assertIsNone(en["bmr"]); self.assertIsNone(en["total"]); self.assertIn("peso", en["missing_profile"])
            conn.close()


class TestAgentTokens(unittest.TestCase):
    def test_tokens_per_agent_legacy_and_revoke(self):
        import json as _j
        from salud import auth
        with tempfile.TemporaryDirectory() as base:
            auth.set_password(base, "ana", "contrasena123", "Ana")
            legacy = auth.new_api_token(base, "ana")
            # simula el formato antiguo (un solo token)
            us = auth.list_users(base); t = us["ana"].pop("tokens")[0]; us["ana"]["api_token"] = t["hash"]
            auth._write(auth.users_path(base), us)
            self.assertEqual(auth.token_user(base, legacy, "Claude"), "ana")
            t2 = auth.new_api_token(base, "ana", "codex")
            self.assertEqual(auth.token_user(base, t2, "chatgpt"), "ana")
            ts = auth.list_tokens(base, "ana")
            self.assertEqual(sorted(x["agent"] for x in ts), ["chatgpt", "claude"])
            self.assertEqual([x["kind"] for x in ts if x["agent"] == "chatgpt"], ["codex"])
            auth.revoke_api_token(base, "ana", [x["id"] for x in ts if x["agent"] == "claude"][0])
            self.assertIsNone(auth.token_user(base, legacy))
            self.assertEqual(auth.token_user(base, t2), "ana")
            auth.revoke_api_token(base, "ana")
            self.assertIsNone(auth.token_user(base, t2))


class TestStrengthLevel(Base):
    PAGE = ("<h2 class='t'>Male Pull Ups Standards</h2>" + ("<table class=\"table is-striped is-fullwidth is-narrow has-text-right\"><tr><th>BW</th></tr>"
            "<tr><td>50</td><td>&lt; 1</td><td>6</td><td>14</td><td>24</td><td>34</td></tr></table>") * 2 +
            ("<table class=\"table is-striped is-fullwidth is-narrow has-text-right\"><tr><th>BW</th></tr>"
             "<tr><td>50</td><td>-5 kg</td><td>+7 kg</td><td>+22 kg</td><td>+39 kg</td><td>+56 kg</td></tr></table>") * 2)

    def test_parse_cache_and_setting(self):
        from salud import strengthlevel as SL
        page = self.PAGE + self.PAGE.replace("Male", "Female")
        with tempfile.TemporaryDirectory() as d:
            calls = []
            data = SL.get(d, "pull-ups", fetch=lambda u: calls.append(u) or page)
            self.assertEqual(data["name"], "Pull Ups")
            self.assertEqual(data["H"]["reps"][0], [50, 0.5, 6, 14, 24, 34])
            self.assertEqual(data["M"]["add"][0], [50, -5, 7, 22, 39, 56])
            SL.get(d, "pull-ups", fetch=lambda u: calls.append(u) or page)
            self.assertEqual(len(calls), 1)  # la segunda vez sale de la caché
            with self.assertRaises(SL.SLError):
                SL.get(d, "../etc", fetch=lambda u: page)
        r = dispatch(self.conn, "PUT", "/api/exercise-settings", {}, {"name": "Dominadas Escapulares", "sl_slug": "https://strengthlevel.com/strength-standards/scapular-pull-ups/kg"}, "web")
        self.assertEqual(r["sl_slug"], "scapular-pull-ups")


class TestNotes(Base):
    def test_notes_roundtrip(self):
        self.assertEqual(dispatch(self.conn, "GET", "/api/notes/claude", {}, {}, "chat")["body"], "")
        dispatch(self.conn, "PUT", "/api/notes/claude", {}, {"body": "- objetivo 2.450 kcal"}, "chat")
        self.assertEqual(dispatch(self.conn, "GET", "/api/notes/claude", {}, {}, "chat")["body"], "- objetivo 2.450 kcal")
        with self.assertRaises(ApiError):
            dispatch(self.conn, "PUT", "/api/notes/claude", {}, {"body": 5}, "chat")


if __name__ == "__main__":
    unittest.main()


class TestDynamicTarget(Base):
    def test_balance_queda_en_la_diferencia(self):
        core.set_target(self.conn, {"valid_from": D1, "mode": "gasto", "kcal_offset": -300, "protein_per_kg": 2, "fat_min_pct": 25, "fat_max_pct": 35}, "test")
        core.update_day(self.conn, D2, {"steps": 8000}, "test")
        st = core.day_state(self.conn, D2)
        tg = st["target"]
        self.assertTrue(tg["dynamic"])
        # si come exactamente el objetivo, el balance (comido − gasto con su TEF) queda en −300
        tef = float(core.settings(self.conn)["tef_pct"])
        gasto = tg["base_kcal"] + tef * tg["kcal"]
        self.assertAlmostEqual(tg["kcal"] - gasto, -300, delta=2)
        self.assertEqual(tg["protein_g"], round(2 * 81.5))

    def test_fijo_que_no_cuadra(self):
        from salud.db import ValidationError
        with self.assertRaises(ValidationError):
            core.set_target(self.conn, {"valid_from": D1, "kcal": 1200, "protein_g": 250, "fat_min_g": 60}, "test")
