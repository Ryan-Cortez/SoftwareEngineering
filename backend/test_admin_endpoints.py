import unittest


class AdminEndpointsTests(unittest.TestCase):
    """
    Minimal "test readiness" checks using Flask's built-in test client.

    These tests assume you are running against a real DB that already has:
      - users/admin seeded (seed.sql inserts admin_id=1)
      - showrooms seeded (seed.sql inserts 3 showrooms)
    """

    def setUp(self):
        from app import app

        self.app = app
        self.client = app.test_client()

        # Log in as seeded admin user.
        # If you changed the password via reset flow, update this password.
        resp = self.client.post(
            "/api/auth/login",
            json={"email": "nrw82335@uga.edu", "password": "CHANGE_ME"},
        )
        # If login fails, the tests can't proceed; keep the assertion message simple.
        self.assertEqual(resp.status_code, 200, msg=resp.get_data(as_text=True))

    def test_admin_add_movie_validation(self):
        resp = self.client.post("/api/admin/movies", json={})
        self.assertEqual(resp.status_code, 400)

    def test_admin_add_showtime_conflict(self):
        # Use an existing seeded showtime slot (from seed.sql) to force a conflict.
        # Seed has (1, 1, '2026-03-27 13:00:00') for show table.
        resp = self.client.post(
            "/api/admin/shows",
            json={"movie_id": 1, "showroom_id": 1, "start_time": "2026-03-27T13:00:00"},
        )
        self.assertEqual(resp.status_code, 409, msg=resp.get_data(as_text=True))

    def test_list_showrooms(self):
        resp = self.client.get("/api/showrooms")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(isinstance(data, list))
        self.assertGreaterEqual(len(data), 3)


if __name__ == "__main__":
    unittest.main()

