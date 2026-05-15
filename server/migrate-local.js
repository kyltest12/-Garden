import "dotenv/config";
import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const LOCAL_DATA_PATH = path.join(__dirname, "dev-data.json");

const SHEETS = {
  users: ["user_id", "login", "password_hash", "nickname", "created_at", "last_login_at", "last_seen_at", "is_banned"],
  profiles: ["user_id", "nickname", "gold", "selected_plant", "unlocked_plots_count", "total_harvests", "total_earned", "plants_planted", "plants_harvested", "different_plants_grown", "online_seconds", "last_save_at"],
  saves: ["user_id", "garden_json", "seed_shop_json", "stats_json", "updated_at"],
  sessions: ["session_id", "user_id", "started_at", "last_heartbeat_at", "online_seconds_added"],
  events: ["event_id", "user_id", "event_type", "event_json", "created_at"]
};

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!spreadsheetId) {
    console.error("GOOGLE_SHEET_ID не задан в .env");
    process.exit(1);
  }

  const localData = JSON.parse(await fs.readFile(LOCAL_DATA_PATH, "utf8"));
  const credentialsPath = path.resolve(ROOT_DIR, process.env.GOOGLE_APPLICATION_CREDENTIALS || "garden-496416-f01f9fa139cf.json");
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });

  let added = 0;
  for (const user of localData.users || []) {
    if (await rowExists(sheets, spreadsheetId, "users", "user_id", user.user_id)) {
      continue;
    }
    await appendRow(sheets, spreadsheetId, "users", user);
    added += 1;
  }

  for (const table of ["profiles", "saves", "sessions", "events"]) {
    for (const row of localData[table] || []) {
      const key = table === "sessions" ? "session_id" : table === "events" ? "event_id" : "user_id";
      if (await rowExists(sheets, spreadsheetId, table, key, row[key])) {
        continue;
      }
      await appendRow(sheets, spreadsheetId, table, row);
    }
  }

  console.log(`Перенесено новых пользователей: ${added}`);
  console.log(`Таблица: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}

async function rowExists(sheets, spreadsheetId, sheetName, column, value) {
  const rows = await readObjects(sheets, spreadsheetId, sheetName);
  return rows.some((row) => row[column] === value);
}

async function readObjects(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:Z` });
  const rows = response.data.values || [];
  const headers = rows[0] || SHEETS[sheetName];
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

async function appendRow(sheets, spreadsheetId, sheetName, object) {
  const headers = SHEETS[sheetName];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [headers.map((header) => object[header] ?? "")] }
  });
}

main().catch((error) => {
  console.error(error.response?.data?.error?.message || error.message);
  process.exit(1);
});
