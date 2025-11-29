DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    quota_limit INTEGER DEFAULT 1073741824,
    quota_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS files;
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded DATETIME DEFAULT CURRENT_TIMESTAMP,
    contentType TEXT,
    parent_path TEXT,
    is_directory BOOLEAN DEFAULT FALSE,
    downloads INTEGER DEFAULT 0,
    uploader_id INTEGER,
    FOREIGN KEY (uploader_id) REFERENCES users(id)
);

DROP TABLE IF EXISTS downloads;
CREATE TABLE downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_key TEXT NOT NULL,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    size INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (file_key) REFERENCES files(key)
);

CREATE INDEX IF NOT EXISTS idx_files_parent_path_is_directory_name ON files(parent_path, is_directory, name);
CREATE INDEX IF NOT EXISTS idx_files_parent_path_is_directory_uploaded ON files(parent_path, is_directory, uploaded DESC);
CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_file_key ON downloads(file_key);


DROP TABLE IF EXISTS verification_codes;
CREATE TABLE verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);

