import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const HEARTBEAT_SECONDS = 30;

const SHEETS = {
  users: ["user_id", "login", "password_hash", "nickname", "created_at", "last_login_at", "last_seen_at", "is_banned"],
  profiles: ["user_id", "nickname", "gold", "selected_plant", "unlocked_plots_count", "total_harvests", "total_earned", "plants_planted", "plants_harvested", "different_plants_grown", "online_seconds", "last_save_at"],
  saves: ["user_id", "garden_json", "seed_shop_json", "stats_json", "updated_at"],
  sessions: ["session_id", "user_id", "started_at", "last_heartbeat_at", "online_seconds_added"],
  events: ["event_id", "user_id", "event_type", "event_json", "created_at"]
};

const app = express();
const storage = await createStorage();
const store = storage.store;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(ROOT_DIR));

app.post("/api/register", async (req, res) => {
  try {
    const { login, password, nickname } = readCredentials(req.body, true);
    const existingUser = await store.findUserByLogin(login);
    const existingNickname = await store.findUserByNickname(nickname);

    if (existingUser) {
      return res.status(409).json({ error: "Логин уже занят" });
    }

    if (existingNickname) {
      return res.status(409).json({ error: "Никнейм уже занят" });
    }

    const now = new Date().toISOString();
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const initialSave = normalizeSave(req.body.save || {});

    await store.createUser({
      user_id: userId,
      login,
      password_hash: passwordHash,
      nickname,
      created_at: now,
      last_login_at: now,
      last_seen_at: now,
      is_banned: "false"
    });
    await store.upsertProfile(buildProfileRow(userId, nickname, initialSave, now, 0));
    await store.upsertSave(userId, initialSave, now);
    await store.logEvent(userId, "register", { nickname });

    const session = await createSession(userId);
    const token = createToken(userId, session.session_id);
    res.status(201).json({ token, user: publicUser(userId, nickname), save: initialSave });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { login, password } = readCredentials(req.body, false);
    const user = await store.findUserByLogin(login);

    if (!user || user.is_banned === "true") {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const now = new Date().toISOString();
    await store.updateUser(user.user_id, { last_login_at: now, last_seen_at: now });
    await store.logEvent(user.user_id, "login", {});

    const session = await createSession(user.user_id);
    const token = createToken(user.user_id, session.session_id);
    const save = await store.getSave(user.user_id);
    res.json({ token, user: publicUser(user.user_id, user.nickname), save });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await store.findUserById(req.auth.userId);
  if (!user) {
    return res.status(404).json({ error: "Пользователь не найден" });
  }

  const profile = await store.getProfile(req.auth.userId);
  const save = await store.getSave(req.auth.userId);
  res.json({ user: publicUser(user.user_id, user.nickname), profile, save });
});

app.post("/api/save", requireAuth, async (req, res) => {
  try {
    const user = await store.findUserById(req.auth.userId);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const now = new Date().toISOString();
    const save = normalizeSave(req.body.save || req.body);
    const profile = await store.getProfile(user.user_id);
    const onlineSeconds = Number(profile?.online_seconds) || 0;

    await store.upsertProfile(buildProfileRow(user.user_id, user.nickname, save, now, onlineSeconds));
    await store.upsertSave(user.user_id, save, now);
    await store.updateUser(user.user_id, { last_seen_at: now });
    await store.logEvent(user.user_id, "save", summarizeSave(save));
    res.json({ ok: true, savedAt: now });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/heartbeat", requireAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const profile = await store.getProfile(req.auth.userId);
    const onlineSeconds = (Number(profile?.online_seconds) || 0) + HEARTBEAT_SECONDS;

    await store.updateProfile(req.auth.userId, { online_seconds: onlineSeconds, last_save_at: now });
    await store.updateUser(req.auth.userId, { last_seen_at: now });
    await store.updateSession(req.auth.sessionId, {
      last_heartbeat_at: now,
      online_seconds_added: (await store.getSessionSeconds(req.auth.sessionId)) + HEARTBEAT_SECONDS
    });
    res.json({ ok: true, onlineSeconds });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/status", (_req, res) => {
  res.json({
    storage: storage.mode,
    spreadsheetUrl: storage.spreadsheetUrl || null
  });
});

app.get("/api/leaderboard", async (_req, res) => {
  const profiles = await store.listProfiles();
  const leaderboard = profiles
    .map((profile) => ({
      nickname: profile.nickname,
      total_earned: Number(profile.total_earned) || 0,
      total_harvests: Number(profile.total_harvests) || 0,
      online_seconds: Number(profile.online_seconds) || 0
    }))
    .sort((left, right) => right.total_earned - left.total_earned)
    .slice(0, 25);

  res.json({ leaderboard });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Garden server is running on port ${PORT}`);
  console.log(`Storage: ${storage.mode}${storage.spreadsheetUrl ? ` → ${storage.spreadsheetUrl}` : " (server/dev-data.json)"}`);
  if (storage.mode === "local" && !isMissingEnvValue(process.env.GOOGLE_SHEET_ID)) {
    console.error("В .env указан GOOGLE_SHEET_ID, но сервер всё равно на локальном хранилище. Перезапусти npm start из папки garden.");
  }
});

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Нужно войти в аккаунт" });
  }
}

async function createSession(userId) {
  const now = new Date().toISOString();
  const session = {
    session_id: randomUUID(),
    user_id: userId,
    started_at: now,
    last_heartbeat_at: now,
    online_seconds_added: 0
  };
  await store.createSession(session);
  return session;
}

function createToken(userId, sessionId) {
  return jwt.sign({ userId, sessionId }, JWT_SECRET, { expiresIn: "14d" });
}

function publicUser(userId, nickname) {
  return { user_id: userId, nickname };
}

function readCredentials(body, requireNickname) {
  const login = String(body.login || "").trim().toLowerCase();
  const password = String(body.password || "");
  const nickname = String(body.nickname || "").trim();

  if (!/^[a-z0-9_.-]{3,24}$/.test(login)) {
    throw validationError("Логин: 3-24 символа, латиница, цифры, '.', '_' или '-'");
  }

  if (password.length < 6 || password.length > 80) {
    throw validationError("Пароль должен быть от 6 до 80 символов");
  }

  if (requireNickname && (nickname.length < 2 || nickname.length > 24)) {
    throw validationError("Никнейм должен быть от 2 до 24 символов");
  }

  return { login, password, nickname };
}

function normalizeSave(save) {
  const stats = save.stats && typeof save.stats === "object" ? save.stats : {};
  return {
    gold: Math.max(0, Number(save.gold) || 0),
    selectedPlant: Math.max(0, Number(save.selectedPlant) || 0),
    garden: Array.isArray(save.garden) ? save.garden.slice(0, 25) : [],
    unlockedPlots: Array.isArray(save.unlockedPlots) ? save.unlockedPlots.slice(0, 25) : [],
    seedShop: save.seedShop && typeof save.seedShop === "object" ? save.seedShop : { items: [], nextRefreshAt: 0 },
    stats: {
      totalHarvests: Math.max(0, Number(stats.totalHarvests) || 0),
      totalEarned: Math.max(0, Number(stats.totalEarned) || 0),
      plantsPlanted: Math.max(0, Number(stats.plantsPlanted) || 0),
      plantsHarvested: Math.max(0, Number(stats.plantsHarvested) || 0),
      grownPlantIndexes: Array.isArray(stats.grownPlantIndexes) ? stats.grownPlantIndexes : []
    }
  };
}

function buildProfileRow(userId, nickname, save, now, onlineSeconds) {
  return {
    user_id: userId,
    nickname,
    gold: save.gold,
    selected_plant: save.selectedPlant,
    unlocked_plots_count: save.unlockedPlots.length,
    total_harvests: save.stats.totalHarvests,
    total_earned: save.stats.totalEarned,
    plants_planted: save.stats.plantsPlanted,
    plants_harvested: save.stats.plantsHarvested,
    different_plants_grown: save.stats.grownPlantIndexes.length,
    online_seconds: onlineSeconds,
    last_save_at: now
  };
}

function summarizeSave(save) {
  return {
    gold: save.gold,
    gardenCount: save.garden.length,
    totalEarned: save.stats.totalEarned,
    totalHarvests: save.stats.totalHarvests
  };
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function sendError(res, error) {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Ошибка сервера" });
}

const ENV_PATH = path.join(ROOT_DIR, ".env");
const SHEET_ID_CACHE_PATH = path.join(__dirname, "sheet-id.txt");
const LOCAL_DATA_PATH = path.join(__dirname, "dev-data.json");

async function createStorage() {
  const wantsSheets = !isMissingEnvValue(process.env.GOOGLE_SHEET_ID);

  try {
    const sheetStore = await createGoogleSheetsStore();
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${sheetStore.spreadsheetId}/edit`;
    const migrated = await migrateLocalDataToSheets(sheetStore);
    if (migrated > 0) {
      console.log(`Migrated ${migrated} local user(s) from dev-data.json to Google Sheets.`);
    }
    return { mode: "google-sheets", store: sheetStore, spreadsheetUrl };
  } catch (error) {
    if (wantsSheets) {
      console.error("Google Sheets is required (GOOGLE_SHEET_ID is set) but connection failed:", error.message);
      if (error.code === 403 || error.status === 403) {
        console.error(
          "Включи Google Sheets API и дай service account доступ Editor к таблице:\n" +
            "https://console.cloud.google.com/apis/library/sheets.googleapis.com"
        );
      }
      process.exit(1);
    }

    console.warn(`${error.message} Using local server/dev-data.json.`);
    return { mode: "local", store: await createLocalStore(), spreadsheetUrl: null };
  }
}

async function createGoogleSheetsStore() {
  const auth = await createGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = await resolveSpreadsheetId(sheets);
  await ensureSheets(sheets, spreadsheetId);
  console.log(`Google Sheets connected: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  return { ...createSheetStore(sheets, spreadsheetId), spreadsheetId, sheets };
}

async function migrateLocalDataToSheets(sheetStore) {
  let localData;
  try {
    localData = await readLocalData(LOCAL_DATA_PATH);
  } catch {
    return 0;
  }

  if (!localData.users?.length) {
    return 0;
  }

  console.log(`Checking ${localData.users.length} local account(s) for migration to Google Sheets...`);
  let migrated = 0;
  for (const user of localData.users) {
    if (await sheetStore.findUserById(user.user_id)) {
      continue;
    }

    await sheetStore.createUser(user);
    migrated += 1;
  }

  for (const profile of localData.profiles || []) {
    await sheetStore.upsertProfile(profile);
  }

  for (const save of localData.saves || []) {
    const decoded = decodeSave(save);
    await sheetStore.upsertSave(save.user_id, decoded, save.updated_at || new Date().toISOString());
  }

  for (const session of localData.sessions || []) {
    if (!(await sheetStore.findSessionById(session.session_id))) {
      await sheetStore.createSession(session);
    }
  }

  for (const event of localData.events || []) {
    await sheetStore.appendEvent(event);
  }

  if (migrated > 0) {
    const backupPath = `${LOCAL_DATA_PATH}.migrated-${Date.now()}.bak`;
    await fs.rename(LOCAL_DATA_PATH, backupPath);
    console.log(`Local backup saved: ${path.basename(backupPath)}`);
  }

  return migrated;
}

async function createGoogleAuth() {
  if (!isMissingEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) && !isMissingEnvValue(process.env.GOOGLE_PRIVATE_KEY)) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  }

  const credentialsPath = await resolveCredentialsPath();
  if (credentialsPath) {
    return new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  }

  // Cloud Run: сервисный аккаунт из --service-account (без JSON-файла в контейнере)
  return new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

async function resolveCredentialsPath() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!isMissingEnvValue(fromEnv)) {
    const resolved = path.isAbsolute(fromEnv) ? fromEnv : path.resolve(ROOT_DIR, fromEnv);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      throw new Error(`Credentials file not found: ${resolved}`);
    }
  }

  const entries = await fs.readdir(ROOT_DIR);
  const jsonFiles = entries.filter((name) => name.endsWith(".json") && !name.includes("package"));
  for (const name of jsonFiles) {
    const filePath = path.join(ROOT_DIR, name);
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (parsed.type === "service_account" && parsed.client_email && parsed.private_key) {
        return filePath;
      }
    } catch {
      // not a service account json
    }
  }

  return null;
}

async function resolveSpreadsheetId(sheets) {
  const fromEnv = process.env.GOOGLE_SHEET_ID;
  if (!isMissingEnvValue(fromEnv)) {
    return fromEnv.trim();
  }

  try {
    const cached = (await fs.readFile(SHEET_ID_CACHE_PATH, "utf8")).trim();
    if (cached) {
      return cached;
    }
  } catch {
    // no cached id yet
  }

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "Garden Game — база данных" }
    }
  });
  const spreadsheetId = created.data.spreadsheetId;
  await fs.writeFile(SHEET_ID_CACHE_PATH, spreadsheetId, "utf8");
  await upsertEnvValue("GOOGLE_SHEET_ID", spreadsheetId);
  console.log("Created a new Google Sheet for game data.");
  return spreadsheetId;
}

async function upsertEnvValue(key, value) {
  let contents = "";
  try {
    contents = await fs.readFile(ENV_PATH, "utf8");
  } catch {
    // .env may not exist yet
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const nextContents = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}${contents ? "\n" : ""}${line}\n`;

  await fs.writeFile(ENV_PATH, nextContents, "utf8");
  process.env[key] = value;
}

function isMissingEnvValue(value) {
  if (!value) {
    return true;
  }

  return /replace-with|your-service-account|\.\.\.|BEGIN PRIVATE KEY/i.test(value);
}

async function ensureSheets(sheets, spreadsheetId) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set(spreadsheet.data.sheets.map((sheet) => sheet.properties.title));
  const addSheetRequests = Object.keys(SHEETS)
    .filter((title) => !existingTitles.has(title))
    .map((title) => ({ addSheet: { properties: { title } } }));

  if (addSheetRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: addSheetRequests } });
  }

  for (const [title, headers] of Object.entries(SHEETS)) {
    const rows = await readRows(sheets, spreadsheetId, title);
    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] }
      });
    }
  }
}

function createSheetStore(sheets, spreadsheetId) {
  return {
    findUserById: async (userId) => findByColumn(sheets, spreadsheetId, "users", "user_id", userId),
    findUserByLogin: async (login) => findByColumn(sheets, spreadsheetId, "users", "login", login),
    findUserByNickname: async (nickname) => findByColumn(sheets, spreadsheetId, "users", "nickname", nickname),
    findSessionById: async (sessionId) => findByColumn(sheets, spreadsheetId, "sessions", "session_id", sessionId),
    getProfile: async (userId) => findByColumn(sheets, spreadsheetId, "profiles", "user_id", userId),
    listProfiles: async () => readObjects(sheets, spreadsheetId, "profiles"),
    getSave: async (userId) => decodeSave(await findByColumn(sheets, spreadsheetId, "saves", "user_id", userId)),
    getSessionSeconds: async (sessionId) => Number((await findByColumn(sheets, spreadsheetId, "sessions", "session_id", sessionId))?.online_seconds_added) || 0,
    createUser: async (user) => appendObject(sheets, spreadsheetId, "users", user),
    createSession: async (session) => appendObject(sheets, spreadsheetId, "sessions", session),
    updateUser: async (userId, patch) => updateByColumn(sheets, spreadsheetId, "users", "user_id", userId, patch),
    updateProfile: async (userId, patch) => updateByColumn(sheets, spreadsheetId, "profiles", "user_id", userId, patch),
    updateSession: async (sessionId, patch) => updateByColumn(sheets, spreadsheetId, "sessions", "session_id", sessionId, patch),
    upsertProfile: async (profile) => upsertByColumn(sheets, spreadsheetId, "profiles", "user_id", profile.user_id, profile),
    upsertSave: async (userId, save, now) => upsertByColumn(sheets, spreadsheetId, "saves", "user_id", userId, encodeSave(userId, save, now)),
    appendEvent: async (event) => appendObject(sheets, spreadsheetId, "events", event),
    logEvent: async (userId, eventType, event) => appendObject(sheets, spreadsheetId, "events", {
      event_id: randomUUID(),
      user_id: userId,
      event_type: eventType,
      event_json: JSON.stringify(event),
      created_at: new Date().toISOString()
    })
  };
}

async function readRows(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:Z` });
  return response.data.values || [];
}

async function readObjects(sheets, spreadsheetId, sheetName) {
  const rows = await readRows(sheets, spreadsheetId, sheetName);
  const headers = rows[0] || SHEETS[sheetName];
  return rows.slice(1).map((row, index) => ({
    ...Object.fromEntries(headers.map((header, colIndex) => [header, row[colIndex] ?? ""])),
    _rowNumber: index + 2
  }));
}

async function appendObject(sheets, spreadsheetId, sheetName, object) {
  const headers = SHEETS[sheetName];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [headers.map((header) => object[header] ?? "")] }
  });
}

async function updateByColumn(sheets, spreadsheetId, sheetName, column, value, patch) {
  const rows = await readObjects(sheets, spreadsheetId, sheetName);
  const existing = rows.find((row) => row[column] === value);
  if (!existing) {
    return false;
  }

  const next = { ...existing, ...patch };
  delete next._rowNumber;
  await updateObjectAtRow(sheets, spreadsheetId, sheetName, existing._rowNumber, next);
  return true;
}

async function upsertByColumn(sheets, spreadsheetId, sheetName, column, value, object) {
  const updated = await updateByColumn(sheets, spreadsheetId, sheetName, column, value, object);
  if (!updated) {
    await appendObject(sheets, spreadsheetId, sheetName, object);
  }
}

async function updateObjectAtRow(sheets, spreadsheetId, sheetName, rowNumber, object) {
  const headers = SHEETS[sheetName];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [headers.map((header) => object[header] ?? "")] }
  });
}

async function findByColumn(sheets, spreadsheetId, sheetName, column, value) {
  const rows = await readObjects(sheets, spreadsheetId, sheetName);
  return rows.find((row) => row[column] === value) || null;
}

function encodeSave(userId, save, now) {
  return {
    user_id: userId,
    garden_json: JSON.stringify(save.garden),
    seed_shop_json: JSON.stringify(save.seedShop),
    stats_json: JSON.stringify({ ...save.stats, gold: save.gold, selectedPlant: save.selectedPlant, unlockedPlots: save.unlockedPlots }),
    updated_at: now
  };
}

function decodeSave(row) {
  if (!row) {
    return normalizeSave({});
  }

  const stats = safeJson(row.stats_json, {});
  return normalizeSave({
    gold: stats.gold,
    selectedPlant: stats.selectedPlant,
    unlockedPlots: stats.unlockedPlots,
    garden: safeJson(row.garden_json, []),
    seedShop: safeJson(row.seed_shop_json, { items: [], nextRefreshAt: 0 }),
    stats
  });
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

async function createLocalStore() {
  const data = await readLocalData(LOCAL_DATA_PATH);

  async function persist() {
    await fs.writeFile(LOCAL_DATA_PATH, JSON.stringify(data, null, 2), "utf8");
  }

  return {
    findUserById: async (userId) => data.users.find((user) => user.user_id === userId) || null,
    findUserByLogin: async (login) => data.users.find((user) => user.login === login) || null,
    findUserByNickname: async (nickname) => data.users.find((user) => user.nickname === nickname) || null,
    getProfile: async (userId) => data.profiles.find((profile) => profile.user_id === userId) || null,
    listProfiles: async () => data.profiles,
    getSave: async (userId) => decodeSave(data.saves.find((save) => save.user_id === userId)),
    getSessionSeconds: async (sessionId) => Number(data.sessions.find((session) => session.session_id === sessionId)?.online_seconds_added) || 0,
    createUser: async (user) => { data.users.push(user); await persist(); },
    createSession: async (session) => { data.sessions.push(session); await persist(); },
    updateUser: async (userId, patch) => { patchLocal(data.users, "user_id", userId, patch); await persist(); },
    updateProfile: async (userId, patch) => { patchLocal(data.profiles, "user_id", userId, patch); await persist(); },
    updateSession: async (sessionId, patch) => { patchLocal(data.sessions, "session_id", sessionId, patch); await persist(); },
    upsertProfile: async (profile) => { upsertLocal(data.profiles, "user_id", profile.user_id, profile); await persist(); },
    upsertSave: async (userId, save, now) => { upsertLocal(data.saves, "user_id", userId, encodeSave(userId, save, now)); await persist(); },
    logEvent: async (userId, eventType, event) => {
      data.events.push({
        event_id: randomUUID(),
        user_id: userId,
        event_type: eventType,
        event_json: JSON.stringify(event),
        created_at: new Date().toISOString()
      });
      await persist();
    }
  };
}

async function readLocalData(dataPath) {
  try {
    return JSON.parse(await fs.readFile(dataPath, "utf8"));
  } catch {
    return Object.fromEntries(Object.keys(SHEETS).map((key) => [key, []]));
  }
}

function patchLocal(rows, key, value, patch) {
  const row = rows.find((item) => item[key] === value);
  if (row) {
    Object.assign(row, patch);
  }
}

function upsertLocal(rows, key, value, object) {
  const index = rows.findIndex((item) => item[key] === value);
  if (index === -1) {
    rows.push(object);
  } else {
    rows[index] = { ...rows[index], ...object };
  }
}
