# Lab Equipment Management

Frontend + backend using HTML/CSS/JavaScript, Node.js, Express, and MySQL (same structure as the Bookstore CRUD project).

Students or faculty can request equipment, admins issue it and record returns, and damaged or unavailable equipment is tracked.

## Database tables
- `equipment`: `equipment_id`, `name`, `category`, `quantity`, `available_quantity`, `status`
- `users`: `user_id`, `name`, `email`, `password`, `role`
- `issue_records`: `issue_id`, `equipment_id` (FK), `user_id` (FK), `issue_date`, `return_date`, `quantity`, `status`

## Setup

1. Install Node.js (LTS) and MySQL Server (or use MySQL through XAMPP).
2. Open MySQL Workbench/phpMyAdmin or another MySQL client.
3. Run the contents of `database.sql` to create the `lab_equipment` database and its tables.
4. Open this project folder in VS Code.
5. Copy `.env.example` to a new file named `.env`.
6. Edit `.env` and set `DB_USER` and `DB_PASSWORD` to your own MySQL credentials. Keep `.env` private.
7. Open a terminal in this folder and run:

   ```bash
   npm install
   npm start
   ```

8. Open **http://localhost:3000** in your browser. Use this URL, not `file://` or Live Server, so the frontend and API share the same origin.

## Pages
| Page | Purpose |
|---|---|
| `index.html` | Home |
| `list.html` | All equipment |
| `listOne.html` | Search equipment by ID |
| `insert.html` | Add equipment |
| `update.html` | Update equipment |
| `delete.html` | Delete equipment |
| `users.html` | Add and list users |
| `request.html` | Request equipment |
| `issues.html` | Approve/reject requests, record returns |
| `reports.html` | Damaged and unavailable equipment |

## Workflow
1. A student or faculty member submits a request (`Requested`). Stock does not change yet.
2. The admin clicks **Issue** on `issues.html`: status becomes `Issued` and `available_quantity` goes down.
3. On return, the admin enters how many units came back damaged (0 if none). Status becomes `Returned` or `Damaged`. Good units go back to stock; damaged units do not.
4. `reports.html` lists damaged and unavailable equipment.

## API
**Equipment (CRUD)**
- `POST /equipment` — create
- `GET /equipment` — list all
- `GET /equipment/:equipment_id` — read one
- `PUT /equipment/:equipment_id` — update
- `DELETE /equipment/:equipment_id` — delete

**Users**
- `GET /users`, `POST /users` (passwords are hashed with scrypt, never returned)

**Issue records**
- `GET /issues` (optional `?status=Issued`)
- `POST /issues` — request equipment
- `PUT /issues/:issue_id/approve` — issue equipment
- `PUT /issues/:issue_id/reject`
- `PUT /issues/:issue_id/return` — body `{ "damaged_qty": 0 }`

**Reports**
- `GET /reports/problem-equipment`, `GET /reports/damaged-returns`
- `GET /health` — server health check

## Notes
- Sample data is included in `database.sql` (6 equipment items, 3 users: admin / faculty / student). Remove the sample INSERTs if you want empty tables.
- Sample user passwords: `admin123`, `faculty123`, `student123`.
- Equipment IDs must be unique. Quantities cannot be negative, and available quantity cannot exceed total quantity.
- Do not commit or share your real `.env` file.

## Push to GitHub
```bash
git init
git add .
git commit -m "Lab Equipment Management"
git branch -M main
git remote add origin https://github.com/<your-username>/lab-equipment-fullstack.git
git push -u origin main
```
