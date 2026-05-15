# Деплой на Google Cloud Run

Проект: `garden-496416`  
Service account (уже есть): `kyltest12@garden-496416.iam.gserviceaccount.com`

## 1. Установи Google Cloud CLI

Скачай и установи: https://cloud.google.com/sdk/docs/install

В PowerShell:

```powershell
gcloud auth login
gcloud config set project garden-496416
```

## 2. Включи API (один раз)

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sheets.googleapis.com
```

## 3. Таблица Google Sheets

1. Таблица уже должна быть расшарена для `kyltest12@garden-496416.iam.gserviceaccount.com` с правом **Редактор**.
2. Скопируй ID таблицы в переменную (из URL):  
   `https://docs.google.com/spreadsheets/d/ВОТ_ЭТОТ_ID/edit`

## 4. Секрет для JWT

Придумай длинный случайный ключ (не как в локальном `.env`):

```powershell
# пример — замени на свой
$env:JWT_SECRET = "твой-длинный-секрет-минимум-32-символа"
```

## 5. Деплой

В папке проекта `garden`:

```powershell
cd "C:\Users\компьютер\Desktop\fullstack\Для себя\garden"

gcloud run deploy garden-game `
  --source . `
  --region europe-west1 `
  --platform managed `
  --allow-unauthenticated `
  --service-account kyltest12@garden-496416.iam.gserviceaccount.com `
  --set-env-vars "GOOGLE_SHEET_ID=12L9IehT-Q2RTE3W0illlA2i_ysmBs-6jXO5MEOGsQGU,JWT_SECRET=ТВОЙ_СЕКРЕТ"
```

Через 3–7 минут в конце появится ссылка:

```text
Service URL: https://garden-game-xxxxx-ew.a.run.app
```

Это и есть публичная ссылка на игру.

## 6. Проверка

Открой в браузере:

- `https://ТВОЙ-URL/` — игра
- `https://ТВОЙ-URL/api/status` — должно быть `"storage": "google-sheets"`

## 7. Вставка в Google Sites

Google Sites → **Вставить** → **URL** → вставь Service URL из Cloud Run.

---

## Обновление после изменений в коде

```powershell
gcloud run deploy garden-game --source . --region europe-west1
```

(остальные флаги можно не повторять — сохранятся)

---

## Частые ошибки

| Проблема | Решение |
|----------|---------|
| `403` на Sheets | Включи Sheets API; дай Editor service account на таблицу |
| `Storage: local` в логах | Проверь `GOOGLE_SHEET_ID` в переменных Cloud Run |
| Сервис не стартует | `gcloud run services logs read garden-game --region europe-west1` |

Просмотр логов:

```powershell
gcloud run services logs read garden-game --region europe-west1 --limit 50
```

Переменные окружения в консоли:  
https://console.cloud.google.com/run → **garden-game** → **Edit & deploy new revision** → **Variables**.

---

## Стоимость

Cloud Run на небольшой нагрузке обычно укладывается в **бесплатный лимит** Google Cloud. Следи за квотой в консоли Billing.
