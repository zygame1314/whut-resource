import { onRequest as __api_download___path___js_onRequest } from "D:\\HTML\\whut-resource\\functions\\api\\download\\[[path]].js"
import { onRequestGet as __api_auth_js_onRequestGet } from "D:\\HTML\\whut-resource\\functions\\api\\auth.js"
import { onRequestOptions as __api_auth_js_onRequestOptions } from "D:\\HTML\\whut-resource\\functions\\api\\auth.js"
import { onRequestPost as __api_auth_js_onRequestPost } from "D:\\HTML\\whut-resource\\functions\\api\\auth.js"
import { onRequestPost as __api_batch_download_js_onRequestPost } from "D:\\HTML\\whut-resource\\functions\\api\\batch-download.js"
import { onRequestDelete as __api_files_js_onRequestDelete } from "D:\\HTML\\whut-resource\\functions\\api\\files.js"
import { onRequestGet as __api_files_js_onRequestGet } from "D:\\HTML\\whut-resource\\functions\\api\\files.js"
import { onRequestOptions as __api_files_js_onRequestOptions } from "D:\\HTML\\whut-resource\\functions\\api\\files.js"
import { onRequestPost as __api_files_js_onRequestPost } from "D:\\HTML\\whut-resource\\functions\\api\\files.js"
import { onRequestPut as __api_files_js_onRequestPut } from "D:\\HTML\\whut-resource\\functions\\api\\files.js"
import { onRequestOptions as __api_sync_js_onRequestOptions } from "D:\\HTML\\whut-resource\\functions\\api\\sync.js"
import { onRequestPost as __api_sync_js_onRequestPost } from "D:\\HTML\\whut-resource\\functions\\api\\sync.js"
import { onRequestOptions as __api_upload_js_onRequestOptions } from "D:\\HTML\\whut-resource\\functions\\api\\upload.js"
import { onRequestPost as __api_upload_js_onRequestPost } from "D:\\HTML\\whut-resource\\functions\\api\\upload.js"
import { onRequest as __api_batch_download_js_onRequest } from "D:\\HTML\\whut-resource\\functions\\api\\batch-download.js"
import { onRequest as __api_preview_js_onRequest } from "D:\\HTML\\whut-resource\\functions\\api\\preview.js"

export const routes = [
    {
      routePath: "/api/download/:path*",
      mountPath: "/api/download",
      method: "",
      middlewares: [],
      modules: [__api_download___path___js_onRequest],
    },
  {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_auth_js_onRequestGet],
    },
  {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_auth_js_onRequestOptions],
    },
  {
      routePath: "/api/auth",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_js_onRequestPost],
    },
  {
      routePath: "/api/batch-download",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_batch_download_js_onRequestPost],
    },
  {
      routePath: "/api/files",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_files_js_onRequestDelete],
    },
  {
      routePath: "/api/files",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_files_js_onRequestGet],
    },
  {
      routePath: "/api/files",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_files_js_onRequestOptions],
    },
  {
      routePath: "/api/files",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_files_js_onRequestPost],
    },
  {
      routePath: "/api/files",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_files_js_onRequestPut],
    },
  {
      routePath: "/api/sync",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_sync_js_onRequestOptions],
    },
  {
      routePath: "/api/sync",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_sync_js_onRequestPost],
    },
  {
      routePath: "/api/upload",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_upload_js_onRequestOptions],
    },
  {
      routePath: "/api/upload",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_upload_js_onRequestPost],
    },
  {
      routePath: "/api/batch-download",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_batch_download_js_onRequest],
    },
  {
      routePath: "/api/preview",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_preview_js_onRequest],
    },
  ]