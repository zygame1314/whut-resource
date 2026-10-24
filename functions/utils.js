export function folderKeyUpperBound(folderKey) {
  if (!folderKey) return null;
  const last = folderKey.charCodeAt(folderKey.length - 1);
  return folderKey.slice(0, -1) + String.fromCharCode(last + 1);
}
export const DIR_LIST_CACHE_ID = 2;
export async function invalidateDirListCache(DB) {
  if (!DB) return;
  try {
    await DB.prepare('DELETE FROM system_cache WHERE id = ?').bind(DIR_LIST_CACHE_ID).run();
  } catch (e) {
    console.error('清除目录列表缓存失败:', e?.message || e);
  }
}
const R2_TASK_CONCURRENCY = 4;
const D1_MAX_BIND_PARAMS = 90;
const VECTORIZE_MAX_BATCH = 1000;
const QUEUE_MSG_SAFE_BYTES = 100 * 1024;
const R2_MOVE_CHUNK = 100;
const R2_DELETE_CHUNK = 400;
export async function enqueueFileTask(env, task) {
  if (!env || !env.FILE_QUEUE) return false;
  try {
    await env.FILE_QUEUE.send(task);
    return true;
  } catch (e) {
    console.error('文件任务入队失败，回退同步执行:', e?.message || e);
    return false;
  }
}
async function sendFileTasksBatched(env, tasks) {
  if (!env?.FILE_QUEUE) return false;
  try {
    if (typeof env.FILE_QUEUE.sendBatch === 'function') {
      let batch = [];
      let batchBytes = 0;
      for (const task of tasks) {
        const size = JSON.stringify(task).length * 2 + 80;
        if (batch.length >= 100 || (batch.length > 0 && batchBytes + size > QUEUE_MSG_SAFE_BYTES * 2)) {
          await env.FILE_QUEUE.sendBatch(batch.map(body => ({ body })));
          batch = [];
          batchBytes = 0;
        }
        batch.push(task);
        batchBytes += size;
      }
      if (batch.length > 0) {
        await env.FILE_QUEUE.sendBatch(batch.map(body => ({ body })));
      }
    } else {
      for (const task of tasks) {
        await env.FILE_QUEUE.send(task);
      }
    }
    return true;
  } catch (e) {
    console.error('文件任务批量入队失败，回退同步执行:', e?.message || e);
    return false;
  }
}
function buildMoveTasks(list) {
  const tasks = [];
  let current = [];
  let currentBytes = 0;
  for (const move of list) {
    const size = (move.from.length + move.to.length + (move.contentType ? move.contentType.length : 0)) * 2 + 60;
    if (current.length >= R2_MOVE_CHUNK || (current.length > 0 && currentBytes + size > QUEUE_MSG_SAFE_BYTES)) {
      tasks.push({ type: 'file', op: 'r2_move', moves: current });
      current = [];
      currentBytes = 0;
    }
    current.push(move);
    currentBytes += size;
  }
  if (current.length > 0) tasks.push({ type: 'file', op: 'r2_move', moves: current });
  return tasks;
}
function buildDeleteTasks(list) {
  const tasks = [];
  let current = [];
  let currentBytes = 0;
  for (const key of list) {
    const size = key.length * 2 + 10;
    if (current.length >= R2_DELETE_CHUNK || (current.length > 0 && currentBytes + size > QUEUE_MSG_SAFE_BYTES)) {
      tasks.push({ type: 'file', op: 'r2_delete', keys: current });
      current = [];
      currentBytes = 0;
    }
    current.push(key);
    currentBytes += size;
  }
  if (current.length > 0) tasks.push({ type: 'file', op: 'r2_delete', keys: current });
  return tasks;
}
async function dispatchAttached(env, waitUntil, tasks, fallback) {
  const dispatched = await sendFileTasksBatched(env, tasks);
  if (dispatched) return;
  const run = async () => {
    try {
      await fallback();
    } catch (e) {
      console.error('复合文件任务执行失败:', e);
      await recordFileTaskFailure(env, tasks[0], e?.message || e);
    }
  };
  if (typeof waitUntil === 'function') waitUntil(run());
  else await run();
}
export async function dispatchMoveWithVector(env, waitUntil, moves, unindexIds = [], indexIds = []) {
  const list = Array.isArray(moves) ? moves.filter(m => m && m.from && m.to) : [];
  const unindex = Array.isArray(unindexIds) ? unindexIds.filter(id => id != null) : [];
  const index = Array.isArray(indexIds) ? indexIds.filter(id => id != null) : [];
  if (list.length === 0) {
    if (unindex.length > 0) await dispatchFileTask(env, waitUntil, { type: 'file', op: 'vector_unindex', fileIds: unindex });
    if (index.length > 0) await dispatchFileTask(env, waitUntil, { type: 'file', op: 'vector_index', fileIds: index });
    return;
  }
  const tasks = buildMoveTasks(list);
  tasks[0].unindexIds = unindex;
  tasks[0].indexIds = index;
  await dispatchAttached(env, waitUntil, tasks, async () => {
    await runR2Move(env, list);
    if (unindex.length > 0) await runVectorUnindex(env, unindex);
    if (index.length > 0) await runVectorIndex(env, index);
  });
}
export async function dispatchDeleteWithVector(env, waitUntil, keys, unindexIds = []) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  const unindex = Array.isArray(unindexIds) ? unindexIds.filter(id => id != null) : [];
  if (list.length === 0) {
    if (unindex.length > 0) await dispatchFileTask(env, waitUntil, { type: 'file', op: 'vector_unindex', fileIds: unindex });
    return;
  }
  const tasks = buildDeleteTasks(list);
  tasks[0].unindexIds = unindex;
  await dispatchAttached(env, waitUntil, tasks, async () => {
    await runR2Delete(env, list);
    if (unindex.length > 0) await runVectorUnindex(env, unindex);
  });
}
export async function recordFileTaskFailure(env, task, errorMessage) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO file_task_failures (operation, payload, error_message) VALUES (?, ?, ?)'
    ).bind(
      task?.op || 'unknown',
      JSON.stringify(task || {}).substring(0, 4000),
      String(errorMessage || '').substring(0, 1000)
    ).run();
    await env.DB.prepare(
      "DELETE FROM file_task_failures WHERE resolved = TRUE AND created_at < datetime('now', '-7 days')"
    ).run();
  } catch (e) {
    console.error('记录文件任务失败信息出错:', e?.message || e);
  }
}
export async function runR2Move(env, moves) {
  const R2 = env?.R2_bucket;
  const list = Array.isArray(moves) ? moves.filter(m => m && m.from && m.to) : [];
  if (!R2 || list.length === 0) return;
  for (let i = 0; i < list.length; i += R2_TASK_CONCURRENCY) {
    const batch = list.slice(i, i + R2_TASK_CONCURRENCY);
    await Promise.all(batch.map(async ({ from, to, contentType }) => {
      const sourceObj = await R2.get(from);
      if (!sourceObj) return;
      await R2.put(to, sourceObj.body, {
        httpMetadata: { contentType: contentType || 'application/octet-stream' }
      });
      await R2.delete(from);
    }));
  }
}
export async function runR2Delete(env, keys) {
  const R2 = env?.R2_bucket;
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!R2 || list.length === 0) return;
  for (let i = 0; i < list.length; i += R2_TASK_CONCURRENCY) {
    const batch = list.slice(i, i + R2_TASK_CONCURRENCY);
    await Promise.all(batch.map(key => R2.delete(key)));
  }
}
export async function runVectorIndex(env, fileIds) {
  const ids = Array.isArray(fileIds) ? fileIds.filter(id => id != null) : [];
  if (!env?.VECTORIZE || !env.SILICONFLOW_API_KEY || !env.DB || ids.length === 0) return;
  const files = [];
  for (let i = 0; i < ids.length; i += D1_MAX_BIND_PARAMS) {
    const chunk = ids.slice(i, i + D1_MAX_BIND_PARAMS);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, name, key, parent_path, is_directory, description FROM files WHERE id IN (${placeholders})`
    ).bind(...chunk).all();
    if (results && results.length > 0) files.push(...results);
  }
  if (files.length === 0) return;
  try {
    const embeddings = await generateEmbeddings(env, files.map(f => buildRichEmbeddingText(f)));
    if (!embeddings || embeddings.length !== files.length) {
      throw new Error('嵌入生成失败或数量不匹配');
    }
    const vectors = files.map((file, index) => ({
      id: file.id.toString(),
      values: embeddings[index],
      metadata: { name: file.name, path: file.key }
    }));
    for (let i = 0; i < vectors.length; i += VECTORIZE_MAX_BATCH) {
      const batch = vectors.slice(i, i + VECTORIZE_MAX_BATCH);
      await retryWithBackoff(async () => {
        await env.VECTORIZE.upsert(batch);
      }, 3, 500);
    }
  } catch (error) {
    console.error('向量索引写入失败:', error);
    for (const file of files) {
      await recordVectorSyncFailure(env, 'create', file.id, { name: file.name, key: file.key }, error.message);
    }
  }
}
export async function runVectorUnindex(env, fileIds) {
  const ids = Array.isArray(fileIds) ? fileIds.filter(id => id != null) : [];
  if (!env?.VECTORIZE || ids.length === 0) return;
  const idsToDelete = ids.map(id => id.toString());
  try {
    for (let i = 0; i < idsToDelete.length; i += VECTORIZE_MAX_BATCH) {
      const batch = idsToDelete.slice(i, i + VECTORIZE_MAX_BATCH);
      await retryWithBackoff(async () => {
        await env.VECTORIZE.deleteByIds(batch);
      }, 3, 500);
    }
  } catch (error) {
    console.error('删除向量索引失败:', error);
    for (const id of ids) {
      await recordVectorSyncFailure(env, 'delete', id, null, error.message);
    }
  }
}
export async function runFileTask(env, task) {
  switch (task?.op) {
    case 'r2_move':
      await runR2Move(env, task.moves);
      if (Array.isArray(task.unindexIds) && task.unindexIds.length > 0) {
        await runVectorUnindex(env, task.unindexIds);
      }
      if (Array.isArray(task.indexIds) && task.indexIds.length > 0) {
        await runVectorIndex(env, task.indexIds);
      }
      return;
    case 'r2_delete':
      await runR2Delete(env, task.keys);
      if (Array.isArray(task.unindexIds) && task.unindexIds.length > 0) {
        await runVectorUnindex(env, task.unindexIds);
      }
      return;
    case 'vector_index':
      await runVectorIndex(env, task.fileIds);
      return;
    case 'vector_unindex':
      await runVectorUnindex(env, task.fileIds);
      return;
    case 'vector_refresh':
      await runVectorUnindex(env, task.fileIds);
      await runVectorIndex(env, task.fileIds);
      return;
    default:
      throw new Error('未知的文件任务类型: ' + task?.op);
  }
}
export async function dispatchFileTask(env, waitUntil, task) {
  if (env?.FILE_QUEUE) {
    const sent = await enqueueFileTask(env, task);
    if (sent) return;
  }
  const run = async () => {
    try {
      await runFileTask(env, task);
    } catch (e) {
      console.error('文件任务执行失败:', e);
      await recordFileTaskFailure(env, task, e?.message || e);
    }
  };
  if (typeof waitUntil === 'function') waitUntil(run());
  else await run();
}
export const MAINTENANCE_JOB_TYPE = 'maintenance';
const MAINTENANCE_CHUNK_SIZE = 200;
const MAINTENANCE_MAX_CHUNKS = 5000;
export async function createMaintenanceJob(env, { kind, chunk = {}, total = null, createdBy = null }) {
  if (!env?.DB) throw new Error('数据库未配置');
  const insert = await env.DB.prepare(
    'INSERT INTO maintenance_jobs (kind, status, cursor, total, processed, created_by) VALUES (?, ?, ?, ?, 0, ?)'
  ).bind(kind, 'pending', JSON.stringify(chunk || {}), total, createdBy).run();
  try {
    await env.DB.prepare(
      "DELETE FROM maintenance_jobs WHERE status IN ('completed', 'failed') AND created_at < datetime('now', '-7 days')"
    ).run();
  } catch (e) {
    console.error('清理旧维护任务失败:', e);
  }
  return insert.meta.last_row_id;
}
export async function getMaintenanceJob(env, jobId) {
  if (!env?.DB) return null;
  return await env.DB.prepare('SELECT * FROM maintenance_jobs WHERE id = ?').bind(jobId).first();
}
export async function enqueueMaintenanceJob(env, jobId) {
  if (!env?.FILE_QUEUE) return false;
  try {
    await env.FILE_QUEUE.send({ type: MAINTENANCE_JOB_TYPE, jobId });
    return true;
  } catch (e) {
    console.error('维护任务入队失败:', e?.message || e);
    return false;
  }
}
export async function enqueueDeleteKeysJob(env, keys, createdBy = null) {
  if (!env?.FILE_QUEUE) return null;
  const uniqueKeys = [...new Set((Array.isArray(keys) ? keys : []).filter(k => k && typeof k === 'string').map(k => k.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) return null;
  const jobId = await createMaintenanceJob(env, {
    kind: 'delete_keys',
    chunk: { keys: uniqueKeys },
    total: uniqueKeys.length,
    createdBy
  });
  const queued = await enqueueMaintenanceJob(env, jobId);
  if (!queued) return null;
  return { jobId, count: uniqueKeys.length };
}
async function finishMaintenanceJob(env, jobId, status, message) {
  await env.DB.prepare(
    'UPDATE maintenance_jobs SET status = ?, message = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(status, message || null, jobId).run();
}
async function advanceMaintenanceJob(env, jobId, chunk, processed) {
  await env.DB.prepare(
    'UPDATE maintenance_jobs SET cursor = ?, processed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(JSON.stringify(chunk || {}), processed, jobId).run();
}
async function runSyncProcessChunk(env, chunk) {
  const R2 = env.R2_bucket;
  const DB = env.DB;
  const sessionId = chunk.sessionId;
  if (!R2 || !DB || !sessionId) throw new Error('同步处理缺少 R2/DB/sessionId');
  const options = { limit: 1000 };
  if (chunk.cursor) options.cursor = chunk.cursor;
  const list = await R2.list(options);
  const objects = list.objects || [];
  const dirPaths = new Set();
  const statements = [];
  for (const object of objects) {
    const key = object.key;
    if (key.endsWith('/')) continue;
    const name = key.split('/').pop();
    const parentPath = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
    const size = object.size;
    const uploaded = object.uploaded.toISOString();
    const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
    if (parentPath) {
      let currentPath = parentPath;
      while (currentPath) {
        dirPaths.add(currentPath);
        if (currentPath.endsWith('/')) currentPath = currentPath.slice(0, -1);
        const lastSlash = currentPath.lastIndexOf('/');
        if (lastSlash === -1) break;
        currentPath = currentPath.substring(0, lastSlash + 1);
      }
    }
    statements.push(DB.prepare(`
      INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, uploader_id, last_verified)
      VALUES (?, ?, ?, ?, ?, ?, FALSE, 0, NULL, ?)
      ON CONFLICT(key) DO UPDATE SET
        size = excluded.size,
        uploaded = excluded.uploaded,
        contentType = excluded.contentType,
        parent_path = excluded.parent_path,
        last_verified = excluded.last_verified
    `).bind(key, name, size, uploaded, contentType, parentPath, sessionId));
  }
  for (const dirPath of dirPaths) {
    const parts = dirPath.split('/').filter(p => p);
    const dirName = parts[parts.length - 1];
    const parentDir = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') + '/' : '';
    statements.push(DB.prepare(`
      INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads, last_verified)
      VALUES (?, ?, 0, ?, 'inode/directory', ?, TRUE, 0, ?)
      ON CONFLICT(key) DO UPDATE SET last_verified = excluded.last_verified
    `).bind(dirPath, dirName, new Date().toISOString(), parentDir, sessionId));
  }
  for (let i = 0; i < statements.length; i += 50) {
    const batch = statements.slice(i, i + 50);
    if (batch.length > 0) await DB.batch(batch);
  }
  return {
    done: !list.truncated,
    nextChunk: list.truncated ? { sessionId, cursor: list.cursor } : { sessionId },
    processed: objects.length
  };
}
async function runSyncCleanupChunk(env, chunk) {
  const DB = env.DB;
  const VECTORIZE = env.VECTORIZE;
  const sessionId = chunk.sessionId;
  if (!DB || !sessionId) throw new Error('同步清理缺少 DB/sessionId');
  const filesToDeleteResult = await DB.prepare(`
    SELECT id, key FROM files
    WHERE (last_verified IS NULL OR last_verified != ?)
      AND is_link = FALSE
      AND is_directory = FALSE
  `).bind(sessionId).all();
  const filesToDelete = filesToDeleteResult.results || [];
  const deleteStatements = [];
  const vectorIdsToDelete = [];
  for (const file of filesToDelete) {
    deleteStatements.push(DB.prepare('DELETE FROM files WHERE id = ?').bind(file.id));
    if (file.id) vectorIdsToDelete.push(file.id.toString());
  }
  const dirsToDeleteResult = await DB.prepare(`
    SELECT id, key FROM files
    WHERE is_directory = TRUE
      AND (last_verified IS NULL OR last_verified != ?)
      AND key NOT IN (
        SELECT DISTINCT parent_path FROM files
        WHERE parent_path IS NOT NULL AND (last_verified = ? OR is_link = TRUE)
      )
  `).bind(sessionId, sessionId).all();
  const dirsToDelete = dirsToDeleteResult.results || [];
  for (const dir of dirsToDelete) deleteStatements.push(DB.prepare('DELETE FROM files WHERE id = ?').bind(dir.id));
  for (let i = 0; i < deleteStatements.length; i += 50) {
    const batch = deleteStatements.slice(i, i + 50);
    if (batch.length > 0) await DB.batch(batch);
  }
  if (dirsToDelete.length > 0) await invalidateDirListCache(DB);
  let deletedVectorsCount = 0;
  if (VECTORIZE && vectorIdsToDelete.length > 0) {
    for (let i = 0; i < vectorIdsToDelete.length; i += 100) {
      const batch = vectorIdsToDelete.slice(i, i + 100);
      try {
        await VECTORIZE.deleteByIds(batch);
        deletedVectorsCount += batch.length;
      } catch (e) {
        console.error('清理向量索引失败:', e);
        for (const id of batch) await recordVectorSyncFailure(env, 'delete', Number(id), null, e.message);
      }
    }
  }
  try {
    await DB.prepare(`
      INSERT INTO system_stats (id, total_files, total_size)
      VALUES (1, 0, 0)
      ON CONFLICT(id) DO UPDATE SET
        total_files = (SELECT COUNT(*) FROM files WHERE is_directory = FALSE),
        total_size = COALESCE((SELECT SUM(size) FROM files WHERE is_directory = FALSE), 0),
        updated_at = CURRENT_TIMESTAMP
    `).run();
  } catch (e) {
    console.error('更新系统统计失败', e);
  }
  return { done: true, nextChunk: {}, processed: filesToDelete.length + dirsToDelete.length };
}
async function runReindexChunk(env, chunk) {
  const DB = env.DB;
  const VECTORIZE = env.VECTORIZE;
  if (!DB || !VECTORIZE || !env.SILICONFLOW_API_KEY) throw new Error('重建索引缺少 DB/VECTORIZE/SILICONFLOW_API_KEY');
  const lastId = Number(chunk.lastId) || 0;
  const filesResult = await DB.prepare(
    'SELECT id, name, key, parent_path, is_directory, description FROM files WHERE id > ? ORDER BY id LIMIT ?'
  ).bind(lastId, MAINTENANCE_CHUNK_SIZE).all();
  const files = filesResult.results || [];
  if (files.length === 0) {
    return { done: true, nextChunk: {}, processed: 0 };
  }
  const embeddings = await generateEmbeddings(env, files.map(f => buildRichEmbeddingText(f)));
  if (!embeddings || embeddings.length !== files.length) {
    throw new Error('AI 嵌入生成失败或数量不匹配');
  }
  const vectors = files.map((file, index) => ({
    id: file.id.toString(),
    values: embeddings[index],
    metadata: { name: file.name, path: file.key }
  }));
  await retryWithBackoff(async () => {
    await VECTORIZE.upsert(vectors);
  }, 3, 500);
  const nextLastId = files[files.length - 1].id;
  const done = files.length < MAINTENANCE_CHUNK_SIZE;
  return {
    done,
    nextChunk: done ? {} : { lastId: nextLastId },
    processed: files.length
  };
}
async function runDeleteKeysChunk(env, chunk) {
  const DB = env.DB;
  if (!DB) throw new Error('批量删除缺少 DB');
  const allKeys = Array.isArray(chunk.keys) ? chunk.keys.filter(Boolean) : [];
  if (allKeys.length === 0) return { done: true, nextChunk: {}, processed: 0 };
  const ROW_BUDGET = 5000;
  const offset = Number(chunk.offset) || 0;
  const allKeysToRemove = new Set();
  const fileIdsToUnindex = [];
  const r2DeleteKeys = [];
  const folderSubKeys = [];
  let rows = 0;
  let index = offset;
  for (; index < allKeys.length; index++) {
    const key = allKeys[index];
    if (key.endsWith('/')) {
      const folderPath = key;
      const endKey = folderPath.substring(0, folderPath.length - 1) + '0';
      const { results: childItems } = await DB.prepare(
        "SELECT id, key, is_link, is_directory FROM files WHERE key >= ? AND key < ? AND key != ?"
      ).bind(folderPath, endKey, folderPath).all();
      const children = childItems || [];
      for (const child of children) {
        allKeysToRemove.add(child.key);
        if (child.id) fileIdsToUnindex.push(child.id);
        const isChildLink = child.is_link === 1 || child.is_link === true;
        const isChildDirectory = child.is_directory === 1 || child.is_directory === true;
        if (!isChildLink && !isChildDirectory) r2DeleteKeys.push(child.key);
      }
      allKeysToRemove.add(folderPath);
      const folderRecord = await DB.prepare('SELECT id FROM files WHERE key = ?').bind(folderPath).first();
      if (folderRecord?.id) fileIdsToUnindex.push(folderRecord.id);
      folderSubKeys.push(folderPath);
      rows += children.length + 1;
    } else {
      const fileRecord = await DB.prepare('SELECT id, is_link FROM files WHERE key = ?').bind(key).first();
      if (fileRecord) {
        allKeysToRemove.add(key);
        if (fileRecord.id) fileIdsToUnindex.push(fileRecord.id);
        const isLink = fileRecord.is_link === 1 || fileRecord.is_link === true;
        if (!isLink) r2DeleteKeys.push(key);
        rows += 1;
      }
    }
    if (rows >= ROW_BUDGET) {
      index++;
      break;
    }
  }
  for (const folderPath of folderSubKeys) {
    const upper = folderKeyUpperBound(folderPath);
    await DB.prepare('DELETE FROM folder_subscriptions WHERE folder_key >= ? AND folder_key < ?').bind(folderPath, upper).run();
  }
  const keyList = [...allKeysToRemove];
  const CHUNK = 90;
  for (let i = 0; i < keyList.length; i += CHUNK) {
    const batch = keyList.slice(i, i + CHUNK);
    const placeholders = batch.map(() => '?').join(',');
    await DB.batch([
      DB.prepare(`DELETE FROM files WHERE key IN (${placeholders})`).bind(...batch),
      DB.prepare(`DELETE FROM downloads WHERE file_key IN (${placeholders})`).bind(...batch),
      DB.prepare(`DELETE FROM file_reactions WHERE file_key IN (${placeholders})`).bind(...batch),
      DB.prepare(`DELETE FROM file_boosts WHERE file_key IN (${placeholders})`).bind(...batch),
      DB.prepare(`DELETE FROM favorites WHERE file_key IN (${placeholders})`).bind(...batch)
    ]);
  }
  if (r2DeleteKeys.length > 0) {
    await runR2Delete(env, r2DeleteKeys);
  }
  if (fileIdsToUnindex.length > 0) {
    await runVectorUnindex(env, fileIdsToUnindex);
  }
  await invalidateDirListCache(DB);
  const done = index >= allKeys.length;
  if (done) {
    try {
      await DB.prepare(`
        INSERT INTO system_stats (id, total_files, total_size)
        VALUES (1, 0, 0)
        ON CONFLICT(id) DO UPDATE SET
          total_files = (SELECT COUNT(*) FROM files WHERE is_directory = FALSE),
          total_size = COALESCE((SELECT SUM(size) FROM files WHERE is_directory = FALSE), 0),
          updated_at = CURRENT_TIMESTAMP
      `).run();
    } catch (e) {
      console.error('更新系统统计失败', e);
    }
  }
  return {
    done,
    nextChunk: done ? {} : { keys: allKeys, offset: index },
    processed: index - offset
  };
}
async function runMaintenanceChunk(env, job) {
  const chunk = job.cursor ? JSON.parse(job.cursor) : {};
  switch (job.kind) {
    case 'sync_process':
      return await runSyncProcessChunk(env, chunk);
    case 'sync_cleanup':
      return await runSyncCleanupChunk(env, chunk);
    case 'reindex':
      return await runReindexChunk(env, chunk);
    case 'delete_keys':
      return await runDeleteKeysChunk(env, chunk);
    default:
      throw new Error('未知的维护任务类型: ' + job.kind);
  }
}
export async function runMaintenanceJob(env, jobId) {
  const job = await getMaintenanceJob(env, jobId);
  if (!job) return { success: false, message: '任务不存在' };
  if (job.status === 'completed' || job.status === 'failed') {
    return { success: true, message: '任务已结束', status: job.status };
  }
  const chunks = Number(job.chunks) || 0;
  if (chunks >= MAINTENANCE_MAX_CHUNKS) {
    await finishMaintenanceJob(env, jobId, 'failed', `超过最大分片次数(${MAINTENANCE_MAX_CHUNKS})，已中止`);
    return { success: false, message: '超过最大分片次数' };
  }
  await env.DB.prepare(
    "UPDATE maintenance_jobs SET status = 'running', chunks = chunks + 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(jobId).run();
  let result;
  try {
    result = await runMaintenanceChunk(env, job);
  } catch (e) {
    console.error(`维护任务执行失败 (job=${jobId}, kind=${job.kind}):`, e);
    await finishMaintenanceJob(env, jobId, 'failed', e?.message || String(e));
    await recordFileTaskFailure(env, { op: MAINTENANCE_JOB_TYPE, jobId, kind: job.kind }, e?.message || e);
    return { success: false, message: e?.message || '任务执行失败' };
  }
  const processed = (Number(job.processed) || 0) + (Number(result.processed) || 0);
  if (result.done) {
    await advanceMaintenanceJob(env, jobId, {}, processed);
    await finishMaintenanceJob(env, jobId, 'completed', `处理完成，共 ${processed} 项`);
    return { success: true, done: true, processed };
  }
  await advanceMaintenanceJob(env, jobId, result.nextChunk || {}, processed);
  await enqueueMaintenanceJob(env, jobId);
  return { success: true, done: false, processed };
}
const _rlCache = new Map();
const RL_WINDOW_MS = 60 * 1000;
const RL_CLEANUP_THRESHOLD = 5000;
function _cleanupRlCache(now) {
  if (_rlCache.size < RL_CLEANUP_THRESHOLD) return;
  for (const [k, v] of _rlCache) {
    if (now - v.ts > RL_WINDOW_MS * 2) _rlCache.delete(k);
  }
}
export function checkRateLimit(key, maxCount, windowMs = RL_WINDOW_MS) {
  const now = Date.now();
  _cleanupRlCache(now);
  const k = `${key}|${Math.floor(now / windowMs)}`;
  const entry = _rlCache.get(k);
  if (entry) {
    entry.c++;
    if (entry.c > maxCount) return false;
  } else {
    _rlCache.set(k, { c: 1, ts: now });
  }
  return true;
}
export function getRequestRateLimitKey(request, suffix) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return `${ip}:${suffix}`;
}
export function getUserRateLimitKey(user, suffix) {
  return `u:${user?.id || 'anon'}:${suffix}`;
}
export function checkContentLength(request, maxBytes) {
  const cl = request.headers.get('Content-Length');
  if (cl && parseInt(cl, 10) > maxBytes) return false;
  return true;
}
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (salt || "default-salt"));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyPasswordHash(password, hash, salt) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}
export function toBase64Url(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export async function signToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  const encodedSignature = toBase64Url(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
function fromBase64Url(str) {
  const binary = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signature = Uint8Array.from(atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    if (!isValid) return null;
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
const JWT_KEY_ID = "rsa-1";
const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_FOOTER = "-----END PRIVATE KEY-----";
function pemToBase64Der(pem) {
  const trimmed = pem.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function importRsaPrivateKey(pem) {
  const der = pemToBase64Der(pem);
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
export async function getRsaPrivateKey(env) {
  const pem = env.JWT_PRIVATE_KEY;
  if (!pem || typeof pem !== 'string' || !pem.includes(PEM_HEADER)) {
    throw new Error('JWT_PRIVATE_KEY 未配置或格式无效（需 PKCS#8 PEM 私钥）');
  }
  return await importRsaPrivateKey(pem);
}
export async function signIdToken(payload, env) {
  const key = await getRsaPrivateKey(env);
  const header = { alg: "RS256", typ: "JWT", kid: JWT_KEY_ID };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  const encodedSignature = toBase64Url(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
export async function getJwks(env) {
  const pem = env.JWT_PRIVATE_KEY;
  if (!pem || typeof pem !== 'string' || !pem.includes(PEM_HEADER)) {
    return { keys: [] };
  }
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBase64Der(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return {
    keys: [
      {
        kty: "RSA",
        kid: JWT_KEY_ID,
        alg: "RS256",
        use: "sig",
        n: jwk.n,
        e: jwk.e
      }
    ]
  };
}
export function addCorsHeaders(headers = {}) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
    'Access-Control-Max-Age': '86400',
  };
}
export function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'super_admin');
}
export function buildRichEmbeddingText(file) {
  const parts = [];
  if (file.name) parts.push(file.name);
  if (file.parent_path) {
    const pathParts = file.parent_path.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
    parts.push(...pathParts);
  }
  if (file.description && file.description.trim()) parts.push(file.description.trim());
  return [...new Set(parts)].join(' ');
}
const FTS_RESERVED_OPERATORS = ['AND', 'OR', 'NOT'];
const FTS_SPECIAL_CHARS = /[-*():^"'./\\?!,;=<>@#$%&|~{}\[\]`]/g;
export function buildFtsMatchQuery(input, operator = 'AND') {
  if (typeof input !== 'string') return '';
  const joiner = operator === 'OR' ? ' OR ' : ' ';
  const terms = input.replace(/"/g, '').split(/\s+/).filter(t => t.length > 0);
  const processedTerms = [];
  for (const term of terms) {
    const upperTerm = term.toUpperCase();
    if (FTS_RESERVED_OPERATORS.includes(upperTerm)) {
      if (processedTerms.length > 0) processedTerms.push(upperTerm);
      continue;
    }
    const stripped = term.replace(FTS_SPECIAL_CHARS, '');
    const chars = Array.from(stripped).filter(c => /\S/.test(c));
    if (chars.length === 0) continue;
    if (/[^\x00-\x7F]/.test(stripped)) {
      processedTerms.push(chars.join(joiner));
    } else {
      processedTerms.push(`"${chars.join(' ')}"`);
    }
  }
  return processedTerms.join(joiner).trim();
}
const CN_SEMESTER_DIGIT = { 一: 1, 二: 2, 1: 1, 2: 2 };
const TERM_TAG_SOURCE = '(20\\d{2})\\s*[-~至到]\\s*(20\\d{2})\\s*[-~至到]\\s*([12])(?!\\d)';

function currentSemester(now) {
  const matched = String(now || '').match(/(20\d{2})\D{1,3}(\d{1,2})\D/);
  let year, month;
  if (matched) {
    year = Number(matched[1]);
    month = Number(matched[2]);
  } else {
    const date = new Date();
    year = date.getFullYear();
    month = date.getMonth() + 1;
  }
  if (month >= 9) return { year, semester: 1 };
  if (month === 1) return { year: year - 1, semester: 1 };
  return { year: year - 1, semester: 2 };
}

function collectTermTags(text, target = []) {
  const regex = new RegExp(TERM_TAG_SOURCE, 'g');
  let matched;
  while ((matched = regex.exec(text)) !== null) {
    target.push({ start: Number(matched[1]), end: Number(matched[2]), semester: Number(matched[3]) });
  }
  return target;
}

export function parseTimeConstraint(constraint, query, now) {
  const text = `${constraint || ''} ${query || ''}`;
  const years = [...new Set([...text.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map(m => Number(m[1])))];
  const explicitTerms = collectTermTags(`${constraint || ''}`);
  if (years.length === 0 && explicitTerms.length === 0) return null;
  let semester = 0;
  const termMatch = text.match(/第\s*([一二12])\s*学期/);
  if (termMatch) {
    semester = CN_SEMESTER_DIGIT[termMatch[1]] || 0;
  } else if (/上学期/.test(text)) {
    semester = 1;
  } else if (/下学期/.test(text)) {
    semester = 2;
  } else if (/这学期|本学期|当前学期/.test(text)) {
    semester = currentSemester(now).semester;
  }
  return { years, semester, explicitTerms };
}

function matchesTimeConstraint(row, parsed, loose = false) {
  const haystack = `${row.name || ''} ${row.key || ''}`;
  const tags = collectTermTags(haystack);
  if (parsed.explicitTerms.length > 0) {
    return parsed.explicitTerms.some(term => tags.some(
      tag => tag.start === term.start && tag.end === term.end && tag.semester === term.semester
    ) || haystack.includes(`${term.start}-${term.end}-${term.semester}`));
  }
  if (tags.length === 0) {
    if (parsed.semester) return false;
    return parsed.years.some(year => haystack.includes(String(year)));
  }
  return tags.some(tag => parsed.years.some(year => {
    if (loose) {
      if (year < tag.start || year > tag.end) return false;
      return parsed.semester ? tag.semester === parsed.semester : true;
    }
    if (parsed.semester === 2) return tag.end === year && tag.semester === 2;
    if (parsed.semester === 1) return tag.semester === 1 && (tag.start === year || tag.end === year);
    return year >= tag.start && year <= tag.end;
  }));
}

// 先按自然年精确匹配；一个都没有时退回"学年区间覆盖该年"的宽松口径
function filterByTime(rows, parsed) {
  if (!parsed) return rows;
  const strict = rows.filter(row => matchesTimeConstraint(row, parsed));
  if (strict.length > 0) return strict;
  return rows.filter(row => matchesTimeConstraint(row, parsed, true));
}

export function applyTimeConstraint(rows, constraint, query, now) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || null;
  const parsed = parseTimeConstraint(constraint, query, now);
  if (!parsed) return rows;
  const filtered = filterByTime(rows, parsed);
  return filtered.length > 0 ? filtered : null;
}
const NON_LITERAL_CONSTRAINT = /^(?:第?[一二三四1-4]学期|上学期|下学期|这学期|本学期|学年|今年|明年|去年|前年)$/;

// 模型偶尔会把"第二学期""这学期"这类描述性时间词塞进限定；
// 它们永远不可能出现在文件名里，留着会让字面检索的 AND 必然落空。
// 学期/学年信息由 parseTimeConstraint 从原文解析，这里只需要保留年份之类的字面词。
export function sanitizeConstraintTerms(terms) {
  const list = Array.isArray(terms) ? terms : (terms == null ? [] : [terms]);
  const out = [];
  for (const raw of list) {
    const term = String(raw == null ? '' : raw).trim();
    if (!term) continue;
    if (NON_LITERAL_CONSTRAINT.test(term)) continue;
    if (/学期|学年/.test(term)) {
      for (const year of term.match(/20\d{2}/g) || []) out.push(year);
      continue;
    }
    out.push(term);
  }
  return [...new Set(out)];
}

export async function searchByLiteralTerms(DB, keywords, terms, limit = 50) {
  if (!Array.isArray(terms) || terms.length === 0) return null;
  const baseQuery = buildFtsMatchQuery(keywords);
  if (!baseQuery) return null;
  const termQueries = terms
    .map(t => buildFtsMatchQuery(t))
    .filter(Boolean);
  if (termQueries.length === 0) return null;
  const matchQuery = [baseQuery, ...termQueries.map(q => `AND (${q})`)].join(' ');
  try {
    const result = await DB.prepare(
      `SELECT f.id, f.name, f.key, f.parent_path, f.is_directory, f.is_link, f.link_url,
              f.description, f.contentType, f.size, f.downloads, f.likes, f.uploaded
       FROM files f
       JOIN files_fts ON f.id = files_fts.rowid
       WHERE files_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    ).bind(matchQuery, limit).all();
    const rows = result.results || [];
    if (rows.length === 0) return null;
    const lowered = terms.map(t => String(t).toLowerCase()).filter(Boolean);
    const verified = rows.filter(row => {
      const haystack = `${row.name || ''} ${row.key || ''}`.toLowerCase();
      return lowered.every(t => haystack.includes(t));
    });
    if (verified.length === 0) return null;
    return verified;
  } catch (e) {
    console.error('字面限定搜索失败:', e);
    return null;
  }
}
export async function hybridSearch(DB, VECTORIZE, env, query, options = {}) {
  const {
    topK = 50,
    vectorTopK = 30,
    ftsLimit = 30,
    minVectorScore = 0.2,
  } = options;
  const embeddings = await generateEmbeddings(env, [query.trim()]);
  if (!embeddings?.[0]) {
    throw new Error('AI 嵌入生成失败');
  }
  const vectorResults = await VECTORIZE.query(embeddings[0], {
    topK: vectorTopK,
    returnMetadata: 'all'
  });
  const candidateIds = new Set();
  const vectorScoreMap = {};
  const ftsHitSet = new Set();
  if (vectorResults?.matches) {
    for (const m of vectorResults.matches) {
      if (m.score >= minVectorScore) {
        candidateIds.add(parseInt(m.id));
        vectorScoreMap[m.id] = m.score;
      }
    }
  }
  let ftsResults = [];
  const runFts = async matchQuery => {
    const ftsResult = await DB.prepare(
      `SELECT f.id, f.name, f.key, f.parent_path, f.is_directory, f.description, f.contentType, f.size, f.downloads, f.likes
       FROM files f
       JOIN files_fts ON f.id = files_fts.rowid
       WHERE files_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    ).bind(matchQuery, ftsLimit).all();
    return ftsResult.results || [];
  };
  const ftsTokenizedQuery = buildFtsMatchQuery(query);
  if (ftsTokenizedQuery) {
    try {
      ftsResults = await runFts(ftsTokenizedQuery);
      if (ftsResults.length === 0) {
        // 全字 AND 一个都没命中时退化为 OR，避免 FTS 完全不出力
        const orQuery = buildFtsMatchQuery(query, 'OR');
        if (orQuery && orQuery !== ftsTokenizedQuery) {
          ftsResults = await runFts(orQuery);
        }
      }
    } catch (e) {
      console.error('FTS搜索失败:', e);
    }
  }
  for (const row of ftsResults) {
    candidateIds.add(row.id);
    ftsHitSet.add(row.id);
    if (!vectorScoreMap[row.id]) {
      vectorScoreMap[row.id] = 0;
    }
  }
  if (candidateIds.size === 0) {
    return { results: [], keywords: query };
  }
  const idArray = [...candidateIds];
  const placeholders = idArray.map(() => '?').join(',');
  const dbResults = await DB.prepare(
    `SELECT id, name, key, parent_path, is_directory, is_link, link_url, description, contentType, size, downloads, likes, uploaded FROM files WHERE id IN (${placeholders})`
  ).bind(...idArray).all();
  let results = (dbResults.results || []).map(file => ({
    ...file,
    vector_score: vectorScoreMap[file.id] || 0,
    fts_hit: ftsHitSet.has(file.id)
  }));
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  results = results.map(f => {
    let nameMatchBonus = 0;
    if (f.name) {
      const nameLower = f.name.toLowerCase();
      let matchCount = 0;
      for (const term of queryTerms) {
        if (nameLower.includes(term)) matchCount++;
      }
      nameMatchBonus = matchCount / queryTerms.length;
    }
    return { ...f, name_match: nameMatchBonus };
  });
  results.sort((a, b) => {
    const scoreA = a.vector_score + (a.fts_hit ? 0.5 : 0) + a.name_match * 0.3;
    const scoreB = b.vector_score + (b.fts_hit ? 0.5 : 0) + b.name_match * 0.3;
    return scoreB - scoreA;
  });
  const RERANK_MAX_DOCS = Math.min(Math.max(topK, 20), 50);
  const rerankCandidates = results.slice(0, RERANK_MAX_DOCS);
  const rerankDocs = rerankCandidates.map(f => {
    const parts = [];
    if (f.name) parts.push(f.name);
    if (f.parent_path) parts.push(f.parent_path.replace(/^\/|\/$/g, ''));
    if (f.description && f.description.trim()) parts.push(f.description.trim());
    return parts.join(' | ');
  });
  const rerankResult = await rerankResults(env, query, rerankDocs, RERANK_MAX_DOCS);
  const rerankScoreMap = {};
  if (rerankResult) {
    rerankResult.forEach(r => {
      const originalIndex = r.index;
      if (originalIndex >= 0 && originalIndex < rerankCandidates.length) {
        const fileId = rerankCandidates[originalIndex].id;
        rerankScoreMap[fileId] = r.relevance_score;
      }
    });
  }
  results = results.map(f => ({ ...f, rerank_score: rerankScoreMap[f.id] ?? 0 }));
  const maxRerank = Math.max(...Object.values(rerankScoreMap), 0.001);
  const maxVector = Math.max(...results.map(f => f.vector_score), 0.001);
  results = results.map(f => {
    const rn = f.rerank_score > 0 ? f.rerank_score / maxRerank : 0;
    const vs = f.vector_score > 0 ? f.vector_score / maxVector : 0;
    const ft = f.fts_hit ? 1 : 0;
    const nm = f.name_match || 0;
    let combined;
    if (f.rerank_score > 0) {
      combined = 0.55 * rn + 0.15 * vs + 0.15 * ft + 0.15 * nm;
    } else {
      combined = 0.35 * vs + 0.35 * ft + 0.30 * nm;
    }
    return {
      ...f,
      similarity_score: combined,
      relevance: buildAbsoluteRelevance(f)
    };
  });
  results.sort((a, b) => b.similarity_score - a.similarity_score);
  return { results: results.slice(0, topK), keywords: query };
}
function buildAbsoluteRelevance(file) {
  const rerank = Number(file.rerank_score) || 0;
  const vector = Number(file.vector_score) || 0;
  return rerank > 0 ? rerank : vector;
}
const MIN_RELEVANCE = 0.3;
const RELATIVE_RELEVANCE_RATIO = 0.45;
export function filterByRelevance(results, { minRelevance = MIN_RELEVANCE, relativeRatio = RELATIVE_RELEVANCE_RATIO } = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const topRelevance = Math.max(...results.map(f => Number(f.relevance) || 0));
  if (topRelevance <= 0) return results;
  const threshold = Math.max(minRelevance, topRelevance * relativeRatio);
  return results.filter(f => (Number(f.relevance) || 0) >= threshold);
}
export function isSuperAdmin(user) {
  return user && user.role === 'super_admin';
}
export async function getUserFromRequest(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const payload = await verifyToken(token, env.JWT_SECRET || 'secret');
  if (!payload) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.id).first();
  return user;
}
export async function logAdminAction(env, operatorId, action, targetType, targetId, reason, details, skipCleanup = false) {
  try {
    await env.DB.prepare(
      'INSERT INTO admin_logs (action, target_type, target_id, reason, details, operator_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(action, targetType, targetId || null, reason || null, details || null, operatorId || null).run();
    if (!skipCleanup) {
      await env.DB.prepare("DELETE FROM admin_logs WHERE created_at < date('now', '-3 days')").run();
    }
  } catch (e) {
    console.error('记录管理员操作失败:', e);
  }
}
export async function cleanupAdminLogs(env) {
  try {
    await env.DB.prepare("DELETE FROM admin_logs WHERE created_at < date('now', '-3 days')").run();
  } catch (e) {
    console.error('清理管理员日志失败:', e);
  }
}
const EMBEDDING_MODEL = 'Qwen/Qwen3-Embedding-0.6B';
const EMBEDDING_DIMENSIONS = 256;
const SILICONFLOW_EMBEDDING_URL = 'https://api.siliconflow.cn/v1/embeddings';
const RERANKER_MODEL = 'BAAI/bge-reranker-v2-m3';
const SILICONFLOW_RERANK_URL = 'https://api.siliconflow.cn/v1/rerank';
function buildSiliconFlowError(response, body, label) {
  const error = new Error(`${label} API Error: ${response.status} - ${body}`);
  const retryAfter = parseInt(response.headers.get('Retry-After') || '', 10);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    error.retryAfterMs = retryAfter * 1000;
  }
  return error;
}
export async function generateEmbeddings(env, texts) {
  if (!texts || texts.length === 0) return [];
  const apiKey = env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error('未配置 SILICONFLOW_API_KEY');
  return await retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(SILICONFLOW_EMBEDDING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          encoding_format: 'float',
          dimensions: EMBEDDING_DIMENSIONS
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw buildSiliconFlowError(response, errorText, 'SiliconFlow Embedding');
      }
      const result = await response.json();
      if (!result?.data || result.data.length !== texts.length) {
        throw new Error('嵌入生成失败或数量不匹配');
      }
      return result.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);
    } finally {
      clearTimeout(timeoutId);
    }
  }, 1, 500);
}
export async function rerankResults(env, query, documents, topN = 20) {
  if (!env.SILICONFLOW_API_KEY) {
    console.warn('未配置 SILICONFLOW_API_KEY，跳过重排');
    return null;
  }
  if (!documents || documents.length === 0) return [];
  try {
    return await retryWithBackoff(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(SILICONFLOW_RERANK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`
          },
          body: JSON.stringify({
            model: RERANKER_MODEL,
            query: query,
            documents: documents,
            top_n: topN,
            return_documents: false
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw buildSiliconFlowError(response, errorText, 'Reranker');
        }
        const result = await response.json();
        return result.results || null;
      } finally {
        clearTimeout(timeoutId);
      }
    }, 0, 500);
  } catch (error) {
    console.error('重排请求失败（已重试）:', error);
    return null;
  }
}
export async function rerankRows(env, query, rows, { topN = 30, minScore = 0.02 } = {}) {
  const passthrough = list => list.map(row => ({ ...row, relevance: row.relevance ?? 1 }));
  if (!Array.isArray(rows) || rows.length <= 5) return passthrough(rows || []);
  const documents = rows.map(row => [row.name, (row.key || '').replace(/\/+$/, ''), row.description]
    .filter(Boolean).join(' | '));
  const results = await rerankResults(env, query, documents, Math.min(rows.length, topN));
  if (!results || results.length === 0) return passthrough(rows);
  const scored = results
    .map(item => ({ row: rows[item.index], score: Number(item.relevance_score) || 0 }))
    .filter(item => item.row && item.score >= minScore)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return passthrough(rows);
  const maxScore = Math.max(...scored.map(item => item.score), 0.0001);
  return scored.map(item => ({
    ...item.row,
    relevance: item.score / maxScore,
    rerank_score: item.score
  }));
}
const SCOPE_PICK_MAX_CANDIDATES = 30;
const SCOPE_CHILD_LIMIT = 150;
// 硅基流动 L0 为 80k TPM：单批 120 条约 5k tokens，超过 1 批时串行请求，避免并发撞限流
const FILE_PICK_BATCH_SIZE = 120;
const FILE_PICK_MAX_BATCHES = 2;
const FILE_PICK_MAX_CANDIDATES = FILE_PICK_BATCH_SIZE * FILE_PICK_MAX_BATCHES;
const FILE_PICK_MAX_DIRS = 3;
const FILE_PICK_DIR_LIMIT = 120;
const FILE_PICK_PROMPT = `从候选中挑出符合限定条件的条目，只输出两行：
MATCH: 命中编号，英文逗号分隔；没有写 0
TERMS: 实际用于比对的字面词，英文逗号分隔

规则：
- 限定先转成字面词，再去文件名和路径里找。TERMS 只填限定词（年份/学年/老师/版本），不填"真题""资料"等通用词，后端会复核。
- 四位年份要展开：年份本身 + 前后学年（2024 → 2024、2023-2024、2024-2025）。
- 用户写了学期就核对学期；只写年份时，覆盖该年的任一学期都算。
- 相对时间按【当前时间】换算成四位年份，不要拿"去年""前年"直接比对。
- 找不到对应字面词的不要选，宁可少选。

示例（当前 2026 年）：
用户需求「前年的毛概」，限定「2024」，候选：1.2023-2024-1 毛概复习题.docx（路径: 0.课程资料/毛概/2023-2024-1）  2.2024-2025-1 毛概主观题.pdf（路径: 0.课程资料/毛概/2024-2025-1）  3.毛概重点整理.docx（路径: 0.课程资料/毛概）
MATCH: 1,2
TERMS: 2024,2023-2024,2024-2025`;
const SCOPE_PICK_PROMPT = `从候选目录中选出符合时间限定的一个，只输出编号或 0，不要解释。

规则：
- 先把限定换算成具体年份/学年学期，不能直接用"去年""前年"比对。
- 用户写明学期时按自然年锁定唯一学年，这条优先级最高：
  Y年第2学期 = (Y-1)-Y-2（Y年2~8月）；Y年第1学期 = Y-(Y+1)-1（Y年9~12月）或 (Y-1)-Y-1（Y年1月）。
  例：2026第2学期 → 2025-2026-2；2026第1学期 → 2026-2027-1 或 2025-2026-1。
- 只写年份、没写学期时，才用"优先学年起始年等于该年份"的规则（2024 → 2024-2025-* 优先，其次覆盖该年的）。
- 目录名不含时间（如"期末试卷""往年资料"）但里面按年份分试卷时，也可以选它，后续会按子项再筛。
- 学期口径：9月~次年1月为第 1 学期，2月~8月为第 2 学期。
- 候选里没有任何目录跟时间沾边就返回 0，不要勉强选。

示例（当前 2026 年）：
限定「2026」，用户需求「2026第二学期」，候选：1.形势与政策/2025-2026-1  2.形势与政策/2025-2026-2  3.形势与政策/2026-2027-1
2

限定「2024」，候选：1.高等数学A/2023-2024-2  2.高等数学A/2024-2025-1  3.高等数学A/2025-2026-1
2

限定「2024」，候选：1.高等数学A/期末试卷  2.高等数学A/练习册
1

限定「2024」，候选：1.高等数学A/1.期中真题  2.高等数学A/4.期末真题
0`;
function stripThinkTags(rawContent) {
  if (typeof rawContent !== 'string') return '';
  let text = rawContent;
  const open = '<' + 'think>';
  const close = '<' + '/think>';
  while (text.includes(open) && text.includes(close)) {
    const start = text.indexOf(open);
    const end = text.indexOf(close, start);
    if (end < 0) break;
    text = text.slice(0, start) + text.slice(end + close.length);
  }
  return text.trim();
}
function collectAnchorDirs(baseResults) {
  const anchors = new Map();
  for (const row of baseResults || []) {
    if (!row.is_directory || !row.key) continue;
    if (anchors.size >= 5) break;
    anchors.set(row.key, {
      id: row.id,
      key: row.key,
      name: row.name,
      parent_path: row.parent_path || ''
    });
  }
  if (anchors.size === 0) {
    for (const row of baseResults || []) {
      if (!row || !row.parent_path) continue;
      const key = normalizeDirKey(row.parent_path);
      if (!key || anchors.has(key)) continue;
      const segments = key.split('/').filter(Boolean);
      anchors.set(key, {
        id: null,
        key,
        name: segments[segments.length - 1] || key,
        parent_path: segments.slice(0, -1).join('/')
      });
      if (anchors.size >= 5) break;
    }
  }
  return [...anchors.values()];
}
function normalizeDirKey(key) {
  return (key || '').replace(/\/+$/, '');
}
// DB 里 parent_path 统一带尾斜杠，查询兄弟目录前必须补回来
export function toParentLookupKey(key) {
  const normalized = normalizeDirKey(key);
  return normalized ? `${normalized}/` : '';
}
function shortDirPath(key) {
  const parts = normalizeDirKey(key).split('/').filter(Boolean);
  return parts.slice(-3).join('/');
}
function buildPrefixUpperBound(prefix) {
  const chars = Array.from(prefix);
  for (let i = chars.length - 1; i >= 0; i--) {
    const code = chars[i].codePointAt(0);
    if (code < 0x10FFFF) {
      chars[i] = String.fromCodePoint(code + 1);
      return chars.slice(0, i + 1).join('');
    }
  }
  return prefix + '\uFFFF';
}
async function loadChildDirs(DB, dirKeys) {
  const normalized = dirKeys.map(normalizeDirKey).filter(Boolean);
  if (normalized.length === 0) return [];
  const anchorKeys = new Set(normalized);
  const lookups = normalized.map(k => `${k}/`);
  const seen = new Set();
  const collected = [];
  const rows = await DB.prepare(
    `SELECT id, key, name, parent_path FROM files
     WHERE is_directory = 1 AND parent_path IN (${lookups.map(() => '?').join(',')})
     LIMIT ?`
  ).bind(...lookups, SCOPE_PICK_MAX_CANDIDATES + 1).all();
  for (const row of rows.results || []) {
    if (!row.key || seen.has(row.key)) continue;
    if (anchorKeys.has(normalizeDirKey(row.key))) continue;
    seen.add(row.key);
    collected.push(row);
  }
  collected.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
  return collected;
}
async function loadComparableDirs(DB, anchorDirs) {
  const depthOf = key => normalizeDirKey(key).split('/').filter(Boolean).length;
  const shallowest = [...anchorDirs].sort((a, b) => depthOf(a.key) - depthOf(b.key))[0];
  const children = await loadChildDirs(DB, [shallowest.key]);
  if (children.length > 1) return children.slice(0, SCOPE_PICK_MAX_CANDIDATES);
  // DB 里 parent_path 统一带尾斜杠，normalizeDirKey 会去掉，查询前必须补回来，否则匹配不到兄弟目录
  const parentSet = [...new Set(
    anchorDirs.map(d => toParentLookupKey(d.parent_path)).filter(Boolean)
  )];
  if (parentSet.length > 0) {
    const siblingRows = await DB.prepare(
      `SELECT id, key, name, parent_path FROM files
       WHERE is_directory = 1 AND parent_path IN (${parentSet.map(() => '?').join(',')})
       LIMIT ?`
    ).bind(...parentSet, SCOPE_PICK_MAX_CANDIDATES + 1).all();
    const siblings = (siblingRows.results || []).filter(r => r.key && normalizeDirKey(r.key) !== normalizeDirKey(r.parent_path));
    siblings.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
    if (siblings.length > 1) return siblings.slice(0, SCOPE_PICK_MAX_CANDIDATES);
  }
  return children.slice(0, SCOPE_PICK_MAX_CANDIDATES);
}
function pickDirectoryByTime(candidates, parsed) {
  if (!parsed) return null;
  const exact = filterByTime(candidates, parsed);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 && parsed.years.length === 1) {
    const year = parsed.years[0];
    const sameStartYear = exact.filter(dir => {
      const tag = collectTermTags(dir.key)[0];
      return tag && tag.start === year;
    });
    if (sameStartYear.length === 1) return sameStartYear[0];
  }
  return null;
}
async function pickDirectoryScope(env, DB, query, constraint, baseResults, now) {
  const anchorDirs = collectAnchorDirs(baseResults);
  if (anchorDirs.length === 0) return null;
  const candidates = await loadComparableDirs(DB, anchorDirs);
  if (candidates.length === 0) {
    console.log('[目录选择]', JSON.stringify({
      candidates: [],
      reason: 'no-comparable-dirs',
      anchors: anchorDirs.map(dir => dir.key)
    }));
    return null;
  }
  const parsed = parseTimeConstraint(constraint, query, now);
  let chosen = pickDirectoryByTime(candidates, parsed);
  const autoPicked = chosen ? normalizeDirKey(chosen.key) : null;
  if (!chosen) {
    const numbered = candidates.map((d, i) => `${i + 1}. ${d.key}`).join('\n');
    const pickResponse = await fetchSiliconFlowChat(env, {
      messages: [
        { role: 'system', content: SCOPE_PICK_PROMPT + `\n当前时间：${now}` },
        { role: 'user', content: `用户需求：${query}\n限定条件：${constraint}\n候选目录：\n${numbered}\n请返回最符合限定条件的目录编号：` }
      ],
      maxTokens: 32
    });
    const pickText = stripThinkTags(pickResponse.choices?.[0]?.message?.content);
    const picked = parseInt((pickText.match(/\d+/) || [])[0] || '0', 10);
    console.log('[目录选择]', JSON.stringify({
      candidates: candidates.map(d => normalizeDirKey(d.key)),
      parsed,
      autoPicked,
      llmRaw: (pickText || '').slice(0, 40),
      picked
    }));
    if (!(picked > 0 && picked <= candidates.length)) return null;
    chosen = candidates[picked - 1];
  } else {
    console.log('[目录选择]', JSON.stringify({
      candidates: candidates.map(d => normalizeDirKey(d.key)),
      parsed,
      autoPicked,
      llmRaw: null,
      picked: 0
    }));
  }
  const scopeKey = normalizeDirKey(chosen.key);
  const scopeUpper = buildPrefixUpperBound(`${scopeKey}/`);
  const fullRows = await DB.prepare(
    `SELECT id, name, key, parent_path, is_directory, is_link, link_url, description, contentType, size, downloads, likes, uploaded
     FROM files
     WHERE key >= ? AND key < ?
     LIMIT ?`
  ).bind(scopeKey, scopeUpper, SCOPE_CHILD_LIMIT + 1).all();
  const rows = fullRows.results || [];
  const directory = rows.find(r => normalizeDirKey(r.key) === scopeKey);
  if (!directory) return null;
  const children = rows.filter(r => normalizeDirKey(r.key) !== scopeKey);
  if (!parsed || matchesTimeConstraint(directory, parsed, true)) {
    return { path: scopeKey, directory, children };
  }
  // 目录名本身不带时间（如"期末试卷"），时间限定落在具体试卷上，按子项再筛一遍
  const timedChildren = filterByTime(children, parsed);
  if (timedChildren.length === 0) return null;
  return { path: scopeKey, directory: null, children: timedChildren };
}
function interleaveByDir(groups, limit) {
  const out = [];
  let round = 0;
  while (out.length < limit) {
    let added = false;
    for (const group of groups) {
      if (round < group.length) {
        out.push(group[round]);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
    round += 1;
  }
  return out;
}
async function loadAnchorFiles(DB, anchorDirs) {
  const depthOf = key => key.split('/').filter(Boolean).length;
  const unique = [...new Set(
    (anchorDirs || []).map(d => normalizeDirKey(d.key)).filter(Boolean)
  )].filter(k => depthOf(k) >= 2);
  if (unique.length === 0) return [];
  const ancestors = unique.filter(k => !unique.some(other => other !== k && k.startsWith(`${other}/`)));
  const dirs = ancestors.slice(0, FILE_PICK_MAX_DIRS);
  if (dirs.length === 0) return [];
  const seenId = new Set();
  const groups = [];
  for (const dir of dirs) {
    const lower = `${dir}/`;
    const upper = buildPrefixUpperBound(lower);
    const rows = await DB.prepare(
      `SELECT id, name, key, parent_path, is_directory, is_link, link_url, description, contentType, size, downloads, likes, uploaded
       FROM files
       WHERE key >= ? AND key < ?
       LIMIT ?`
    ).bind(lower, upper, FILE_PICK_DIR_LIMIT).all();
    const group = [];
    for (const row of rows.results || []) {
      if (!row || row.id == null || seenId.has(row.id)) continue;
      if (row.is_directory) continue;
      seenId.add(row.id);
      group.push(row);
    }
    if (group.length > 0) groups.push(group);
  }
  return interleaveByDir(groups, FILE_PICK_MAX_CANDIDATES);
}
async function pickNameMatched(env, DB, query, constraint, baseResults, now) {
  const anchorDirs = collectAnchorDirs(baseResults);
  if (anchorDirs.length === 0) return null;
  let pool = [];
  try {
    pool = await loadAnchorFiles(DB, anchorDirs);
  } catch (e) {
    console.error('加载锚定目录文件失败:', e);
    pool = [];
  }
  if (pool.length === 0) return null;
  const scopedPool = pool.slice(0, FILE_PICK_MAX_CANDIDATES);
  const chunks = [];
  for (let offset = 0; offset < scopedPool.length; offset += FILE_PICK_BATCH_SIZE) {
    chunks.push(scopedPool.slice(offset, offset + FILE_PICK_BATCH_SIZE));
  }
  const pickTexts = [];
  for (const chunk of chunks) {
    const numbered = chunk.map((row, i) => {
      const parentPath = shortDirPath(row.parent_path);
      return `${i + 1}. ${row.name}${parentPath ? `（路径: ${parentPath}）` : ''}`;
    }).join('\n');
    try {
      const pickResponse = await fetchSiliconFlowChat(env, {
        messages: [
          { role: 'system', content: FILE_PICK_PROMPT + `\n当前时间：${now}` },
          { role: 'user', content: `用户需求：${query || constraint}\n限定条件：${constraint}\n候选资源：\n${numbered}\n请按格式返回：` }
        ],
        maxTokens: 768
      });
      pickTexts.push(stripThinkTags(pickResponse.choices?.[0]?.message?.content));
    } catch (e) {
      console.error('文件名级限定裁决失败:', e);
      pickTexts.push('');
    }
  }
  const hits = new Set();
  let usedTerms = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const trimmed = (pickTexts[chunkIndex] || '').trim();
    if (!trimmed) continue;
    const matchLine = (trimmed.match(/MATCH\s*[:：]\s*(.+)/i) || [])[1] || '';
    const termsLine = (trimmed.match(/TERMS\s*[:：]\s*(.+)/i) || [])[1] || '';
    const chunkTerms = termsLine
      .split(/[,，、\s]+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t && t !== '0');
    for (const t of chunkTerms) {
      if (!usedTerms.includes(t)) usedTerms.push(t);
    }
    if (chunkTerms.length === 0) continue;
    const numberPattern = /\d+/g;
    let matched;
    while ((matched = numberPattern.exec(matchLine)) !== null) {
      const index = parseInt(matched[0], 10);
      if (!(index > 0 && index <= chunk.length)) continue;
      const row = chunk[index - 1];
      const haystack = `${row.name || ''} ${row.key || ''}`.toLowerCase();
      if (!chunkTerms.some(t => haystack.includes(t))) continue;
      hits.add(row.id);
    }
  }
  if (hits.size === 0) return null;
  usedTerms = usedTerms.filter(t => /[\u4e00-\u9fa5a-z0-9]/.test(t));
  if (usedTerms.length === 0) return null;
  const timedFiles = applyTimeConstraint(scopedPool.filter(row => hits.has(row.id)), constraint, query, now);
  if (!timedFiles) return null;
  return {
    matchedIds: timedFiles.map(row => row.id),
    files: timedFiles
  };
}
export async function resolveConstraintScope(env, DB, query, constraint, baseResults, now) {
  const hasSemesterHint = /学年|学期|\d{4}\s*[-~至到]\s*\d{4}/.test(`${constraint || ''} ${query || ''}`);
  const parsed = parseTimeConstraint(constraint, query, now);
  const anchors = collectAnchorDirs(baseResults);
  console.log('[限定解析]', JSON.stringify({
    constraint,
    query: String(query || '').slice(0, 60),
    hasSemesterHint,
    parsed,
    baseCount: Array.isArray(baseResults) ? baseResults.length : -1,
    anchors: anchors.map(dir => dir.key)
  }));
  let directoryScope = null;
  if (hasSemesterHint) {
    try {
      directoryScope = await pickDirectoryScope(env, DB, query, constraint, baseResults, now);
    } catch (e) {
      console.error('目录级限定裁决失败:', e);
    }
    if (directoryScope) return { mode: 'directory', ...directoryScope };
  }
  const nameScope = await pickNameMatched(env, DB, query, constraint, baseResults, now);
  if (!nameScope) return null;
  return { mode: 'name', path: '', ...nameScope };
}
export function mergeScopeFirst(scope, baseResults) {
  const seen = new Set();
  const merged = [];
  if (scope.mode === 'name') {
    const matched = new Set(scope.matchedIds || []);
    const hits = [];
    for (const item of baseResults || []) {
      if (!item || !matched.has(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      hits.push(item);
    }
    for (const row of scope.files || []) {
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push(row);
    }
    hits.sort((a, b) => {
      const ra = Number(a.relevance ?? a.similarity_score) || 0;
      const rb = Number(b.relevance ?? b.similarity_score) || 0;
      return rb - ra;
    });
    hits.forEach(item => {
      merged.push({
        ...item,
        similarity_score: item.similarity_score ?? 1,
        relevance: item.relevance ?? 1,
        scoped: true
      });
    });
    return merged;
  }
  const scopePrefix = normalizeDirKey(scope.path);
  const inScope = item => {
    const key = normalizeDirKey(item && item.key);
    return Boolean(key) && (key === scopePrefix || key.startsWith(`${scopePrefix}/`));
  };
  const push = (item, score, scoped) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    merged.push({
      ...item,
      similarity_score: item.similarity_score ?? score,
      relevance: item.relevance ?? (scoped ? 1 : score),
      scoped
    });
  };
  push(scope.directory, 1, true);
  for (const child of scope.children) {
    push(child, 0.95, true);
  }
  // 目录名不带时间（directory 为 null）时只信任已按子项筛过的结果，不再回捞原始列表
  if (scope.directory) {
    for (const item of baseResults || []) {
      if (!inScope(item)) continue;
      push(item, item.similarity_score ?? 0, true);
    }
  }
  return merged;
}
const SILICONFLOW_CHAT_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_CHAT_MODEL = 'Qwen/Qwen3.5-4B';
export async function fetchSiliconFlowChat(env, { messages, tools = null, toolChoice = 'auto', temperature = 0.1, model = DEFAULT_CHAT_MODEL, maxTokens = null, enableThinking = false }) {
  if (!env.SILICONFLOW_API_KEY) {
    throw new Error('未配置 SILICONFLOW_API_KEY');
  }
  const body = {
    model: model,
    messages: messages,
    temperature: temperature,
    stream: false,
    enable_thinking: enableThinking
  };
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }
  if (tools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }
  return await retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(SILICONFLOW_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw buildSiliconFlowError(response, errorText, 'SiliconFlow');
      }
      const data = await response.json();
      return validateAIResponse(data, '[SiliconFlow] ');
    } finally {
      clearTimeout(timeoutId);
    }
  }, 1, 500);
}
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const retryAfterMs = Number(error && error.retryAfterMs);
      const delay = Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? Math.min(retryAfterMs, 10000)
        : baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`操作失败，${Math.round(delay)}ms 后重试 (${attempt + 1}/${maxRetries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
export function validateAIResponse(data, context = '') {
  if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error(`${context}AI 返回数据结构异常: ${JSON.stringify(data).substring(0, 200)}`);
  }
  const choice = data.choices[0];
  if (choice.finish_reason === 'length') {
    throw new Error(`${context}AI 输出被截断 (finish_reason=length)，可能内容不完整`);
  }
  const message = choice.message;
  if (!message) {
    throw new Error(`${context}AI 未返回有效消息`);
  }
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasContent = message.content && message.content.trim().length > 0;
  if (!hasToolCalls && !hasContent) {
    throw new Error(`${context}AI 返回内容为空`);
  }
  if (hasToolCalls) {
    for (let i = 0; i < message.tool_calls.length; i++) {
      const tc = message.tool_calls[i];
      if (!tc.function || !tc.function.name) {
        throw new Error(`${context}AI tool_call[${i}] 缺少函数名`);
      }
      if (tc.function.arguments) {
        try {
          JSON.parse(tc.function.arguments);
        } catch (e) {
          throw new Error(`${context}AI tool_call[${i}] arguments JSON 解析失败: ${tc.function.arguments.substring(0, 100)}`);
        }
      }
    }
  }
  return data;
}
export async function cleanupOrphanTodos(env, guestbookIds) {
  if (!guestbookIds || guestbookIds.length === 0) return;
  const ph = guestbookIds.map(() => '?').join(',');
  const affectedRows = await env.DB.prepare(
    `SELECT DISTINCT todo_id FROM todo_guestbook WHERE guestbook_id IN (${ph})`
  ).bind(...guestbookIds).all();
  await env.DB.prepare(
    `DELETE FROM todo_guestbook WHERE guestbook_id IN (${ph})`
  ).bind(...guestbookIds).run();
  const todoIds = (affectedRows.results || []).map(r => r.todo_id).filter(Boolean);
  if (todoIds.length > 0) {
    const tPh = todoIds.map(() => '?').join(',');
    const orphans = await env.DB.prepare(
      `SELECT t.id FROM todos t WHERE t.id IN (${tPh}) AND NOT EXISTS (SELECT 1 FROM todo_guestbook tg WHERE tg.todo_id = t.id)`
    ).bind(...todoIds).all();
    if (orphans.results && orphans.results.length > 0) {
      const orphanIds = orphans.results.map(r => r.id);
      const oPh = orphanIds.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM todos WHERE id IN (${oPh})`).bind(...orphanIds).run();
    }
  }
}
export async function deleteGuestbookWithChildren(env, guestbookId) {
  const childIds = await env.DB.prepare('SELECT id FROM guestbook WHERE parent_id = ?').bind(guestbookId).all();
  const allIds = [guestbookId, ...(childIds.results || []).map(r => r.id)];
  const ph = allIds.map(() => '?').join(',');
  const affectedTodos = await env.DB.prepare(
    `SELECT DISTINCT todo_id FROM todo_guestbook WHERE guestbook_id IN (${ph})`
  ).bind(...allIds).all();
  const affectedTodoIds = (affectedTodos.results || []).map(r => r.todo_id).filter(Boolean);
  await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(guestbookId).run();
  if (affectedTodoIds.length > 0) {
    const tPh = affectedTodoIds.map(() => '?').join(',');
    const orphans = await env.DB.prepare(
      `SELECT t.id FROM todos t WHERE t.id IN (${tPh}) AND NOT EXISTS (SELECT 1 FROM todo_guestbook tg WHERE tg.todo_id = t.id)`
    ).bind(...affectedTodoIds).all();
    if (orphans.results && orphans.results.length > 0) {
      const orphanIds = orphans.results.map(r => r.id);
      const oPh = orphanIds.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM todos WHERE id IN (${oPh})`).bind(...orphanIds).run();
    }
  }
}
export async function recordVectorSyncFailure(env, operation, fileId, fileData, errorMessage) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO vector_sync_failures (operation, file_id, file_data, error_message) VALUES (?, ?, ?, ?)'
    ).bind(
      operation,
      fileId || null,
      fileData ? JSON.stringify(fileData) : null,
      errorMessage || ''
    ).run();
    await env.DB.prepare(
      "DELETE FROM vector_sync_failures WHERE resolved = TRUE AND created_at < datetime('now', '-7 days')"
    ).run();
  } catch (dbError) {
    console.error('记录向量同步失败信息出错:', dbError);
  }
}
const VALID_NOTIFICATION_TYPES = new Set([
  'folder_update', 'guestbook_reply'
]);
export async function createNotification(env, { userId, type, title, body = null, link = null, icon = null, payload = null }) {
  if (!env || !env.DB || !userId || !type || !title) return null;
  if (!VALID_NOTIFICATION_TYPES.has(type)) return null;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO notifications (user_id, type, title, body, link, icon, payload) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      userId, type, String(title).slice(0, 200),
      body ? String(body).slice(0, 1000) : null,
      link ? String(link).slice(0, 500) : null,
      icon ? String(icon).slice(0, 100) : null,
      payload ? JSON.stringify(payload) : null
    ).run();
    const notifId = result.meta?.last_row_id || null;
    if (notifId) {
      try { await pushNotificationToUser(env, userId, notifId); }
      catch (e) { console.error('[notify] WS推送失败:', e?.message || e); }
    }
    return notifId;
  } catch (e) {
    console.error('创建通知失败:', e);
    return null;
  }
}
async function pushNotificationToUser(env, userId, notifId) {
  if (!env.DOWNLOAD_LOGGER || !notifId) return;
  try {
    const notif = await env.DB.prepare(
      'SELECT id, user_id, type, title, body, link, icon, payload, created_at FROM notifications WHERE id = ?'
    ).bind(notifId).first();
    if (!notif) return;
    if (notif.payload) {
      try { notif.payload = JSON.parse(notif.payload); } catch (e) { notif.payload = null; }
    }
    const id = env.DOWNLOAD_LOGGER.idFromName('global');
    const stub = env.DOWNLOAD_LOGGER.get(id);
    await stub.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'notification', target_user_id: userId, notification: notif })
    });
  } catch (e) {
    console.error('推送通知到 WebSocket 失败:', e?.message || e);
  }
}
export async function broadcastGuestbookUpdate(env, guestbookId, action, extra = {}) {
  if (!env || !env.DOWNLOAD_LOGGER || !guestbookId || !action) return;
  try {
    const id = env.DOWNLOAD_LOGGER.idFromName('global');
    const stub = env.DOWNLOAD_LOGGER.get(id);
    await stub.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'guestbook_update', guestbookId, action, ...extra })
    });
  } catch (e) {
    console.error('广播留言板更新失败:', e?.message || e);
  }
}
export const MIN_SUBSCRIPTION_DEPTH = 2;
export function getFolderDepth(folderKey) {
  if (!folderKey || typeof folderKey !== 'string') return 0;
  const key = folderKey.endsWith('/') ? folderKey.slice(0, -1) : folderKey;
  if (key.length === 0) return 0;
  return key.split('/').filter(Boolean).length;
}
export function isFolderSubscribable(folderKey) {
  return getFolderDepth(folderKey) >= MIN_SUBSCRIPTION_DEPTH;
}
export async function notifyFolderUpdates(env, newFiles) {
  if (!env?.DB || !Array.isArray(newFiles) || newFiles.length === 0) return;
  try {
    const folderAccum = new Map();
    for (const f of newFiles) {
      let path = f.parentPath || '';
      const seen = new Set();
      while (path) {
        if (seen.has(path)) break;
        seen.add(path);
        if (isFolderSubscribable(path)) {
          let acc = folderAccum.get(path);
          if (!acc) { acc = { count: 0, lastFileName: f.fileName }; folderAccum.set(path, acc); }
          acc.count++;
          acc.lastFileName = f.fileName;
        }
        const idx = path.lastIndexOf('/', path.length - 2);
        path = idx >= 0 ? path.slice(0, idx + 1) : '';
      }
    }
    await Promise.all(Array.from(folderAccum.entries()).map(async ([folderKey, acc]) => {
      const subs = await env.DB.prepare(
        'SELECT user_id, has_update FROM folder_subscriptions WHERE folder_key = ?'
      ).bind(folderKey).all();
      const rows = subs.results || [];
      if (rows.length === 0) return;
      const toMerge = rows.filter(r => r.has_update);
      const toNotify = rows.filter(r => !r.has_update);
      const tasks = [];
      if (toMerge.length > 0) {
        tasks.push(env.DB.prepare(
          'UPDATE folder_subscriptions SET has_update = TRUE, update_count = update_count + ?, last_file_name = ? WHERE folder_key = ? AND has_update = TRUE'
        ).bind(acc.count, acc.lastFileName, folderKey).run());
      }
      if (toNotify.length > 0) {
        tasks.push(env.DB.prepare(
          'UPDATE folder_subscriptions SET has_update = TRUE, update_count = ?, last_file_name = ? WHERE folder_key = ? AND has_update = FALSE'
        ).bind(acc.count, acc.lastFileName, folderKey).run());
      }
      const folderName = folderKey.replace(/\/$/, '').split('/').pop() || folderKey;
      const body = acc.count === 1 ? `新增文件：${acc.lastFileName}` : `新增了 ${acc.count} 个文件，最新：${acc.lastFileName}`;
      for (const row of toNotify) {
        tasks.push(createNotification(env, {
          userId: row.user_id,
          type: 'folder_update',
          title: `订阅文件夹「${folderName}」有更新`,
          body,
          link: `?path=${encodeURIComponent(folderKey)}`,
          payload: { folderKey, count: acc.count, lastFileName: acc.lastFileName }
        }));
      }
      await Promise.all(tasks);
    }));
  } catch (e) {
    console.error('文件夹订阅通知失败:', e?.message || e);
  }
}
