require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve only the website pages and stylesheet (never .env, server.js, or database.sql)
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get(/^\/([A-Za-z]+)\.(html|css)$/, (req, res) => {
  res.sendFile(path.join(__dirname, `${req.params[0]}.${req.params[1]}`), (err) => {
    if (err && !res.headersSent) res.status(404).send("Page not found.");
  });
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lab_equipment",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

const EQUIPMENT_STATUS = ["Available", "Unavailable", "Damaged"];
const ISSUE_STATUS = ["Requested", "Issued", "Returned", "Damaged", "Rejected"];
const ROLES = ["student", "faculty", "admin"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isId(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0 && value !== "" && value !== null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function sendError(res, err, fallback) {
  if (err instanceof HttpError) return res.status(err.status).send(err.message);
  console.error(fallback + ":", err.message);
  res.status(500).send(fallback + " Check the database connection.");
}

// Run several queries as one all-or-nothing transaction
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* ------------------------------ EQUIPMENT ------------------------------ */

function validateEquipment(body, requireId = true) {
  const { equipment_id, name, category, quantity, available_quantity, status } = body;
  const errors = [];
  if (requireId && !isId(equipment_id)) errors.push("equipment_id must be a positive integer.");
  if (typeof name !== "string" || !name.trim()) errors.push("name is required.");
  if (typeof category !== "string" || !category.trim()) errors.push("category is required.");
  const q = Number(quantity);
  const a = Number(available_quantity);
  if (quantity === "" || quantity === undefined || !Number.isInteger(q) || q < 0) {
    errors.push("quantity must be a non-negative integer.");
  }
  if (available_quantity === "" || available_quantity === undefined || !Number.isInteger(a) || a < 0) {
    errors.push("available_quantity must be a non-negative integer.");
  } else if (Number.isInteger(q) && a > q) {
    errors.push("available_quantity cannot be more than quantity.");
  }
  if (!EQUIPMENT_STATUS.includes(status)) errors.push("status must be Available, Unavailable or Damaged.");
  return errors;
}

function equipmentValues(body) {
  return [
    body.name.trim(),
    body.category.trim(),
    Number(body.quantity),
    Number(body.available_quantity),
    body.status
  ];
}

// READ: get all equipment
app.get("/equipment", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT equipment_id, name, category, quantity, available_quantity, status FROM equipment ORDER BY equipment_id"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /equipment:", err.message);
    res.status(500).json({ error: "Could not retrieve equipment. Check the database connection." });
  }
});

// READ: get one equipment item by ID (returns an array to match the frontend)
app.get("/equipment/:equipment_id", async (req, res) => {
  const id = Number(req.params.equipment_id);
  if (!isId(id)) return res.status(400).json({ error: "Invalid equipment ID." });
  try {
    const [rows] = await pool.execute(
      "SELECT equipment_id, name, category, quantity, available_quantity, status FROM equipment WHERE equipment_id = ?",
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Equipment not found." });
    res.json(rows);
  } catch (err) {
    console.error("GET /equipment/:equipment_id:", err.message);
    res.status(500).json({ error: "Could not retrieve this equipment." });
  }
});

// CREATE: add equipment
app.post("/equipment", async (req, res) => {
  const errors = validateEquipment(req.body);
  if (errors.length) return res.status(400).send(errors.join(" "));
  try {
    await pool.execute(
      "INSERT INTO equipment (equipment_id, name, category, quantity, available_quantity, status) VALUES (?, ?, ?, ?, ?, ?)",
      [Number(req.body.equipment_id), ...equipmentValues(req.body)]
    );
    res.status(201).send("Equipment added successfully.");
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).send("Equipment with this ID already exists.");
    console.error("POST /equipment:", err.message);
    res.status(500).send("Could not add equipment. Check the database connection.");
  }
});

// UPDATE: replace all editable equipment details by ID
app.put("/equipment/:equipment_id", async (req, res) => {
  const id = Number(req.params.equipment_id);
  if (!isId(id)) return res.status(400).send("Invalid equipment ID.");
  const errors = validateEquipment({ ...req.body, equipment_id: id });
  if (errors.length) return res.status(400).send(errors.join(" "));
  try {
    const [result] = await pool.execute(
      "UPDATE equipment SET name = ?, category = ?, quantity = ?, available_quantity = ?, status = ? WHERE equipment_id = ?",
      [...equipmentValues(req.body), id]
    );
    if (result.affectedRows === 0) return res.status(404).send("Equipment not found.");
    res.send("Equipment updated successfully.");
  } catch (err) {
    console.error("PUT /equipment/:equipment_id:", err.message);
    res.status(500).send("Could not update equipment. Check the database connection.");
  }
});

// DELETE: remove equipment by ID
app.delete("/equipment/:equipment_id", async (req, res) => {
  const id = Number(req.params.equipment_id);
  if (!isId(id)) return res.status(400).send("Invalid equipment ID.");
  try {
    const [result] = await pool.execute("DELETE FROM equipment WHERE equipment_id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).send("Equipment not found.");
    res.send("Equipment deleted successfully.");
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).send("Cannot delete: this equipment has issue records. Set its status to Unavailable instead.");
    }
    console.error("DELETE /equipment/:equipment_id:", err.message);
    res.status(500).send("Could not delete equipment. Check the database connection.");
  }
});

/* -------------------------------- USERS -------------------------------- */

// READ: list users (password is never returned)
app.get("/users", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT user_id, name, email, role FROM users ORDER BY user_id");
    res.json(rows);
  } catch (err) {
    console.error("GET /users:", err.message);
    res.status(500).json({ error: "Could not retrieve users. Check the database connection." });
  }
});

// CREATE: add a user (password is hashed before it is stored)
app.post("/users", async (req, res) => {
  const { name, email, password, role } = req.body;
  const errors = [];
  if (typeof name !== "string" || !name.trim()) errors.push("name is required.");
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) errors.push("a valid email is required.");
  if (typeof password !== "string" || password.length < 6) errors.push("password must be at least 6 characters.");
  if (!ROLES.includes(role)) errors.push("role must be student, faculty or admin.");
  if (errors.length) return res.status(400).send(errors.join(" "));
  try {
    await pool.execute("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", [
      name.trim(),
      email.trim().toLowerCase(),
      hashPassword(password),
      role
    ]);
    res.status(201).send("User added successfully.");
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).send("A user with this email already exists.");
    console.error("POST /users:", err.message);
    res.status(500).send("Could not add user. Check the database connection.");
  }
});

/* ---------------------- ISSUE RECORDS (request / issue / return) ---------------------- */

// READ: all issue records, optionally filtered with ?status=Issued
app.get("/issues", async (req, res) => {
  const status = req.query.status;
  if (status && !ISSUE_STATUS.includes(status)) return res.status(400).json({ error: "Invalid status." });
  try {
    const [rows] = await pool.query(
      `SELECT r.issue_id, r.equipment_id, e.name AS equipment_name, r.user_id, u.name AS user_name,
              u.role AS user_role, r.issue_date, r.return_date, r.quantity, r.status
       FROM issue_records r
       JOIN equipment e ON e.equipment_id = r.equipment_id
       JOIN users u ON u.user_id = r.user_id
       ${status ? "WHERE r.status = ?" : ""}
       ORDER BY r.issue_id DESC`,
      status ? [status] : []
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /issues:", err.message);
    res.status(500).json({ error: "Could not retrieve issue records. Check the database connection." });
  }
});

// CREATE: a student/faculty member requests equipment (stock changes only when it is issued)
app.post("/issues", async (req, res) => {
  const { equipment_id, user_id, quantity } = req.body;
  if (!isId(equipment_id) || !isId(user_id) || !isId(quantity)) {
    return res.status(400).send("equipment_id, user_id and quantity must be positive integers.");
  }
  try {
    const [equipment] = await pool.execute(
      "SELECT status, available_quantity FROM equipment WHERE equipment_id = ?",
      [Number(equipment_id)]
    );
    if (equipment.length === 0) return res.status(404).send("Equipment not found.");
    const [users] = await pool.execute("SELECT user_id FROM users WHERE user_id = ?", [Number(user_id)]);
    if (users.length === 0) return res.status(404).send("User not found.");
    if (equipment[0].status !== "Available") return res.status(409).send("This equipment is not available right now.");
    if (Number(quantity) > equipment[0].available_quantity) {
      return res.status(409).send(`Only ${equipment[0].available_quantity} unit(s) are available.`);
    }
    await pool.execute(
      "INSERT INTO issue_records (equipment_id, user_id, quantity, status) VALUES (?, ?, ?, 'Requested')",
      [Number(equipment_id), Number(user_id), Number(quantity)]
    );
    res.status(201).send("Request submitted. It is waiting for approval.");
  } catch (err) {
    sendError(res, err, "Could not submit request.");
  }
});

// UPDATE: approve a request -> equipment is issued and stock goes down
app.put("/issues/:issue_id/approve", async (req, res) => {
  const id = Number(req.params.issue_id);
  if (!isId(id)) return res.status(400).send("Invalid issue ID.");
  try {
    await withTransaction(async (conn) => {
      const [issues] = await conn.execute("SELECT * FROM issue_records WHERE issue_id = ? FOR UPDATE", [id]);
      if (issues.length === 0) throw new HttpError(404, "Issue record not found.");
      const issue = issues[0];
      if (issue.status !== "Requested") throw new HttpError(409, "Only requested items can be issued.");
      const [equipment] = await conn.execute(
        "SELECT status, available_quantity FROM equipment WHERE equipment_id = ? FOR UPDATE",
        [issue.equipment_id]
      );
      if (equipment[0].status !== "Available" || equipment[0].available_quantity < issue.quantity) {
        throw new HttpError(409, "Not enough available stock to issue this request.");
      }
      await conn.execute(
        "UPDATE equipment SET available_quantity = available_quantity - ? WHERE equipment_id = ?",
        [issue.quantity, issue.equipment_id]
      );
      await conn.execute("UPDATE issue_records SET status = 'Issued', issue_date = CURDATE() WHERE issue_id = ?", [id]);
    });
    res.send("Equipment issued successfully.");
  } catch (err) {
    sendError(res, err, "Could not issue equipment.");
  }
});

// UPDATE: reject a request
app.put("/issues/:issue_id/reject", async (req, res) => {
  const id = Number(req.params.issue_id);
  if (!isId(id)) return res.status(400).send("Invalid issue ID.");
  try {
    const [result] = await pool.execute(
      "UPDATE issue_records SET status = 'Rejected' WHERE issue_id = ? AND status = 'Requested'",
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).send("No pending request found with this ID.");
    res.send("Request rejected.");
  } catch (err) {
    sendError(res, err, "Could not reject request.");
  }
});

// UPDATE: record a return; damaged units are NOT added back to stock
app.put("/issues/:issue_id/return", async (req, res) => {
  const id = Number(req.params.issue_id);
  if (!isId(id)) return res.status(400).send("Invalid issue ID.");
  const damaged = req.body.damaged_qty === undefined || req.body.damaged_qty === "" ? 0 : Number(req.body.damaged_qty);
  if (!Number.isInteger(damaged) || damaged < 0) return res.status(400).send("damaged_qty must be a non-negative integer.");
  try {
    const message = await withTransaction(async (conn) => {
      const [issues] = await conn.execute("SELECT * FROM issue_records WHERE issue_id = ? FOR UPDATE", [id]);
      if (issues.length === 0) throw new HttpError(404, "Issue record not found.");
      const issue = issues[0];
      if (issue.status !== "Issued") throw new HttpError(409, "Only issued items can be returned.");
      if (damaged > issue.quantity) throw new HttpError(400, "Damaged quantity cannot be more than the quantity issued.");
      const good = issue.quantity - damaged;
      await conn.execute(
        "UPDATE equipment SET available_quantity = available_quantity + ? WHERE equipment_id = ?",
        [good, issue.equipment_id]
      );
      await conn.execute(
        "UPDATE issue_records SET status = ?, return_date = CURDATE() WHERE issue_id = ?",
        [damaged > 0 ? "Damaged" : "Returned", id]
      );
      return `Return recorded. ${good} unit(s) back in stock` + (damaged ? `, ${damaged} marked damaged.` : ".");
    });
    res.send(message);
  } catch (err) {
    sendError(res, err, "Could not record return.");
  }
});

/* -------------------------------- REPORTS -------------------------------- */

// Equipment that is Damaged/Unavailable, or has units lost to damage
// unusable_units = total - in stock - currently issued out
app.get("/reports/problem-equipment", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM (
         SELECT e.equipment_id, e.name, e.category, e.quantity, e.available_quantity, e.status,
                CAST(e.quantity - e.available_quantity - COALESCE(
                  (SELECT SUM(r.quantity) FROM issue_records r
                   WHERE r.equipment_id = e.equipment_id AND r.status = 'Issued'), 0) AS SIGNED) AS unusable_units
         FROM equipment e
       ) t
       WHERE t.status <> 'Available' OR t.unusable_units > 0
       ORDER BY t.equipment_id`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /reports/problem-equipment:", err.message);
    res.status(500).json({ error: "Could not build the report. Check the database connection." });
  }
});

// Returns where some units came back damaged
app.get("/reports/damaged-returns", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.issue_id, e.name AS equipment_name, u.name AS user_name, r.quantity, r.return_date
       FROM issue_records r
       JOIN equipment e ON e.equipment_id = r.equipment_id
       JOIN users u ON u.user_id = r.user_id
       WHERE r.status = 'Damaged'
       ORDER BY r.issue_id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /reports/damaged-returns:", err.message);
    res.status(500).json({ error: "Could not build the report. Check the database connection." });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to MySQL database.");
    app.listen(PORT, () => console.log(`Lab Equipment Management running at http://localhost:${PORT}`));
  } catch (err) {
    console.error("Could not connect to MySQL:", err.message);
    console.error("Check MySQL is running and your .env database settings are correct.");
    process.exit(1);
  }
}
start();
