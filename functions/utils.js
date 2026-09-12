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
export async function dispatchR2MoveTasks(env, waitUntil, moves) {
  const list = Array.isArray(moves) ? moves.filter(m => m && m.from && m.to) : [];
  if (list.length === 0) return;
  const tasks = buildMoveTasks(list);
  const dispatched = await sendFileTasksBatched(env, tasks);
  if (dispatched) return;
  const run = async () => {
    try {
      await runR2Move(env, list);
    } catch (e) {
      console.error('R2移动执行失败:', e);
      await recordFileTaskFailure(env, { op: 'r2_move' }, e?.message || e);
    }
  };
  if (typeof waitUntil === 'function') waitUntil(run());
  else await run();
}
export async function dispatchR2DeleteTasks(env, waitUntil, keys) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (list.length === 0) return;
  const tasks = buildDeleteTasks(list);
  const dispatched = await sendFileTasksBatched(env, tasks);
  if (dispatched) return;
  const run = async () => {
    try {
      await runR2Delete(env, list);
    } catch (e) {
      console.error('R2删除执行失败:', e);
      await recordFileTaskFailure(env, { op: 'r2_delete' }, e?.message || e);
    }
  };
  if (typeof waitUntil === 'function') waitUntil(run());
  else await run();
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
export function fromBase64UrlBytes(str) {
  const binary = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
export function getJwtKeyId() {
  return JWT_KEY_ID;
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
  try {
    const cleanQuery = query.replace(/"/g, '');
    const terms = cleanQuery.split(/\s+/).filter(t => t.length > 0);
    const processedTerms = terms.map(term => {
      const upperTerm = term.toUpperCase();
      if (['AND', 'OR', 'NOT'].includes(upperTerm)) return upperTerm;
      const stripped = term.replace(/[-*():^"']/g, '');
      const chars = Array.from(stripped).filter(c => /\S/.test(c));
      if (chars.length === 0) return null;
      if (/[^\x00-\x7F]/.test(stripped)) {
        return chars.join(' ');
      }
      return `"${chars.join(' ')}"`;
    }).filter(Boolean);
    const ftsTokenizedQuery = processedTerms.join(' ');
    const ftsResult = await DB.prepare(
      `SELECT f.id, f.name, f.key, f.parent_path, f.is_directory, f.description, f.contentType, f.size, f.downloads, f.likes
       FROM files f
       JOIN files_fts ON f.id = files_fts.rowid
       WHERE files_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    ).bind(ftsTokenizedQuery, ftsLimit).all();
    ftsResults = ftsResult.results || [];
  } catch (e) {
    console.error('FTS搜索失败:', e);
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
  const RERANK_MAX_DOCS = 20;
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
      combined = 0.60 * rn + 0.20 * vs + 0.20 * nm;
    } else {
      combined = 0.35 * vs + 0.35 * ft + 0.30 * nm;
    }
    return {
      ...f,
      similarity_score: combined
    };
  });
  results.sort((a, b) => b.similarity_score - a.similarity_score);
  return { results: results.slice(0, topK), keywords: query };
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
        throw new Error(`SiliconFlow Embedding API Error: ${response.status} - ${errorText}`);
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
          throw new Error(`Reranker API Error: ${response.status} - ${errorText}`);
        }
        const result = await response.json();
        return result.results || null;
      } finally {
        clearTimeout(timeoutId);
      }
    }, 1, 500);
  } catch (error) {
    console.error('重排请求失败（已重试）:', error);
    return null;
  }
}
const SILICONFLOW_CHAT_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_CHAT_MODEL = 'Qwen/Qwen3-8B';
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
        throw new Error(`SiliconFlow API Error: ${response.status} - ${errorText}`);
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
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
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
export async function broadcastNotification(env, { type, title, body = null, link = null, icon = null, payload = null }) {
  if (!env || !env.DB || !type || !title) return 0;
  if (!VALID_NOTIFICATION_TYPES.has(type)) return 0;
  let inserted = 0;
  try {
    const { results } = await env.DB.prepare('SELECT id FROM users WHERE is_banned = FALSE OR is_banned = 0').all();
    const userIds = (results || []).map(r => r.id);
    for (const uid of userIds) {
      const id = await createNotification(env, { userId: uid, type, title, body, link, icon, payload });
      if (id) inserted++;
    }
  } catch (e) {
    console.error('广播通知失败:', e);
  }
  return inserted;
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
