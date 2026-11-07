# Единый ключ подписи

Все репозитории плагинов этого реестра подписывают пакеты **одним ключом**. Реестру нужен только public key. Производственный ключ генерирует пользователь локально; workflow его не создаёт.

Из каталога плагина с установленными зависимостями:

```bash
npx --no-install termix-plugin keygen --out "$HOME/termix-signing"
```

CLI создаёт `~/termix-signing/termix-plugin-signing.key` с правами 0600 и печатает public key и key ID. **Отдельный public key файл CLI не записывает**: скопируйте напечатанную строку base64 в `registry.pub`. Key ID — первые 16 hex-символов SHA-256 от raw 32-байтового public key. Запишите ID в защищённое независимое место и сообщите администраторам Termix по доверенному каналу.

Сделайте зашифрованную offline-копию private key и проверьте возможность восстановления. Не размещайте ключ в Git, Releases, Pages, screenshots и logs. После настройки secrets удалите рабочую незашифрованную копию, если она больше не нужна; backup должен остаться доступным владельцу.

В **каждом plugin repository**: Settings → Secrets and variables → Actions → Secrets → New repository secret:

- Name: `TERMIX_PLUGIN_SIGNING_KEY`.
- Secret: фактическое содержимое `.key`, одна строка base64 PKCS8 DER; не имя файла и не путь.

Там же Variables → New repository variable:

- Name: `REGISTRY_PUBLIC_KEY`.
- Value: public key из keygen, 44 символа base64.

Private key также может быть PEM, но используйте стандартный base64 результат CLI — это проще. Workflow передаёт secret в переменную окружения только шагам preflight/sign и не печатает его. Проверка использует public variable. При отсутствии secret публикация останавливается.

Локальная подпись при сохранённом рабочем ключе:

```bash
TERMIX_PLUGIN_SIGNING_KEY="$(cat "$HOME/termix-signing/termix-plugin-signing.key")"   npx --no-install termix-plugin sign host-web-launcher-1.0.0.tmxplug
npx --no-install termix-plugin verify host-web-launcher-1.0.0.tmxplug --key 'YOUR_PUBLIC_KEY'
```

Не включайте `set -x`. CLI подписывает raw SHA-256 архива и пишет plain base64 `.tmxplug.sig`. Подмена архива после подписи, другая пара ключей и подпись hex-строки не пройдут проверку реестра. SHA-256, размер и capabilities берутся из фактического архива, а не release description.

При ротации production key обновление public key не будет принято Termix автоматически. Требуется предупредить пользователей, остановить релизы, восстановить/переподписать доступные версии новым ключом по согласованному плану, обновить ключ и secrets, затем вручную удалить и заново добавить registry с новым fingerprint. Termix также требует переустановки плагинов, связанных со старым ключом. Старый state с другим key намеренно блокирует sync: восстановление/ротация требует отдельного контролируемого изменения deployment/state. Простая замена public key в plugins.json недостаточна. При компрометации исходите из того, что подписанные старым ключом пакеты недоверенны; см. SECURITY.
