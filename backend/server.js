const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db"); // Ensure db.js is in the same directory

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

/* ===================== SIGN UP (New) ===================== */
// This replaces the manual hardcoded INSERTs in image_b10213.png
app.post("/api/signup", (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const sql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";
    
    db.query(sql, [username, email, password], (err, result) => {
        if (err) {
            // Check for duplicate entries (e.g., same email)
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: "Username or Email already exists" });
            }
            return res.status(500).json(err);
        }
        res.status(201).json({ 
            message: "User registered successfully!", 
            userId: result.insertId 
        });
    });
});

/* ===================== LOGIN (Updated) ===================== */
// Changed to POST to securely handle password data from image_b1024f.png
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
    }

    db.query(
        "SELECT id, username, password_hash FROM users WHERE email = ?",
        [email],
        (err, result) => {
            if (err) return res.status(500).json(err);

            if (result.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }

            const user = result[0];

            // Compare the password (Note: Use bcrypt.compare here if you hash passwords)
            if (user.password_hash === password) {
                res.json({ 
                    id: user.id, 
                    username: user.username,
                    message: "Login successful" 
                });
            } else {
                res.status(401).json({ message: "Invalid credentials" });
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
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});