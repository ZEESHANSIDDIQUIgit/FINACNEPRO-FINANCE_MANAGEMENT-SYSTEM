-- ========================================================
-- 1. DATABASE INITIALIZATION
-- ========================================================
CREATE DATABASE IF NOT EXISTS finance_db;
USE finance_db;

-- ========================================================
-- 2. USERS TABLE
-- ========================================================
-- This table stores credentials from your signup.html
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ========================================================
-- 3. TRANSACTIONS TABLE
-- ========================================================
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

-- ========================================================
-- 4. BUDGETS TABLE
-- ========================================================
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

    -- Ensures a user can't have two budgets for the same category
    UNIQUE KEY unique_user_category (user_id, category)
) ENGINE=InnoDB;

-- ========================================================
-- 5. PERFORMANCE INDEXES
-- ========================================================
CREATE INDEX idx_transaction_user ON transactions(user_id);
CREATE INDEX idx_budget_user ON budgets(user_id);

-- ========================================================
-- 6. BUDGET REPORT VIEW
-- ========================================================
-- This view powers the "Budget Status" bars in your index.html
DROP VIEW IF EXISTS view_budget_report;

CREATE VIEW view_budget_report AS
SELECT 
    b.user_id,
    b.category,
    b.limit_amount,
    
    -- Summing expenses for the specific category and user
    COALESCE(SUM(
        CASE WHEN t.type = 'expense' 
        THEN t.amount ELSE 0 END
    ), 0) AS actual_spent,

    -- Calculating what is left
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

-- ========================================================
-- 7. CLEAN SLATE NOTE
-- ========================================================
-- Sample users from image_b10213.png have been removed.
-- You can now create fresh accounts using your signup.html page.