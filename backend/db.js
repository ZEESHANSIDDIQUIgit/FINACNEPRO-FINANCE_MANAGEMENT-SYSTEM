const mysql = require("mysql2");

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "SQLmzs2006", 
    database: "finance_db",
    // Adding this ensures decimals (like amounts) are treated as numbers, not strings
    decimalNumbers: true 
});

db.connect(err => {
    if (err) {
        console.error("❌ Database connection failed: " + err.stack);
        return;
    }
    console.log("✅ Connected to MySQL as ID " + db.threadId);
});

module.exports = db;