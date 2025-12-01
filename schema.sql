DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    nickname TEXT,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    quota_limit INTEGER DEFAULT 50,
    quota_used INTEGER DEFAULT 0,
    last_download_date TEXT,
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
    FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
);

DROP TABLE IF EXISTS downloads;
CREATE TABLE downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_key TEXT NOT NULL,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    size INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_key) REFERENCES files(key) ON DELETE CASCADE
);

DROP TABLE IF EXISTS announcements;
CREATE TABLE announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_published BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    author_id INTEGER,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);

DROP TABLE IF EXISTS guestbook;
CREATE TABLE guestbook (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS guestbook_likes;
CREATE TABLE guestbook_likes (
    user_id INTEGER NOT NULL,
    guestbook_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, guestbook_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (guestbook_id) REFERENCES guestbook(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_parent_path_is_directory_name ON files(parent_path, is_directory, name);
CREATE INDEX IF NOT EXISTS idx_files_parent_path_is_directory_uploaded ON files(parent_path, is_directory, uploaded DESC);
CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_file_key ON downloads(file_key);
CREATE INDEX IF NOT EXISTS idx_guestbook_created_at ON guestbook(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_likes_created_at ON guestbook(likes DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_uploaded ON files(uploaded DESC);


DROP TABLE IF EXISTS verification_codes;
CREATE TABLE verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);


DROP TABLE IF EXISTS system_stats;
CREATE TABLE IF NOT EXISTS system_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_files INTEGER DEFAULT 0,
    total_size INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO system_stats (id, total_files, total_size)
SELECT 1, COUNT(*), COALESCE(SUM(size), 0) FROM files;

DROP TRIGGER IF EXISTS update_stats_after_insert;
CREATE TRIGGER update_stats_after_insert
AFTER INSERT ON files
BEGIN
    UPDATE system_stats 
    SET total_files = total_files + 1,
    total_size = total_size + NEW.size,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = 1;
END;

DROP TRIGGER IF EXISTS update_stats_after_delete;
CREATE TRIGGER update_stats_after_delete
AFTER DELETE ON files
BEGIN
    UPDATE system_stats 
    SET total_files = total_files - 1,
    total_size = total_size - OLD.size,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = 1;
END;

DROP TRIGGER IF EXISTS update_stats_after_update;
CREATE TRIGGER update_stats_after_update
AFTER UPDATE OF size ON files
BEGIN
    UPDATE system_stats 
    SET total_size = total_size - OLD.size + NEW.size,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = 1;
END;
