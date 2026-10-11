const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const db = require("../db");

const router = express.Router();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// Where reset.html is served from. Set FRONTEND_URL in .env if yours differs.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://127.0.0.1:3000/frontend";

// token -> { email, expiresAt }   (in-memory; cleared if the server restarts)
const resetTokens = new Map();
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// 1. Ask for a reset link
router.post("/forgot-password", (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    // Always give the same answer so nobody can check which emails are registered
    const genericReply = { message: "If an account exists for that email, a reset link has been sent." };

    db.query("SELECT id, password_hash FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) {
            console.error("❌ forgot-password lookup error:", err);
            return res.status(500).json({ message: "Database error." });
        }
        if (results.length === 0 || !results[0].password_hash) {
            return res.json(genericReply); // unknown email, or a Google-only account
        }

        const token = crypto.randomBytes(32).toString("hex");
        resetTokens.set(token, { email, expiresAt: Date.now() + TOKEN_TTL_MS });

        const link = `${FRONTEND_URL}/reset.html?token=${token}`;
        try {
            await transporter.sendMail({
                from: `"FinancePro" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: "Reset your FinancePro password",
                html: `
                    <div style="font-family: Inter, sans-serif; background:#0d0d0d; padding:32px; color:#fff;">
                      <h2 style="color:#FFD700;">Reset your password</h2>
                      <p>Click the button below to choose a new password. This link expires in 30 minutes.</p>
                      <p><a href="${link}" style="display:inline-block; background:#FFD700; color:#000; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:700;">Reset password</a></p>
                      <p style="color:#888; font-size:12px;">If you didn't ask for this, you can ignore this email.</p>
                    </div>
                `
            });
        } catch (mailErr) {
            console.error("❌ Reset email error:", mailErr.message);
            return res.status(500).json({ message: "Could not send the reset email." });
        }
        res.json(genericReply);
    });
});

// 2. Set the new password using the token from the email
router.post("/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required." });
    }

    const entry = resetTokens.get(token);
    if (!entry || Date.now() > entry.expiresAt) {
        resetTokens.delete(token);
        return res.status(400).json({ message: "This reset link is invalid or has expired." });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        db.query("UPDATE users SET password_hash = ? WHERE email = ?", [hash, entry.email], (err) => {
            if (err) {
                console.error("❌ reset-password update error:", err);
                return res.status(500).json({ message: "Database error." });
            }
            resetTokens.delete(token);
            res.json({ message: "Password updated. You can now log in." });
        });
    } catch (e) {
        console.error("❌ reset-password error:", e);
        res.status(500).json({ message: "Could not update the password." });
    }
});

module.exports = router;