import { addCorsHeaders, isAdmin, generateEmbeddings, retryWithBackoff, recordVectorSyncFailure, buildRichEmbeddingText, getUserFromRequest } from '../utils.js';
async function ensureDirectoryExists(db, fullPath, env) {
  const pathSegments = fullPath.split('/').filter(segment => segment.length > 0);
  let currentPath = '';
  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segment = pathSegments[i];
    const parentPathForCurrentDir = currentPath;
    currentPath += segment + '/';
    try {
      const checkStmt = db.prepare('SELECT key FROM files WHERE key = ? AND is_directory = TRUE');
      const existingDir = await checkStmt.bind(currentPath).first();
      if (!existingDir) {
        const insertDirStmt = db.prepare(
          'INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        const insertResult = await insertDirStmt.bind(
          currentPath,
          segment,
          0,
          new Date().toISOString(),
          'inode/directory',
          parentPathForCurrentDir,
          true,
          0
        ).run();
        console.log(`在D1中创建目录条目: ${currentPath}`);
        if (env.VECTORIZE && env.SILICONFLOW_API_KEY && insertResult.meta?.last_row_id) {
          try {
            const embeddings = await generateEmbeddings(env, [buildRichEmbeddingText({ name: segment, parent_path: parentPathForCurrentDir })]);
            if (embeddings?.[0]) {
              await retryWithBackoff(async () => {
                await env.VECTORIZE.upsert([{
                  id: insertResult.meta.last_row_id.toString(),
                  values: embeddings[0],
                  metadata: {
                    name: segment,
                    path: currentPath
                  }
                }]);
              }, 3, 500);
              console.log(`已为目录创建向量索引: ${currentPath}`);
            }
          } catch (indexError) {
            console.error('向量索引写入失败（目录，已重试3次）:', indexError);
            await recordVectorSyncFailure(env, 'create', insertResult.meta.last_row_id, { name: segment, key: currentPath }, indexError.message);
          }
        }
      }
    } catch (error) {
      console.error(`确保目录 ${currentPath} 在D1中存在时出错:`, error);
    }
  }
}
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}
function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return null;
  let sanitized = name
    .replace(/\.\./g, '')
    .replace(/^[\/]+/, '')
    .replace(/[<>:"|?*\x00-\x1f]/g, '')
    .trim();
  if (sanitized.length === 0 || sanitized.length > 255) return null;
  return sanitized;
}
export async function onRequestPost({ request, env, waitUntil }) {
  try {
    const R2_BUCKET = env.R2_bucket;
    const DB = env.DB;
    if (!R2_BUCKET || !DB) {
      return new Response(JSON.stringify({ success: false, error: '服务器配置错误（R2或D1绑定）。' }), {
        status: 500,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const user = await getUserFromRequest(request, env);
    if (!user || !isAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: '需要管理员权限。' }), { status: 403, headers: addCorsHeaders() });
    }
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      let jsonData;
      try {
        jsonData = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: '请求体无效。期望JSON格式。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const { linkName, linkUrl, uploadPath } = jsonData;
      if (!linkName || !linkUrl) {
        return new Response(JSON.stringify({ success: false, error: '链接名称和URL不能为空。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      if (!isValidUrl(linkUrl)) {
        return new Response(JSON.stringify({ success: false, error: '请输入有效的URL（以http://或https://开头）。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      if (linkUrl.length > 2000) {
        return new Response(JSON.stringify({ success: false, error: 'URL不能超过2000个字符。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      if (linkName.length > 200) {
        return new Response(JSON.stringify({ success: false, error: '链接名称不能超过200个字符。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const parentPath = uploadPath || '';
      const sanitizedLinkName = sanitizeFileName(linkName);
      if (!sanitizedLinkName) {
        return new Response(JSON.stringify({ success: false, error: '链接名称包含无效字符。' }), {
          status: 400,
          headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
        });
      }
      const key = parentPath ? `${parentPath}${sanitizedLinkName}` : sanitizedLinkName;
      const existingFile = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(key).first();
      if (existingFile) {
        return new Response(JSON.stringify({ success: false, error: '该名称的条目已存在。' }), { status: 409, headers: addCorsHeaders() });
      }
      if (parentPath) {
        await ensureDirectoryExists(DB, key, env);
      }
      const linkInsertResult = await DB.prepare(
        'INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        key,
        sanitizedLinkName,
        0,
        new Date().toISOString(),
        'application/x-link',
        parentPath,
        false,
        true,
        linkUrl,
        0,
        user.id
      ).run();
      if (env.VECTORIZE && env.SILICONFLOW_API_KEY && linkInsertResult.meta?.last_row_id) {
        try {
          const embeddings = await generateEmbeddings(env, [buildRichEmbeddingText({ name: sanitizedLinkName, parent_path: parentPath })]);
          if (embeddings?.[0]) {
            await retryWithBackoff(async () => {
              await env.VECTORIZE.upsert([{
                id: linkInsertResult.meta.last_row_id.toString(),
                values: embeddings[0],
                metadata: {
                  name: sanitizedLinkName,
                  path: key
                }
              }]);
            }, 3, 500);
          }
        } catch (indexError) {
          console.error('向量索引写入失败（链接，已重试3次）:', indexError);
          await recordVectorSyncFailure(env, 'create', linkInsertResult.meta.last_row_id, { name: sanitizedLinkName, key }, indexError.message);
        }
      }
      return new Response(JSON.stringify({ success: true, message: '链接创建成功。' }), {
        status: 200,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: '请求体无效。期望FormData。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const files = formData.getAll('file');
    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '文件数据缺失或无效。' }), {
        status: 400,
        headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
      });
    }
    const uploadResults = await Promise.all(files.map(async (file) => {
      try {
        if (!(file instanceof File)) {
          return { name: 'unknown', success: false, error: '无效的文件对象' };
        }
        const filename = file.name;
        const MAX_FILE_SIZE = 100 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
          return { name: filename, success: false, error: '文件大小超过100MB限制' };
        }
        const sanitizedFilename = sanitizeFileName(filename);
        if (!sanitizedFilename) {
          return { name: filename, success: false, error: '文件名包含无效字符或过长' };
        }
        let key = sanitizedFilename;
        const existingFile = await DB.prepare('SELECT key FROM files WHERE key = ?').bind(key).first();
        if (existingFile) {
          return { name: filename, success: false, error: '文件已存在' };
        }
        await R2_BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });
        const parentPath = key.includes('/') ? key.substring(0, key.lastIndexOf('/') + 1) : '';
        await ensureDirectoryExists(DB, key, env);
        const fileName = sanitizedFilename.split('/').pop();
        const fileInsertResult = await DB.prepare(
          'INSERT INTO files (key, name, size, uploaded, contentType, parent_path, is_directory, is_link, link_url, downloads, uploader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          key,
          fileName,
          file.size,
          new Date().toISOString(),
          file.type,
          parentPath,
          false,
          false,
          null,
          0,
          user.id
        ).run();
        if (env.VECTORIZE && env.SILICONFLOW_API_KEY && fileInsertResult.meta?.last_row_id) {
          const fileId = fileInsertResult.meta.last_row_id;
          const fileNameCopy = fileName;
          const keyCopy = key;
          waitUntil((async () => {
            try {
              const embeddings = await generateEmbeddings(env, [buildRichEmbeddingText({ name: fileNameCopy, parent_path: parentPath })]);
              if (embeddings?.[0]) {
                await retryWithBackoff(async () => {
                  await env.VECTORIZE.upsert([{
                    id: fileId.toString(),
                    values: embeddings[0],
                    metadata: {
                      name: fileNameCopy,
                      path: keyCopy
                    }
                  }]);
                }, 3, 500);
              }
            } catch (indexError) {
              console.error('向量索引写入失败（文件，已重试3次）:', indexError);
              await recordVectorSyncFailure(env, 'create', fileId, { name: fileNameCopy, key: keyCopy }, indexError.message);
            }
          })());
        }
        return { name: filename, success: true };
      } catch (err) {
        console.error(`处理文件 ${file?.name} 时出错:`, err);
        return { name: file?.name, success: false, error: err.message };
      }
    }));
    const successCount = uploadResults.filter(r => r.success).length;
    const failCount = uploadResults.length - successCount;
    return new Response(JSON.stringify({
      success: successCount > 0,
      message: `上传完成: 成功 ${successCount} 个, 失败 ${failCount} 个`,
      results: uploadResults
    }), {
      status: 200,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error("上传错误:", error);
    return new Response(JSON.stringify({ success: false, error: '发生意外错误。' }), {
      status: 500,
      headers: addCorsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: addCorsHeaders() });
}
