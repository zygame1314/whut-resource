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
