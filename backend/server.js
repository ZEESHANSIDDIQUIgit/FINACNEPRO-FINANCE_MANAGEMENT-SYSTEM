const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");

const app = express();

app.use(cors());
app.use(bodyParser.json());

/* ===================== SIGNUP ===================== */
app.post("/api/signup", (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const sql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";

    db.query(sql, [username, email, password], (err, result) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ message: "User already exists" });
            }
            return res.status(500).json(err);
        }

        res.json({ message: "User created", userId: result.insertId });
    });
});

/* ===================== LOGIN ===================== */
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE email = ?",
        [email],
        (err, result) => {
            if (err) return res.status(500).json(err);

            if (result.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }

            const user = result[0];

            if (user.password_hash === password) {
                res.json({
                    id: user.id,
                    username: user.username,
                    message: "Login success"
                });
            } else {
                res.status(401).json({ message: "Wrong password" });
            }
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

    db.query(
        `INSERT INTO transactions (user_id, type, amount, category, description)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, type, amount, category, description],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Transaction added" });
        }
    );
});

app.delete("/transactions/:id", (req, res) => {
    db.query(
        "DELETE FROM transactions WHERE id = ?",
        [req.params.id],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Deleted" });
        }
    );
});

/* ===================== BUDGETS ===================== */
app.post("/budgets", (req, res) => {
    const { userId, category, limit_amount } = req.body;

    db.query(
        `INSERT INTO budgets (user_id, category, limit_amount)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE limit_amount = VALUES(limit_amount)`,
        [userId, category, limit_amount],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Budget saved" });
        }
    );
});

/* ===================== BUDGET STATUS ===================== */
app.get("/budget-status/:userId", (req, res) => {
    db.query(
        "SELECT * FROM view_budget_report WHERE user_id = ?",
        [req.params.userId],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        }
    );
});

/* ===================== FIXED ANALYTICS (IMPORTANT) ===================== */

/* 🔥 MONTHLY CHART (FIXED - NO VIEW) */
app.get("/api/analytics/monthly/:userId", (req, res) => {
    const userId = req.params.userId;

    const sql = `
        SELECT 
            user_id,
            DATE_FORMAT(created_at, '%M %Y') AS month_year,
            SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense
        FROM transactions
        WHERE user_id = ?
        GROUP BY user_id, DATE_FORMAT(created_at, '%M %Y')
        ORDER BY MAX(created_at) DESC
        LIMIT 6
    `;

    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

/* 🔥 CATEGORY CHART (FIXED - NO VIEW) */
app.get("/api/analytics/categories/:userId", (req, res) => {
    const userId = req.params.userId;

    const sql = `
        SELECT 
            category,
            SUM(amount) AS total_amount
        FROM transactions
        WHERE user_id = ? AND type='expense'
        GROUP BY category
    `;

    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

/* ===================== SERVER ===================== */
app.listen(3001, () => {
    console.log("🚀 Server running on port 3001");
});