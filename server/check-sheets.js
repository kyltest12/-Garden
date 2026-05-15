import "dotenv/config";
import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

async function main() {
  const credentialsPath = resolveCredentialsPath();
  if (!credentialsPath) {
    console.error("Не найден JSON-ключ service account. Укажи GOOGLE_APPLICATION_CREDENTIALS в .env");
    process.exit(1);
  }

  const raw = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
  console.log("Service account:", raw.client_email);
  console.log("Project:", raw.project_id);

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });

  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId) {
    await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    console.log("OK: доступ к таблице есть:", `https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    return;
  }

  const created = await sheets.spreadsheets.create({
    requestBody: { properties: { title: "Garden Game — база данных" } }
  });
  console.log("OK: создана таблица:", created.data.spreadsheetUrl);
  console.log("Добавь в .env: GOOGLE_SHEET_ID=" + created.data.spreadsheetId);
}

function resolveCredentialsPath() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(ROOT_DIR, fromEnv);
  }
  return null;
}

main().catch((error) => {
  const details = error.response?.data?.error;
  console.error("Ошибка:", details?.message || error.message);
  if (details?.status === "PERMISSION_DENIED") {
    console.error("\n1. Включи Google Sheets API:");
    console.error("   https://console.cloud.google.com/apis/library/sheets.googleapis.com");
    console.error("2. Создай таблицу вручную и открой доступ Editor для email service account выше.");
    console.error("3. Вставь ID таблицы в .env как GOOGLE_SHEET_ID");
  }
  process.exit(1);
});
