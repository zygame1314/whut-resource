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
    is_banned BOOLEAN DEFAULT FALSE,
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
    is_link BOOLEAN DEFAULT FALSE,
    link_url TEXT,
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
    is_pinned BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'unresolved',
    reject_reason TEXT DEFAULT NULL,
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

CREATE INDEX IF NOT EXISTS idx_downloads_file_key ON downloads(file_key);
CREATE INDEX IF NOT EXISTS idx_downloads_cleanup ON downloads(downloaded_at);
CREATE INDEX IF NOT EXISTS idx_downloads_debounce ON downloads(user_id, file_key, downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_admin_list ON guestbook(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_list_default ON guestbook(is_hidden, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_list_likes ON guestbook(is_hidden, is_pinned DESC, likes DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_user_daily_limit ON guestbook(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guestbook_user_messages ON guestbook(user_id, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_status_time ON guestbook(status, is_hidden, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_status_likes ON guestbook(status, is_hidden, is_pinned DESC, likes DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_recent_uploads ON files(is_directory, uploaded DESC);
CREATE INDEX IF NOT EXISTS idx_files_listing_optimized ON files(parent_path, is_directory DESC, is_link DESC, name ASC, uploaded DESC);
CREATE INDEX IF NOT EXISTS idx_files_dir_key ON files(is_directory, key);
CREATE INDEX IF NOT EXISTS idx_files_stats ON files(is_directory, parent_path, downloads);


DROP TABLE IF EXISTS pending_registrations;
CREATE TABLE pending_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT,
    verify_code TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pending_reg_code ON pending_registrations(verify_code);
CREATE INDEX IF NOT EXISTS idx_pending_reg_student ON pending_registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_pending_reg_expires ON pending_registrations(expires_at);


DROP TABLE IF EXISTS pending_resets;
CREATE TABLE pending_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    new_password_hash TEXT NOT NULL,
    verify_code TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pending_reset_code ON pending_resets(verify_code);
CREATE INDEX IF NOT EXISTS idx_pending_reset_email ON pending_resets(email);
CREATE INDEX IF NOT EXISTS idx_pending_reset_expires ON pending_resets(expires_at);


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

DROP TABLE IF EXISTS files_fts;
CREATE VIRTUAL TABLE files_fts USING fts5(name, content='files', content_rowid='id', tokenize='trigram');

DROP TRIGGER IF EXISTS files_ai;
CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, name) VALUES (new.id, new.name);
END;

DROP TRIGGER IF EXISTS files_ad;
CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name) VALUES('delete', old.id, old.name);
END;

DROP TRIGGER IF EXISTS files_au;
CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name) VALUES('delete', old.id, old.name);
  INSERT INTO files_fts(rowid, name) VALUES (new.id, new.name);
END;

CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    reason TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON admin_logs(target_type, target_id);
