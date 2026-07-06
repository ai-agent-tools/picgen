import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, resolve } from "node:path";
import { cwd } from "node:process";
import { addProviderToConfig, defaultCapabilitiesForProtocol, nextAvailableProviderName } from "./provider.js";
import { toPlanOutput } from "./create.js";
import { createGenerationRun, writeGenerationMetadata } from "../assets/output.js";
import { resolveReferenceImages } from "../assets/reference.js";
import { getManagedEnvPath, inspectEnvVars, readEnvVarValue, saveManagedEnvVar } from "../config/env.js";
import { nextAvailableProviderApiKeyEnv } from "../config/providerKeys.js";
import { setPreferredProvider } from "../config/preferences.js";
import { getConfigPath, loadConfig, saveConfig } from "../config/store.js";
import { getAdapter } from "../providers/adapters.js";
import { testProvider } from "../providers/health.js";
import { normalizeProviderBaseUrl } from "../providers/urls.js";
import { resolveGenerationPlan } from "../routing/resolve.js";
import type { Channel, GeneratedImage, Protocol, ProviderConfig } from "../types.js";

const DEFAULT_PORT = 8188;
const MAX_PORT_ATTEMPTS = 30;

interface OpenOptions {
  port?: string;
  open?: boolean;
}

export async function runOpen(options: OpenOptions): Promise<void> {
  const token = randomBytes(24).toString("hex");
  const port = await listenOnAvailablePort(Number(options.port ?? DEFAULT_PORT), token);
  const url = `http://127.0.0.1:${port}/?token=${token}`;

  console.log(`PicGen is open: ${url}`);
  console.log("Keep this terminal running while using PicGen. Press Ctrl+C to close.");

  if (options.open !== false) {
    await openBrowser(url);
  }
}

async function listenOnAvailablePort(startPort: number, token: string): Promise<number> {
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset += 1) {
    const port = startPort + offset;
    const server = createServer((request, response) => {
      handleRequest(request, response, token).catch((error) => {
        sendJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    });

    const result = await tryListen(server, port);
    if (result) return port;
  }

  throw new Error(`Could not find an available port starting at ${startPort}.`);
}

function tryListen(server: ReturnType<typeof createServer>, port: number): Promise<boolean> {
  return new Promise((resolveListen, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolveListen(false);
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => resolveListen(true));
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname === "/" || url.pathname === "/index.html") {
    if (url.searchParams.get("token") !== token) {
      sendText(response, 403, "Invalid PicGen session token.");
      return;
    }
    sendHtml(response, appHtml);
    return;
  }

  if (!isAuthorized(request, url, token)) {
    sendJson(response, 403, { ok: false, error: "Invalid PicGen session token." });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, await buildState());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/providers") {
    sendJson(response, 200, await addProviderFromBody(await readJson(request)));
    return;
  }

  const providerTestMatch = /^\/api\/providers\/([^/]+)\/test$/.exec(url.pathname);
  if (request.method === "POST" && providerTestMatch) {
    const config = await loadConfig();
    const name = decodeURIComponent(providerTestMatch[1]);
    const provider = config.providers[name];
    if (!provider) throw new Error(`Unknown provider: ${name}`);
    sendJson(response, 200, await testProvider(name, provider));
    return;
  }

  const providerDefaultMatch = /^\/api\/providers\/([^/]+)\/default$/.exec(url.pathname);
  if (request.method === "POST" && providerDefaultMatch) {
    const config = await loadConfig();
    const name = decodeURIComponent(providerDefaultMatch[1]);
    setPreferredProvider(config, name);
    await saveConfig(config);
    sendJson(response, 200, await buildState());
    return;
  }

  const providerMatch = /^\/api\/providers\/([^/]+)$/.exec(url.pathname);
  if (providerMatch) {
    const name = decodeURIComponent(providerMatch[1]);
    if (request.method === "PATCH") {
      sendJson(response, 200, await patchProvider(name, await readJson(request)));
      return;
    }
    if (request.method === "DELETE") {
      sendJson(response, 200, await deleteProvider(name));
      return;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/key") {
    const body = await readJson(request);
    if (typeof body.name !== "string" || typeof body.value !== "string") {
      throw new Error("Key name and value are required.");
    }
    await saveManagedEnvVar(body.name, body.value);
    sendJson(response, 200, { ok: true, state: await buildState() });
    return;
  }

  const keyMatch = /^\/api\/key\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && keyMatch) {
    const name = decodeURIComponent(keyMatch[1]);
    sendJson(response, 200, { ok: true, value: await readEnvVarValue(name) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/plan") {
    sendJson(response, 200, await planGeneration(await readJson(request)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate") {
    sendJson(response, 200, await generate(await readJson(request)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/history") {
    sendJson(response, 200, { ok: true, runs: await listHistory() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/file") {
    await sendOutputFile(response, url.searchParams.get("path"));
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found." });
}

function isAuthorized(request: IncomingMessage, url: URL, token: string): boolean {
  return request.headers["x-picgen-token"] === token || url.searchParams.get("token") === token;
}

async function buildState(): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const keyInspections = await inspectEnvVars(
    Object.values(config.providers).map((provider) => provider.api_key_env)
  );
  const keys = Object.fromEntries(keyInspections.map((key) => [key.name, key]));

  return {
    ok: true,
    config_path: getConfigPath(),
    key_file_path: getManagedEnvPath(),
    default_provider: config.routing.default_provider,
    fallback_providers: config.routing.fallback_providers,
    default_preset: config.default_preset,
    default_mode: config.routing.default_mode,
    providers: Object.entries(config.providers).map(([name, provider]) => ({
      name,
      ...provider,
      key: keys[provider.api_key_env],
      preference:
        name === config.routing.default_provider
          ? "default"
          : config.routing.fallback_providers.includes(name)
            ? "fallback"
            : "manual"
    })),
    presets: config.presets,
    modes: config.modes
  };
}

async function addProviderFromBody(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const protocol = body.protocol === "gemini" ? "gemini" : "openai-images";
  const channel = body.channel === "official" ? "official" : "third_party";
  const template = defaultProviderTemplate(protocol, channel);
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : nextAvailableProviderName(config, template.name);
  const apiKeyEnv =
    typeof body.api_key_env === "string" && body.api_key_env.trim()
      ? body.api_key_env.trim()
      : nextAvailableProviderApiKeyEnv(config, template.api_key_env, name);
  const models =
    typeof body.models === "string" && body.models.trim()
      ? parseModels(body.models)
      : template.models;

  const provider: ProviderConfig = {
    enabled: true,
    protocol,
    channel,
    base_url: normalizeProviderBaseUrl(String(body.base_url ?? template.base_url)),
    api_key_env: apiKeyEnv,
    models,
    capabilities: defaultCapabilitiesForProtocol(protocol)
  };

  addProviderToConfig(config, name, provider);
  if (body.prefer === true || !config.providers[config.routing.default_provider]) {
    setPreferredProvider(config, name);
  }
  await saveConfig(config);

  if (typeof body.api_key === "string" && body.api_key.trim()) {
    await saveManagedEnvVar(apiKeyEnv, body.api_key.trim());
  }

  return { ok: true, state: await buildState() };
}

async function patchProvider(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const provider = config.providers[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);

  if (typeof body.enabled === "boolean") provider.enabled = body.enabled;
  if (typeof body.base_url === "string") provider.base_url = normalizeProviderBaseUrl(body.base_url);
  if (typeof body.models === "string") provider.models = parseModels(body.models);
  if (typeof body.api_key === "string" && body.api_key.trim()) {
    await saveManagedEnvVar(provider.api_key_env, body.api_key.trim());
  }

  await saveConfig(config);
  return { ok: true, state: await buildState() };
}

async function deleteProvider(name: string): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  if (!config.providers[name]) throw new Error(`Unknown provider: ${name}`);
  delete config.providers[name];
  config.routing.fallback_providers = config.routing.fallback_providers.filter((item) => item !== name);
  if (config.routing.default_provider === name) {
    const nextDefault = config.routing.fallback_providers[0] ?? Object.keys(config.providers)[0];
    if (nextDefault) {
      config.routing.default_provider = nextDefault;
      config.routing.fallback_providers = config.routing.fallback_providers.filter(
        (item) => item !== nextDefault
      );
    }
  }
  await saveConfig(config);
  return { ok: true, state: await buildState() };
}

async function planGeneration(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const referenceImages = await resolveReferenceImages(parsePathList(body.references));
  const [maskImage] = await resolveReferenceImages(asOptionalString(body.mask) ? [String(body.mask)] : []);
  if (maskImage && referenceImages.length === 0) {
    throw new Error("遮罩图需要至少一张参考图。");
  }
  const plan = resolveGenerationPlan(config, {
    prompt: String(body.prompt ?? "").trim(),
    presetName: asOptionalString(body.preset),
    providerName: asOptionalString(body.provider),
    modeName: asOptionalString(body.mode),
    model: asOptionalString(body.model),
    outputDirectory: asOptionalString(body.output_directory),
    referenceImages,
    maskImage
  });
  return {
    ok: true,
    dry_run: true,
    provider_called: false,
    plan: toPlanOutput(plan)
  };
}

async function generate(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const config = await loadConfig();
  const referenceImages = await resolveReferenceImages(parsePathList(body.references));
  const [maskImage] = await resolveReferenceImages(asOptionalString(body.mask) ? [String(body.mask)] : []);
  if (maskImage && referenceImages.length === 0) {
    throw new Error("遮罩图需要至少一张参考图。");
  }
  const plan = resolveGenerationPlan(config, {
    prompt: String(body.prompt ?? "").trim(),
    presetName: asOptionalString(body.preset),
    providerName: asOptionalString(body.provider),
    modeName: asOptionalString(body.mode),
    model: asOptionalString(body.model),
    outputDirectory: asOptionalString(body.output_directory),
    referenceImages,
    maskImage
  });
  const run = await createGenerationRun(plan);
  const runtimePlan = { ...plan, outputDirectory: run.outputDirectory };
  const runtimePlanOutput = toPlanOutput(runtimePlan);
  await writeGenerationMetadata(run, {
    plan: runtimePlanOutput,
    run: {
      id: run.id,
      output_directory: run.outputDirectory,
      metadata_path: run.metadataPath,
      prompt_path: run.promptPath
    }
  });

  const adapter = getAdapter(plan.provider.protocol);
  try {
    const result = await adapter.generate(runtimePlan, run);
    await writeGenerationMetadata(run, {
      plan: runtimePlanOutput,
      run: {
        id: run.id,
        output_directory: run.outputDirectory,
        metadata_path: run.metadataPath,
        prompt_path: run.promptPath
      },
      provider_response: result.provider_response,
      images: result.images
    });
    return {
      ok: true,
      output_dir: run.outputDirectory,
      metadata_path: run.metadataPath,
      images: result.images
    };
  } catch (error) {
    await writeGenerationMetadata(run, {
      plan: runtimePlanOutput,
      run: {
        id: run.id,
        output_directory: run.outputDirectory,
        metadata_path: run.metadataPath,
        prompt_path: run.promptPath
      },
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined
      }
    });
    throw error;
  }
}

async function listHistory(): Promise<Array<Record<string, unknown>>> {
  const baseDir = resolve(cwd(), "outputs", "picgen");
  const dates = await safeReaddir(baseDir);
  const runs: Array<Record<string, unknown>> = [];

  for (const date of dates) {
    const datePath = join(baseDir, date);
    if (!(await isDirectory(datePath))) continue;
    for (const runName of await safeReaddir(datePath)) {
      const runPath = join(datePath, runName);
      if (!(await isDirectory(runPath))) continue;
      const metadataPath = join(runPath, "metadata.json");
      const promptPath = join(runPath, "prompt.txt");
      const metadata = await readJsonFile(metadataPath);
      const prompt = await readTextFile(promptPath);
      const images = ((metadata?.images as GeneratedImage[] | undefined) ?? [])
        .filter((image) => image.path)
        .map((image) => ({
          ...image,
          url: `/api/file?path=${encodeURIComponent(image.path)}`
        }));
      const info = await stat(runPath);
      runs.push({
        id: runName,
        date,
        created_at: info.mtime.toISOString(),
        output_dir: runPath,
        metadata_path: metadataPath,
        prompt,
        plan: metadata?.plan,
        images
      });
    }
  }

  return runs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 60);
}

async function sendOutputFile(response: ServerResponse, path: string | null): Promise<void> {
  if (!path) {
    sendJson(response, 400, { ok: false, error: "Missing file path." });
    return;
  }
  const resolved = resolve(path);
  const allowedRoot = resolve(cwd(), "outputs", "picgen");
  if (!resolved.startsWith(`${allowedRoot}/`)) {
    sendJson(response, 403, { ok: false, error: "File is outside PicGen outputs." });
    return;
  }
  const extension = extname(resolved).toLowerCase();
  const mimeType =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : extension === ".png"
          ? "image/png"
          : "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": mimeType,
    "Cache-Control": "no-store"
  });
  createReadStream(resolved).pipe(response);
}

function defaultProviderTemplate(protocol: Protocol, channel: Channel): {
  name: string;
  base_url: string;
  api_key_env: string;
  models: string[];
} {
  if (protocol === "gemini") {
    return {
      name: channel === "official" ? "gemini_official" : "gemini_proxy",
      base_url: channel === "official" ? "https://generativelanguage.googleapis.com" : "https://www.pandai.vip",
      api_key_env: channel === "official" ? "GEMINI_API_KEY" : "PICGEN_GEMINI_PROXY_KEY",
      models: ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"]
    };
  }
  return {
    name: channel === "official" ? "openai_official" : "openai_proxy",
    base_url: channel === "official" ? "https://api.openai.com" : "https://www.pandai.vip",
    api_key_env: channel === "official" ? "OPENAI_API_KEY" : "PICGEN_OPENAI_PROXY_KEY",
    models: ["gpt-image-2"]
  };
}

function parseModels(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePathList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value, null, 2));
}

function sendHtml(response: ServerResponse, value: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(value);
}

function sendText(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(value);
}

async function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  await new Promise<void>((resolveOpen) => {
    execFile(command, args, () => resolveOpen());
  });
}

const appHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PicGen</title>
  <style>
    :root{--bg:#f6f7f9;--panel:#fff;--text:#17202a;--muted:#667085;--border:#d9dee7;--soft:#eef2f6;--accent:#2563eb;--accent2:#0f766e;--danger:#b42318;--ok:#087443;--warn:#b54708;--radius:8px}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select,textarea{font:inherit}button{border:1px solid var(--border);background:#fff;color:var(--text);border-radius:7px;padding:7px 10px;cursor:pointer}button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button.ghost{background:transparent}button.danger{color:var(--danger)}button:disabled{opacity:.55;cursor:not-allowed}input,select,textarea{width:100%;border:1px solid var(--border);border-radius:7px;padding:8px 9px;background:#fff;color:var(--text)}textarea{min-height:120px;resize:vertical}.wrap{max-width:1120px;margin:0 auto;padding:22px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.brand h1{font-size:22px;margin:0 0 3px}.brand p,.muted{color:var(--muted);margin:0}.notice{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:var(--radius);padding:10px 12px;margin-bottom:16px}.tabs{display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid var(--border)}.tab{border:0;border-radius:7px 7px 0 0;background:transparent;padding:9px 12px}.tab.active{background:#fff;border:1px solid var(--border);border-bottom-color:#fff;margin-bottom:-1px}.grid{display:grid;gap:14px}.cols{display:grid;grid-template-columns:1fr 360px;gap:14px}.panel{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px}.panel h2{font-size:15px;margin:0 0 12px}.row{display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:center;margin:9px 0}.actions{display:flex;gap:8px;flex-wrap:wrap}.provider{display:grid;grid-template-columns:1fr auto;gap:12px;border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:#fff}.provider+.provider{margin-top:10px}.title{font-weight:650}.badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.badge{display:inline-flex;align-items:center;border-radius:999px;background:var(--soft);color:#344054;font-size:12px;padding:2px 8px}.badge.ok{background:#dcfae6;color:var(--ok)}.badge.warn{background:#fef0c7;color:var(--warn)}.badge.default{background:#dbeafe;color:#1d4ed8}.keyline{margin-top:8px;color:var(--muted)}.keyline code,.path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f4f7;border-radius:5px;padding:2px 5px}.source{display:inline-flex;align-items:center;border-radius:5px;padding:2px 6px;background:#ecfdf3;color:#067647;font-size:12px;margin-left:4px}.source.project{background:#fff7ed;color:#9a3412}.source.shell{background:#eef4ff;color:#3538cd}.source.missing{background:#fef3f2;color:#b42318}.hint{margin-top:8px;color:var(--muted);font-size:12px}.warning{margin-top:8px;color:var(--warn);font-size:12px}.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:31px;height:31px;padding:0;vertical-align:middle}.icon-btn svg{width:16px;height:16px;stroke:currentColor}.formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.full{grid-column:1/-1}.plan{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius);padding:10px}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.run img,.result img{width:100%;height:150px;object-fit:contain;background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius)}.run{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:10px}.hidden{display:none}.toast{position:fixed;right:18px;bottom:18px;background:#111827;color:#fff;border-radius:8px;padding:10px 12px;max-width:360px}.small{font-size:12px}.split{display:flex;justify-content:space-between;gap:8px;align-items:center}@media(max-width:860px){.cols{grid-template-columns:1fr}.row{grid-template-columns:1fr}.formgrid{grid-template-columns:1fr}.provider{grid-template-columns:1fr}.top{display:block}.wrap{padding:14px}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <div class="brand"><h1>PicGen</h1><p>本地生图工作台</p></div>
      <div class="actions"><button id="refresh">刷新</button></div>
    </div>
    <div class="notice">这是本机临时页面，只绑定 127.0.0.1。使用完可以关闭页面，并在启动 PicGen 的终端按 Ctrl+C 退出服务。</div>
    <nav class="tabs">
      <button class="tab active" data-tab="settings">配置</button>
      <button class="tab" data-tab="generate">生成</button>
      <button class="tab" data-tab="history">历史</button>
    </nav>
    <section id="settings" class="grid"></section>
    <section id="generate" class="hidden"></section>
    <section id="history" class="hidden grid"></section>
  </main>
  <div id="toast" class="toast hidden"></div>
  <script>
    const token = new URLSearchParams(location.search).get('token');
    const headers = {'Content-Type':'application/json','x-picgen-token':token};
    const state = {data:null,plan:null};
    const $ = (s,p=document)=>p.querySelector(s);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3500)}
    async function api(path, opts={}){const res=await fetch(path,{...opts,headers:{...headers,...opts.headers}});const data=await res.json().catch(()=>({ok:false,error:'Invalid JSON'}));if(!res.ok||data.ok===false)throw new Error(data.error||data.message||res.statusText);return data}
    async function load(){state.data=await api('/api/state');renderSettings();renderGenerate();await renderHistory()}
    function tab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));['settings','generate','history'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==name))}
    document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));$('#refresh').onclick=()=>load().then(()=>toast('已刷新')).catch(e=>toast(e.message));
    const labels={default:'默认',fallback:'备用',manual:'手动',official:'官方',third_party:'第三方','openai-images':'OpenAI 兼容',gemini:'Gemini',enabled:'已启用',disabled:'已停用',shell:'终端环境变量',project:'当前项目 .env',managed:'PicGen 管理文件',missing:'未配置'};
    const eyeIcon='<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOffIcon='<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m2 2 20 20"/><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"/><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4.0c6.5 0 10 8 10 8a17.8 17.8 0 0 1-2.3 3.5"/><path d="M6.6 6.6C3.6 8.7 2 12 2 12s3.5 8 10 8c1.6 0 3-.3 4.2-.9"/></svg>';
    function label(v){return labels[v]||v}
    function keySource(key){return key?.set?label(key.source):'未配置'}
    function templateDefaults(template){return {gemini_proxy:{protocol:'gemini',channel:'third_party',name:'gemini_proxy',host:'https://www.pandai.vip',models:'gemini-3.1-flash-image-preview, gemini-3-pro-image-preview'},openai_proxy:{protocol:'openai-images',channel:'third_party',name:'openai_proxy',host:'https://www.pandai.vip',models:'gpt-image-2'},gemini_official:{protocol:'gemini',channel:'official',name:'gemini_official',host:'https://generativelanguage.googleapis.com',models:'gemini-3.1-flash-image-preview, gemini-3-pro-image-preview'},openai_official:{protocol:'openai-images',channel:'official',name:'openai_official',host:'https://api.openai.com',models:'gpt-image-2'}}[template]}
    function renderSettings(){const s=state.data;$('#settings').innerHTML=\`
      <div class="panel"><h2>路径</h2><div class="row"><div>配置文件</div><div class="path">\${esc(s.config_path)}</div></div><div class="row"><div>PicGen 密钥文件</div><div class="path">\${esc(s.key_file_path)}</div></div><p class="hint">key 读取优先级：终端环境变量 &gt; 当前项目 .env &gt; PicGen 管理文件。</p></div>
      <div class="panel"><div class="split"><h2>渠道</h2><button class="primary" id="addProviderBtn">添加渠道</button></div>
      <div class="hidden" id="providerForm" style="margin:12px 0 14px"><h2>添加渠道</h2>
        <div class="formgrid">
          <label class="full">渠道类型<select id="newTemplate"><option value="gemini_proxy">第三方 Gemini</option><option value="openai_proxy">第三方 OpenAI 兼容</option><option value="gemini_official">官方 Gemini</option><option value="openai_official">官方 OpenAI</option></select></label>
          <label>名称<input id="newName" placeholder="自动"></label>
          <label>Host<input id="newHost" value="https://www.pandai.vip"></label>
          <label class="full">API key<input id="newKey" type="password" placeholder="保存在本机，不写入聊天"></label>
          <p class="hint full">每个新渠道会自动分配独立的 key 名称，避免多个渠道互相覆盖。</p>
          <label class="full">模型列表<input id="newModels" placeholder="使用推荐默认值"></label>
          <label><input id="newPrefer" type="checkbox" checked style="width:auto"> 设为默认渠道</label>
          <div class="actions"><button class="primary" id="saveProvider">保存渠道</button><button id="cancelProvider">取消</button></div>
        </div>
      </div><div id="providers"></div></div>\`;
      $('#addProviderBtn').onclick=()=>{const form=$('#providerForm');form.classList.remove('hidden');form.scrollIntoView({block:'nearest'});};$('#cancelProvider').onclick=()=>$('#providerForm').classList.add('hidden');$('#saveProvider').onclick=saveProvider;$('#newTemplate').onchange=applyProviderTemplate;applyProviderTemplate();
      $('#providers').innerHTML=s.providers.map(providerCard).join('') || '<p class="muted">还没有配置渠道。</p>';
      bindProviderActions();
    }
    function providerCard(p){const key=p.key||{set:false};const source=key.set?\`<span class="source \${esc(key.source)}">\${esc(keySource(key))}</span>\`:'<span class="source missing">未配置</span>';const sourcePath=key.path?\`<div class="keyline small">来源路径 <span class="path">\${esc(key.path)}</span></div>\`:'';const officialHint=p.channel==='official'?'<div class="warning">官方渠道通常需要官方 API key；如果这里放的是第三方渠道 key，测试可能失败。</div>':'';return \`<div class="provider"><div><div class="title">\${esc(p.name)}</div><div class="badges"><span class="badge \${p.preference==='default'?'default':''}">\${esc(label(p.preference))}</span><span class="badge">\${esc(label(p.protocol))}</span><span class="badge">\${esc(label(p.channel))}</span><span class="badge \${p.enabled?'ok':'warn'}">\${p.enabled?'已启用':'已停用'}</span></div><div class="keyline">\${esc(p.base_url)}</div><div class="keyline">Key <code>\${esc(p.api_key_env)}</code>: \${key.set?\`<code data-key-preview="\${esc(p.api_key_env)}">\${esc(key.preview)}</code> <button class="icon-btn" title="显示完整 key" aria-label="显示完整 key" data-reveal="\${esc(p.api_key_env)}" data-visible="false">\${eyeIcon}</button>\`:'未配置'} \${source} \${key.fingerprint?'<span class="small">fingerprint '+esc(key.fingerprint)+'</span>':''}</div>\${sourcePath}\${officialHint}</div><div class="actions"><button data-test="\${esc(p.name)}">测试</button><button data-default="\${esc(p.name)}">设为默认</button><button data-toggle="\${esc(p.name)}">\${p.enabled?'停用':'启用'}</button><button class="danger" data-delete="\${esc(p.name)}">移除</button></div></div>\`}
    function bindProviderActions(){document.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>testProvider(b.dataset.test));document.querySelectorAll('[data-default]').forEach(b=>b.onclick=()=>post('/api/providers/'+encodeURIComponent(b.dataset.default)+'/default',{}));document.querySelectorAll('[data-toggle]').forEach(b=>{const p=state.data.providers.find(x=>x.name===b.dataset.toggle);b.onclick=()=>patch('/api/providers/'+encodeURIComponent(p.name),{enabled:!p.enabled})});document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>confirm('确认移除这个渠道？')&&del('/api/providers/'+encodeURIComponent(b.dataset.delete)));document.querySelectorAll('[data-reveal]').forEach(b=>b.onclick=()=>toggleKey(b.dataset.reveal,b))}
    function applyProviderTemplate(){const t=templateDefaults($('#newTemplate').value);$('#newName').placeholder=t.name;$('#newHost').value=t.host;$('#newModels').placeholder=t.models}
    async function saveProvider(){const t=templateDefaults($('#newTemplate').value);await post('/api/providers',{protocol:t.protocol,channel:t.channel,name:$('#newName').value,base_url:$('#newHost').value,api_key:$('#newKey').value,models:$('#newModels').value,prefer:$('#newPrefer').checked});$('#providerForm').classList.add('hidden');toast('渠道已保存')}
    async function testProvider(name){const r=await api('/api/providers/'+encodeURIComponent(name)+'/test',{method:'POST'});toast((r.ok?'测试通过：':'测试失败：')+r.message)}
    async function toggleKey(name,btn){const slot=document.querySelector('[data-key-preview="'+CSS.escape(name)+'"]');if(btn.dataset.visible==='true'){const key=state.data.providers.find(p=>p.api_key_env===name)?.key;slot.textContent=key?.preview||'';btn.dataset.visible='false';btn.title='显示完整 key';btn.setAttribute('aria-label','显示完整 key');btn.innerHTML=eyeIcon;return}const r=await api('/api/key/'+encodeURIComponent(name));slot.textContent=r.value||'';btn.dataset.visible='true';btn.title='隐藏 key';btn.setAttribute('aria-label','隐藏 key');btn.innerHTML=eyeOffIcon}
    async function post(path,body){await api(path,{method:'POST',body:JSON.stringify(body)});await load()}
    async function patch(path,body){await api(path,{method:'PATCH',body:JSON.stringify(body)});await load()}
    async function del(path){await api(path,{method:'DELETE'});await load()}
    function renderGenerate(){const s=state.data;const prefs=JSON.parse(localStorage.getItem('picgen:prefs')||'{}');$('#generate').innerHTML=\`<div class="cols"><div class="panel"><h2>生成图片</h2><label>提示词<textarea id="prompt">\${esc(prefs.prompt||'一张简洁的 PicGen 测试图，白色背景，少量蓝绿色科技感点缀')}</textarea></label><div class="formgrid"><label>渠道<select id="genProvider"><option value="">自动选择</option>\${s.providers.map(p=>'<option value="'+esc(p.name)+'" '+(prefs.provider===p.name?'selected':'')+'>'+esc(p.name)+'</option>').join('')}</select></label><label>预设<select id="genPreset">\${Object.keys(s.presets).map(p=>'<option '+((prefs.preset||'fast-draft')===p?'selected':'')+'>'+esc(p)+'</option>').join('')}</select></label><label>模型<input id="genModel" value="\${esc(prefs.model||'')}" placeholder="可选"></label><label>模式<input id="genMode" value="\${esc(prefs.mode||'')}" placeholder="可选"></label><label class="full">参考图路径<textarea id="genReferences" placeholder="/Users/me/reference.png&#10;可填写多行或逗号分隔">\${esc(prefs.references||'')}</textarea></label><label class="full">遮罩图路径<input id="genMask" value="\${esc(prefs.mask||'')}" placeholder="可选；需要同时填写参考图"></label></div><div class="actions" style="margin-top:12px"><button id="preview" class="primary">预览方案</button><button id="generateBtn" disabled>开始生成</button></div></div><div class="panel"><h2>方案 / 结果</h2><div id="plan" class="plan">还没有预览。</div><div id="result" class="result" style="margin-top:12px"></div></div></div>\`;$('#preview').onclick=preview;$('#generateBtn').onclick=generateNow}
    function genBody(){const body={prompt:$('#prompt').value,preset:$('#genPreset').value,provider:$('#genProvider').value,model:$('#genModel').value,mode:$('#genMode').value,references:$('#genReferences').value,mask:$('#genMask').value};localStorage.setItem('picgen:prefs',JSON.stringify(body));return body}
    async function preview(){const r=await api('/api/plan',{method:'POST',body:JSON.stringify(genBody())});state.plan=r.plan;$('#plan').textContent=JSON.stringify(r.plan,null,2);$('#generateBtn').disabled=false}
    async function generateNow(){if(!state.plan&&!confirm('还没有预览方案，确定直接生成？'))return;$('#generateBtn').disabled=true;$('#result').innerHTML='<p class="muted">正在生成...</p>';try{const r=await api('/api/generate',{method:'POST',body:JSON.stringify(genBody())});$('#result').innerHTML='<p>已保存到 <span class="path">'+esc(r.output_dir)+'</span></p>'+r.images.map(img=>'<img src="/api/file?path='+encodeURIComponent(img.path)+'&token='+token+'"><div class="path">'+esc(img.path)+'</div>').join('');await renderHistory()}catch(e){$('#result').innerHTML='<p style="color:var(--danger)">'+esc(e.message)+'</p>'}finally{$('#generateBtn').disabled=false}}
    async function renderHistory(){const h=$('#history');if(!state.data)return;const r=await api('/api/history');h.innerHTML='<div class="panel"><h2>历史记录</h2><p class="muted">找回最近生成的图片和本地保存路径。</p></div><div class="gallery">'+r.runs.map(runCard).join('')+'</div>'}
    function runCard(r){const img=(r.images&&r.images[0])?'<img src="'+r.images[0].url+'&token='+token+'">':'';const plan=r.plan||{};return '<div class="run">'+img+'<div class="title">'+esc((r.prompt||'未命名').slice(0,60))+'</div><div class="muted small">'+esc(new Date(r.created_at).toLocaleString())+' · '+esc(plan.provider||'')+' · '+esc(plan.preset||'')+'</div><div class="path small">'+esc(r.output_dir)+'</div><div class="actions" style="margin-top:8px"><button onclick="navigator.clipboard.writeText(\\''+esc(String(r.output_dir)).replaceAll("'","\\\\'")+'\\')">复制文件夹</button></div></div>'}
    load().catch(e=>toast(e.message));
  </script>
</body>
</html>`;
