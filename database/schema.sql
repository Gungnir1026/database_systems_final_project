-- Executed once by MySQL's entrypoint inside MYSQL_DATABASE. Never drops a database.
SET NAMES utf8mb4;

CREATE TABLE Users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  email VARCHAR(100),
  role ENUM('老師','學生','獎助單位','管理員') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Student (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  department VARCHAR(50),
  academic_year INT,
  student_number VARCHAR(50) NOT NULL UNIQUE,
  bank_serial_number VARCHAR(100),
  bank_account VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Teacher (
  teacher_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  department VARCHAR(50),
  job_title VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Scholarship_Provider (
  provider_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  organization_name VARCHAR(100),
  contact_person VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Scholarship (
  Scholarship_NUMBER INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  scholarship_amount DECIMAL(10,2) NOT NULL,
  application_start_date DATE NOT NULL,
  application_deadline DATE NOT NULL,
  provider_id VARCHAR(50),
  FOREIGN KEY (provider_id) REFERENCES Scholarship_Provider(user_id) ON DELETE SET NULL,
  CHECK (scholarship_amount > 0),
  CHECK (application_start_date <= application_deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Application (
  application_id INT AUTO_INCREMENT PRIMARY KEY,
  ranking INT,
  grade INT,
  status ENUM('待審核','通過','不通過') NOT NULL DEFAULT '待審核',
  application_date DATE NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  scholarship_id INT NOT NULL,
  teacher_id INT,
  UNIQUE KEY unique_student_scholarship (user_id, scholarship_id),
  FOREIGN KEY (user_id) REFERENCES Student(user_id) ON DELETE CASCADE,
  FOREIGN KEY (scholarship_id) REFERENCES Scholarship(Scholarship_NUMBER) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES Teacher(teacher_id) ON DELETE SET NULL,
  CHECK (grade BETWEEN 0 AND 100),
  CHECK (ranking > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Recommendation_Letter (
  letter_id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  content TEXT NOT NULL,
  submission_date DATE NOT NULL,
  application_id INT NOT NULL,
  UNIQUE KEY unique_application_letter (application_id),
  FOREIGN KEY (application_id) REFERENCES Application(application_id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES Teacher(teacher_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Announcement (
  Announcement_NUMBER INT AUTO_INCREMENT PRIMARY KEY,
  announcement_date DATE NOT NULL,
  TITLE VARCHAR(200) NOT NULL,
  CONTENT TEXT NOT NULL,
  user_id VARCHAR(50),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX sessions_expiry (expires_at),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
