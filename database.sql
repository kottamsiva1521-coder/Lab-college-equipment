CREATE DATABASE IF NOT EXISTS lab_equipment;
USE lab_equipment;

CREATE TABLE IF NOT EXISTS equipment (
    equipment_id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    available_quantity INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Available',
    CHECK (quantity >= 0),
    CHECK (available_quantity >= 0 AND available_quantity <= quantity),
    CHECK (status IN ('Available', 'Unavailable', 'Damaged'))
);

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'student',
    CHECK (role IN ('student', 'faculty', 'admin'))
);

CREATE TABLE IF NOT EXISTS issue_records (
    issue_id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    user_id INT NOT NULL,
    issue_date DATE NULL,
    return_date DATE NULL,
    quantity INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Requested',
    CHECK (quantity > 0),
    CHECK (status IN ('Requested', 'Issued', 'Returned', 'Damaged', 'Rejected')),
    FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Optional sample data for testing (passwords are stored hashed):
-- admin123 / faculty123 / student123
INSERT INTO users (user_id, name, email, password, role)
VALUES
(1, 'Administrator', 'admin@college.edu', '734e1cbe2fba30e9acd2977878423b93:a8c1cf7f3a6956f124d2d86fa1451daae5c64d63dbc1f50a7a12a587488b08e093627a6480ff5533c1dbc8b9238054afc57b11da9c7c7e950f01ac4e4840cd5d', 'admin'),
(2, 'Demo Faculty', 'faculty@college.edu', '60f096545a7e45e64a3444de15d76149:82896fbf7809aef610490582c90e217a367947c81182cd5cdb15d4bc1744a86c3e5865268ff3ae62d2327eaa33717fcb7902ad72ce91d305d37a306237ca05b8', 'faculty'),
(3, 'Demo Student', 'student@college.edu', '9cc5777b51d5e14eb0509dafd04687f4:a5f514a0fc521bf9de3c941dbd0abcc3fa64976d9a2f91c2bcff4854bc145e4533344784a2e45fa5011c137f706ef8dc26c8f988079a11c40478202206510119', 'student')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO equipment (equipment_id, name, category, quantity, available_quantity, status)
VALUES
(101, 'Digital Oscilloscope', 'Electronics', 5, 5, 'Available'),
(102, 'Multimeter', 'Electronics', 20, 20, 'Available'),
(103, 'Microscope', 'Biology', 10, 10, 'Available'),
(104, 'Bunsen Burner', 'Chemistry', 15, 15, 'Available'),
(105, 'Arduino Kit', 'Electronics', 12, 12, 'Available'),
(106, 'Beaker Set (500ml)', 'Chemistry', 30, 30, 'Available')
ON DUPLICATE KEY UPDATE name = VALUES(name);
