-- ===================== DATABASE =====================
CREATE DATABASE IF NOT EXISTS finance_db;
USE finance_db;

-- ===================== 1. USERS TABLE =====================
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===================== 2. TRANSACTIONS TABLE =====================
DROP TABLE IF EXISTS transactions;

CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('income','expense') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category VARCHAR(50),
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_transaction
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================== 3. BUDGETS TABLE =====================
DROP TABLE IF EXISTS budgets;

CREATE TABLE budgets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category VARCHAR(50) NOT NULL,
    limit_amount DECIMAL(10,2) NOT NULL,
    period VARCHAR(20) DEFAULT 'monthly',

    CONSTRAINT fk_user_budget
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    UNIQUE KEY unique_user_category (user_id, category)
) ENGINE=InnoDB;

-- ===================== 4. INDEXES =====================
CREATE INDEX idx_transaction_user ON transactions(user_id);
CREATE INDEX idx_budget_user ON budgets(user_id);

-- ===================== 5. SAMPLE USERS =====================
INSERT INTO users (username, email, password_hash)
VALUES
('user1', 'test@example.com', 'pass123'),
('user2', 'user2@example.com', 'pass456')
ON DUPLICATE KEY UPDATE email=email;

-- ===================== 6. SAMPLE BUDGETS =====================
INSERT INTO budgets (user_id, category, limit_amount)
VALUES
(1, 'Food', 500.00),
(1, 'Rent', 1200.00);

-- ===================== 7. VIEW (BUDGET REPORT) =====================
DROP VIEW IF EXISTS view_budget_report;

CREATE VIEW view_budget_report AS
SELECT
    b.user_id,
    b.category,
    b.limit_amount,

    COALESCE(SUM(
        CASE WHEN t.type = 'expense'
        THEN t.amount ELSE 0 END
    ), 0) AS actual_spent,

    (b.limit_amount -
    COALESCE(SUM(
        CASE WHEN t.type = 'expense'
        THEN t.amount ELSE 0 END
    ), 0)) AS remaining_budget

FROM budgets b
LEFT JOIN transactions t
    ON b.user_id = t.user_id
    AND LOWER(TRIM(b.category)) = LOWER(TRIM(t.category))

GROUP BY b.user_id, b.category, b.limit_amount;