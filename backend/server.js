const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db"); // Your MySQL connection file

const app = express();

app.use(cors());
app.use(bodyParser.json());

/* ===================== AUTHENTICATION ROUTES ===================== */

// 1. LOGIN ROUTE
app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    // Mapping 'username' to 'name' and 'password_hash' to 'password' for full compatibility
    const sql = "SELECT id, username AS name, email, password_hash AS password FROM users WHERE email = ?";
    db.query(sql, [email], (err, results) => {
        if (err) return res.status(500).json({ message: "Database query error", error: err });
        
        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid email address or password." });
        }

        const user = results[0];

        // Direct matching plain text or custom comparisons
        if (user.password !== password) {
            return res.status(401).json({ message: "Invalid email address or password." });
        }

        // Return credentials expected by frontend storage
        res.json({
            message: "Login successful",
            userId: user.id,
            name: user.name || email.split('@')[0]
        });
    });
});

// 2. FORGOT PASSWORD ROUTE (Generates a local reset link in the VS Code terminal)
app.post("/api/auth/forgot-password", (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email parameter is required." });
    }

    // Verify user profile presence locally before initializing a reset payload
    const sql = "SELECT id FROM users WHERE email = ?";
    db.query(sql, [email], (err, results) => {
        if (err) return res.status(500).json({ message: "Database lookup failed.", error: err });

        if (results.length === 0) {
            return res.status(404).json({ message: "No registered account found with this email address." });
        }

        // 📋 PRINT CLICKABLE RESET LINK DIRECTLY IN YOUR VS CODE TERMINAL
        console.log(`\n🔑 PASSWORD RESET INITIATED`);
        console.log(`Target Email: ${email}`);
        console.log(`Click to Reset: http://127.0.0.1:3000/frontend/RESET.HTML?email=${encodeURIComponent(email)}`);
        console.log(`----------------------------------------------------\n`);

        // Return success confirmation to frontend
        res.json({ 
            message: "A password recovery process has been initialized. Check your simulated delivery logs!" 
        });
    });
});

// 2b. RESET PASSWORD ROUTE (Updates MySQL with the new password)
app.post("/api/auth/reset-password", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and new password are required." });
    }

    // Set the password_hash column in the users table
    const sql = "UPDATE users SET password_hash = ? WHERE email = ?";
    db.query(sql, [password, email], (err, result) => {
        if (err) return res.status(500).json({ message: "Database update failed.", error: err });

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "No registered account found with this email." });
        }

        res.json({ message: "Password updated successfully!" });
    });
});

// 3. REGISTER / SIGNUP ROUTE (Supports both endpoint variations)
app.post(["/api/auth/signup", "/api/auth/register"], (req, res) => {
    const { username, name, email, password } = req.body;
    
    // Fallback to support both "username" (from signup.html) and "name" properties
    const displayName = username || name;

    if (!displayName || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required." });
    }

    // Check if the user email is already registered
    const checkUserSql = "SELECT id FROM users WHERE email = ?";
    db.query(checkUserSql, [email], (err, results) => {
        if (err) {
            console.error("❌ SQL Check Error:", err);
            return res.status(500).json({ message: "Database error during lookup.", error: err });
        }

        if (results.length > 0) {
            return res.status(409).json({ message: "An account with this email address already exists." });
        }

        // Insert mapped to the correct columns: 'username' and 'password_hash'
        const insertUserSql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";
        db.query(insertUserSql, [displayName, email, password], (err2, result) => {
            if (err2) {
                console.error("❌ SQL Insert Error:", err2);
                return res.status(500).json({ message: "Database registration failure.", error: err2 });
            }

            // Return user details expected by the frontend
            res.status(201).json({
                message: "Account created successfully!",
                userId: result.insertId,
                name: displayName
            });
        });
    });
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
    db.query("DELETE FROM transactions WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Deleted" });
    });
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

/* ===================== ANALYTICS ===================== */
app.get("/api/analytics/monthly/:userId", (req, res) => {
    const userId = req.params.userId;
    const sql = `SELECT total_income, total_expense, month_year FROM view_monthly_comparison WHERE user_id = ? LIMIT 6`;

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

    const yearlySql = `SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS yearlyIncome, SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS yearlyExpense FROM transactions WHERE user_id = ? AND YEAR(transaction_date) = ?`;
    const netWorthSql = `SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS netWorth FROM transactions WHERE user_id = ?`;

    db.query(yearlySql, [userId, targetYear], (err, yearlyResult) => {
        if (err) return res.status(500).json(err);
        db.query(netWorthSql, [userId], (err2, netWorthResult) => {
            if (err2) return res.status(500).json(err2);
            res.json({
                yearlyIncome:  yearlyResult[0].yearlyIncome  || 0,
                yearlyExpense: yearlyResult[0].yearlyExpense || 0,
                netWorth:      netWorthResult[0].netWorth    || 0
            });
        });
    });
});

/* ===================== RESET SINGLE BUDGET ===================== */
app.delete("/api/reset-budget/:userId", (req, res) => {
    const userId = req.params.userId;
    const selectedMonth = req.query.month;
    const category = req.query.category;

    if (!selectedMonth || !category) {
        return res.status(400).json({ message: "Month and Category query parameters are required" });
    }

    const budgetMonthDate = `${selectedMonth}-01`;

    db.query(
        `DELETE FROM budgets 
         WHERE user_id = ? AND budget_month = ? AND LOWER(TRIM(category)) = LOWER(TRIM(?))`,
        [userId, budgetMonthDate, category],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: `Successfully cleared your ${category.toUpperCase()} budget limit!` });
        }
    );
});

/* ===================== SERVER ===================== */
app.listen(3002, () => {
    console.log("🚀 Node.js Core Feature Server running on port 3002");
});