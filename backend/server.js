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
    const userId = req.params.userId;
    const selectedMonth = req.query.month; 

    let sql = "SELECT * FROM transactions WHERE user_id = ?";
    const params = [userId];

    if (selectedMonth) {
        sql += " AND DATE_FORMAT(transaction_date, '%Y-%m') = ?";
        params.push(selectedMonth);
    }

    sql += " ORDER BY transaction_date DESC, created_at DESC";

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

app.post("/transactions", (req, res) => {
    const { userId, type, amount, category, description, month } = req.body;

    const transactionDate = month ? `${month}-01` : new Date().toISOString().slice(0, 10);

    db.query(
        `INSERT INTO transactions (user_id, type, amount, category, description, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, type, amount, category, description, transactionDate],
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
    const { userId, category, limit_amount, month } = req.body;
    
    if (!month) return res.status(400).json({ message: "Target month context is required" });
    const budgetMonth = `${month}-01`; 

    db.query(
        `INSERT INTO budgets (user_id, category, limit_amount, budget_month)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE limit_amount = VALUES(limit_amount)`,
        [userId, category, limit_amount, budgetMonth],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Budget saved" });
        }
    );
});

/* ===================== BUDGET STATUS ===================== */
app.get("/budget-status/:userId", (req, res) => {
    const userId = req.params.userId;
    const selectedMonth = req.query.month; 
    const budgetMonth = selectedMonth ? `${selectedMonth}-01` : null;

    let sql = "SELECT * FROM view_budget_report WHERE user_id = ?";
    const params = [userId];

    if (budgetMonth) {
        sql += " AND budget_month = ?";
        params.push(budgetMonth);
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

/* ===================== ANALYTICS ENDPOINTS ===================== */

app.get("/api/analytics/monthly/:userId", (req, res) => {
    const userId = req.params.userId;

    const sql = `
        SELECT total_income, total_expense, month_year 
        FROM view_monthly_comparison 
        WHERE user_id = ? 
        LIMIT 6
    `;

    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result.reverse());
    });
});

app.get("/api/analytics/categories/:userId", (req, res) => {
    const userId = req.params.userId;
    const selectedMonth = req.query.month; 

    let sql = "SELECT category, total_amount FROM view_category_distribution WHERE user_id = ?";
    const params = [userId];

    if (selectedMonth) {
        sql += " AND target_month = ?";
        params.push(selectedMonth);
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

app.get("/api/analytics/yearly-summary/:userId", (req, res) => {
    const userId = req.params.userId;
    const targetYear = req.query.year || new Date().getFullYear();

    const yearlySql = `
        SELECT 
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS yearlyIncome,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS yearlyExpense
        FROM transactions 
        WHERE user_id = ? AND YEAR(transaction_date) = ?
    `;

    const netWorthSql = `
        SELECT 
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) -
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS netWorth
        FROM transactions 
        WHERE user_id = ?
    `;

    db.query(yearlySql, [userId, targetYear], (err, yearlyResult) => {
        if (err) return res.status(500).json(err);

        db.query(netWorthSql, [userId], (err2, netWorthResult) => {
            if (err2) return res.status(500).json(err2);

            res.json({
                yearlyIncome: yearlyResult[0].yearlyIncome || 0,
                yearlyExpense: yearlyResult[0].yearlyExpense || 0,
                netWorth: netWorthResult[0].netWorth || 0
            });
        });
    });
});

/* ===================== FIXED: SINGLE CATEGORY BUDGET RESET ===================== */
app.delete("/api/reset-budget/:userId", (req, res) => {
    const userId = req.params.userId;
    const selectedMonth = req.query.month; 
    const category = req.query.category; // Dynamically binds chosen category target parameter

    if (!selectedMonth || !category) {
        return res.status(400).json({ message: "Month and Category query parameters are required" });
    }

    const budgetMonthDate = `${selectedMonth}-01`;

    // Target deletion strictly matches the specific user, month, and category
    const deleteBudgetSql = `
        DELETE FROM budgets 
        WHERE user_id = ? AND budget_month = ? AND LOWER(TRIM(category)) = LOWER(TRIM(?))
    `;

    db.query(deleteBudgetSql, [userId, budgetMonthDate, category], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: `Successfully cleared your ${category.toUpperCase()} budget limit!` });
    });
});

/* ===================== SERVER ===================== */
// CHANGED: Explicitly run listener operations over Port 3002 to match frontend queries
app.listen(3002, () => {
    console.log("🚀 Server running on port 3002");
});