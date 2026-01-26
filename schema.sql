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
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(is_banned, created_at DESC);

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
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    uploader_id INTEGER,
    last_verified INTEGER DEFAULT 0,
    FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
);

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
CREATE TRIGGER files_au AFTER UPDATE OF name ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, name) VALUES('delete', old.id, old.name);
    INSERT INTO files_fts(rowid, name) VALUES (new.id, new.name);
END;

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
    resolve_note TEXT DEFAULT NULL,
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
CREATE INDEX IF NOT EXISTS idx_guestbook_likes_reverse ON guestbook_likes(guestbook_id, user_id);

CREATE INDEX IF NOT EXISTS idx_downloads_file_key ON downloads(file_key);
CREATE INDEX IF NOT EXISTS idx_downloads_cleanup ON downloads(downloaded_at);
CREATE INDEX IF NOT EXISTS idx_downloads_debounce ON downloads(user_id, file_key, downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_admin_list ON guestbook(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_list_default ON guestbook(is_hidden, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_user_daily_limit ON guestbook(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guestbook_created_at ON guestbook(created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_recent_uploads ON files(is_directory, uploaded DESC);
CREATE INDEX IF NOT EXISTS idx_files_listing_optimized ON files(parent_path, is_directory DESC, is_link DESC, name ASC, uploaded DESC);
CREATE INDEX IF NOT EXISTS idx_files_dir_key ON files(is_directory, key);
CREATE INDEX IF NOT EXISTS idx_files_stats ON files(is_directory, parent_path, downloads);
CREATE INDEX IF NOT EXISTS idx_files_cleanup_sync ON files(is_link, last_verified);

DROP TABLE IF EXISTS file_reactions;
CREATE TABLE file_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_key TEXT NOT NULL,
    reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_key) REFERENCES files(key) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_reactions_unique ON file_reactions(user_id, file_key);
CREATE INDEX IF NOT EXISTS idx_file_reactions_key ON file_reactions(file_key);

DROP TRIGGER IF EXISTS update_file_reaction_insert;
CREATE TRIGGER update_file_reaction_insert AFTER INSERT ON file_reactions BEGIN
    UPDATE files SET 
        likes = CASE WHEN new.reaction = 'like' THEN likes + 1 ELSE likes END,
        dislikes = CASE WHEN new.reaction = 'dislike' THEN dislikes + 1 ELSE dislikes END
    WHERE key = new.file_key;
END;

DROP TRIGGER IF EXISTS update_file_reaction_delete;
CREATE TRIGGER update_file_reaction_delete AFTER DELETE ON file_reactions BEGIN
    UPDATE files SET 
        likes = CASE WHEN old.reaction = 'like' THEN likes - 1 ELSE likes END,
        dislikes = CASE WHEN old.reaction = 'dislike' THEN dislikes - 1 ELSE dislikes END
    WHERE key = old.file_key;
END;

DROP TRIGGER IF EXISTS update_file_reaction_update;
CREATE TRIGGER update_file_reaction_update AFTER UPDATE ON file_reactions BEGIN
    UPDATE files SET 
        likes = CASE 
            WHEN new.reaction = 'like' AND old.reaction = 'dislike' THEN likes + 1
            WHEN new.reaction = 'dislike' AND old.reaction = 'like' THEN likes - 1
            ELSE likes END,
        dislikes = CASE 
            WHEN new.reaction = 'dislike' AND old.reaction = 'like' THEN dislikes + 1
            WHEN new.reaction = 'like' AND old.reaction = 'dislike' THEN dislikes - 1
            ELSE dislikes END
    WHERE key = new.file_key;
END;


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
    maintenance_mode BOOLEAN DEFAULT FALSE,
    maintenance_msg TEXT DEFAULT '系统正在进行升级维护，请稍候访问...',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO system_stats (id, total_files, total_size, maintenance_mode, maintenance_msg)
SELECT 1, COUNT(*), COALESCE(SUM(size), 0), FALSE, '系统正在进行升级维护，请稍候访问...' FROM files;

DROP TRIGGER IF EXISTS update_stats_after_insert;
CREATE TRIGGER update_stats_after_insert
AFTER INSERT ON files
WHEN NEW.is_directory = FALSE
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
WHEN OLD.is_directory = FALSE
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

DROP TABLE IF EXISTS guestbook_stats;
CREATE TABLE IF NOT EXISTS guestbook_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_messages_all_time INTEGER DEFAULT 0,
    current_messages_count INTEGER DEFAULT 0,
    last_cleanup_at DATETIME,
    last_cleanup_count INTEGER DEFAULT 0
);

INSERT OR REPLACE INTO guestbook_stats (id, total_messages_all_time, current_messages_count) 
SELECT 1, 
       COALESCE((SELECT total_messages_all_time FROM guestbook_stats WHERE id = 1), COUNT(*)),
       COUNT(*) 
FROM guestbook;

DROP TRIGGER IF EXISTS update_guestbook_stats_insert;
CREATE TRIGGER update_guestbook_stats_insert
AFTER INSERT ON guestbook
BEGIN
    UPDATE guestbook_stats 
    SET total_messages_all_time = total_messages_all_time + 1,
        current_messages_count = current_messages_count + 1
    WHERE id = 1;
END;

DROP TRIGGER IF EXISTS update_guestbook_stats_delete;
CREATE TRIGGER update_guestbook_stats_delete
AFTER DELETE ON guestbook
BEGIN
    UPDATE guestbook_stats 
    SET current_messages_count = current_messages_count - 1
    WHERE id = 1;
END;

DROP TABLE IF EXISTS system_cache;
CREATE TABLE IF NOT EXISTS system_cache (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO system_cache (id, data, updated_at)
SELECT 1, 
    '[' || COALESCE(GROUP_CONCAT(json_object('path', parent_path, 'total_downloads', total_downloads)), '') || ']',
    CURRENT_TIMESTAMP
FROM (
    SELECT parent_path, SUM(downloads) as total_downloads
    FROM files
    WHERE parent_path != '' AND is_directory = FALSE
    GROUP BY parent_path
    ORDER BY total_downloads DESC
    LIMIT 5
);

DROP TABLE IF EXISTS admin_requests;
CREATE TABLE admin_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_type TEXT NOT NULL,
    request_data TEXT NOT NULL,
    requested_by INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    reviewed_by INTEGER,
    review_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_admin_requests_status_created ON admin_requests(status, created_at DESC);
CREATE INDEX idx_admin_requests_requester ON admin_requests(requested_by, created_at DESC);
CREATE INDEX idx_admin_requests_reviewer ON admin_requests(reviewed_by, reviewed_at DESC);
CREATE INDEX idx_admin_requests_created_at ON admin_requests(created_at);

DROP TABLE IF EXISTS login_attempts;
CREATE TABLE login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    attempt_type TEXT NOT NULL CHECK (attempt_type IN ('ip', 'email')),
    fail_count INTEGER DEFAULT 1,
    last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier, attempt_type);
CREATE INDEX IF NOT EXISTS idx_login_attempts_expires ON login_attempts(expires_at);
