# foundry-sync — арти з апки у Foundry VTT

Гравець завантажує портрет чи токен на сторінці **«Арти для Foundry»** в апці, а цей
сервіс на сервері Foundry кладе файл у `Data/pilots/<нік>/`. Папка гравця створюється
сама при першому арті. Видалення арту в апці прибирає файл і з Foundry.

В апці біля кожного арту з'являється шлях на кшталт `pilots/magellan/portret.png` —
саме його вставляють у Foundry в поле зображення токена чи актора.

## Встановлення на сервер (один раз)

Потрібен Node.js 18+ (він уже є, бо на ньому працює Foundry: `node -v`).

1. Скопіюйте папку `foundry-sync` на сервер, наприклад у `/home/foundry/foundry-sync`
   (через `scp`, `git clone` репозиторію чи WinSCP).
2. Встановіть залежність:
   ```bash
   cd /home/foundry/foundry-sync && npm install --omit=dev
   ```
3. Створіть `.env` з прикладу і заповніть:
   ```bash
   cp .env.example .env && nano .env
   ```
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → **Project Settings → API → service_role**.
     Це секретний ключ: тільки в цьому файлі на сервері.
   - `FOUNDRY_DATA` — повний шлях до папки **Data** Foundry (де лежать `worlds/`, `modules/`).
     Якщо не певні: Foundry → **Setup → Configuration → User Data Path**, і до нього `/Data`.
4. Перевірка вручну:
   ```bash
   node index.mjs
   ```
   Має з'явитися `foundry-sync: /…/Data/pilots, кожні 15 с`. Завантажте арт в апці —
   за кілька секунд у консолі буде `+ pilots/<нік>/<файл>`. Зупинити: Ctrl+C.
5. Автозапуск через systemd (від імені того ж користувача, що й Foundry):
   ```bash
   sudo cp foundry-sync.service /etc/systemd/system/
   sudo nano /etc/systemd/system/foundry-sync.service   # User= і WorkingDirectory= — свої
   sudo systemctl daemon-reload && sudo systemctl enable --now foundry-sync
   ```
   Логи: `journalctl -u foundry-sync -f`.

Якщо Foundry запущено через Docker — `FOUNDRY_DATA` має вказувати на папку на хості,
змонтовану в контейнер як `/data` (тоді це `<папка на хості>/Data`).

## Як це влаштовано

- Файли зберігаються в приватному бакеті Supabase `pilot-art`, кожен гравець бачить лише свої.
- Таблиця `art_uploads`: `synced_at` / `foundry_path` заповнює цей сервіс; `deleted_at`
  ставить апка, коли гравець видаляє арт.
- Папка гравця — його нік латиницею (`Гліб` → `hlib`); якщо такий нік уже зайнятий іншим
  гравцем, додається хвіст з ID. Однакові імена файлів отримують `-2`, `-3`…
- Сервіс нічого не пише поза `FOUNDRY_DATA` і не перезаписує наявні файли.
