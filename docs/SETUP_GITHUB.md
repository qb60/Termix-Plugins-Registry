# Настройка GitHub Pages

1. Создайте публичный репозиторий Termix-Plugins-Registry через GitHub → + → New repository → Public → Create repository. Не добавляйте автоматически README или LICENSE при загрузке уже готового проекта.
2. Установите Node.js 24 LTS, выполните `npm ci`, `npm test`. Создайте ключ по SIGNING, опубликуйте хотя бы один подписанный plugin release.
3. Сохраните public key отдельной строкой в файл, затем `npm run configure -- YOUR_OWNER /path/to/registry.pub`. Команда заполнит только начальный список Host Web Launcher; впоследствии редактируйте `plugins.json` вручную. Для иного первого плагина укажите его repository вместо этой строки.
4. В каталоге проекта выполните `git init -b main`, `git add .`, `git commit -m "feat: add custom Termix registry"`, `git remote add origin https://github.com/YOUR_OWNER/Termix-Plugins-Registry.git`, `git push -u origin main`. Авторизуйтесь своим обычным способом самостоятельно.
5. Settings → Actions → General → Actions permissions: Allow all actions and reusable workflows либо разрешите используемые `actions/*`. Workflow permissions: Read repository contents; workflow сам запросит необходимые Pages-права. Организационная policy может требовать разрешения администратора.
6. Settings → Pages → Build and deployment → Source → GitHub Actions. Не выбирайте branch/docs publishing.
7. Actions → Sync and deploy registry → Run workflow → main → Run workflow. Если первый автоматический запуск произошёл до включения Pages, повторите после настройки.
8. Откройте успешный run → deploy → URL deployment. Проверьте именно `/Termix-Plugins-Registry/index.json`, не корень сайта: HTML landing page не создаётся.
9. В Termix → Plugins → Registries → Add registry введите полный URL, Check, сравните key ID и Trust and add.

Приватный ключ, PAT и signing secret реестру не нужны. `GITHUB_TOKEN` GitHub выдаёт автоматически каждому run. Ручной deploy после первого release достаточен; дальше scheduler запускается в `main` примерно каждые шесть часов. GitHub может задерживать scheduled jobs и отключать их после длительной неактивности публичного репозитория; проверьте Actions и при необходимости включите workflow снова.

При локальном sync с уже опубликованным реестром сначала выполните `GITHUB_REPOSITORY=YOUR_OWNER/Termix-Plugins-Registry node scripts/restore-state.mjs`. Иначе previous state отсутствует и локальный запуск не проверит историческое закрепление ID/hash. Для безопасности публикацию выполняет workflow с автоматическим восстановлением state.
