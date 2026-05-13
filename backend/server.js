const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");

const app = express();

app.use(cors());
app.use(bodyParser.json());

/* ===================== LOGIN ===================== */

app.get("/api/login", (req, res) => {

    const email = req.query.email;

    if (!email) {
        return res.status(400).json({ message: "Email required" });
    }

    db.query(
        "SELECT id, username FROM users WHERE email = ?",
        [email],
        (err, result) => {

            if (err) return res.status(500).json(err);

            if (result.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }

            res.json(result[0]);
        }
    );
});

/* ===================== TRANSACTIONS ===================== */

app.get("/transactions/:userId", (req, res) => {

    db.query(
        "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC",
        [req.params.userId],
        (err, result) => {

            if (err) return res.status(500).json(err);

            res.json(result);
        }
    );
});

app.post("/transactions", (req, res) => {

    const { userId, type, amount, category, description } = req.body;

    if (!userId || !type || !amount) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    db.query(
        `INSERT INTO transactions (user_id, type, amount, category, description)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, type, amount, category, description],
        (err) => {

            if (err) return res.status(500).json(err);

            res.json({ message: "Transaction added successfully" });
        }
    );
});

app.delete("/transactions/:id", (req, res) => {

    db.query(
        "DELETE FROM transactions WHERE id = ?",
        [req.params.id],
        (err) => {

            if (err) return res.status(500).json(err);

            res.json({ message: "Transaction deleted" });
        }
    );
});

/* ===================== BUDGETS ===================== */

app.post("/budgets", (req, res) => {

    const { userId, category, limit_amount } = req.body;

    if (!userId || !category || !limit_amount) {
        return res.status(400).json({ message: "Missing budget fields" });
    }

    db.query(
        `INSERT INTO budgets (user_id, category, limit_amount)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE limit_amount = VALUES(limit_amount)`,
        [userId, category, limit_amount],
        (err) => {

            if (err) return res.status(500).json(err);

            res.json({ message: "Budget saved successfully" });
        }
    );
});

/* ===================== BUDGET STATUS ===================== */

app.get("/budget-status/:userId", (req, res) => {

    db.query(
        `SELECT * FROM view_budget_report WHERE user_id = ?`,
        [req.params.userId],
        (err, result) => {

            if (err) return res.status(500).json(err);

            res.json(result);
        }
    );
});

/* ===================== SERVER START ===================== */

app.listen(3001, () => {
    console.log("🚀 Server running on port 3001");
});