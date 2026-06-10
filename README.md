# 💰 FinancePro: Personal Finance Management System

A secure, full-stack personal finance application designed to help users track transactions, manage dynamic category-based budgets, visualize financial analytics, and generate professional multi-format statements. Built with Node.js, Express, MySQL, and Tailwind CSS.

---

## 🚀 Key Feature Set

### 1. 🔑 Secure Authentication & Password Recovery
- **Local Credentials Verification:** Manages user authentication securely using localized password-hashing columns in MySQL.
- **Visual Password Recovery:** Implements a full password recovery flow that logs clickable local reset links directly to the developer's server terminal, enabling a 100% functional reset pipeline without complex SMTP configurations.

### 2. 💸 Real-Time Transaction Tracking
- **Automated Ledgers:** Processes and calculates active balances, net worth metrics, and transaction ledgers instantly.
- **Categorization:** Enables students to add, filter, and delete both income and expense logs dynamically.

### 3. 🎯 Dynamic Threshold-Based Budgeting
- **Color-Coded Budget Alerts:** Utilizes dynamic, threshold-based visual progress bars to track monthly spending limits:
  - **Safe (Green):** Low spending relative to the set limit.
  - **Warning (Gold):** Approaching set category limits.
  - **Exceeded (Red):** Reached or exceeded the monthly category budget.

### 4. 📊 Interactive Data Visualization
- **Doughnut Charts:** Built-in interactive category distribution charts using Chart.js to identify high-spending channels easily.
- **Bar Charts:** Compares historical monthly income vs. expense performance to visualize savings progress.

### 5. 📁 Advanced Multi-Format Document Compilation
- **Export Spreadsheet (.xlsx):** Compiles and formats transaction data into structured Excel spreadsheets using SheetJS (XLSX).
- **Export PDF Statement (.pdf):** Generates polished PDF statements using jsPDF & AutoTable, featuring automatically computed financial summary blocks (Total Income, Total Expenses, Net Savings).
- **Export Word Document (.doc):** Compiles financial ledgers directly into readable Word documents using HTML-blob formatting.

---

## 🛠️ Technology Stack

- **Backend:** Node.js, Express, MySQL, `cors`, `dotenv`
- **Frontend:** HTML5, CSS3, JavaScript (ES6), Chart.js, jsPDF (AutoTable), SheetJS (XLSX)

---

## 📁 Database Schema Reference

The database consists of three core relational tables and three custom analytics views in MySQL:

1. **`users`**: Manages unique accounts (`id`, `username`, `email`, `password_hash`, `created_at`).
2. **`transactions`**: Stores financial logs (`id`, `user_id`, `type`, `amount`, `category`, `description`, `transaction_date`).
3. **`budgets`**: Tracks monthly category spending targets (`user_id`, `category`, `limit_amount`, `budget_month`).

### Core SQL Views:
- **`view_budget_report`**: Compares category limits against actual cumulative spending in real-time.
- **`view_monthly_comparison`**: Compares monthly cumulative income vs. expense totals.
- **`view_category_distribution`**: Computes category-wise cumulative expenditure percentages.

---
```bash
git clone <your-repository-url>
cd Personal-Finance-Manager
