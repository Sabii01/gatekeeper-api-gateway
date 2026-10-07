import express from "express";
import { pool } from "./db.js";

const router = express.Router();

router.get("/users/:id", async (req, res) => {
    const result = await pool.query(
        "SELECT * FROM users WHERE id = " + req.params.id
    );
    res.json(result.rows[0]);
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows[0].password == password) {
        res.json({ token: "abc123" });
    }
});

export default router;