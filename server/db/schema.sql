-- AI-Powered Co-Working Space Asset Manager: database schema (MySQL 8)
DROP DATABASE IF EXISTS asset_manager;
CREATE DATABASE asset_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE asset_manager;

CREATE TABLE users (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  contact_no     VARCHAR(20),
  password_hash  CHAR(60) NOT NULL,
  role           ENUM('Admin','Member') NOT NULL DEFAULT 'Member',
  account_status ENUM('Active','Deactivated') NOT NULL DEFAULT 'Active',
  failed_logins  INT NOT NULL DEFAULT 0,
  locked_until   DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  description VARCHAR(255)
);

CREATE TABLE assets (
  asset_id    INT AUTO_INCREMENT PRIMARY KEY,
  asset_tag   VARCHAR(30) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  category_id INT NOT NULL,
  location    VARCHAR(100) NOT NULL,
  `condition` ENUM('New','Good','Fair','Damaged') NOT NULL DEFAULT 'Good',
  status      ENUM('Available','Reserved','Borrowed','Under Maintenance','Retired') NOT NULL DEFAULT 'Available',
  description TEXT,
  image_path  VARCHAR(255),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE TABLE asset_requests (
  request_id       INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  asset_id         INT NOT NULL,
  purpose          VARCHAR(255) NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  status           ENUM('Pending','Approved','Rejected','Cancelled','Completed') NOT NULL DEFAULT 'Pending',
  rejection_reason VARCHAR(255),
  decided_by       INT NULL,
  decided_at       DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id),
  FOREIGN KEY (decided_by) REFERENCES users(user_id)
);

CREATE TABLE borrow_records (
  borrow_id        INT AUTO_INCREMENT PRIMARY KEY,
  request_id       INT NOT NULL UNIQUE,
  asset_id         INT NOT NULL,
  user_id          INT NOT NULL,
  issued_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date         DATE NOT NULL,
  returned_at      DATETIME NULL,
  return_condition ENUM('New','Good','Fair','Damaged') NULL,
  status           ENUM('Active','Overdue','Returned') NOT NULL DEFAULT 'Active',
  FOREIGN KEY (request_id) REFERENCES asset_requests(request_id),
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE maintenance_logs (
  maintenance_id    INT AUTO_INCREMENT PRIMARY KEY,
  asset_id          INT NOT NULL,
  reported_by       INT NOT NULL,
  issue_description VARCHAR(500) NOT NULL,
  notes             TEXT,
  cost              DECIMAL(10,2) NOT NULL DEFAULT 0,
  status            ENUM('Open','In Progress','Closed') NOT NULL DEFAULT 'Open',
  outcome           ENUM('Repaired','Retired') NULL,
  reported_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at       DATETIME NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(asset_id),
  FOREIGN KEY (reported_by) REFERENCES users(user_id)
);

CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  type            VARCHAR(40) NOT NULL,
  message         VARCHAR(255) NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE ai_chat_logs (
  chat_id    INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  feature    ENUM('Assistant','Recommendation') NOT NULL,
  prompt     TEXT NOT NULL,
  response   TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE audit_logs (
  log_id     INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(40) NOT NULL,
  entity_id  INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
