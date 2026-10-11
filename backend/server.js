require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const db = require("./db"); // Your MySQL connection file

const app = express();

app.use(cors());
app.use(bodyParser.json());

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ===================== MAILER ===================== */
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

function sendOtpEmail(toEmail, otp) {
    return transporter.sendMail({
        from: `"FinancePro" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `${otp} is your FinancePro verification code`,
        html: `
            <div style="font-family: Inter, sans-serif; background:#0d0d0d; padding:32px; color:#fff;">
              <h2 style="color:#FFD700;">Verify your email</h2>
              <p>Enter this code to finish creating your FinancePro account:</p>
              <p style="font-size:32px; letter-spacing:8px; font-weight:700; color:#FFD700;">${otp}</p>
              <p style="color:#888; font-size:12px;">This code expires in 10 minutes.</p>
            </div>
        `
    });
}

function sendWelcomeEmail(toEmail, username) {
    return transporter.sendMail({
        from: `"FinancePro" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: "Welcome to FinancePro 🎉",
        html: `
            <div style="font-family: Inter, sans-serif; background:#0d0d0d; padding:32px; color:#fff;">
              <h2 style="color:#FFD700;">Welcome to FinancePro, ${username}!</h2>
              <p>Your account has been created and verified. You can now log in and start
              tracking your budgets, transactions, and reports.</p>
              <p style="color:#888; font-size:12px; margin-top:24px;">
                If you didn't create this account, you can safely ignore this email.
              </p>
            </div>
        `
    });
}

/* ===================== PENDING SIGNUP STORE (in-memory) =====================
 * Holds unverified signups until the OTP is confirmed, so no row is written to
 * `users` until the email is proven live. Fine for a single server process; move
 * to a `pending_signups` table or Redis if you ever run more than one instance.
 */
const pendingSignups = new Map(); // email -> { username, passwordHash, otp, expiresAt }
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

/* ===================== AUTHENTICATION ROUTES ===================== */

// 1. LOGIN ROUTE (unchanged)
app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    const sql = "SELECT id, username AS name, email, password_hash FROM users WHERE email = ?";
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ message: "Database query error", error: err });

        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid email address or password." });
        }

        const user = results[0];

        if (!user.password_hash) {
            return res.status(401).json({ message: "This account uses Google Sign-In. Try that instead." });
        }

        try {
            const passwordMatches = await bcrypt.compare(password, user.password_hash);

            if (!passwordMatches) {
                return res.status(401).json({ message: "Invalid email address or password." });
            }

            res.json({
                message: "Login successful",
                userId: user.id,
                name: user.name || email.split('@')[0]
            });
        } catch (compareErr) {
            console.error("❌ Password compare error:", compareErr);
            return res.status(500).json({ message: "Login failed due to a server error." });
        }
    });
});

// 2. FORGOT PASSWORD / RESET PASSWORD ROUTES (token-based, see routes/passwordReset.js)
const passwordResetRoutes = require("./routes/passwordReset");
app.use("/api/auth", passwordResetRoutes);

// 3a. REQUEST SIGNUP OTP (replaces the old direct /api/auth/signup insert)
app.post("/api/auth/signup/request-otp", (req, res) => {
    const { username, name, email, password } = req.body;
    const displayName = username || name;

    if (!displayName || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required." });
    }

    const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailFormat.test(email)) {
        return res.status(400).json({ message: "Enter a valid email address." });
    }

    const checkUserSql = "SELECT id FROM users WHERE email = ?";
    db.query(checkUserSql, [email], async (err, results) => {
        if (err) {
            console.error("❌ SQL Check Error:", err);
            return res.status(500).json({ message: "Database error during lookup." });
        }

        if (results.length > 0) {
            return res.status(409).json({ message: "An account with this email address already exists." });
        }

        try {
            const passwordHash = await bcrypt.hash(password, 10);
            const otp = generateOtp();

            pendingSignups.set(email, {
                username: displayName,
                passwordHash,
                otp,
                expiresAt: Date.now() + OTP_TTL_MS
            });

            await sendOtpEmail(email, otp);
            res.json({ message: "Verification code sent" });

        } catch (mailErr) {
            console.error("❌ OTP send error:", mailErr);
            res.status(500).json({ message: "Could not send verification code." });
        }
    });
});

// 3b. VERIFY SIGNUP OTP → actually creates the account
app.post("/api/auth/signup/verify-otp", (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and code are required." });
    }

    const pending = pendingSignups.get(email);
    if (!pending) {
        return res.status(400).json({ message: "No pending signup for this email. Request a new code." });
    }
    if (Date.now() > pending.expiresAt) {
        pendingSignups.delete(email);
        return res.status(400).json({ message: "Code expired. Request a new one." });
    }
    if (otp !== pending.otp) {
        return res.status(400).json({ message: "Incorrect code." });
    }

    const insertUserSql = "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";
    db.query(insertUserSql, [pending.username, email, pending.passwordHash], async (err2, result) => {
        if (err2) {
            console.error("❌ SQL Insert Error:", err2);
            return res.status(500).json({ message: "Database registration failure." });
        }

        pendingSignups.delete(email);

        try {
            await sendWelcomeEmail(email, pending.username);
        } catch (mailErr) {
            console.error("Welcome email failed to send:", mailErr.message);
            // don't fail the request — the account was still created
        }

        res.status(201).json({
            message: "Account created successfully!",
            userId: result.insertId,
            name: pending.username
        });
    });
});

// 3c. GOOGLE SIGN-IN (email already verified by Google, so no OTP needed)
app.post("/api/auth/google", async (req, res) => {
    const { credential } = req.body;
    if (!credential) {
        return res.status(400).json({ message: "Missing Google credential" });
    }

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { email, name, sub: googleId } = payload;

        db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
            if (err) {
                console.error("❌ SQL Check Error:", err);
                return res.status(500).json({ message: "Database error during lookup." });
            }

            if (results.length > 0) {
                const user = results[0];
                return res.json({
                    message: "Login successful",
                    userId: user.id,
                    name: user.username || email.split("@")[0]
                });
            }

            // First time signing in with Google — create the account
            const displayName = name.replace(/\s+/g, "").toLowerCase();
            const insertSql = "INSERT INTO users (username, email, password_hash, google_id) VALUES (?, ?, NULL, ?)";
            db.query(insertSql, [displayName, email, googleId], async (err2, result) => {
                if (err2) {
                    console.error("❌ SQL Insert Error:", err2);
                    return res.status(500).json({ message: "Database registration failure." });
                }

                try {
                    await sendWelcomeEmail(email, displayName);
                } catch (mailErr) {
                    console.error("Welcome email failed to send:", mailErr.message);
                }

                res.status(201).json({
                    message: "Account created successfully!",
                    userId: result.insertId,
                    name: displayName
                });
            });
        });

    } catch (err) {
        console.error("❌ Google sign-in verification failed:", err.message);
        res.status(401).json({ message: "Invalid Google credential" });
    }
});


// 3d. CONTACT FORM — sends the visitor's message straight to the site owner's inbox
app.post("/api/contact", async (req, res) => {
    const { email, message } = req.body;

    if (!email || !message) {
        return res.status(400).json({ message: "Email and message are required." });
    }
    const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailFormat.test(email)) {
        return res.status(400).json({ message: "Enter a valid email address." });
    }

    try {
        await transporter.sendMail({
            from: `"FinancePro Contact Form" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER, // sends to your own inbox
            replyTo: email,             // hitting "Reply" in your inbox replies straight to the visitor
            subject: `New FinancePro contact message from ${email}`,
            html: `
                <div style="font-family: Inter, sans-serif; background:#0d0d0d; padding:32px; color:#fff;">
                  <h2 style="color:#FFD700;">New Contact Form Message</h2>
                  <p><strong>From:</strong> ${email}</p>
                  <p style="white-space: pre-wrap; margin-top:16px; background:#1a1a1a; padding:16px; border-radius:8px;">${message}</p>
                </div>
            `
        });

        res.json({ message: "Message sent successfully!" });
    } catch (mailErr) {
        console.error("❌ Contact form email error:", mailErr);
        res.status(500).json({ message: "Could not send your message right now." });
    }
});


/* ===================== TRANSACTIONS ===================== */
app.get("/transactions/:userId", (req, res) => {
    const userId = req.params.userId;
    const selectedMonth = req.query.month;
    const selectedYear = req.query.year;

    let sql = "SELECT * FROM transactions WHERE user_id = ?";
    const params = [userId];

    if (selectedMonth) {
        sql += " AND DATE_FORMAT(transaction_date, '%Y-%m') = ?";
        params.push(selectedMonth);
    } else if (selectedYear) {
        sql += " AND YEAR(transaction_date) = ?";
        params.push(selectedYear);
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

// NEW: Edit an existing transaction (needed by the "Edit" button in the UI)
app.put("/transactions/:id", (req, res) => {
    const { id } = req.params;
    const { type, amount, category, description } = req.body;

    if (!type || !amount || !category) {
        return res.status(400).json({ message: "Type, amount, and category are required." });
    }

    db.query(
        `UPDATE transactions
         SET type = ?, amount = ?, category = ?, description = ?
         WHERE id = ?`,
        [type, amount, category, description || null, id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Transaction not found." });
            }
            res.json({ message: "Transaction updated" });
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