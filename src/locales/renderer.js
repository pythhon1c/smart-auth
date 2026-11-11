"use strict";
// Static UI translations and language-specific matching data.
window.SmartLocaleData = Object.freeze({
  settingsGeneral: "Загальні",
  settingsGeneralHint: "Вигляд, системний трей і сповіщення",
  settingsSecurity: "Блокування та захист",
  settingsSecurityHint: "Таймери блокування й доступ до сховища",
  settingsNetwork: "Мережа та продуктивність",
  settingsNetworkHint: "Підключення, проксі й паралельні завдання",
  settingsBrowserHint: "Сесії, вигляд, закладки й розширення",
  settingsAutomation: "Автоматизація Steam",
  settingsAutomationHint: "Адміністратори Steam і перевірка блокувань",
  settingsUnsaved: "Є незбережені зміни",
  settingsLayoutTranslations: `Загальні|General|Общие
Вигляд, системний трей і сповіщення|Appearance, system tray and notifications|Внешний вид, системный трей и уведомления
Блокування та захист|Locking and security|Блокировка и защита
Таймери блокування й доступ до сховища|Lock timers and vault access|Таймеры блокировки и доступ к хранилищу
Мережа та продуктивність|Network and performance|Сеть и производительность
Підключення, проксі й паралельні завдання|Connections, proxies and concurrent tasks|Подключения, прокси и параллельные задачи
Сесії, вигляд, закладки й розширення|Sessions, appearance, bookmarks and extensions|Сессии, внешний вид, закладки и расширения
Автоматизація Steam|Steam automation|Автоматизация Steam
Адміністратори Steam і перевірка блокувань|Steam administrators and ban checks|Администраторы Steam и проверка блокировок
Є незбережені зміни|Unsaved changes|Есть несохранённые изменения`,
  sessionAuthTranslations: "Сесію Steam не створено. Збережіть пароль акаунта або увійдіть у Steam вручну.|No Steam session is available. Save the account password or log in to Steam manually.|Сессия Steam не создана. Сохраните пароль аккаунта или войдите в Steam вручную.",
  activeDataDirectory: "Папка даних програми",
  activeDataDirectoryHint: "Натисніть шлях, потім Ctrl+C, щоб скопіювати.",
  dataDirectoryTranslations: `Папка даних програми|App data directory|Папка данных программы
Натисніть шлях, потім Ctrl+C, щоб скопіювати.|Click the path, then press Ctrl+C to copy.|Нажмите путь, затем Ctrl+C, чтобы скопировать.`,
  appUpdates: "Оновлення програми",
  appUpdateIdle: "Перевірте наявність нової версії smart-auth.",
  appUpdateCheck: "Перевірити оновлення",
  appUpdateDownload: "Завантажити оновлення",
  appUpdateRestart: "Перезапустити в новій версії",
  appUpdateChecking: "Перевірка оновлень…",
  appUpdateDownloading: "Завантаження та перевірка оновлення…",
  appUpdateRestarting: "Створення резервної копії та перезапуск…",
  appUpdateCurrentVersion: "Поточна версія: {version}",
  appUpdateLatestVersion: "Найновіша версія: {version}",
  appUpdateUnchecked: "ще не перевірено",
  appUpdateNoRelease: "немає доступного білду",
  appUpdateNoNewer: "Новішого сумісного білду не знайдено.",
  appUpdateCurrent: "Встановлено актуальну версію.",
  appUpdateAvailable: "Доступна нова версія.",
  appUpdateReady: "Оновлення перевірено та готове до перезапуску.",
  appUpdateFileConflict: "У папці smart-auth-updates уже є інший файл із назвою цієї збірки. Перейменуйте його й повторіть завантаження.",
  appUpdateBadDownload: "Розмір або контрольна сума файлу не збігається з релізом. Повторіть завантаження.",
  appUpdateBackupFailed: "Не вдалося зберегти резервну копію сховища. Перевірте вільне місце та доступ до папки даних і повторіть спробу.",
  appUpdateFailed:
    "Не вдалося виконати оновлення. Перевірте з’єднання та доступ до папки завантажень і повторіть дію. Якщо помилка лишається, перевірте оновлення знову.",
  appUpdateStorageNote:
    "Перевірений новий EXE зберігається поруч зі старим у Downloads/smart-auth-updates, не перезаписуючи його.",
  appUpdateRestartNote:
    "Натискання «Перезапустити в новій версії» створить резервну копію та закриє активні завдання програми.",
  appUpdateTranslations: `Оновлення програми|App updates|Обновления программы
У папці smart-auth-updates уже є інший файл із назвою цієї збірки. Перейменуйте його й повторіть завантаження.|The smart-auth-updates folder already contains a different file with this build's name. Rename that file and download again.|В папке smart-auth-updates уже есть другой файл с именем этой сборки. Переименуйте его и повторите загрузку.
Розмір або контрольна сума файлу не збігається з релізом. Повторіть завантаження.|The file size or checksum differs from the release. Download it again.|Размер или контрольная сумма файла отличается от релиза. Повторите загрузку.
Не вдалося зберегти резервну копію сховища. Перевірте вільне місце та доступ до папки даних і повторіть спробу.|The vault backup could not be saved. Check free space and access to the data folder, then try again.|Не удалось сохранить резервную копию хранилища. Проверьте свободное место и доступ к папке данных и повторите попытку.
Перевірте наявність нової версії smart-auth.|Check for a new version of smart-auth.|Проверьте наличие новой версии smart-auth.
Перевірити оновлення|Check for updates|Проверить обновления
Завантажити оновлення|Download update|Скачать обновление
Перезапустити в новій версії|Restart in new version|Перезапустить в новой версии
Перевірка оновлень…|Checking for updates…|Проверка обновлений…
Завантаження та перевірка оновлення…|Downloading and verifying update…|Загрузка и проверка обновления…
Створення резервної копії та перезапуск…|Creating backup and restarting…|Создание резервной копии и перезапуск…
Поточна версія: {version}|Current version: {version}|Текущая версия: {version}
Найновіша версія: {version}|Latest version: {version}|Последняя версия: {version}
ще не перевірено|not checked yet|ещё не проверено
немає доступного білду|no build available|нет доступной сборки
Новішого сумісного білду не знайдено.|No newer compatible build was found.|Более новая совместимая сборка не найдена.
Встановлено актуальну версію.|You have the latest version.|Установлена актуальная версия.
Доступна нова версія.|A new version is available.|Доступна новая версия.
Оновлення перевірено та готове до перезапуску.|The update is verified and ready to restart.|Обновление проверено и готово к перезапуску.
Не вдалося виконати оновлення. Перевірте з’єднання та доступ до папки завантажень і повторіть дію. Якщо помилка лишається, перевірте оновлення знову.|The update failed. Check your connection and access to Downloads, then retry. If the error continues, check for updates again.|Не удалось выполнить обновление. Проверьте соединение и доступ к папке загрузок и повторите действие. Если ошибка остаётся, проверьте обновления снова.
Перевірений новий EXE зберігається поруч зі старим у Downloads/smart-auth-updates, не перезаписуючи його.|The verified new EXE is saved alongside the old one in Downloads/smart-auth-updates without overwriting it.|Проверенный новый EXE сохраняется рядом со старым в Downloads/smart-auth-updates, не перезаписывая его.
Натискання «Перезапустити в новій версії» створить резервну копію та закриє активні завдання програми.|Clicking “Restart in new version” creates a backup and closes active app tasks.|Нажатие «Перезапустить в новой версии» создаст резервную копию и закроет активные задачи программы.`,
  oneMafile: "Один .maFile",
  optionalSteamPassword: "Пароль Steam (необов’язково)",
  optionalDedicatedProxy: "Окремий проксі (необов’язково)",
  singleImportDetailsHelp:
    "Виберіть один .maFile. Пароль Steam та окремий проксі можна залишити порожніми.",
  singleImportProxyExamples:
    "Проксі: host:port, host:port:user:password або http://user:password@host:port. Для SOCKS5 виберіть відповідний протокол.",
  dedicatedProxyWillBeAssigned: "Акаунту буде призначено окремий проксі.",
  singleImportTranslations: `Один .maFile|One .maFile|Один .maFile
Пароль Steam (необов’язково)|Steam password (optional)|Пароль Steam (необязательно)
Окремий проксі (необов’язково)|Dedicated proxy (optional)|Отдельный прокси (необязательно)
Виберіть один .maFile. Пароль Steam та окремий проксі можна залишити порожніми.|Choose one .maFile. Steam password and dedicated proxy can both be left empty.|Выберите один .maFile. Пароль Steam и отдельный прокси можно оставить пустыми.
Проксі: host:port, host:port:user:password або http://user:password@host:port. Для SOCKS5 виберіть відповідний протокол.|Proxy: host:port, host:port:user:password or http://user:password@host:port. Select the matching protocol for SOCKS5.|Прокси: host:port, host:port:user:password или http://user:password@host:port. Для SOCKS5 выберите соответствующий протокол.
Акаунту буде призначено окремий проксі.|A dedicated proxy will be assigned to the account.|Аккаунту будет назначен отдельный прокси.
Виберіть рівно один файл .maFile з одним акаунтом.|Select exactly one .maFile containing one account.|Выберите ровно один файл .maFile с одним аккаунтом.
Пароль Steam має містити не більше 4096 символів без перенесення рядків.|Steam password must contain at most 4096 characters without line breaks.|Пароль Steam должен содержать не более 4096 символов без переносов строк.
Окремий пароль та проксі доступні лише для імпорту одного .maFile.|A separate password and proxy are only available when importing one .maFile.|Отдельный пароль и прокси доступны только при импорте одного .maFile.`,
  betaWarning:
    "Бета-версія ще проходить тестування. Використовуйте на власний ризик.",
  betaTranslations: `Бета-версія ще проходить тестування. Використовуйте на власний ризик.|Beta software is still being tested. Use at your own risk.|Бета-версия ещё проходит тестирование. Используйте на свой страх и риск.`,
  browserLanguageNames: Object.freeze({
    "en-US": "English",
    uk: "Українська",
    ru: "Русский",
    de: "Deutsch",
    fr: "Français",
    es: "Español",
    pl: "Polski",
    "pt-BR": "Português (Brasil)",
    tr: "Türkçe",
    "zh-CN": "简体中文",
    ja: "日本語",
  }),
  browserRuntimeTitle: "Завантажити Chrome",
  browserRuntimeSource:
    "Chrome завантажується безпосередньо з Google. Облікові дані акаунтів не потрібні.",
  browserRuntimeDetails: "Версія: {version}. Завантаження: {size}.",
  browserRuntimeConsent:
    "Я приймаю Умови використання Google та додаткові Умови використання Chrome.",
  browserRuntimeGoogleTerms: "Умови використання Google",
  browserRuntimeChromeTerms: "Умови використання Chrome",
  browserRuntimeDownload: "Завантажити Chrome",
  browserRuntimeBusy: "Завантаження Chrome…",
  browserRuntimeVerifying: "Перевірка Chrome…",
  browserRuntimeExtracting: "Розпакування Chrome…",
  browserRuntimeError: "Не вдалося встановити Chrome. Повторіть завантаження.",
  browserRuntimeCancel: "Скасувати",
  browserRuntimeUnknown: "невідомо",
  browserRuntimeTranslations: `Завантажити Chrome|Download Chrome|Скачать Chrome
Chrome завантажується безпосередньо з Google. Облікові дані акаунтів не потрібні.|Chrome is downloaded directly from Google. No account credentials are needed.|Chrome загружается напрямую с Google. Данные аккаунтов не нужны.
Версія: {version}. Завантаження: {size}.|Version: {version}. Download: {size}.|Версия: {version}. Загрузка: {size}.
Я приймаю Умови використання Google та додаткові Умови використання Chrome.|I accept the Google Terms of Service and the additional Chrome Terms of Service.|Я принимаю Условия использования Google и дополнительные Условия использования Chrome.
Умови використання Google|Google Terms of Service|Условия использования Google
Умови використання Chrome|Chrome Terms of Service|Условия использования Chrome
Завантаження Chrome…|Downloading Chrome…|Загрузка Chrome…
Перевірка Chrome…|Verifying Chrome…|Проверка Chrome…
Розпакування Chrome…|Extracting Chrome…|Распаковка Chrome…
Не вдалося встановити Chrome. Повторіть завантаження.|Chrome could not be installed. Retry the download.|Не удалось установить Chrome. Повторите загрузку.
Скасувати|Cancel|Отмена
невідомо|unknown|неизвестно`,
  loading: "Завантаження…",
  theCodeIsNotReadyYet: "Код ще не готовий.",
  confirming: "Підтвердження",
  copySteamGuardCode: "Копіювати код Steam Guard",
  codeCopied: "Код скопійовано",
  codeUnavailable: "Код недоступний",
  openProfile: "Відкрити профіль",
  edit: "Редагувати",
  moveToFolder: "Перемістити до папки",
  exportAccount: "Експорт акаунта",
  openInBrowser: "Відкрити в браузері",
  browserProfile: "Профіль браузера",
  closeBrowser: "Закрити браузер",
  viewPassword: "Переглянути пароль",
  copyPassword: "Копіювати пароль",
  passwordCopied: "Пароль скопійовано",
  editSavedPassword: "Змінити збережений пароль",
  addSavedPassword: "Додати збережений пароль",
  logInToSteam: "Увійти в Steam",
  syncTime: "Оновити час",
  timeSynchronized: "Час синхронізовано",
  note: "Нотатка",
  assignProxy: "Призначити проксі",
  checkProxies: "Перевірити проксі",
  editRules: "Змінити правила",
  deleteAccount: "Видалити акаунт",
  deleteAccountFromVault: "Видалити акаунт зі сховища?",
  changesCancelled: "Зміни скасовано",
  refreshAndTryAgain: "Оновіть дані та повторіть спробу.",
  accountIsUsedAsALootWarehouse: "Акаунт використовується як склад Loot",
  disablingGiftAcceptanceMayInterruptAutomaticLootChooseAnActionForTheseWarehouses:
    "Вимкнення приймання подарунків може перервати автоматичний Loot. Оберіть дію для цих складів:",
  removeFromWarehousesAndDisable: "Видалити зі складів і вимкнути",
  keepAsWarehouseAndDisable: "Залишити складом і вимкнути",
  cancel: "Скасувати",
  newSteamConfirmationsAreWaiting: "Є нові підтвердження Steam",
  newIncomingTradeOffers: "Нові вхідні обміни",
  attentionNeededCheckAccountStatus: "Потрібна увага: перевірте стан акаунтів",
  testNotificationSent: "Тестове сповіщення надіслано",
  give: "Віддаєте",
  receive: "Отримуєте",
  moreStacks: "Ще стеків: {count}",
  viewAllItemsInSmartSDA: "Усі предмети — у smart-auth",
  closeDialog: "Закрити вікно",
  save: "Зберегти",
  checkingVaultProtectionThisMayTakeAFewSeconds:
    "Перевіряємо захист сховища… Це може тривати кілька секунд.",
  tooManyAttemptsTryAgainInSeconds:
    "Забагато спроб. Спробуйте через {seconds} с.",
  couldNotConnectToTheVault: "Не вдалося підключитися до сховища.",
  couldNotSaveTheThemeAndLanguageYourChoicesAreAppliedSavingWillBe:
    "Не вдалося зберегти тему й мову. Ваш вибір діє; збереження буде повторено.",
  openingVault: "Відкриваємо сховище…",
  refresh: "Оновити",
  privateVAULT: "ПРИВАТНЕ СХОВИЩЕ",
  welcomeBack: "З поверненням",
  yourAccountsProtected: "Ваші акаунти. Під захистом.",
  unlockTheAppToView: "Розблокуйте програму для перегляду",
  createAPasswordForYourEncryptedSteamGuardVault:
    "Створіть пароль для зашифрованого сховища Steam Guard.",
  password: "Пароль",
  atLeast15Characters: "Щонайменше 15 символів",
  confirmPassword: "Повторіть пароль",
  googleAuthenticatorCode: "Код Google Authenticator",
  unlock: "Розблокувати",
  createVault: "Створити сховище",
  useAPasswordWithAtLeast15Characters:
    "Використайте пароль щонайменше з 15 символів.",
  passwordsDoNotMatch: "Паролі не збігаються.",
  aes256GCMLocalStorage: "AES-256-GCM · локальне зберігання",
  navigation: "Навігація",
  import: "+ Імпортувати",
  allAccounts: "▦  Усі акаунти",
  proxies: "⇄  Проксі",
  lists: "Списки",
  proxies_f1fa83d: "Проксі",
  passwordManager: "Менеджер паролів",
  accountsInFolder: "Акаунтів у папці: {count}",
  newFolder: "+ Нова папка",
  settings: "⚙  Налаштування",
  general: "Загальні",
  security: "◎  Безпека",
  recentActivity: "◷  Останні події",
  lockWithPIN: "▣  Заблокувати PIN",
  lockVault: "↗  Заблокувати",
  vaultEncrypted: "● Сховище зашифровано",
  newScheme: "Нова схема",
  lootSchemes: "Схеми Loot",
  createSeparateCollectionRoutesAndRunMultipleSchemesAtOnce:
    "Створюйте окремі маршрути збору й запускайте кілька схем одночасно.",
  noSchemesYet: "Ще немає схем",
  addSourcesWarehousesAndSenderRulesInANewWindow:
    "Додайте джерела, склади та правила відправлення в новому вікні.",
  message: "Перевірка",
  running: "Працює",
  scheduled: "За розкладом",
  manualStart: "Ручний запуск",
  sources: "Джерела",
  warehouses: "Склади",
  concurrentAccounts: "Паралельні акаунти",
  intervalHours: "Інтервал, годин",
  message_5fa7165: "Прогрес",
  offersSent: "Обмінів надіслано: {count}",
  withoutAnAllowedWarehouse: "Без дозволеного складу: {count}",
  openScheme: "Відкрити схему",
  stop: "Зупинити",
  remove: "Видалити",
  deleteLootScheme: "Видалити схему Loot?",
  stopTheSchemeAndCheckItsPendingOffersFirst:
    "Спочатку зупиніть схему й перевірте незавершені обміни.",
  dismissTheAuthenticatorReminder: "Приховати нагадування про Authenticator",
  addASecondLayerOfProtection: "Додайте другий рівень захисту",
  connectGoogleAuthenticatorToProtectAccessWithAOneTimeCode:
    "Підключіть Google Authenticator, щоб захистити вхід одноразовим кодом.",
  setUpAuthenticator: "Налаштувати Authenticator",
  folder: "Папка",
  searchByNameOrSteamID: "Пошук за назвою або Steam ID…",
  templateText: " акаунтів",
  noResults: "Нічого не знайдено",
  addYourFirstAccount: "Додайте перший акаунт",
  changeTheSearchOrFilters: "Змініть пошук або фільтри.",
  importAMaFileUsingTheSystemDialogSecretsStayInTheEncryptedVault:
    "Імпортуйте .maFile через захищений системний діалог. Секрети залишаться у зашифрованому сховищі.",
  auto: "⚡ Авто",
  manual: "Вручну",
  game: "Ігрові",
  banned: "Є блокування",
  noBan: "Без блокування",
  unknown: "Невідомо",
  checked: "Перевірено",
  vacBan: "Блокування VAC",
  gameBans: "Ігрові блокування",
  communityBan: "Блокування Community",
  allBanStates: "Усі статуси блокування",
  sessionStatus: "Статус сесії",
  allSessions: "Усі сесії",
  sessionSaved: "Сесію збережено",
  loginNeeded: "Потрібен вхід",
  proxyStatus: "Статус проксі",
  allProxyStatuses: "Усі статуси проксі",
  proxyConnected: "Проксі працює",
  unchecked: "Не перевірено",
  checking: "Перевіряється",
  proxyUnavailable: "Проксі недоступний",
  blocked: "Заблоковано",
  directConnection: "Пряме підключення",
  autoConfirmationMode: "Режим автопідтвердження",
  allModes: "Усі режими",
  anyAutoConfirmation: "Будь-яке автопідтвердження",
  marketSales: "Продажі маркету",
  marketPurchases: "Покупки маркету",
  trades: "Обміни",
  watchingIncomingOffers: "Відстеження вхідних обмінів",
  acceptingGifts: "Приймання подарунків",
  actionNeeded: "Потрібна дія",
  resetFilters: "Скинути фільтри",
  selectAllFilteredAccountsAllPages: "Обрати всі за фільтром (усі сторінки)",
  account: "Акаунт",
  session: "Сесія",
  individualProxies: "Окремі проксі",
  editFolder: "Редагувати папку",
  newFolder_09d9d8e: "Нова папка",
  title: "Назва",
  parentFolder: "Батьківська папка",
  noParentFolder: "Без батьківської папки",
  folderSaved: "Папку збережено",
  saveAndRedistributeProxies: "Зберегти й перерозподілити проксі",
  deleteFolder: "Видалити папку",
  deleteFolder_0595a9b: "Видалити папку?",
  confirmDeletionThisActionCannotBeUndone:
    "Підтвердьте видалення. Цю дію неможливо скасувати.",
  allAccounts_1fa9847: "← Усі акаунти",
  checkBans: "Перевірити блокування",
  noNewBanDataIsAvailableThePreviousStatusIsPreserved:
    "Нових даних про блокування немає. Попередній статус збережено.",
  checkFinishedSomeBanStatusesRemainUnknown:
    "Перевірку завершено. Частина статусів блокування залишається невідомою.",
  addNote: "Додати нотатку",
  editNote: "Редагувати нотатку",
  steamGuardSecretsAreMissingCodesAndConfirmationsAreUnavailable:
    "Секрети Steam Guard відсутні: коди й підтвердження недоступні.",
  mobileDevice: "Мобільний пристрій",
  steamPasswordSaved: "Пароль Steam збережено",
  noSteamPasswordSaved: "Пароль Steam не збережено",
  networkRoute: "Мережевий маршрут",
  unassignedNetworkRequestsBlocked:
    "Не призначено. Мережеві запити заблоковано.",
  currentRoute: "Поточний маршрут",
  proxySource: "Джерело проксі",
  enterManually: "Ввести вручну",
  freeProxyFromAList: "Вільний проксі зі списку",
  routePosition: "Позиція маршруту",
  primaryProxy: "Основний проксі",
  backupProxy: "Резервний проксі",
  thisAccountWillUseItsOwnRouteExistingProxiesRemainAsBackupsANew:
    "Акаунт використовуватиме власний маршрут. Наявні проксі залишаться резервними; новий резервний проксі додається в кінець.",
  proxyURL: "Адреса проксі",
  httpHostPortOrHostPortLoginPassword:
    "http://host:port або host:port:login:password",
  proxyList: "Список проксі",
  chooseAList: "Оберіть список",
  freeProxy: "Вільний проксі",
  proxyAssigned: "Проксі призначено",
  thisListHasNoFreeProxies: "У цьому списку немає вільних проксі.",
  accountSettings: "Налаштування акаунта",
  noFolder: "Без папки",
  inheritFolderProxies: "Успадковувати проксі папки",
  saveYourAccountSettingsChangesFirst:
    "Спочатку збережіть зміни налаштувань акаунта.",
  signingInToSteam: "Вхід у Steam",
  useSavedPassword: "Використати збережений пароль",
  steamPassword: "Пароль Steam",
  theSavedPasswordWillBeUsedLocallyWithoutDisplayingIt:
    "Пароль буде використано локально без показу",
  confirmationCodeIfNeeded: "Код підтвердження (за потреби)",
  waitingForSteamLoginTheSessionWillAppearAutomatically:
    "Очікуємо завершення входу Steam. Сесія з’явиться автоматично.",
  loginComplete: "Вхід завершено",
  logIn: "Увійти",
  confirmLogin: "Підтвердьте вхід",
  enterTheCodeFromEmailOrSteamGuard: "Введіть код із пошти або Steam Guard.",
  code: "Код",
  waitingForSteamLogin: "Очікуємо завершення входу Steam.",
  steamIsAwaitingConfirmationCheckTheCodeOrInstructions:
    "Steam очікує підтвердження. Перевірте код або інструкції.",
  confirm: "Підтвердити",
  noPendingConfirmations: "Немає запитів на підтвердження.",
  viewActionInBrowser: "Переглянути дію в браузері",
  steamRequest: "Запит Steam",
  thePreviousActionWasSentAutomaticRetriesAreBlockedCheckTheResultInSteam:
    "Попередню дію вже надіслано. Автоматичний повтор заблоковано; перевірте результат у Steam.",
  steamAcknowledgedTheRequestTradeCompletionIsUnverified:
    "Steam підтвердив запит, завершення угоди не перевірено",
  resultNeedsVerification: "Результат потребує перевірки",
  message_9f287fe: "Обмін",
  message_acde1a1: "Продаж маркету",
  accountRecovery: "Відновлення акаунта",
  apiKeyCreation: "Створення API-ключа",
  marketPurchase: "Покупка маркету",
  otherSteamConfirmationType: "Інше підтвердження Steam (тип {type})",
  manualConfirmationOnly: "Лише ручне підтвердження",
  reject: "Відхилити",
  done: "Готово",
  separateAccountAndFolderRoutesBackupsFollowTheSelectedOrder:
    "Окремі маршрути для акаунтів і папок. Резерви працюють за заданим порядком.",
  addProxy: "+ Додати проксі",
  withoutAssignedProxiesNetworkOperationsAreBlockedDirectModeIsDisabledByDefault:
    "Без призначеного проксі мережеві операції заблоковано. Пряме підключення не використовується.",
  noRoutesYet: "Маршрутів ще немає",
  addHTTPHTTPSOrSOCKS5HProxiesThenAssignThemToAnAccountOrFolder:
    "Додайте HTTP, HTTPS або SOCKS5H проксі, потім призначте їх папці чи акаунту.",
  deleteProxy: "Видалити проксі?",
  editProxy: "Редагувати проксі",
  newProxy: "Новий проксі",
  forExampleWarsaw01: "Наприклад, Варшава · 01",
  supportsHttpHttpsAndSocks5hCredentialsAreStoredInTheEncryptedVault:
    "Підтримуються http://, https:// та socks5h://. Облікові дані зберігаються у зашифрованому сховищі.",
  proxySaved: "Проксі збережено",
  proxyNotFound: "Проксі не знайдено.",
  vaultSecurity: "Безпека сховища",
  manageAccessAndBackups: "Керуйте доступом і резервними копіями.",
  enabled: "Увімкнено",
  disabled: "Вимкнено",
  accessPassword: "Пароль доступу",
  yourPasswordProtectsAccessToTheLocalVault:
    "Власний пароль захищає вхід до вашого локального сховища.",
  changePassword: "Змінити пароль",
  disablePassword: "Вимкнути пароль",
  notConfigured: "Не налаштовано",
  twoStepVerification: "Двоетапна перевірка",
  aCodeFromGoogleAuthenticatorOrACompatibleAppWhenUnlocking:
    "Код із Google Authenticator або іншого сумісного застосунку при розблокуванні.",
  disableTOTP: "Вимкнути TOTP",
  setUpTOTP: "Налаштувати TOTP",
  encryptedBackup: "Зашифрована резервна копія",
  saveAVaultCopyToAChosenLocationYourAccessFactorsAreNeededTo:
    "Збережіть копію сховища у вибраному місці. Для відновлення знадобляться ваші засоби доступу.",
  saveBackup: "Зберегти копію",
  backupOperationComplete: "Операцію резервного копіювання завершено",
  disablePassword_b7ad7b5: "Вимкнення пароля",
  changePassword_34f113e: "Зміна пароля",
  currentPassword: "Поточний пароль",
  authenticatorCode: "Код Authenticator",
  newPassword: "Новий пароль",
  confirmNewPassword: "Повторіть новий пароль",
  newPasswordMustContainAtLeast15Characters:
    "Новий пароль має містити щонайменше 15 символів.",
  newPasswordsDoNotMatch: "Нові паролі не збігаються.",
  passwordSettingsUpdated: "Налаштування пароля оновлено",
  authenticatorSetup: "Налаштування Authenticator",
  scanTheQRCodeInGoogleAuthenticatorOrEnterTheKeyManuallyThenEnter:
    "Відскануйте QR у Google Authenticator або додайте ключ вручну. Після цього введіть поточний шестизначний код.",
  authenticatorSetupQR: "QR для підключення Authenticator",
  twoStepVerificationEnabled: "Двоетапну перевірку увімкнено",
  activate: "Активувати",
  confirmYourCurrentVaultPasswordBeforeViewingTheAuthenticatorQRAndSecretKey:
    "Підтвердіть поточний пароль сховища, перш ніж показати QR і секретний ключ Authenticator.",
  theVaultPasswordIsDisabledAuthenticatorSetupUsesTheCurrentUnlockedSessionOnThis:
    "Пароль сховища вимкнено. Підключення Authenticator використовує поточний розблокований сеанс цього пристрою.",
  continue: "Продовжити",
  disableAuthenticator: "Вимкнення Authenticator",
  vaultPassword: "Пароль сховища",
  currentAuthenticatorCode: "Поточний код Authenticator",
  twoStepVerificationDisabled: "Двоетапну перевірку вимкнено",
  disable: "Вимкнути",
  settings_2aac460: "Налаштування",
  message_6e800d7: "Поведінка застосунку та журнал подій.",
  autoLockMinutes: "Автоблокування, хвилин",
  autoConfirmationIntervalSeconds: "Інтервал автопідтверджень, секунд",
  saveSettings: "Зберегти налаштування",
  settingsSaved: "Налаштування збережено",
  recentActivity_189c85b: "Останні події",
  noEventsYet: "Подій ще немає.",
  event: "Подія",
  directConnection_8593d25: "● Пряме підключення",
  proxyConnected_8390885: "● Проксі працює",
  blocked_8ee55d7: "● Заблоковано",
  proxyUnavailable_3d6fe2f: "● Проксі недоступний",
  checkingProxy: "◌ Перевірка проксі…",
  unchecked_839e0f8: "○ Не перевірено",
  checkTheAssignedProxiesFirst: "Спочатку перевірте призначені проксі",
  routeCheck: "Перевірка маршруту",
  directConnectionIsAllowedForAccountsWithoutARoute:
    "Пряме підключення дозволено для акаунтів без маршруту.",
  networkOperationsBlockedNoProxyIsAvailable:
    "Мережеві операції заблоковано: немає доступного проксі.",
  routeReadySteamWillUseTheAvailableProxy:
    "Маршрут готовий. Steam використовуватиме доступний проксі.",
  uncheckedProxiesCheckAgainToContinue:
    "Неперевірених проксі: {count}. Повторіть перевірку, щоб продовжити.",
  assignPrimaryAndBackupProxiesInAccountOrFolderSettings:
    "Призначте основний проксі та резерви в налаштуваннях акаунта або папки.",
  deferredProxies: "Відкладені проксі",
  directConnectionNoProxy: "Пряме з’єднання (без проксі)",
  primary: "Основний",
  message_6af24b8: "Резерв ",
  message_5160aea: " мс",
  connectionFailed: "Не вдалося підключитися",
  deferred: "Відкладено",
  active: "Активний",
  available: "Доступний",
  unavailable: "Недоступний",
  savedSessions: "Збережені сесії",
  automaticConfirmations: "Автопідтвердження",
  autoMarketSales: "Авто: продажі маркету",
  autoMarketPurchases: "Авто: покупки маркету",
  autoTrades: "Авто: обміни",
  allAccounts_f69787c: "Усі акаунти",
  proxyLists: "Списки проксі",
  translationTable:
    "seconds|с|с\nFolders|Папки|Папки\nNew folder|Нова папка|Новая папка\nEdit folder|Редагувати папку|Изменить папку\nDelete folder|Видалити папку|Удалить папку\nBackup|Резервна копія|Резервная копия\nLock|Заблокувати|Заблокировать\n2fa (not steam)|2fa (not steam)|2fa (not steam)\nSearch issuer or account|Пошук сервісу або акаунта|Поиск сервиса или аккаунта\nAdd account|Додати акаунт|Добавить аккаунт\nImport|Імпорт|Импорт\nSelect all filtered|Обрати всі за фільтром|Выбрать все по фильтру\nMove selected to folder|Папка для вибраних|Папка для выбранных\nMove selected|Перемістити вибрані|Переместить выбранные\nDelete selected|Видалити вибрані|Удалить выбранные\nNo folder|Без папки|Без папки\nAll accounts|Усі акаунти|Все аккаунты\nNo accounts found|Акаунтів не знайдено|Аккаунты не найдены\nSelect|Обрати|Выбрать\nHidden code|••• •••|••• •••\nCode copied|Код скопійовано|Код скопирован\nCopy code|Копіювати код|Копировать код\nEdit|Редагувати|Изменить\nNext HOTP code|Наступний код HOTP|Следующий код HOTP\nSeconds remaining|Залишилось секунд|Осталось секунд\nClose|Закрити|Закрыть\nCancel|Скасувати|Отмена\nConfirm this action?|Підтвердити цю дію?|Подтвердить это действие?\nConfirm|Підтвердити|Подтвердить\nFolder name|Назва папки|Название папки\nSave|Зберегти|Сохранить\nEdit account|Редагувати акаунт|Изменить аккаунт\nIssuer|Сервіс|Сервис\nAccount|Акаунт|Аккаунт\nBase32 secret|Секрет Base32|Секрет Base32\nLeave the secret empty to keep it unchanged.|Залиште секрет порожнім, щоб зберегти поточний.|Оставьте секрет пустым, чтобы сохранить текущий.\nEnter the Base32 secret from the service setup screen. It stays encrypted in your vault.|Введіть секрет Base32 з екрана налаштування сервісу. Він зберігається зашифрованим у сховищі.|Введите секрет Base32 с экрана настройки сервиса. Он хранится зашифрованным в хранилище.\nType|Тип|Тип\nAlgorithm|Алгоритм|Алгоритм\nDigits|Кількість цифр|Количество цифр\nPeriod (seconds)|Період, секунд|Период, секунд\nCounter|Лічильник|Счётчик\nFolder|Папка|Папка\nImport accounts|Імпорт акаунтів|Импорт аккаунтов\nGoogle Authenticator: open Transfer accounts → Export accounts, select the accounts, then save or capture every QR code. Import all images together; nothing is uploaded.|Google Authenticator: відкрийте «Перенести акаунти» → «Експорт акаунтів», виберіть акаунти та збережіть або зробіть знімок кожного QR-коду. Імпортуйте всі зображення разом; нічого не надсилається в мережу.|Google Authenticator: откройте «Перенести аккаунты» → «Экспорт аккаунтов», выберите аккаунты и сохраните или сделайте снимок каждого QR-кода. Импортируйте все изображения вместе; ничего не загружается в сеть.\nAuthenticator URIs|URI автентифікатора|URI аутентификатора\nChoose QR images or text files|Обрати QR-зображення або текстові файли|Выбрать QR-изображения или текстовые файлы\nReview import|Перевірка імпорту|Проверка импорта\nDuplicate|Дублікат|Дубликат\nDuplicates|Дублікати|Дубликаты\nSkip existing|Пропустити наявні|Пропустить существующие\nReplace existing|Замінити наявні|Заменить существующие\nApply import|Застосувати імпорт|Применить импорт\nImport complete|Імпорт завершено|Импорт завершён\nLocked|Заблоковано|Заблокировано\nНеповний пакет імпорту 2FA.|Неповний пакет імпорту 2FA.|Неполный пакет импорта 2FA.",
  message_43f5d75: "Неповний пакет імпорту 2FA.",
  uaText: "Неповний пакет імпорту 2FA. Імпортуйте всі частини QR разом.",
  ruText: "Неполный пакет импорта 2FA. Импортируйте все части QR вместе.",
  couldNotSaveTheVaultTheBackupMayHaveDifferentAccessSettingsKeepBoth:
    "Не вдалося зберегти сховище. Резервна копія може мати інші налаштування доступу; збережіть обидва файли.",
  couldNotSaveTheVaultTheBackupMayHaveDifferentAccessSettingsKeepBoth_7256876:
    "Не удалось сохранить хранилище. Резервная копия может иметь другие настройки доступа; сохраните оба файла.",
  couldNotSafelySaveTheBackup: "Не вдалося безпечно зберегти резервну копію.",
  couldNotSafelySaveTheBackup_2b23b22:
    "Не удалось безопасно сохранить резервную копию.",
  message_80bec8e: "Некоректні дані менеджера 2FA.",
  message_1378d1a:
    "Некорректные данные менеджера 2FA. Проверьте секрет и настройки аккаунта.",
  message_86040dc: "Запис 2FA не знайдено.",
  message_14ee023: "Запись 2FA не найдена.",
  message_79b93c1: "Запис 2FA змінено. Оновіть дані.",
  message_a2c58de: "Запись 2FA изменена. Обновите данные.",
  message_1c9977f: "Папку 2FA не знайдено.",
  message_e3307f5: "Папка 2FA не найдена.",
  message_6a7ebe1: "Попередній перегляд 2FA застарів.",
  message_2698807: "Предварительный просмотр 2FA устарел. Повторите импорт.",
  message_a032ca6: "Повторювані записи в імпорті 2FA.",
  message_8ac7996: "Повторяющиеся записи в импорте 2FA.",
  invalidBrowserProfileFields: "Некоректні поля профілю браузера.",
  invalidBrowserProfile: "Некоректний профіль браузера.",
  browserProfileGenerationExhausted:
    "Ліміт поколінь профілю браузера вичерпано.",
  applyThisField: "Застосувати це поле",
  cookiesHistoryAndStoragePersistForThisWindowsUserSeparatelyFromVaultBackupAnd:
    "Cookies, історія та сховище зберігаються для цього користувача Windows окремо від резервної копії й експорту сховища.",
  stockChromiumPageLevelChangesFullFingerprintIsolationIsNotGuaranteedNativeUAAnd:
    "Звичайний Chromium; зміни на рівні сторінок. Повної ізоляції fingerprint не гарантує. UA та ОС залишаються рідними; мова й часовий пояс — вручну або системні; геолокація не рандомізується.",
  generationChangesTheFingerprintWithoutClearingBrowserDataReopenTheBrowserToApply:
    "Генерація змінює відбиток без очищення даних браузера. Відкрийте браузер повторно для застосування.",
  accounts: "Акаунти",
  generation: "Генерація",
  onlyCheckedFieldsChangeForEverySelectedAccountGenerationCreatesASeparateFingerprintFor:
    "Лише позначені поля зміняться для всіх вибраних акаунтів. Генерація створює окремий відбиток кожному.",
  browserLanguage: "Мова браузера",
  timezone: "Часовий пояс",
  screenReportedToWebsites: "Екран для сайтів",
  cpuThreads: "Потоки CPU",
  memoryGB: "Пам’ять (ГБ)",
  geolocation: "Геолокація",
  blockThirdPartyCookies: "Блокувати сторонні cookies",
  yes: "Так",
  no: "Ні",
  native: "Рідний",
  noise: "Шум",
  block: "Блокувати",
  ask: "Запитувати",
  protected: "Захищений",
  newFingerprintForEach: "Новий fingerprint для кожного",
  newFingerprint: "Новий fingerprint",
  apply: "Застосувати",
  checkFieldsToChange: "Позначте поля для зміни.",
  close: "Закрити",
  closeTheSelectedAccountsBrowsersFirst:
    "Спочатку закрийте браузери вибраних акаунтів.",
  working: "Виконання операції…",
  running_af4dd92: "Виконується",
  completed: "Завершено",
  failed: "Помилка",
  profilesSavedReopenTheBrowser:
    "Профілі збережено. Відкрийте браузер повторно.",
  validationMessage: "Запит застарів",
  itemNameUnavailable: "Назва предмета недоступна",
  requestDetails: "Деталі запиту",
  imageUnavailable: "Зображення недоступне",
  loadingDetails: "Завантаження деталей…",
  counterparty: "Контрагент",
  onlyTheFirst100ItemRowsAreShownMoreItemsWereOmittedReviewThe:
    "Показано лише перші 100 рядків предметів. Решту пропущено. Перевірте повний обмін у Steam перед підтвердженням.",
  someImagesAreUnavailableAllItemsAndQuantitiesAreShownBelow:
    "Частина зображень недоступна. Усі предмети та кількості показано нижче.",
  steamDidNotProvideCounterpartyDetails: "Steam не надав дані контрагента.",
  youGive: "Ви віддаєте",
  youReceive: "Ви отримуєте",
  itemsDirectionUnknown: "Предмети — напрямок не визначено",
  show100MoreStacks: "Показати ще 100 стеків",
  stacksShownOfRemaining:
    "Показано стеків: {shown} із {total}. Залишилось: {remaining}.",
  steamProvidedIncompleteItemDataCheckTheRequestTextBeforeConfirming:
    "Steam надав неповні дані предметів. Перевірте текст запиту перед підтвердженням.",
  steamData: "Дані Steam",
  fullSteamText: "Повний текст Steam",
  steamProvidedNoAdditionalDetails: "Steam не надав додаткових деталей.",
  tryAgain: "Повторити",
  message_181bf51: "Українська",
  message_5537fc8: "Русский",
  dark: "Темна",
  light: "Світла",
  language: "Мова",
  theme: "Тема",
  search: "Пошук…",
  templateText_a5f4179: "Порядок: ",
  moveUp: "Вгору",
  moveDown: "Вниз",
  eachAccountReceivesOneProxyFromEachListTheFirstListProvidesThePrimary:
    "Кожен акаунт отримує один проксі з кожного списку. Перший список — основний маршрут, наступні — резервні.",
  listOrder: "Порядок списків",
  proxyAllocation: "Розподіл проксі",
  accountRoutes: "Маршрути акаунтів",
  importedAccountRoutes: "Маршрути імпортованих акаунтів",
  keepManualRoutesUseFolderLists:
    "Зберегти ручні маршрути / Використати списки папки",
  useFolderListsKeepImportedRoutes:
    "Використати списки папки / Зберегти з імпорту",
  chooseListsAndIndividualProxies: "Вибрати списки та окремі проксі",
  individualProxiesAreAddedManuallyAsAdditionalRoutesReusingProxiesFromListsRequiresSeparate:
    "Окремі проксі додаються вручну як додаткові маршрути. Повторне використання проксі зі списків потребує окремого підтвердження.",
  couldNotPrepareProxyAllocation: "Не вдалося підготувати розподіл проксі.",
  proxyAllocationApplied: "Розподіл проксі застосовано",
  reviewProxyAllocation: "Перевірка розподілу проксі",
  newAccountsUpdatedExisting:
    "Нових акаунтів: {imported}. Оновлених: {updated}. Наявних: {duplicates}.",
  passwordsToAdd: "Паролів буде додано: {count}",
  accountsToAllocate: "Акаунтів для розподілу: {count}",
  availableRequiredShort:
    "Доступно: {available}. Потрібно: {required}. Бракує: {shortage}.",
  thisListHasNoProxiesAddProxiesToTheListBeforeAllocating:
    "У цьому списку немає проксі. Додайте проксі до списку перед розподілом.",
  distinctProxiesAreAssignedFirstOnlyAccountsWithoutAProxyReuseThisListS:
    "Спочатку призначаються різні проксі. Лише акаунти, яким їх бракує, повторно отримають проксі цього списку по колу.",
  allowReuseFromListForAccounts:
    "Дозволити повторне використання зі списку «{name}» для {count} акаунтів.",
  assignAvailableSpareProxies: "Призначити вільні резервні проксі",
  maximumSpareProxiesPerAccount: "До резервних проксі на акаунт",
  availableAccountsSparesToAssign:
    "Вільних: {available}. Акаунтів: {accounts}. Буде призначено резервних: {total}.",
  ifThereAreTooFewFreeProxiesForAFullRoundTheLastAccounts:
    "Якщо вільних проксі недостатньо для повного кола, останні акаунти отримають менше резервних.",
  confirmAllocation: "Підтвердити розподіл",
  importProxies: "Імпорт проксі",
  source: "Джерело",
  fromFiles: "Із файлів",
  pasteText: "Вставити текст",
  listName: "Назва списку",
  protocol: "Протокол",
  oneProxyPerLineHostPortHostPortUserPasswordOrURLSOCKS5Uses:
    "Один проксі на рядок: host:port, host:port:user:password або URL. SOCKS5 використовує віддалений DNS.",
  proxyText: "Текст проксі",
  templateText_01cecfd: "Імпортовано: ",
  templateText_27ccd5d: " · Дублікати: ",
  import_68f804f: "Імпортувати",
  editList: "Редагувати список",
  newList: "Новий список",
  listMembersAndOrder: "Склад і порядок списку",
  listSaved: "Список збережено",
  editAddresses: "Редагувати адреси",
  skipVACBannedAccounts: "Пропустити акаунти з VAC-блокуванням",
  skipCommunityBannedAccounts: "Пропустити акаунти з Community-блокуванням",
  skippedVACCommunityChecked:
    "Пропущено VAC: {vac}. Community: {community}. Перевірено: {checked}.",
  banStatusIsUnknownForAccountsTheyCannotBeConsideredChecked:
    "Статус блокування невідомий для {count} акаунтів. Їх не можна вважати перевіреними.",
  importAccounts: "Імпорт акаунтів",
  filesMaFileJSONTXTSteamsession: "Файли .maFile / JSON / TXT / .steamsession",
  oneAccountFromText: "Один акаунт із тексту",
  folderGroup: "Папка → група",
  format: "Формат",
  autoDetect: "Автовизначення",
  importSmartSDA: "Імпорт smart-auth",
  tradeBotsSystemOneJSONMultipleFilesOrAPackageFolderWithManifestJson:
    "Trade Bots System: один JSON, кілька файлів або папка пакета з manifest.json. Проксі та прив’язки імпортуються з перевіреного пакета.",
  autoDetectChecksStructureSIHNebulaSDADepsNanSelectTheExpectedFormatIncompatible:
    "Автовизначення перевіряє структуру. SIH / Nebula / SDA / Deps / Nan задають очікуваний формат; несумісні записи буде позначено перед імпортом.",
  accountText: "Текст акаунта",
  singleAccountJSONOrLoginPasswordSecretsAreProcessedLocallyAndExcludedFromThe:
    "JSON одного акаунта або логін:пароль. Секрети обробляються локально й не потрапляють у попередній перегляд.",
  reviewBeforeImport: "Переглянути перед імпортом",
  importReview: "Перевірка імпорту",
  templateText_6d248a2: "Готово: ",
  templateText_565159c: " · Помилки: ",
  passwordsToAddConflicts:
    "Паролів буде додано: {added}. Конфліктів: {conflicts}.",
  existingPasswordsAreNeverOverwrittenConflictingRecordsAreSkipped:
    "Наявні паролі не перезаписуються. Конфліктні записи пропущено.",
  templateText_220d5be: "Буде створено папку: ",
  passwordWillBeAdded: "Буде додано пароль",
  passwordAddition: "Доповнення пароля",
  duplicate: "Дублікат",
  ready: "Готовий",
  importErrors: "Помилки імпорту",
  back: "Повернутися",
  applyImport: "Застосувати імпорт",
  importCompleted: "Імпорт завершено",
  processed: "Оброблено: {processed} / {total}",
  bulkOperationProgress: "Перебіг масової операції",
  queued: "У черзі",
  awaitingConfirmation: "Очікує підтвердження",
  cancelled: "Скасовано",
  reviewConfirmations: "Перевірка підтверджень",
  sendingConfirmations: "Надсилання підтверджень",
  closeBrowsers: "Закрити браузери",
  selected: "Вибрано: {count}",
  accountsMoved: "Акаунти переміщено",
  export: "Експорт",
  logInToSteam_097c47f: "Увійти у Steam",
  browserProfiles: "Профілі браузера",
  confirmMarket: "Підтвердити маркет",
  confirmMarketPurchases: "Підтвердити покупки маркету",
  confirmTrades: "Підтвердити обміни",
  chooseAction: "Оберіть дію",
  bulkAction: "Масова дія",
  run: "Виконати",
  selectAtLeastOneAccount: "Виберіть хоча б один акаунт.",
  proxyChecksUseTheBulkOperationSettings:
    "Перевірка проксі використовує налаштування масових операцій.",
  workingProxies: "Проксі працює: {count}",
  runningConcurrently: "Виконується одночасно: {count}",
  stopRemaining: "Зупинити решту",
  queueStopped: "Чергу зупинено",
  proxyChecksComplete: "Перевірку проксі завершено",
  accountFromVault: "Акаунт зі сховища",
  chooseAccount: "Оберіть акаунт",
  externalSteamID64: "Зовнішній SteamID64",
  steamAdministrators: "Адміністратори Steam",
  trustedSteamID64sWatchingIncomingOffersAutomaticallyAcceptsAnyTradeFromThemIncludingGivingYour:
    "Довірені SteamID64: відстеження вхідних обмінів автоматично приймає будь-який обмін від них, включно з передаванням ваших предметів. Список порожній за замовчуванням.",
  steamAdministratorsSaved: "Адміністраторів Steam збережено",
  noSteamAdministrators: "Немає адміністраторів Steam",
  addAdministrator: "Додати адміністратора",
  enterAValidPersonalSteamID64:
    "Введіть коректний SteamID64 особистого акаунта.",
  thisSteamID64IsAlreadyAdded: "Цей SteamID64 вже додано.",
  refreshAvatars: "Оновити аватари",
  steamBanChecks: "Перевірка блокувань Steam",
  steamWebAPIKey: "Ключ Steam Web API",
  saved: "Збережено",
  theKeyIsEncryptedAndExcludedFromAccountExportsVACIsAvailableWithoutA:
    "Ключ зберігається зашифрованим і не включається в експорт акаунтів. VAC доступний без ключа; ігрові та Community-блокування залишаються невідомими до перевірки з ключем.",
  saveKey: "Зберегти ключ",
  removeKey: "Видалити ключ",
  appBehaviorSecurityAndBrowser: "Поведінка застосунку, безпека та браузер.",
  appearance: "Вигляд",
  accountsPerPage: "Акаунтів на сторінці",
  network: "Мережа",
  allowDirectConnectionWithoutARoute:
    "Дозволити пряме підключення без маршруту",
  onlyForAccountsWithNoAssignedProxiesOrListsAFailedProxyNeverFalls:
    "Лише для акаунтів без призначених проксі чи списків. Після помилки проксі прямого резервного підключення ніколи немає.",
  showProxyUsernamesAndPasswords: "Показувати логіни та паролі проксі",
  hideTheVaultProtectionReminder: "Приховувати повідомлення про захист сховища",
  showIconInTheSystemTray: "Показувати значок у системному треї",
  minimizeToTray: "Згортати у трей",
  closeWindowToTray: "Закривати вікно у трей",
  trayAccountsUpTo10: "Акаунти у треї (до 10)",
  searchAccountsForTheTray: "Пошук акаунтів для трея",
  systemTray: "Системний трей",
  searchShowsUpTo20MatchesTrayActionsOpenAReviewBeforeConfirmation:
    "Пошук показує до 20 збігів. Дії трея відкривають перевірку перед підтвердженням.",
  bulkOperations: "Масові операції",
  concurrentAccountTasks: "Одночасних завдань акаунтів",
  concurrentProxyChecks: "Одночасних перевірок проксі",
  concurrentBrowserLaunches: "Одночасних запусків браузера",
  delayBetweenTaskStartsMs: "Пауза між стартами завдань, мс",
  delayBetweenBrowserStartsMs: "Пауза між стартами браузера, мс",
  thisIsOurConservativeStartingProfileNotGuaranteedValveLimitsChangesApplyToNew:
    "Це наш обережний початковий профіль, а не гарантовані ліміти Valve. Зміни застосовуються до нових операцій після збереження.",
  networkProtectionUpTo12ConcurrentHTTPRequestsOneRequestPerRouteAndServer:
    "Мережевий захист: до 12 HTTP-запитів одночасно; один запит на маршрут і сервер, пауза щонайменше 750 мс. Для одного акаунта — щонайменше 500 мс між запитами.",
  restoreRecommendedValues: "Відновити рекомендовані",
  locking: "Блокування",
  pinLockAfterInactivityMinutes: "PIN-блокування після бездіяльності, хвилин",
  passwordLockAfterInactivityMinutes:
    "Парольне блокування після бездіяльності, хвилин",
  text0DisablesTheCorrespondingTimerBothTimersStartFromTheLastUserActivityThe:
    "0 вимикає відповідний таймер. Обидва відліки починаються з останньої дії користувача. Парольний таймер продовжується під PIN-блокуванням; коротший парольний таймер спрацьовує першим.",
  pinHidesAccountsAndStopsOperationsButRetainsTheKeyInMemoryPasswordLock:
    "PIN приховує акаунти й зупиняє операції, але ключ лишається в оперативній пам’яті. Парольне блокування очищує ключ і секрети. Після перезапуску потрібне повне розблокування.",
  aSuccessfulPINUnlockRestartsBothTimersAnIncorrectPINDoesNotExtendThe:
    "Успішний PIN-вхід починає обидва відліки заново. Невірний PIN не подовжує сеанс.",
  setTheCheckIntervalInAccountSettingsOrForSelectedAccounts:
    "Інтервал перевірки задається окремо в налаштуваннях акаунта або для вибраних акаунтів.",
  chromiumBrowser: "Браузер Chromium",
  separateBrowserWebSession: "Окрема вебсесія браузера",
  steamWebInTheBrowserUsesChromeOnWindowsAndIsSavedSeparatelyFrom:
    "Steam Web у браузері використовує Chrome на Windows і зберігається окремо від сесії автентифікатора. Якщо вимкнути, браузер використовує сесію автентифікатора, як раніше.",
  maximumOpenAccounts: "Максимум відкритих акаунтів",
  browserAppearanceAndLanguage: "Вигляд і мова браузера",
  browserTheme: "Тема браузера",
  systemDefault: "Як у системі",
  browserBookmarks: "Закладки браузера",
  showBookmarksBar: "Показувати панель закладок",
  bookmarkTitle: "Назва закладки",
  bookmarkURL: "Адреса закладки",
  removeBookmark: "Видалити закладку",
  addBookmark: "Додати закладку",
  upTo100BookmarksTitlesCanContainUpTo120CharactersURLsMustUse:
    "До 100 закладок. Назва — до 120 символів; адреса — HTTP або HTTPS без логіна та пароля.",
  theSavedListIsAddedToEachNewProfileBookmarkChangesMadeInChromium:
    "Збережений список додається до кожного нового профілю. Зміни закладок у Chromium не синхронізуються зі smart-auth.",
  changingBrowserSettingsClosesOpenWindowsNewSettingsApplyTheNextTimeYouOpen:
    "Зміна налаштувань браузера закриває відкриті вікна. Нові параметри застосовуються під час наступного відкриття.",
  browserExtensions: "Розширення браузера",
  allEnabledExtensionsArePinnedToTheBrowserToolbar:
    "Усі ввімкнені розширення закріплено на панелі браузера.",
  enableSmartTrader: "Увімкнути Smart Trader",
  automaticallyAcceptSmartTraderSInitialAgreement:
    "Автоматично приймати початкову угоду Smart Trader",
  onFirstRunChecksAllLicenseThirdPartyServiceAndAutomationCheckboxesAndClicks:
    "Під час першого запуску позначає всі прапорці ліцензії, сторонніх сервісів та автоматизації й натискає кнопку підтвердження незалежно від мови.",
  alsoAutomaticallyClicksAllowInSmartTraderSPermissionDialogTheAgreementPermissionsAnd:
    "Також автоматично натискає Allow у вікні дозволів Smart Trader. Угода, дозволи й налаштування розширення зберігаються в цьому профілі браузера.",
  additionalChromeWebStoreExtensionsOneLinkPerLine:
    "Додаткові розширення Chrome Web Store — одне посилання на рядок",
  eachAccountHasItsOwnWindowAndProfileAnAssignedProxyIsRequiredThere:
    "Окреме вікно й профіль для кожного акаунта. Потрібен призначений проксі; прямого резервного підключення немає.",
  lockingTheAppClosesItsBrowsersChangingExtensionSettingsAlsoClosesOpenWindows:
    "Блокування програми закриває браузери. Зміна налаштувань розширень також закриває відкриті вікна.",
  upTo20ManifestV3ExtensionsInTotalIncludingSmartTraderWhenEnabledExtensions:
    "До 20 розширень Manifest V3 загалом, включно з увімкненим Smart Trader. Розширення з доступом до проксі, nativeMessaging або debugger не підтримуються.",
  closeAllBrowsers: "Закрити всі браузери",
  notifications: "Сповіщення",
  showSystemNotifications: "Показувати системні сповіщення",
  playSound: "Відтворювати звук",
  notifyAboutErrors: "Сповіщати про помилки",
  volume: "Гучність",
  testNotification: "Тестове сповіщення",
  theVaultS20MostRecentEventsNewestFirst:
    "Останні 20 подій сховища, від найновіших.",
  newList_e9b6916: "+ Новий список",
  templateText_074ef29: "Проксі: ",
  deleteList: "Видалити список?",
  importCancelledCorrectTheErrorsAndTryAgain:
    "Імпорт скасовано. Виправте помилки та повторіть.",
  pastedText: "Вставлений текст",
  invalidProxyURL: "Некоректна адреса проксі.",
  accessSecurity: "Безпека доступу",
  passwordEnabled: "Пароль увімкнено",
  passwordDisabled: "Пароль вимкнено",
  enablePassword: "Увімкнути пароль",
  quickPIN: "Швидкий PIN",
  a612DigitPINQuicklyRestoresTheCurrentSessionItDoesNotReplace:
    "PIN — 6–12 цифр для швидкого повернення в поточний сеанс. Він не замінює пароль або Authenticator.",
  changePIN: "Змінити PIN",
  setUpPIN: "Налаштувати PIN",
  disablePIN: "Вимкнути PIN",
  vaultEncryption: "Шифрування сховища",
  passwordProtectionScrypt256MiBAndAES256GCM:
    "Парольний захист: scrypt (256 МіБ) та AES-256-GCM.",
  passwordProtectedVaultsAutomaticallyUpgradeToScrypt256MiBAndAES256GCMAfter:
    "Парольне сховище автоматично переходить на scrypt (256 МіБ) та AES-256-GCM після повного розблокування.",
  passwordProtectionIsOffFileProtectionReliesOnWindowsAccessControls:
    "Пароль вимкнено. Захист файла покладається на засоби доступу Windows.",
  localTOTPVerifiesAccessToTheAppButIsNotAnIndependentFactorFor:
    "Локальний TOTP перевіряє вхід у застосунок, але не є окремим фактором шифрування файла сховища.",
  yourCurrentPasswordIsShorterThan15CharactersChangeItToALongerUnique:
    "Чинний пароль коротший за 15 символів. Змініть його на довшу унікальну парольну фразу.",
  disablePIN_2be7521: "Вимкнення PIN",
  changePIN_96db4dc: "Зміна PIN",
  pinSetup: "Налаштування PIN",
  changingPINRequiresTheCurrentPasswordAndAuthenticatorCodeWhenTheseProtectionsAreEnabled:
    "Зміна PIN потребує чинного пароля та коду Authenticator, якщо ці засоби захисту увімкнено.",
  newPIN: "Новий PIN",
  confirmPIN: "Повторіть PIN",
  pinMustContain612Digits: "PIN має містити від 6 до 12 цифр.",
  pinsDoNotMatch: "PIN-коди не збігаються.",
  pinDisabled: "PIN вимкнено",
  pinSaved: "PIN збережено",
  quickLOCK: "ШВИДКЕ БЛОКУВАННЯ",
  enterPIN: "Введіть PIN",
  unlockWithPassword: "Розблокувати паролем",
  thePasswordTimerContinuesDuringPINLockWhenEnabled:
    "Парольний таймер продовжується під PIN-блокуванням, якщо його ввімкнено.",
  thisChangesOnlyThePasswordInTheLocalVaultItDoesNotChangeYour:
    "Змінюється лише пароль у локальному сховищі. Пароль облікового запису на серверах Steam не змінюється; вхід автоматично не виконується.",
  newSavedPassword: "Новий збережений пароль",
  confirmSavedPassword: "Повторіть збережений пароль",
  enterAValidSavedPassword: "Введіть коректний збережений пароль.",
  savedPasswordUpdated: "Збережений пароль оновлено",
  savedSteamPassword: "Збережений пароль Steam",
  thePasswordIsAvailableOnlyInThisDialogCloseItToRemoveThePassword:
    "Пароль доступний лише в цьому вікні. Закрийте його, щоб прибрати пароль з екрана.",
  show: "Показати",
  hide: "Приховати",
  noteSaved: "Нотатку збережено",
  selectedAccounts: "Вибрано акаунтів: {count}",
  actionFailedCheckTheInputProxiesAndSession:
    "Не вдалося виконати дію. Перевірте дані, проксі та стан сесії.",
  confirmationsToApprove: "Буде підтверджено: {count}",
  market: "Маркет",
  approveReviewedConfirmations: "Підтвердити перевірені",
  confirmed: "Підтверджено: {count}",
  browserLimitExceededChangeItInSettings:
    "Перевищено ліміт браузерів. Змініть його в налаштуваннях.",
  preparingSessionsProxiesAndExtensions:
    "Підготовка сесій, проксі та розширень…",
  browsersOpened: "Браузерів відкрито: {count}",
  queueComplete: "Чергу завершено",
  bulkSteamLogin: "Масовий вхід у Steam",
  starting: "Запуск…",
  successfulAwaitingApproval:
    "Успішно: {complete}. Очікують підтвердження: {pending}.",
  stoppingCancelsRemainingQueuedAccountsAttemptsAlreadyStartedMayFinish:
    "Зупинка скасовує решту черги; розпочаті спроби можуть завершитися.",
  checksCompletedUnknown:
    "Перевірок завершено: {complete}. Невідомо: {pending}.",
  exportAccounts: "Експорт акаунтів",
  classicMaFileSDANebula: "Класичні maFile (SDA/Nebula)",
  includeProxies: "Включити проксі",
  encryptExport: "Шифрувати експорт",
  exportPassword: "Пароль експорту",
  confirmExportPassword: "Повторіть пароль експорту",
  unencryptedExportContainsPasswordsSessionsAnd2FASecretsStoreItSecurely:
    "Незашифрований експорт містить паролі, сесії та секрети 2FA. Зберігайте файл у захищеному місці.",
  exportPasswordMustContainAtLeast15Characters:
    "Пароль експорту має містити щонайменше 15 символів.",
  accountsExported: "Експортовано акаунтів: {count}",
  saveExport: "Зберегти експорт",
  chooseASmartSDAFileEnterItsPasswordIfEncryptedLeaveTheFieldEmpty:
    "Виберіть файл smart-auth. Для зашифрованого файлу введіть його пароль; для відкритого залиште поле порожнім.",
  filePassword: "Пароль файлу",
  keepImportedFolders: "Зберегти папки з імпорту",
  chooseFileAndReview: "Вибрати файл і переглянути",
  reviewTradeBotsSystemImport: "Перевірка імпорту Trade Bots System",
  reviewSmartSDAImport: "Перевірка імпорту smart-auth",
  readyDuplicates: "Готово: {ready}. Дублікати: {duplicates}.",
  foldersProxies: "Папки: {groups}. Проксі: {proxies}.",
  encryptedFile: "Зашифрований файл",
  unencryptedFile: "Незашифрований файл",
  automaticConfirmationsAreDisabledForNewAndReplacedAccountsReviewAccountsBeforeEnablingRules:
    "Для нових і замінених акаунтів автопідтвердження вимкнено. Перевірте акаунти перед увімкненням правил.",
  existingAccounts: "Наявні акаунти",
  skip: "Пропустити",
  replace: "Замінити",
  fillMissingFields: "Доповнити відсутнє",
  cancelEntireImport: "Скасувати весь імпорт",
  replaceImportedFieldsReplaceStoredValuesAccountIDAndHistoryRemainAutomaticConfirmationsAre:
    "Замінити: імпортовані поля замінять збережені. ID акаунта та історія залишаться; автопідтвердження буде вимкнено.",
  fillMissingFieldsAddOnlyAMissingPasswordAvatarNoteAndWhollyAbsentSession:
    "Доповнити: додати лише відсутні пароль, аватар, нотатку та повністю відсутню сесію. Наявні поля й налаштування не змінюються.",
  skipExistingAccountsRemainUnchanged:
    "Пропустити: наявні акаунти не змінюються.",
  checkingAndConfirmations: "Перевірка та підтвердження",
  checkConfirmationsPeriodically: "Періодично перевіряти підтвердження",
  notifyAboutNewConfirmations: "Сповіщати про нові підтвердження",
  automaticallyConfirmMarketListings:
    "Автоматично підтверджувати продажі маркету",
  automaticallyConfirmMarketPurchases:
    "Автоматично підтверджувати покупки маркету",
  automaticallyConfirmTrades: "Автоматично підтверджувати обміни",
  watchIncomingTradeOffers: "Відстежувати вхідні обміни",
  automaticallyAcceptGifts: "Автоматично приймати подарунки",
  unchanged: "Без змін",
  enable: "Увімкнути",
  intervalSeconds: "Інтервал, секунд",
  intervalSecondsBlankToKeepUnchanged: "Інтервал, секунд (порожньо — без змін)",
  periodicCheckingControlsConfirmationsAndNotificationsIncomingOffersAndGiftsHaveSeparateRules:
    "Періодична перевірка керує підтвердженнями та сповіщеннями. Вхідні обміни й подарунки мають окремі правила.",
  anEnabledRuleAllowsConfirmationWithoutAnotherPrompt:
    "Увімкнене правило дозволяє підтвердження без додаткового запиту.",
  intervalMustBeAnIntegerFrom30To86400Seconds:
    "Інтервал має бути цілим числом від 30 до 86400 секунд.",
  confirmationRulesSaved: "Правила підтверджень збережено",
  translationTable_9b39cee:
    "Ігрові|Game|Игровые\nІгрові блокування|Game bans|Игровые блокировки\nНових даних про блокування немає. Попередній статус збережено.|No new ban data is available. The previous status is preserved.|Новых данных о блокировках нет. Предыдущий статус сохранён.\nПеревірку завершено. Частина статусів блокування залишається невідомою.|Check finished. Some ban statuses remain unknown.|Проверка завершена. Часть статусов блокировки остаётся неизвестной.\nПеревірка блокувань Steam|Steam ban checks|Проверка блокировок Steam\nКлюч Steam Web API|Steam Web API key|Ключ Steam Web API\nЗберегти ключ|Save key|Сохранить ключ\nВидалити ключ|Remove key|Удалить ключ\nЗбережено|Saved|Сохранено\nКлюч зберігається зашифрованим і не включається в експорт акаунтів. VAC доступний без ключа; ігрові та Community-блокування залишаються невідомими до перевірки з ключем.|The key is encrypted and excluded from account exports. VAC is available without a key; Game and Community bans stay unknown until checked with a key.|Ключ хранится зашифрованным и не включается в экспорт аккаунтов. VAC доступен без ключа; игровые и Community-блокировки остаются неизвестными до проверки с ключом.\nБлокування VAC|VAC ban|Блокировка VAC\nБлокування Community|Community ban|Блокировка Community\nУсі статуси блокування|All ban states|Все статусы блокировки\nЄ блокування|Banned|Есть блокировка\nБез блокування|No ban|Без блокировки\nНевідомо|Unknown|Неизвестно\nПеревірено|Checked|Проверено\nПеревірити блокування|Check bans|Проверить блокировки\nПеревірок завершено: {complete}. Невідомо: {pending}.|Checks completed: {complete}. Unknown: {pending}.|Проверок завершено: {complete}. Неизвестно: {pending}.\nПропустити акаунти з VAC-блокуванням|Skip VAC-banned accounts|Пропустить аккаунты с VAC-блокировкой\nПропустити акаунти з Community-блокуванням|Skip Community-banned accounts|Пропустить аккаунты с Community-блокировкой\nПропущено VAC: {vac}. Community: {community}. Перевірено: {checked}.|Skipped VAC: {vac}. Community: {community}. Checked: {checked}.|Пропущено VAC: {vac}. Community: {community}. Проверено: {checked}.\nСтатус блокування невідомий для {count} акаунтів. Їх не можна вважати перевіреними.|Ban status is unknown for {count} accounts. They cannot be considered checked.|Статус блокировки неизвестен для {count} аккаунтов. Их нельзя считать проверенными.\nНе вдалося безпечно зберегти резервну копію.|Could not safely save the backup.|Не удалось безопасно сохранить резервную копию.\nЗнайдено резервну копію сховища. Відновіть її перед створенням нового.|A vault backup was found. Restore it before creating a new vault.|Найдена резервная копия хранилища. Восстановите её перед созданием нового.\nНе вдалося зберегти сховище. Резервна копія може мати інші налаштування доступу; збережіть обидва файли.|Could not save the vault. The backup may have different access settings; keep both files.|Не удалось сохранить хранилище. Резервная копия может иметь другие настройки доступа; сохраните оба файла.\nПродовжити|Continue|Продолжить\nПідтвердіть поточний пароль сховища, перш ніж показати QR і секретний ключ Authenticator.|Confirm your current vault password before viewing the Authenticator QR and secret key.|Подтвердите текущий пароль хранилища перед показом QR и секретного ключа Authenticator.\nПароль сховища вимкнено. Підключення Authenticator використовує поточний розблокований сеанс цього пристрою.|The vault password is disabled. Authenticator setup uses the current unlocked session on this device.|Пароль хранилища отключён. Подключение Authenticator использует текущий разблокированный сеанс этого устройства.\nСистемний трей|System tray|Системный трей\nПоказувати значок у системному треї|Show icon in the system tray|Показывать значок в системном трее\nЗгортати у трей|Minimize to tray|Сворачивать в трей\nЗакривати вікно у трей|Close window to tray|Закрывать окно в трей\nАкаунти у треї (до 10)|Tray accounts (up to 10)|Аккаунты в трее (до 10)\nПошук акаунтів для трея|Search accounts for the tray|Поиск аккаунтов для трея\nПошук показує до 20 збігів. Дії трея відкривають перевірку перед підтвердженням.|Search shows up to 20 matches. Tray actions open a review before confirmation.|Поиск показывает до 20 совпадений. Действия трея открывают проверку перед подтверждением.\nПідтвердити покупки маркету|Confirm market purchases|Подтвердить покупки маркета\nДеталі запиту|Request details|Подробности запроса\nЗображення недоступне|Image unavailable|Изображение недоступно\nЗавантаження деталей…|Loading details…|Загрузка подробностей…\nКонтрагент|Counterparty|Контрагент\nВи віддаєте|You give|Вы отдаёте\nВи отримуєте|You receive|Вы получаете\nПредмети — напрямок не визначено|Items — direction unknown|Предметы — направление неизвестно\nНазва предмета недоступна|Item name unavailable|Название предмета недоступно\nПоказано лише перші 100 рядків предметів. Решту пропущено. Перевірте повний обмін у Steam перед підтвердженням.|Only the first 100 item rows are shown. More items were omitted. Review the full exchange in Steam before confirming.|Показаны только первые 100 строк предметов. Остальные пропущены. Проверьте полный обмен в Steam перед подтверждением.\nSteam надав неповні дані предметів. Перевірте текст запиту перед підтвердженням.|Steam provided incomplete item data. Check the request text before confirming.|Steam предоставил неполные данные предметов. Проверьте текст запроса перед подтверждением.\nДані Steam|Steam data|Данные Steam\nSteam не надав дані контрагента.|Steam did not provide counterparty details.|Steam не предоставил данные контрагента.\nПовний текст Steam|Full Steam text|Полный текст Steam\nSteam не надав додаткових деталей.|Steam provided no additional details.|Steam не предоставил дополнительных подробностей.\nДодати нотатку|Add note|Добавить заметку\nРедагувати нотатку|Edit note|Редактировать заметку\nПравила підтверджень збережено|Confirmation rules saved|Правила подтверждений сохранены\nНе вдалося зберегти тему й мову. Ваш вибір діє; збереження буде повторено.|Could not save the theme and language. Your choices are applied; saving will be retried.|Не удалось сохранить тему и язык. Ваш выбор действует; сохранение будет повторено.\nУсі акаунти|All accounts|Все аккаунты\nВідкрити профіль|Open profile|Открыть профиль\nКод недоступний|Code unavailable|Код недоступен\nПоказувати логіни та паролі проксі|Show proxy usernames and passwords|Показывать логины и пароли прокси\nПриховувати повідомлення про захист сховища|Hide the vault protection reminder|Скрывать напоминание о защите хранилища\nGoogle Authenticator|Google Authenticator|Google Authenticator\nПриховати нагадування про Authenticator|Dismiss the Authenticator reminder|Скрыть напоминание об Authenticator\nАвто: продажі маркету|Auto: market sales|Авто: продажи маркета\nАвто: покупки маркету|Auto: market purchases|Авто: покупки маркета\nАвто: обміни|Auto: trades|Авто: обмены\nСтатус сесії|Session status|Статус сессии\nСтатус проксі|Proxy status|Статус прокси\nРежим автопідтвердження|Auto-confirmation mode|Режим автоподтверждения\nУсі сесії|All sessions|Все сессии\nУсі статуси проксі|All proxy statuses|Все статусы прокси\nПроксі працює|Proxy connected|Прокси работает\nНе перевірено|Unchecked|Не проверено\nПеревіряється|Checking|Проверяется\nПроксі недоступний|Proxy unavailable|Прокси недоступен\nЗаблоковано|Blocked|Заблокировано\nПряме підключення|Direct connection|Прямое подключение\nУсі режими|All modes|Все режимы\nБудь-яке автопідтвердження|Any auto-confirmation|Любое автоподтверждение\nПродажі маркету|Market sales|Продажи маркета\nПокупки маркету|Market purchases|Покупки маркета\nОбміни|Trades|Обмены\nСкинути фільтри|Reset filters|Сбросить фильтры\nЗмініть пошук або фільтри.|Change the search or filters.|Измените поиск или фильтры.\nПризначити вільні резервні проксі|Assign available spare proxies|Назначить свободные резервные прокси\nДо резервних проксі на акаунт|Maximum spare proxies per account|Максимум резервных прокси на аккаунт\nСпочатку збережіть зміни налаштувань акаунта.|Save your account settings changes first.|Сначала сохраните изменения настроек аккаунта.\nЗавантаження…|Loading…|Загрузка…\nВільних: {available}. Акаунтів: {accounts}. Буде призначено резервних: {total}.|Available: {available}. Accounts: {accounts}. Spares to assign: {total}.|Свободных: {available}. Аккаунтов: {accounts}. Будет назначено резервных: {total}.\nЯкщо вільних проксі недостатньо для повного кола, останні акаунти отримають менше резервних.|If there are too few free proxies for a full round, the last accounts receive fewer spares.|Если свободных прокси недостаточно для полного круга, последние аккаунты получат меньше резервных.\nПризначити проксі|Assign proxy|Назначить прокси\nПоточний маршрут|Current route|Текущий маршрут\nНекоректне призначення проксі.|Invalid proxy assignment.|Некорректное назначение прокси.\nЦей проксі вже зайнятий або недоступний. Оновіть список.|This proxy is already assigned or unavailable. Refresh the list.|Этот прокси уже занят или недоступен. Обновите список.\nВведіть один проксі у підтримуваному форматі.|Enter one proxy in a supported format.|Введите один прокси в поддерживаемом формате.\nПроксі акаунта оновлено.|Account proxy updated.|Прокси аккаунта обновлён.\nДжерело проксі|Proxy source|Источник прокси\nВвести вручну|Enter manually|Ввести вручную\nВільний проксі зі списку|Free proxy from a list|Свободный прокси из списка\nПозиція маршруту|Route position|Позиция маршрута\nОсновний проксі|Primary proxy|Основной прокси\nРезервний проксі|Backup proxy|Резервный прокси\nАкаунт використовуватиме власний маршрут. Наявні проксі залишаться резервними; новий резервний проксі додається в кінець.|This account will use its own route. Existing proxies remain as backups; a new backup is appended.|Аккаунт будет использовать собственный маршрут. Имеющиеся прокси останутся резервными; новый резервный добавляется в конец.\nОберіть список|Choose a list|Выберите список\nВільний проксі|Free proxy|Свободный прокси\nУ цьому списку немає вільних проксі.|This list has no free proxies.|В этом списке нет свободных прокси.\nПроксі призначено|Proxy assigned|Прокси назначен\nhttp://host:port або host:port:login:password|http://host:port or host:port:login:password|http://host:port или host:port:login:password\nЗберегти|Save|Сохранить\nСкасувати|Cancel|Отмена\nЗакрити вікно|Close dialog|Закрыть окно\nНавігація|Navigation|Навигация\nВибрано: {count}|Selected: {count}|Выбрано: {count}\nНе вдалося підключитися до сховища.|Could not connect to the vault.|Не удалось подключиться к хранилищу.\nПРИВАТНЕ СХОВИЩЕ|PRIVATE VAULT|ЛИЧНОЕ ХРАНИЛИЩЕ\nЗ поверненням|Welcome back|С возвращением\nВаші акаунти. Під захистом.|Your accounts. Protected.|Ваши аккаунты. Под защитой.\nРозблокуйте програму для перегляду|Unlock the app to view|Разблокируйте приложение для просмотра\nРозблокуйте сховище, щоб продовжити.|Unlock your vault to continue.|Разблокируйте хранилище, чтобы продолжить.\nСтворіть пароль для зашифрованого сховища Steam Guard.|Create a password for your encrypted Steam Guard vault.|Создайте пароль для зашифрованного хранилища Steam Guard.\nПароль|Password|Пароль\nЩонайменше 15 символів|At least 15 characters|Не менее 15 символов\nПовторіть пароль|Confirm password|Повторите пароль\nКод Google Authenticator|Google Authenticator code|Код Google Authenticator\nРозблокувати|Unlock|Разблокировать\nСтворити сховище|Create vault|Создать хранилище\nПаролі не збігаються.|Passwords do not match.|Пароли не совпадают.\nAES-256-GCM · локальне зберігання|AES-256-GCM · local storage|AES-256-GCM · локальное хранение\n▦  Усі акаунти|▦  All accounts|▦  Все аккаунты\n⇄  Проксі|⇄  Proxies|⇄  Прокси\n◎  Безпека|◎  Security|◎  Безопасность\nПАПКИ|FOLDERS|ПАПКИ\n+ Нова папка|+ New folder|+ Новая папка\n◷  Останні події|◷  Recent activity|◷  Последние события\n⚙  Налаштування|⚙  Settings|⚙  Настройки\n↗  Заблокувати|↗  Lock vault|↗  Заблокировать\n● Сховище зашифровано|● Vault encrypted|● Хранилище зашифровано\nДодайте другий рівень захисту|Add a second layer of protection|Добавьте второй уровень защиты\nПідключіть Google Authenticator, щоб захистити вхід одноразовим кодом.|Connect Google Authenticator to protect access with a one-time code.|Подключите Google Authenticator для защиты входа одноразовым кодом.\nНалаштувати Authenticator|Set up Authenticator|Настроить Authenticator\nВаші акаунти|Your accounts|Ваши аккаунты\nКоди Steam Guard та підтвердження в одному місці.|Steam Guard codes and confirmations in one place.|Коды Steam Guard и подтверждения в одном месте.\nПапка|Folder|Папка\nАкаунтів у папці: {count}|Accounts in folder: {count}|Аккаунтов в папке: {count}\n+ Імпортувати|+ Import|+ Импортировать\nІмпорт завершено|Import complete|Импорт завершён\nАкаунтів у сховищі|Accounts in vault|Аккаунтов в хранилище\nЗбережені сесії|Saved sessions|Сохранённые сессии\nАвтопідтвердження|Auto confirmations|Автоподтверждения\nПошук за назвою або Steam ID…|Search by name or Steam ID…|Поиск по имени или Steam ID…\nНічого не знайдено|No results|Ничего не найдено\nДодайте перший акаунт|Add your first account|Добавьте первый аккаунт\nСпробуйте іншу назву або Steam ID.|Try another name or Steam ID.|Попробуйте другое имя или Steam ID.\nІмпортуйте .maFile через захищений системний діалог. Секрети залишаться у зашифрованому сховищі.|Import a .maFile using the system dialog. Secrets stay in the encrypted vault.|Импортируйте .maFile через системный диалог. Секреты останутся в зашифрованном хранилище.\nСесію збережено|Session saved|Сессия сохранена\nПотрібен вхід|Login needed|Нужен вход\n⚡ Авто|⚡ Auto|⚡ Авто\nВручну|Manual|Вручную\nОсновний|Primary|Основной\nСпочатку додайте проксі. Без маршруту мережеві дії заблоковано.|Add a proxy first. Network operations are blocked without a route.|Сначала добавьте прокси. Без маршрута сетевые действия заблокированы.\nПроксі: вибирайте в порядку основний → резервні|Proxies: select primary → backups in order|Прокси: выбирайте по порядку основной → резервные\nРедагувати папку|Edit folder|Изменить папку\nНова папка|New folder|Новая папка\nНазва|Name|Название\nБатьківська папка|Parent folder|Родительская папка\nБез батьківської папки|No parent folder|Без родительской папки\nПапку збережено|Folder saved|Папка сохранена\nВидалити папку|Delete folder|Удалить папку\nВидалити папку?|Delete folder?|Удалить папку?\nПідтвердьте видалення. Цю дію неможливо скасувати.|Confirm deletion. This action cannot be undone.|Подтвердите удаление. Это действие нельзя отменить.\nВидалити|Delete|Удалить\n← Усі акаунти|← All accounts|← Все аккаунты\nРедагувати|Edit|Изменить\nМобільний пристрій|Mobile device|Мобильное устройство\nОновити час|Sync time|Обновить время\nЧас синхронізовано|Time synchronized|Время синхронизировано\nУвійти в Steam|Log in to Steam|Войти в Steam\nМережевий маршрут|Network route|Сетевой маршрут\nНе призначено. Мережеві запити заблоковано.|Unassigned. Network requests blocked.|Не назначен. Сетевые запросы заблокированы.\nПеревірити проксі|Check proxies|Проверить прокси\nувімкнено|on|включено\nвимкнено|off|выключено\nЗмінити правила|Edit rules|Изменить правила\nПідтвердження|Confirmations|Подтверждения\nЗавантажити|Load|Загрузить\nЗавантажте актуальні запити Steam для цього акаунта.|Load current Steam requests for this account.|Загрузите текущие запросы Steam для этого аккаунта.\nНалаштування акаунта|Account settings|Настройки аккаунта\nБез папки|No folder|Без папки\nУспадковувати проксі папки|Inherit folder proxies|Наследовать прокси папки\nАвтоматично підтверджувати продажі маркету|Automatically confirm Market listings|Автоматически подтверждать продажи на Маркете\nАвтоматично підтверджувати обміни|Automatically confirm trades|Автоматически подтверждать обмены\nУвімкнене правило дозволяє підтвердження без додаткового запиту.|An enabled rule allows confirmation without another prompt.|Включённое правило разрешает подтверждение без дополнительного запроса.\nВидалити акаунт|Delete account|Удалить аккаунт\nВидалити акаунт зі сховища?|Delete account from vault?|Удалить аккаунт из хранилища?\nВхід у Steam|Steam login|Вход в Steam\nПароль Steam|Steam password|Пароль Steam\nКод підтвердження (за потреби)|Confirmation code (if needed)|Код подтверждения (при необходимости)\nОчікуємо завершення входу Steam. Сесія з’явиться автоматично.|Waiting for Steam login. The session will appear automatically.|Ожидаем завершения входа Steam. Сессия появится автоматически.\nВхід завершено|Login complete|Вход выполнен\nУвійти|Log in|Войти\nПідтвердьте вхід|Confirm login|Подтвердите вход\nВведіть код із пошти або Steam Guard.|Enter the code from email or Steam Guard.|Введите код из почты или Steam Guard.\nКод|Code|Код\nОчікуємо завершення входу Steam.|Waiting for Steam login.|Ожидаем завершения входа Steam.\nSteam очікує підтвердження. Перевірте код або інструкції.|Steam is awaiting confirmation. Check the code or instructions.|Steam ожидает подтверждения. Проверьте код или инструкции.\nПідтвердити|Confirm|Подтвердить\nОновити|Refresh|Обновить\nНемає запитів на підтвердження.|No pending confirmations.|Нет запросов на подтверждение.\nЗапит Steam|Steam request|Запрос Steam\nПопередню дію вже надіслано. Автоматичний повтор заблоковано; перевірте результат у Steam.|The previous action was sent. Automatic retries are blocked; check the result in Steam.|Предыдущее действие уже отправлено. Автоповтор заблокирован; проверьте результат в Steam.\nSteam підтвердив запит, завершення угоди не перевірено|Steam acknowledged the request; trade completion is unverified|Steam подтвердил запрос, завершение сделки не проверено\nРезультат потребує перевірки|Result needs verification|Результат требует проверки\nВідхилити|Reject|Отклонить\nГотово|Done|Готово\nПроксі|Proxies|Прокси\nОкремі маршрути для акаунтів і папок. Резерви працюють за заданим порядком.|Separate account and folder routes. Backups follow the selected order.|Отдельные маршруты аккаунтов и папок. Резервы работают в заданном порядке.\n+ Додати проксі|+ Add proxy|+ Добавить прокси\nБез призначеного проксі мережеві операції заблоковано. Пряме підключення не використовується.|Without assigned proxies, network operations are blocked. Direct mode is disabled by default.|Без назначенных прокси сетевые операции заблокированы. Прямой режим по умолчанию отключён.\nМаршрутів ще немає|No routes yet|Маршрутов пока нет\nДодайте HTTP, HTTPS або SOCKS5H проксі, потім призначте їх папці чи акаунту.|Add HTTP, HTTPS or SOCKS5H proxies, then assign them to an account or folder.|Добавьте HTTP, HTTPS или SOCKS5H прокси, затем назначьте папке или аккаунту.\nВидалити проксі?|Delete proxy?|Удалить прокси?\nРедагувати проксі|Edit proxy|Изменить прокси\nНовий проксі|New proxy|Новый прокси\nНаприклад, Варшава · 01|For example, Warsaw · 01|Например, Варшава · 01\nНова адреса проксі (з обліковими даними)|New proxy URL (with credentials)|Новый адрес прокси (с учётными данными)\nАдреса проксі|Proxy URL|Адрес прокси\nПідтримуються http://, https:// та socks5h://. Облікові дані зберігаються у зашифрованому сховищі.|Supports http://, https:// and socks5h://. Credentials are stored in the encrypted vault.|Поддерживаются http://, https:// и socks5h://. Учётные данные хранятся в зашифрованном хранилище.\nПроксі збережено|Proxy saved|Прокси сохранён\nБезпека сховища|Vault security|Безопасность хранилища\nКеруйте доступом і резервними копіями.|Manage access and backups.|Управляйте доступом и резервными копиями.\nУвімкнено|Enabled|Включено\nВимкнено|Disabled|Выключено\nПароль доступу|Access password|Пароль доступа\nВласний пароль захищає вхід до вашого локального сховища.|Your password protects access to the local vault.|Ваш пароль защищает вход в локальное хранилище.\nЗмінити пароль|Change password|Изменить пароль\nВимкнути пароль|Disable password|Отключить пароль\nНе налаштовано|Not configured|Не настроено\nДвоетапна перевірка|Two-step verification|Двухэтапная проверка\nКод із Google Authenticator або іншого сумісного застосунку при розблокуванні.|A code from Google Authenticator or a compatible app when unlocking.|Код из Google Authenticator или совместимого приложения при разблокировке.\nВимкнути TOTP|Disable TOTP|Отключить TOTP\nНалаштувати TOTP|Set up TOTP|Настроить TOTP\nЗашифрована резервна копія|Encrypted backup|Зашифрованная резервная копия\nЗбережіть копію сховища у вибраному місці. Для відновлення знадобляться ваші засоби доступу.|Save a vault copy to a chosen location. Your access factors are needed to restore it.|Сохраните копию хранилища в выбранном месте. Для восстановления потребуются ваши средства доступа.\nЗберегти копію|Save backup|Сохранить копию\nОперацію резервного копіювання завершено|Backup operation complete|Резервное копирование завершено\nВимкнення пароля|Disable password|Отключение пароля\nЗміна пароля|Change password|Изменение пароля\nПоточний пароль|Current password|Текущий пароль\nКод Authenticator|Authenticator code|Код Authenticator\nНовий пароль|New password|Новый пароль\nПовторіть новий пароль|Confirm new password|Повторите новый пароль\nНові паролі не збігаються.|New passwords do not match.|Новые пароли не совпадают.\nНалаштування пароля оновлено|Password settings updated|Настройки пароля обновлены\nНалаштування Authenticator|Authenticator setup|Настройка Authenticator\nВідскануйте QR у Google Authenticator або додайте ключ вручну. Після цього введіть поточний шестизначний код.|Scan the QR code in Google Authenticator or enter the key manually. Then enter the current six-digit code.|Отсканируйте QR в Google Authenticator или добавьте ключ вручную. Затем введите текущий шестизначный код.\nQR для підключення Authenticator|Authenticator setup QR|QR подключения Authenticator\nДвоетапну перевірку увімкнено|Two-step verification enabled|Двухэтапная проверка включена\nАктивувати|Activate|Активировать\nВимкнення Authenticator|Disable Authenticator|Отключение Authenticator\nПароль сховища|Vault password|Пароль хранилища\nПоточний код Authenticator|Current Authenticator code|Текущий код Authenticator\nДвоетапну перевірку вимкнено|Two-step verification disabled|Двухэтапная проверка отключена\nВимкнути|Disable|Отключить\nНалаштування|Settings|Настройки\nПоведінка застосунку, безпека та браузер.|App behavior, security, and browser.|Поведение приложения, безопасность и браузер.\nАвтоблокування, хвилин|Auto-lock, minutes|Автоблокировка, минуты\nІнтервал автопідтверджень, секунд|Auto-confirmation interval, seconds|Интервал автоподтверждений, секунды\nЗберегти налаштування|Save settings|Сохранить настройки\nНалаштування збережено|Settings saved|Настройки сохранены\nОстанні події|Recent activity|Последние события\nОстанні 20 подій сховища, від найновіших.|The vault’s 20 most recent events, newest first.|Последние 20 событий хранилища, начиная с новых.\nПодій ще немає.|No events yet.|Событий пока нет.\nПодія|Event|Событие\n● Проксі працює|● Proxy connected|● Прокси работает\n● Заблоковано|● Blocked|● Заблокировано\n● Проксі недоступний|● Proxy unavailable|● Прокси недоступен\n○ Не перевірено|○ Unchecked|○ Не проверено\nСпочатку перевірте призначені проксі|Check the assigned proxies first|Сначала проверьте назначенные прокси\nПеревірка маршруту|Route check|Проверка маршрута\nМережеві операції заблоковано: немає доступного проксі.|Network operations blocked: no proxy is available.|Сетевые операции заблокированы: нет доступного прокси.\nМаршрут готовий. Steam використовуватиме доступний проксі.|Route ready. Steam will use the available proxy.|Маршрут готов. Steam будет использовать доступный прокси.\nПризначте основний проксі та резерви в налаштуваннях акаунта або папки.|Assign primary and backup proxies in account or folder settings.|Назначьте основной и резервные прокси в настройках аккаунта или папки.\nНе вдалося підключитися|Connection failed|Не удалось подключиться\nАктивний|Active|Активный\nДоступний|Available|Доступен\nНедоступний|Unavailable|Недоступен\nМова|Language|Язык\nТема|Theme|Тема\nТемна|Dark|Тёмная\nСвітла|Light|Светлая\nМережа|Network|Сеть\nДозволити пряме підключення без маршруту|Allow direct connection without a route|Разрешить прямое подключение без маршрута\nЛише для акаунтів без призначених проксі чи списків. Після помилки проксі прямого резервного підключення ніколи немає.|Only for accounts with no assigned proxies or lists. A failed proxy never falls back to direct connection.|Только для аккаунтов без назначенных прокси и списков. При сбое прокси прямого резервного подключения никогда нет.\nСповіщення|Notifications|Уведомления\nПоказувати системні сповіщення|Show system notifications|Показывать системные уведомления\nВідтворювати звук|Play sound|Воспроизводить звук\nСповіщати про помилки|Notify about errors|Уведомлять об ошибках\nГучність|Volume|Громкость\nТестове сповіщення|Test notification|Тестовое уведомление\nТестове сповіщення надіслано|Test notification sent|Тестовое уведомление отправлено\nСписки проксі|Proxy lists|Списки прокси\n+ Новий список|+ New list|+ Новый список\nІмпорт проксі|Import proxies|Импорт прокси\nІз файлів|From files|Из файлов\nВставити текст|Paste text|Вставить текст\nНазва списку|List name|Название списка\nПротокол|Protocol|Протокол\nОдин проксі на рядок: host:port, host:port:user:password або URL. SOCKS5 використовує віддалений DNS.|One proxy per line: host:port, host:port:user:password or URL. SOCKS5 uses remote DNS.|Один прокси в строке: host:port, host:port:user:password или URL. SOCKS5 использует удалённый DNS.\nТекст проксі|Proxy text|Текст прокси\nІмпортувати|Import|Импортировать\nРедагувати список|Edit list|Изменить список\nНовий список|New list|Новый список\nВидалити список?|Delete list?|Удалить список?\nСписок збережено|List saved|Список сохранён\nРедагувати адреси|Edit addresses|Изменить адреса\nСклад і порядок списку|List members and order|Состав и порядок списка\nСпочатку окремі проксі, потім списки в заданому порядку. Усередині кожного списку порядок зберігається.|Individual proxies first, then lists in the selected order. Each list keeps its order.|Сначала отдельные прокси, затем списки в заданном порядке. Внутри каждого списка порядок сохраняется.\nПорядок списків|List order|Порядок списков\nОкремі проксі|Individual proxies|Отдельные прокси\nСписків ще немає|No lists yet|Списков пока нет\nПеремістити акаунти|Move accounts|Переместить аккаунты\nВибрати акаунти|Select accounts|Выбрать аккаунты\nСкасувати вибір|Clear selection|Сбросить выбор\nВиберіть хоча б один акаунт.|Select at least one account.|Выберите хотя бы один аккаунт.\nАкаунти переміщено|Accounts moved|Аккаунты перемещены\nІмпорт акаунтів|Import accounts|Импорт аккаунтов\nФайли .maFile / JSON|.maFile / JSON files|Файлы .maFile / JSON\nПапка → група|Folder → group|Папка → группа\nОдин акаунт із тексту|One account from text|Один аккаунт из текста\nФормат|Format|Формат\nАвтовизначення|Auto-detect|Автоопределение\nJSON одного акаунта. Секрети передаються лише в локальний процес імпорту й не потрапляють у попередній перегляд.|Single-account JSON. Secrets are sent only to the local import process and excluded from the preview.|JSON одного аккаунта. Секреты передаются только в локальный процесс импорта и не попадают в предпросмотр.\nАвтовизначення перевіряє структуру. SIH / Nebula / SDA / Deps / Nan задають очікуваний формат; несумісні записи буде позначено перед імпортом.|Auto-detect checks structure. SIH / Nebula / SDA / Deps / Nan select the expected format; incompatible records are flagged before import.|Автоопределение проверяет структуру. SIH / Nebula / SDA / Deps / Nan задают ожидаемый формат; несовместимые записи будут отмечены до импорта.\nТекст акаунта|Account text|Текст аккаунта\nПереглянути перед імпортом|Review before import|Просмотреть перед импортом\nПеревірка імпорту|Import review|Проверка импорта\nЗастосувати імпорт|Apply import|Применить импорт\nГотовий|Ready|Готов\nДублікат|Duplicate|Дубликат\nПомилки імпорту|Import errors|Ошибки импорта\nПовернутися|Back|Назад\nІмпорт не містить готових акаунтів.|No accounts are ready to import.|Нет аккаунтов, готовых к импорту.\nЗапит скасовано|Request cancelled|Запрос отменён\n● Пряме підключення|● Direct connection|● Прямое подключение\nПряме підключення дозволено для акаунтів без маршруту.|Direct connection is allowed for accounts without a route.|Прямое подключение разрешено для аккаунтов без маршрута.\nСховище заблоковано.|Vault locked.|Хранилище заблокировано.\nНевірні облікові дані або пошкоджене сховище.|Incorrect credentials or damaged vault.|Неверные учётные данные или повреждённое хранилище.\nЗабагато спроб. Спробуйте пізніше.|Too many attempts. Try again later.|Слишком много попыток. Повторите позже.\nОперацію скасовано.|Operation cancelled.|Операция отменена.\nПотрібно повторно увійти у Steam|Please log in to Steam again|Нужно повторно войти в Steam\nПроксі не призначено. Пряме з’єднання зі Steam заборонене.|No proxy assigned. Direct Steam connection is forbidden.|Прокси не назначен. Прямое соединение со Steam запрещено.\nУсі призначені проксі недоступні. З’єднання зі Steam заблоковано.|All assigned proxies are unavailable. Steam connection blocked.|Все назначенные прокси недоступны. Соединение со Steam заблокировано.\nМережеві запити заблоковано|Network requests blocked|Сетевые запросы заблокированы\nЩе не перевірено|Not checked yet|Ещё не проверено\nНе вдалося отримати підтвердження Steam|Could not load Steam confirmations|Не удалось получить подтверждения Steam\nОновіть список підтверджень|Refresh the confirmation list|Обновите список подтверждений\nРезультат дії невідомий. Оновіть список перед повторенням|The outcome is unknown. Refresh the list before retrying|Результат действия неизвестен. Обновите список перед повторением\nSteam не підтвердив дію. Оновіть список|Steam did not acknowledge the action. Refresh the list|Steam не подтвердил действие. Обновите список\nДля цього акаунта вже виконується операція.|An operation is already running for this account.|Для этого аккаунта уже выполняется операция.\nПроксі не призначено|No proxy assigned|Прокси не назначен\nНемає готової мобільної сесії|No mobile session ready|Нет готовой мобильной сессии\nПомилка операції|Operation failed|Ошибка операции",
  pattern: "^Автопідтвердження оновлено для акаунтів: (\\d+)\\.$",
  templateText_1a70f6c: "Автоподтверждения обновлены для аккаунтов: ",
  pattern_d49f17a:
    "^Імпортовано акаунтів: (\\d+)\\. Пропущено дублікатів: (\\d+)\\.$",
  templateText_529a72a: "Импортировано аккаунтов: ",
  templateText_088894a: ". Пропущено дубликатов: ",
  pattern_36ae341: "^Імпортовано списків проксі: (\\d+)\\.$",
  templateText_ee567b6: "Импортировано списков прокси: ",
  pattern_b83fb57: "^Переміщено акаунтів: (\\d+)\\.$",
  templateText_7c38269: "Перемещено аккаунтов: ",
  pattern_b532970: "^Пряме з’єднання \\(без проксі\\) · (.+)$",
  directConnectionNoProxy_4cfec4e: "Прямое соединение (без прокси) · ",
  pattern_eaa81d6: "^(\\d+) акаунтів$",
  templateText_03aad3d: " аккаунтов",
  pattern_309830c: "^Резерв (\\d+)$",
  pattern_406e91c: "^Порядок: (\\d+)$",
  pattern_8865a12: "^Проксі: (\\d+)$",
  templateText_eb3b870: "Прокси: ",
  pattern_3acc74e: "^Вибрано: (\\d+)$",
  templateText_3ef8b74: "Выбрано: ",
  pattern_960a308: "^Готово: (\\d+) · Дублікати: (\\d+) · Помилки: (\\d+)$",
  templateText_33d04bd: " · Дубликаты: ",
  templateText_c0689c9: " · Ошибки: ",
  pattern_8fe48d1: "^Буде створено папку: (.+)$",
  templateText_9d8da16: "Будет создана папка: ",
  pattern_01aa771: "^Імпортовано: (\\d+) · Дублікати: (\\d+)$",
  templateText_d16103f: "Импортировано: ",
  pattern_b9939c8: "^Через (.+)$",
  templateText_d54dca6: "Через ",
  pattern_74bc54c: "^Проксі (.+) недоступний\\.$",
  proxies_7e4b0bd: "Прокси ",
  templateText_e12d660: " недоступен.",
  pattern_bdab0fa: "^(.*) \\+ (\\d+) резерв\\.$",
  templateText_1db3b57: " резерв.",
  pattern_92a2a7d: "^Маркет: (.+) · Обміни: (.+)$",
  templateText_a27a8c2: "Маркет: ",
  templateText_bc8e7d1: " · Обмены: ",
  pattern_dc41bf7: " мс\\b",
  translationTable_519c236:
    "Джерело|Source|Источник\nНеперевірених проксі: {count}. Повторіть перевірку, щоб продовжити.|Unchecked proxies: {count}. Check again to continue.|Непроверенных прокси: {count}. Повторите проверку, чтобы продолжить.\nВідкладено|Deferred|Отложено\nВигляд|Appearance|Оформление\nВгору|Move up|Вверх\nВниз|Move down|Вниз\nПошук…|Search…|Поиск…\nВибрати всі за фільтром|Select all matching accounts|Выбрать все по фильтру\nЄ нові підтвердження Steam|New Steam confirmations are waiting|Есть новые подтверждения Steam\nПотрібна увага: перевірте стан акаунтів|Attention needed: check account status|Требуется внимание: проверьте состояние аккаунтов\nSteam не підтвердив дію. Перевірте початкову дію у Steam; повторення заблоковано|Steam did not acknowledge the action. Check the original action in Steam; retries are blocked|Steam не подтвердил действие. Проверьте исходное действие в Steam; повтор заблокирован\nSteam повернув некоректний токен|Steam returned an invalid token|Steam вернул некорректный токен\nSteamID потрібен без втрати точності|SteamID must preserve exact precision|SteamID нужен без потери точности\nSteamID сесії не збігається з обліковим записом|Session SteamID does not match the account|SteamID сессии не совпадает с аккаунтом\nSteamID токена не збігається|Token SteamID does not match|SteamID токена не совпадает\nTOTP вже увімкнено.|TOTP is already enabled.|TOTP уже включён.\nmaFile не містить даних для підтверджень|maFile has no confirmation credentials|maFile не содержит данных для подтверждений\nmaFile перевищує 1 МБ.|maFile exceeds 1 MB.|maFile превышает 1 МБ.\nmaFile повинен містити коректний JSON|maFile must contain valid JSON|maFile должен содержать корректный JSON\nІмпорт Steam maFiles|Import Steam maFiles|Импорт Steam maFiles\nІмпортуйте не більше 500 файлів за раз.|Import up to 500 files at a time.|Импортируйте не более 500 файлов за раз.\nАвтоблокування: 0–1440 хв. Перевірка підтверджень: 15–3600 с.|Auto-lock: 0–1440 min. Confirmation interval: 15–3600 sec.|Автоблокировка: 0–1440 мин. Проверка подтверждений: 15–3600 с.\nАкаунт|Account|Аккаунт\nАкаунт видалено зі сховища. Автентифікатор у Steam не відключено.|Account removed from vault. The Steam authenticator remains active.|Аккаунт удалён из хранилища. Аутентификатор в Steam не отключён.\nВведіть пароль Steam|Enter your Steam password|Введите пароль Steam\nВиберіть інше місце для резервної копії.|Choose another backup location.|Выберите другое место для резервной копии.\nВикористайте пароль щонайменше з 15 символів.|Use a password with at least 15 characters.|Используйте пароль не короче 15 символов.\nВкажіть адресу проксі.|Enter a proxy URL.|Укажите адрес прокси.\nВкажіть назву від 1 до 120 символів.|Enter a name of 1–120 characters.|Укажите название от 1 до 120 символов.\nВкажіть пароль.|Enter a password.|Укажите пароль.\nВставлений текст|Pasted text|Вставленный текст\nВхід належить іншому SteamID|Login belongs to another SteamID|Вход принадлежит другому SteamID\nВхід скасовано|Login cancelled|Вход отменён\nВідкладені проксі|Deferred proxies|Отложенные прокси\nВідповідь не отримано. Статус операції невідомий; перевірте стан операції у Steam.|No response received. The outcome is unknown; check the operation in Steam.|Ответ не получен. Статус операции неизвестен; проверьте операцию в Steam.\nДвоетапний вхід вимкнено.|Two-step login disabled.|Двухэтапный вход отключён.\nДвоетапний вхід увімкнено.|Two-step login enabled.|Двухэтапный вход включён.\nДля підтверджень потрібен identity_secret у maFile.|Confirmations require identity_secret in the maFile.|Для подтверждений нужен identity_secret в maFile.\nДля підтверджень потрібен оригінальний device_id|Confirmations require the original device_id|Для подтверждений нужен оригинальный device_id\nДоступ заборонено.|Access denied.|Доступ запрещён.\nЖурнал підтверджень заповнений. Нові дії заблоковано|Confirmation journal full. New actions blocked|Журнал подтверждений заполнен. Новые действия заблокированы\nЗабагато мережевих операцій. Спробуйте пізніше.|Too many network operations. Try again later.|Слишком много сетевых операций. Повторите позже.\nЗабагато полів maFile|Too many maFile fields|Слишком много полей maFile\nЗабагато рядків проксі|Too many proxy rows|Слишком много строк прокси\nЗабагато списків проксі.|Too many proxy lists.|Слишком много списков прокси.\nЗаборонений мережевий заголовок.|Forbidden network header.|Запрещённый сетевой заголовок.\nЗавелика вкладеність maFile|maFile nesting is too deep|Слишком глубокая вложенность maFile\nЗанадто довгі облікові дані проксі.|Proxy credentials are too long.|Слишком длинные учётные данные прокси.\nЗапис|Record|Запись\nЗапис пошкоджений, має суперечливі дані або не містить потрібного SteamID/секрету|Record is damaged, conflicting or missing the required SteamID/secret|Запись повреждена, содержит противоречивые данные или не содержит нужного SteamID/секрета\nЗапит завеликий.|Request too large.|Слишком большой запрос.\nЗахист Windows недоступний.|Windows protection is unavailable.|Защита Windows недоступна.\nЗашифровану резервну копію збережено.|Encrypted backup saved.|Зашифрованная резервная копия сохранена.\nЛише локальні коди: відсутній оригінальний device_id або identity_secret|Local codes only: original device_id or identity_secret missing|Только локальные коды: отсутствует оригинальный device_id или identity_secret\nЛіміт перевірок або очікування після помилки.|Check limit reached or cooling down after an error.|Лимит проверок или ожидание после ошибки.\nМережеву адресу заблоковано політикою застосунку.|Network address blocked by app policy.|Сетевой адрес заблокирован политикой приложения.\nНалаштування акаунта оновлено.|Account settings updated.|Настройки аккаунта обновлены.\nНалаштування застосунку збережено.|App settings saved.|Настройки приложения сохранены.\nНалаштування папок оновлено.|Folder settings updated.|Настройки папок обновлены.\nНалаштування пароля змінено.|Password settings changed.|Настройки пароля изменены.\nНалаштування проксі оновлено.|Proxy settings updated.|Настройки прокси обновлены.\nНе вдалося виконати автопідтвердження. Перевірте маршрут і сесію.|Auto confirmation failed. Check the route and session.|Не удалось выполнить автоподтверждение. Проверьте маршрут и сессию.\nНе вдалося виконати дію. Перевірте дані, проксі та стан сесії.|Action failed. Check the input, proxies and session.|Не удалось выполнить действие. Проверьте данные, прокси и состояние сессии.\nНе вдалося відкрити сховище.|Could not open vault.|Не удалось открыть хранилище.\nНе вдалося зберегти зміни. Сховище заблоковано; перевірте вільне місце та права доступу.|Could not save changes. Vault locked; check disk space and permissions.|Не удалось сохранить изменения. Хранилище заблокировано; проверьте свободное место и права доступа.\nНе вдалося зберегти сховище.|Could not save vault.|Не удалось сохранить хранилище.\nНе вдалося змінити пароль.|Could not change password.|Не удалось изменить пароль.\nНе вдалося прочитати файл|Could not read file|Не удалось прочитать файл\nНе вдалося увійти у Steam|Steam login failed|Не удалось войти в Steam\nНебезпечне поле maFile|Unsafe maFile field|Опасное поле maFile\nНевідома дія.|Unknown action.|Неизвестное действие.\nНевідоме налаштування.|Unknown setting.|Неизвестная настройка.\nНевідомий запит автентифікації|Unknown authentication request|Неизвестный запрос аутентификации\nНевірний новий пароль.|Invalid new password.|Неверный новый пароль.\nНевірні облікові дані.|Incorrect credentials.|Неверные учётные данные.\nНекоректна адреса проксі.|Invalid proxy URL.|Некорректный адрес прокси.\nНекоректна відповідь автентифікації Steam|Invalid Steam authentication response|Некорректный ответ аутентификации Steam\nНекоректна відповідь підтверджень Steam|Invalid Steam confirmation response|Некорректный ответ подтверждений Steam\nНекоректна відповідь часу Steam|Invalid Steam time response|Некорректный ответ времени Steam\nНекоректна дія підтвердження|Invalid confirmation action|Некорректное действие подтверждения\nНекоректна сесія maFile|Invalid maFile session|Некорректная сессия maFile\nНекоректне налаштування акаунта.|Invalid account setting.|Некорректная настройка аккаунта.\nНекоректне підтвердження.|Invalid confirmation.|Некорректное подтверждение.\nНекоректне ім’я облікового запису Steam|Invalid Steam account name|Некорректное имя аккаунта Steam\nНекоректний device_id|Invalid device_id|Некорректный device_id\nНекоректний maFile|Invalid maFile|Некорректный maFile\nНекоректний або дубльований запис підтвердження Steam|Invalid or duplicate Steam confirmation record|Некорректная или дублированная запись подтверждения Steam\nНекоректний або завеликий maFile|Invalid or oversized maFile|Некорректный или слишком большой maFile\nНекоректний запит.|Invalid request.|Некорректный запрос.\nНекоректний код Steam Guard|Invalid Steam Guard code|Некорректный код Steam Guard\nНекоректний мережевий заголовок.|Invalid network header.|Некорректный сетевой заголовок.\nНекоректний перелік списків проксі.|Invalid proxy list selection.|Некорректный перечень списков прокси.\nНекоректний секрет Base64|Invalid Base64 secret|Некорректный секрет Base64\nНекоректний список проксі.|Invalid proxy list.|Некорректный список прокси.\nНекоректний список шляхів|Invalid path list|Некорректный список путей\nНекоректний тег підтвердження|Invalid confirmation tag|Некорректный тег подтверждения\nНекоректний токен Steam|Invalid Steam token|Некорректный токен Steam\nНекоректний час|Invalid time|Некорректное время\nНекоректний час Steam|Invalid Steam time|Некорректное время Steam\nНекоректний час очікування.|Invalid timeout.|Некорректное время ожидания.\nНекоректний шлях|Invalid path|Некорректный путь\nНекоректний ідентифікатор|Invalid identifier|Некорректный идентификатор\nНекоректні налаштування.|Invalid settings.|Некорректные настройки.\nНекоректні облікові дані проксі.|Invalid proxy credentials.|Некорректные учётные данные прокси.\nНекоректні токени сесії Steam|Invalid Steam session tokens|Некорректные токены сессии Steam\nНемає з’єднання через цей проксі.|This proxy cannot connect.|Нет соединения через этот прокси.\nНепідтримуваний JSON або формат. Потрібен незашифрований запис автентифікатора|Unsupported JSON or format. An unencrypted authenticator record is required|Неподдерживаемый JSON или формат. Нужна незашифрованная запись аутентификатора\nНепідтримуваний JSON списку проксі|Unsupported proxy-list JSON|Неподдерживаемый JSON списка прокси\nНепідтримуваний протокол проксі|Unsupported proxy protocol|Неподдерживаемый протокол прокси\nНепідтримуваний режим імпорту|Unsupported import mode|Неподдерживаемый режим импорта\nНепідтримуваний формат імпорту|Unsupported import format|Неподдерживаемый формат импорта\nНовий пароль має містити щонайменше 15 символів.|New password must contain at least 15 characters.|Новый пароль должен содержать не менее 15 символов.\nОперацію скасовано|Operation cancelled|Операция отменена\nПапка не може містити сама себе.|A folder cannot contain itself.|Папка не может содержать сама себя.\nПапка недоступна|Folder unavailable|Папка недоступна\nПапку|Folder|Папку\nПеревищено глибину папок|Folder depth limit exceeded|Превышена глубина папок\nПеревищено ліміт обсягу імпорту|Import size limit exceeded|Превышен лимит объёма импорта\nПеревищено ліміт тексту|Text size limit exceeded|Превышен лимит текста\nПеревищено ліміт файлів|File limit exceeded|Превышен лимит файлов\nПеревірені проксі недоступні. Ліміт спроб вичерпано; повторна перевірка продовжить список.|Checked proxies unavailable. Attempt limit reached; check again to continue the list.|Проверенные прокси недоступны. Лимит попыток исчерпан; повторная проверка продолжит список.\nПеревірені проксі недоступні. Решту відкладено; повторна перевірка продовжить список.|Checked proxies unavailable. Remaining checks deferred; check again to continue.|Проверенные прокси недоступны. Остальные отложены; повторная проверка продолжит список.\nПеренаправлення Steam заблоковано. Оновіть сесію.|Steam redirect blocked. Refresh your session.|Перенаправление Steam заблокировано. Обновите сессию.\nПорожню папку видалено.|Empty folder deleted.|Пустая папка удалена.\nПотрібен захищений проксі-транспорт|A protected proxy transport is required|Нужен защищённый прокси-транспорт\nПотрібен узгоджений SteamID64 у текстовому форматі|A consistent SteamID64 string is required|Нужен согласованный SteamID64 в текстовом формате\nПотрібна увага|Attention required|Требуется внимание\nПотрібне підтвердження|Confirmation required|Требуется подтверждение\nПотрібно увійти у Steam|Log in to Steam|Нужно войти в Steam\nПочніть налаштування TOTP знову.|Start TOTP setup again.|Начните настройку TOTP заново.\nПроксі видалено.|Proxy deleted.|Прокси удалён.\nПроксі не призначено. З’єднання зі Steam заблоковано.|No proxy assigned. Steam connection blocked.|Прокси не назначен. Соединение со Steam заблокировано.\nПряме з’єднання (без проксі)|Direct connection (no proxy)|Прямое соединение (без прокси)\nПряме з’єднання (без проксі) недоступне.|Direct connection (no proxy) unavailable.|Прямое соединение (без прокси) недоступно.\nПряме з’єднання дозволено|Direct connection allowed|Прямое соединение разрешено\nПряме з’єднання заборонено.|Direct connection forbidden.|Прямое соединение запрещено.\nПряме з’єднання недоступне.|Direct connection unavailable.|Прямое соединение недоступно.\nПрямий мережевий доступ заборонено|Direct network access forbidden|Прямой сетевой доступ запрещён\nПідтвердження відхилено|Confirmation rejected|Подтверждение отклонено\nПідтвердження змінилося. Оновіть список|Confirmation changed. Refresh the list|Подтверждение изменилось. Обновите список\nПідтвердження прийнято|Confirmation acknowledged|Подтверждение принято\nПідтримуються HTTP, HTTPS та SOCKS5 з DNS через проксі.|Supports HTTP, HTTPS and SOCKS5 with remote DNS.|Поддерживаются HTTP, HTTPS и SOCKS5 с DNS через прокси.\nРезультат дії невідомий. Перевірте початкову дію у Steam; повторення заблоковано|Action outcome unknown. Check the original action in Steam; retries blocked|Результат действия неизвестен. Проверьте исходное действие в Steam; повтор заблокирован\nСекрет Steam повинен містити 20 байтів|Steam secret must be 20 bytes|Секрет Steam должен содержать 20 байт\nСесію Steam оновлено|Steam session updated|Сессия Steam обновлена\nСесія Steam пошкоджена або прострочена. Увійдіть повторно|Steam session damaged or expired. Log in again|Сессия Steam повреждена или просрочена. Войдите повторно\nСимволічні посилання та junction не імпортуються|Symbolic links and junctions are not imported|Символические ссылки и junction не импортируются\nСписок проксі|Proxy list|Список прокси\nСповіщення smart-auth працюють.|smart-auth notifications are working.|Уведомления smart-auth работают.\nСпочатку заберіть список із маршрутів акаунтів і папок.|Remove this list from account and folder routes first.|Сначала уберите список из маршрутов аккаунтов и папок.\nСпочатку заберіть цей проксі з маршрутів акаунтів і папок.|Remove this proxy from account and folder routes first.|Сначала уберите прокси из маршрутов аккаунтов и папок.\nСпочатку перемістіть акаунти та вкладені папки.|Move accounts and nested folders first.|Сначала переместите аккаунты и вложенные папки.\nСпочатку розпочніть вхід|Start login first|Сначала начните вход\nСховище вже відкрито.|Vault is already open.|Хранилище уже открыто.\nСховище вже існує.|Vault already exists.|Хранилище уже существует.\nТака папка вже існує.|A folder with this name already exists.|Такая папка уже существует.\nТакий список проксі вже існує.|This proxy list already exists.|Такой список прокси уже существует.\nТест сповіщень|Notification test|Тест уведомлений\nТокен сесії належить іншому обліковому запису або пошкоджений|Session token belongs to another account or is damaged|Токен сессии принадлежит другому аккаунту или повреждён\nУсі проксі недоступні. Steam заблоковано.|All proxies unavailable. Steam blocked.|Все прокси недоступны. Steam заблокирован.\nУсі проксі недоступні. Пряме з’єднання зі Steam заблоковано.|All proxies unavailable. Direct Steam connection blocked.|Все прокси недоступны. Прямое соединение со Steam заблокировано.\nФайл|File|Файл\nФайл недоступний|File unavailable|Файл недоступен\nФормат проксі: http://user:password@host:port або socks5h://host:port.|Proxy format: http://user:password@host:port or socks5h://host:port.|Формат прокси: http://user:password@host:port или socks5h://host:port.\nЦе підтвердження вже має записану дію. Перевірте її стан у Steam; автоматичне повторення заблоковано|This confirmation has a recorded action. Check its state in Steam; automatic retries blocked|Для этого подтверждения уже записано действие. Проверьте его в Steam; автоповтор заблокирован\nЦикл у структурі папок.|Cycle in folder hierarchy.|Цикл в структуре папок.\nЧас операції вичерпано.|Operation timed out.|Время операции истекло.\nЧас очікування входу вичерпано|Login timed out|Время ожидания входа истекло\nЧас очікування мережевої операції вичерпано.|Network operation timed out.|Время ожидания сетевой операции истекло.",
  importCancelledCorrectTheErrorsAndTryAgain_2ae5df2:
    "Импорт отменён. Исправьте ошибки и повторите.",
  translationTable_30c9806:
    "Імпорт|Import|Импорт\nНевідомий режим імпорту.|Unknown import mode.|Неизвестный режим импорта.\nПопередній перегляд імпорту застарів. Виберіть файли повторно.|Import preview expired. Select the files again.|Предпросмотр импорта устарел. Выберите файлы повторно.\nІмпорт списків проксі|Import proxy lists|Импорт списков прокси\nНекоректні рядки у списку проксі. Перевірте формат.|Invalid proxy-list rows. Check the format.|Некорректные строки в списке прокси. Проверьте формат.\nСписок проксі збережено.|Proxy list saved.|Список прокси сохранён.\nСписок проксі видалено.|Proxy list deleted.|Список прокси удалён.\nНекоректний список акаунтів.|Invalid account list.|Некорректный список аккаунтов.\nНепідтримуваний запис JSON|Unsupported JSON record|Неподдерживаемая запись JSON\nЗапис JSON не відповідає вибраному формату|JSON record does not match the selected format|Запись JSON не соответствует выбранному формату\nНе вдалося перевірити підтвердження. Перевірте маршрут і сесію.|Could not check confirmations. Check the route and session.|Не удалось проверить подтверждения. Проверьте маршрут и сессию.\nСписок перевищує ліміт 2000 проксі|List exceeds the 2000-proxy limit|Список превышает лимит 2000 прокси\nПроксі не знайдено.|Proxy not found.|Прокси не найден.\nСписок проксі не знайдено.|Proxy list not found.|Список прокси не найден.\nПапку не знайдено.|Folder not found.|Папка не найдена.\nАкаунт не знайдено.|Account not found.|Аккаунт не найден.\nДля підтверджень потрібні identity_secret та device_id у maFile.|Confirmations require identity_secret and device_id in the maFile.|Для подтверждений нужны identity_secret и device_id в maFile.\nПроксі доступний|Proxy available|Прокси доступен",
  translationTable_eded315:
    "Блокування|Locking|Блокировка\nPIN-блокування після бездіяльності, хвилин|PIN lock after inactivity, minutes|PIN-блокировка после бездействия, минуты\nПарольне блокування після бездіяльності, хвилин|Password lock after inactivity, minutes|Парольная блокировка после бездействия, минуты\n0 вимикає відповідний таймер. Обидва відліки починаються з останньої дії користувача. Парольний таймер продовжується під PIN-блокуванням; коротший парольний таймер спрацьовує першим.|0 disables the corresponding timer. Both timers start from the last user activity. The password timer continues during PIN lock; an earlier password timeout takes priority.|0 отключает соответствующий таймер. Оба отсчёта начинаются с последнего действия пользователя. Парольный таймер продолжается при PIN-блокировке; более короткий парольный таймер срабатывает первым.\nPIN приховує акаунти й зупиняє операції, але ключ лишається в оперативній пам’яті. Парольне блокування очищує ключ і секрети. Після перезапуску потрібне повне розблокування.|PIN hides accounts and stops operations, but retains the key in memory. Password lock clears the key and secrets. A restart requires full unlocking.|PIN скрывает аккаунты и останавливает операции, но ключ остаётся в оперативной памяти. Парольная блокировка очищает ключ и секреты. После перезапуска нужна полная разблокировка.\nУспішний PIN-вхід починає обидва відліки заново. Невірний PIN не подовжує сеанс.|A successful PIN unlock restarts both timers. An incorrect PIN does not extend the session.|Успешный PIN-вход запускает оба отсчёта заново. Неверный PIN не продлевает сеанс.\nБезпека доступу|Access security|Безопасность доступа\nПароль увімкнено|Password enabled|Пароль включён\nПароль вимкнено|Password disabled|Пароль отключён\nУвімкнути пароль|Enable password|Включить пароль\nШвидкий PIN|Quick PIN|Быстрый PIN\nPIN — 6–12 цифр для швидкого повернення в поточний сеанс. Він не замінює пароль або Authenticator.|A 6–12 digit PIN quickly restores the current session. It does not replace your password or Authenticator.|PIN из 6–12 цифр быстро возвращает в текущий сеанс. Он не заменяет пароль или Authenticator.\nЗмінити PIN|Change PIN|Изменить PIN\nНалаштувати PIN|Set up PIN|Настроить PIN\nВимкнути PIN|Disable PIN|Отключить PIN\nВимкнення PIN|Disable PIN|Отключение PIN\nЗміна PIN|Change PIN|Изменение PIN\nНалаштування PIN|PIN setup|Настройка PIN\nЗміна PIN потребує чинного пароля та коду Authenticator, якщо ці засоби захисту увімкнено.|Changing PIN requires the current password and Authenticator code when these protections are enabled.|Изменение PIN требует текущего пароля и кода Authenticator, если эти средства защиты включены.\nНовий PIN|New PIN|Новый PIN\nПовторіть PIN|Confirm PIN|Повторите PIN\nPIN має містити від 6 до 12 цифр.|PIN must contain 6–12 digits.|PIN должен содержать от 6 до 12 цифр.\nPIN-коди не збігаються.|PINs do not match.|PIN-коды не совпадают.\nPIN вимкнено|PIN disabled|PIN отключён\nPIN збережено|PIN saved|PIN сохранён\nШВИДКЕ БЛОКУВАННЯ|QUICK LOCK|БЫСТРАЯ БЛОКИРОВКА\nВведіть PIN|Enter PIN|Введите PIN\nСеанс приховано. Введіть PIN, щоб продовжити.|Session hidden. Enter your PIN to continue.|Сеанс скрыт. Введите PIN, чтобы продолжить.\nРозблокувати паролем|Unlock with password|Разблокировать паролем\nПовне блокування автоматично спрацює за парольним таймером.|The password timer will automatically apply a full lock.|Полная блокировка автоматически сработает по парольному таймеру.\n▣  Заблокувати PIN|▣  Lock with PIN|▣  Заблокировать PIN\nНевірний PIN.|Incorrect PIN.|Неверный PIN.\nНевірний PIN-код.|Incorrect PIN.|Неверный PIN-код.\nPIN не налаштовано.|PIN is not configured.|PIN не настроен.\nСпочатку розблокуйте сховище паролем.|Unlock the vault with your password first.|Сначала разблокируйте хранилище паролем.",
  translationTable_55a1e26:
    "Спочатку налаштуйте PIN.|Set up PIN first.|Сначала настройте PIN.\nРозблокуйте сховище основним способом.|Fully unlock the vault first.|Разблокируйте хранилище основным способом.\nPIN заблоковано. Розблокуйте сховище основним способом.|PIN blocked. Fully unlock the vault.|PIN заблокирован. Разблокируйте хранилище основным способом.\nPIN налаштовано.|PIN configured.|PIN настроен.\nPIN вимкнено.|PIN disabled.|PIN отключён.\nПарольний таймер продовжується під PIN-блокуванням, якщо його ввімкнено.|The password timer continues during PIN lock when enabled.|Парольный таймер продолжается при PIN-блокировке, если он включён.",
  openingVault_b401815: "Открываем хранилище…",
  translationTable_beb6e6e:
    "Пароль Steam збережено|Steam password saved|Пароль Steam сохранён\nПароль Steam не збережено|No Steam password saved|Пароль Steam не сохранён\nВикористати збережений пароль|Use saved password|Использовать сохранённый пароль\nПароль буде використано локально без показу|The saved password will be used locally without displaying it|Сохранённый пароль будет использован локально без показа\nПереглянути пароль|View password|Просмотреть пароль\nКопіювати пароль|Copy password|Копировать пароль\nПароль скопійовано|Password copied|Пароль скопирован\nЗбережений пароль Steam|Saved Steam password|Сохранённый пароль Steam\nПароль доступний лише в цьому вікні. Закрийте його, щоб прибрати пароль з екрана.|The password is available only in this dialog. Close it to remove the password from the screen.|Пароль доступен только в этом окне. Закройте его, чтобы убрать пароль с экрана.\nПоказати|Show|Показать\nПриховати|Hide|Скрыть\nПаролів буде додано: {added}. Конфліктів: {conflicts}.|Passwords to add: {added}. Conflicts: {conflicts}.|Будет добавлено паролей: {added}. Конфликтов: {conflicts}.\nНаявні паролі не перезаписуються. Конфліктні записи пропущено.|Existing passwords are never overwritten. Conflicting records are skipped.|Существующие пароли не перезаписываются. Конфликтные записи пропущены.\nБуде додано пароль|Password will be added|Будет добавлен пароль\nДоповнення пароля|Password addition|Добавление пароля\nДодано паролів: {count}|Passwords added: {count}|Добавлено паролей: {count}",
  translationTable_6d25531:
    "Паролі акаунтів|Account passwords|Пароли аккаунтов\nСуперечливі паролі: збережений пароль не змінено.|Conflicting passwords: the saved password was not changed.|Противоречивые пароли: сохранённый пароль не изменён.\nАвтентифікатор не відповідає наявному акаунту; пароль не змінено.|Authenticator does not match the existing account; password unchanged.|Аутентификатор не соответствует существующему аккаунту; пароль не изменён.\nЛогін не має єдиного відповідного акаунта; пароль не імпортовано.|Login has no unique matching account; password not imported.|Логин не имеет единственного соответствующего аккаунта; пароль не импортирован.\nПароль акаунта не збережено.|No account password is saved.|Пароль аккаунта не сохранён.",
  translationTable_4b31784:
    "Змінити збережений пароль|Edit saved password|Изменить сохранённый пароль\nДодати збережений пароль|Add saved password|Добавить сохранённый пароль\nНовий збережений пароль|New saved password|Новый сохранённый пароль\nПовторіть збережений пароль|Confirm saved password|Повторите сохранённый пароль\nЗмінюється лише пароль у локальному сховищі. Пароль облікового запису на серверах Steam не змінюється; вхід автоматично не виконується.|This changes only the password in the local vault. It does not change your password on Steam servers or log in automatically.|Меняется только пароль в локальном хранилище. Пароль аккаунта на серверах Steam не меняется; автоматический вход не выполняется.\nВведіть коректний збережений пароль.|Enter a valid saved password.|Введите корректный сохранённый пароль.\nЗбережений пароль оновлено|Saved password updated|Сохранённый пароль обновлён\nJSON одного акаунта або логін:пароль. Секрети обробляються локально й не потрапляють у попередній перегляд.|Single-account JSON or login:password. Secrets are processed locally and excluded from the preview.|JSON одного аккаунта или логин:пароль. Секреты обрабатываются локально и не попадают в предпросмотр.",
  translationTable_eb61410:
    "Вкажіть пароль від 1 до 4096 символів без перенесення рядків.|Enter a password of 1 to 4096 characters without line breaks.|Введите пароль от 1 до 4096 символов без переносов строк.\nЗбережений пароль акаунта змінено.|Saved account password changed.|Сохранённый пароль аккаунта изменён.\nФайли .maFile / JSON / TXT / .steamsession|Files .maFile / JSON / TXT / .steamsession|Файлы .maFile / JSON / TXT / .steamsession",
  translationTable_1fc32b4:
    "Нотатка|Note|Заметка\nБез нотатки|No note|Без заметки\nНотатку збережено|Note saved|Заметка сохранена\nАкаунтів на сторінці|Accounts per page|Аккаунтов на странице\nКод ще не готовий.|The code is not ready yet.|Код ещё не готов.\nКопіювати код Steam Guard|Copy Steam Guard code|Копировать код Steam Guard\nКод скопійовано|Code copied|Код скопирован\nАвтопідтвердження|Automatic confirmations|Автоподтверждения\nБез змін|Unchanged|Без изменений\nУвімкнути|Enable|Включить\nВимкнути|Disable|Выключить\nМаркет|Market|Маркет\nОбміни|Trades|Обмены\nПідтвердити маркет|Confirm market|Подтвердить маркет\nПідтвердити обміни|Confirm trades|Подтвердить обмены\nВибрано акаунтів: {count}|Selected accounts: {count}|Выбрано аккаунтов: {count}\nПравила оновлено|Rules updated|Правила обновлены\nПеревірка підтверджень|Review confirmations|Проверка подтверждений\nБуде підтверджено: {count}|Confirmations to approve: {count}|Будет подтверждено: {count}\nПідтвердити перевірені|Approve reviewed confirmations|Подтвердить проверенные\nПідтверджено: {count}|Confirmed: {count}|Подтверждено: {count}",
  translationTable_d5b83cb:
    "Увійти у Steam|Log in to Steam|Войти в Steam\nМасовий вхід у Steam|Bulk Steam login|Массовый вход в Steam\nЗапуск…|Starting…|Запуск…\nОброблено: {processed} / {total}|Processed: {processed} / {total}|Обработано: {processed} / {total}\nУспішно: {complete}. Очікують підтвердження: {pending}.|Successful: {complete}. Awaiting approval: {pending}.|Успешно: {complete}. Ожидают подтверждения: {pending}.\nЗупинка скасовує решту черги; розпочаті спроби можуть завершитися.|Stopping cancels remaining queued accounts; attempts already started may finish.|Остановка отменяет остаток очереди; начатые попытки могут завершиться.\nЗупинити решту|Stop remaining accounts|Остановить остальные\nЧергу зупинено|Queue stopped|Очередь остановлена\nЧергу завершено|Queue completed|Очередь завершена",
  translationTable_a406c6c:
    "Код Steam Guard недоступний.|Steam Guard code unavailable.|Код Steam Guard недоступен.\nОберіть налаштування автопідтвердження.|Choose an automatic confirmation setting.|Выберите настройку автоподтверждений.\nМасовий вхід уже виконується.|Bulk login is already running.|Массовый вход уже выполняется.\nМасовий вхід завершено або скасовано.|Bulk login completed or cancelled.|Массовый вход завершён или отменён.\nОгляд підтверджень застарів. Оновіть список.|Confirmation review expired. Refresh the list.|Проверка подтверждений устарела. Обновите список.\nНевідомий тип підтвердження.|Unknown confirmation type.|Неизвестный тип подтверждения.\nПідтвердження змінилося. Оновіть список.|Confirmation changed. Refresh the list.|Подтверждение изменилось. Обновите список.\nНекоректний список акаунтів.|Invalid account selection.|Некорректный список аккаунтов.",
  translationTable_c062afd:
    "Експорт|Export|Экспорт\nЕкспорт акаунта|Export account|Экспорт аккаунта\nЕкспорт акаунтів|Export accounts|Экспорт аккаунтов\nКласичні maFile (SDA/Nebula)|Classic maFile (SDA/Nebula)|Классические maFile (SDA/Nebula)\nВключити проксі|Include proxies|Включить прокси\nШифрувати експорт|Encrypt export|Шифровать экспорт\nПароль експорту|Export password|Пароль экспорта\nПовторіть пароль експорту|Confirm export password|Повторите пароль экспорта\nНезашифрований експорт містить паролі, сесії та секрети 2FA. Зберігайте файл у захищеному місці.|Unencrypted export contains passwords, sessions and 2FA secrets. Store it securely.|Незашифрованный экспорт содержит пароли, сессии и секреты 2FA. Храните его в защищённом месте.\nПароль експорту має містити щонайменше 15 символів.|Export password must contain at least 15 characters.|Пароль экспорта должен содержать не менее 15 символов.\nЗберегти експорт|Save export|Сохранить экспорт\nЕкспортовано акаунтів: {count}|Accounts exported: {count}|Экспортировано аккаунтов: {count}\nІмпорт smart-auth|Import smart-auth|Импорт smart-auth\nВиберіть файл smart-auth. Для зашифрованого файлу введіть його пароль; для відкритого залиште поле порожнім.|Choose a smart-auth file. Enter its password if encrypted; leave the field empty for an unencrypted file.|Выберите файл smart-auth. Для зашифрованного файла введите пароль; для открытого оставьте поле пустым.\nПароль файлу|File password|Пароль файла\nВибрати файл і переглянути|Choose file and review|Выбрать файл и просмотреть\nПеревірка імпорту smart-auth|Review smart-auth import|Проверка импорта smart-auth\nГотово: {ready}. Дублікати: {duplicates}.|Ready: {ready}. Duplicates: {duplicates}.|Готово: {ready}. Дубликаты: {duplicates}.\nПапки: {groups}. Проксі: {proxies}.|Folders: {groups}. Proxies: {proxies}.|Папки: {groups}. Прокси: {proxies}.\nЗашифрований файл|Encrypted file|Зашифрованный файл\nНезашифрований файл|Unencrypted file|Незашифрованный файл\nПісля імпорту автоматичні підтвердження вимкнено. Увімкніть потрібні правила вручну після перевірки акаунтів.|Automatic confirmations are disabled after import. Enable the required rules manually after reviewing the accounts.|После импорта автоматические подтверждения выключены. Включите нужные правила вручную после проверки аккаунтов.\nІмпорт завершено|Import completed|Импорт завершён",
  translationTable_1dbb694:
    "Наявні акаунти|Existing accounts|Существующие аккаунты\nПропустити|Skip|Пропустить\nЗамінити|Replace|Заменить\nДоповнити відсутнє|Fill missing fields|Дополнить отсутствующее\nЗамінити: імпортовані поля замінять збережені. ID акаунта та історія залишаться; автопідтвердження буде вимкнено.|Replace: imported fields replace stored values. Account ID and history remain; automatic confirmations are disabled.|Заменить: импортированные поля заменят сохранённые. ID аккаунта и история сохранятся; автоподтверждения будут выключены.\nДоповнити: додати лише відсутні пароль, аватар, нотатку та повністю відсутню сесію. Наявні поля й налаштування не змінюються.|Fill missing fields: add only a missing password, avatar, note and wholly absent session. Existing fields and settings remain unchanged.|Дополнить: добавить только отсутствующие пароль, аватар, заметку и полностью отсутствующую сессию. Существующие поля и настройки не меняются.\nПропустити: наявні акаунти не змінюються.|Skip: existing accounts remain unchanged.|Пропустить: существующие аккаунты не меняются.\nДля нових і замінених акаунтів автопідтвердження вимкнено. Перевірте акаунти перед увімкненням правил.|Automatic confirmations are disabled for new and replaced accounts. Review accounts before enabling rules.|Для новых и заменённых аккаунтов автоподтверждения выключены. Проверьте аккаунты перед включением правил.",
  cancelEntireImport_49c6b00: "Отменить весь импорт",
  translationTable_117e707:
    "Перевірка та підтвердження|Checking and confirmations|Проверка и подтверждения\nПеріодично перевіряти підтвердження|Check confirmations periodically|Периодически проверять подтверждения\nСповіщати про нові підтвердження|Notify about new confirmations|Уведомлять о новых подтверждениях\nАвтоматично підтверджувати покупки маркету|Automatically confirm market purchases|Автоматически подтверждать покупки маркета\nІнтервал перевірки, секунд|Check interval, seconds|Интервал проверки, секунд\nІнтервал перевірки, секунд (порожньо — без змін)|Check interval, seconds (empty means unchanged)|Интервал проверки, секунд (пусто — без изменений)\nПеріодична перевірка керує всіма фоновими діями. Якщо її вимкнено, правила зберігаються, але не виконуються.|Periodic checking controls all background actions. When disabled, rules are retained but do not run.|Периодическая проверка управляет всеми фоновыми действиями. При отключении правила сохраняются, но не выполняются.\nІнтервал має бути цілим числом від 30 до 86400 секунд.|Interval must be an integer from 30 to 86400 seconds.|Интервал должен быть целым числом от 30 до 86400 секунд.",
  marketPurchase_f29cbb1: "Покупка маркета",
  listingsPurchasesTrades:
    "Продажі: {sales} · Покупки: {purchases} · Обміни: {trades}",
  listingsPurchasesTrades_ab5be66:
    "Продажи: {sales} · Покупки: {purchases} · Обмены: {trades}",
  setTheCheckIntervalInAccountSettingsOrForSelectedAccounts_6467dc0:
    "Интервал проверки задаётся в настройках аккаунта или для выбранных аккаунтов.",
  tradeBotsSystemOneJSONMultipleFilesOrAPackageFolderWithManifestJson_6d11fe0:
    "Trade Bots System: один JSON, несколько файлов или папка пакета с manifest.json. Прокси и привязки импортируются из проверенного пакета.",
  reviewTradeBotsSystemImport_45c602d: "Проверка импорта Trade Bots System",
  steamGuardSecretsAreMissingCodesAndConfirmationsAreUnavailable_1ab1a08:
    "Секреты Steam Guard отсутствуют: коды и подтверждения недоступны.",
  externalTokenSavedASeparateLoginIsNeededForAMobileSession:
    "Зовнішній токен збережено; для мобільної сесії потрібен окремий вхід.",
  externalTokenSavedASeparateLoginIsNeededForAMobileSession_860bd5e:
    "Внешний токен сохранён; для мобильной сессии требуется отдельный вход.",
  tokenSavedAsMetadataMobileLoginCompatibilityIsUnverified:
    "Токен збережено як метадані; сумісність із мобільним входом не підтверджена.",
  tokenSavedAsMetadataMobileLoginCompatibilityIsUnverified_f616c58:
    "Токен сохранён как метаданные; совместимость с мобильным входом не подтверждена.",
  noProxyAssignedCheckTheRouteBeforeSigningIn:
    "Проксі не призначено. Перевірте маршрут перед входом.",
  noProxyAssignedCheckTheRouteBeforeSigningIn_8a590a9:
    "Прокси не назначен. Проверьте маршрут перед входом.",
  tradeBotsSystemTokenBelongsToAnotherAccount:
    "Токен Trade Bots System належить іншому акаунту.",
  tradeBotsSystemTokenBelongsToAnotherAccount_36a4426:
    "Токен Trade Bots System принадлежит другому аккаунту.",
  tradeBotsSystemLoginIsAlreadyLinkedToADifferentSteamID:
    "Логін Trade Bots System уже пов’язаний з іншим SteamID.",
  tradeBotsSystemLoginIsAlreadyLinkedToADifferentSteamID_8c3cde0:
    "Логин Trade Bots System уже связан с другим SteamID.",
  tradeBotsSystemSteamIDIsAlreadyLinkedToADifferentLogin:
    "SteamID Trade Bots System уже пов’язаний з іншим логіном.",
  tradeBotsSystemSteamIDIsAlreadyLinkedToADifferentLogin_07a1c09:
    "SteamID Trade Bots System уже связан с другим логином.",
  enterAPasswordOf116384CharactersWithoutLineBreaks:
    "Вкажіть пароль від 1 до 16384 символів без перенесення рядків.",
  enterAPasswordOf116384CharactersWithoutLineBreaks_133fff1:
    "Введите пароль от 1 до 16384 символов без переноса строк.",
  aTradeBotsSystemProxyExceedsTransportLimitsThePackageWasNotImported:
    "Проксі Trade Bots System несумісний з обмеженнями транспорту. Пакет не імпортовано.",
  aTradeBotsSystemProxyExceedsTransportLimitsThePackageWasNotImported_5aef52e:
    "Прокси Trade Bots System несовместим с ограничениями транспорта. Пакет не импортирован.",
  invalidTradeBotsSystemV1PackageCheckItsSchemaIntegrityAndAssignments:
    "Некоректний пакет Trade Bots System v1. Перевірте схему, цілісність і прив’язки.",
  invalidTradeBotsSystemV1PackageCheckItsSchemaIntegrityAndAssignments_43a329a:
    "Некорректный пакет Trade Bots System v1. Проверьте схему, целостность и привязки.",
  translationTable_74a25c3:
    "Відкрити в браузері|Open in browser|Открыть в браузере\nЗакрити браузер|Close browser|Закрыть браузер\nЗакрити браузери|Close browsers|Закрыть браузеры\nЗакрити всі браузери|Close all browsers|Закрыть все браузеры\nБраузер Chromium|Chromium browser|Браузер Chromium\nМаксимум відкритих акаунтів|Maximum open accounts|Максимум открытых аккаунтов\nРозширення Chrome Web Store — одне посилання на рядок|Chrome Web Store extensions — one link per line|Расширения Chrome Web Store — одна ссылка на строку\nОкреме вікно й профіль для кожного акаунта. Потрібен призначений проксі; прямого резервного підключення немає.|Each account has its own window and profile. An assigned proxy is required; there is no direct connection fallback.|У каждого аккаунта своё окно и профиль. Требуется назначенный прокси; прямого резервного подключения нет.\nБлокування програми закриває браузери. Зміна списку розширень також закриває відкриті вікна; порожній список запускає без розширень.|Locking the app closes its browsers. Changing the extension list also closes open windows; an empty list disables extensions.|Блокировка программы закрывает браузеры. Изменение списка расширений также закрывает окна; пустой список отключает расширения.\nПеревищено ліміт браузерів. Змініть його в налаштуваннях.|Browser limit exceeded. Change it in settings.|Превышен лимит браузеров. Измените его в настройках.\nПеревищено ліміт браузерів. Закрийте зайві вікна або змініть ліміт.|Browser limit exceeded. Close some windows or change the limit.|Превышен лимит браузеров. Закройте лишние окна или измените лимит.\nВідкриття браузерів уже виконується.|Browsers are already being opened.|Открытие браузеров уже выполняется.\nЧергу браузерів не знайдено.|Browser queue not found.|Очередь браузеров не найдена.\nПідготовка сесій, проксі та розширень…|Preparing sessions, proxies and extensions…|Подготовка сессий, прокси и расширений…\nОброблено: {processed} / {total}|Processed: {processed} / {total}|Обработано: {processed} / {total}\nБраузерів відкрито: {count}|Browsers opened: {count}|Открыто браузеров: {count}\nЗупинити решту|Stop remaining|Остановить оставшиеся\nЧергу зупинено|Queue stopped|Очередь остановлена\nЧергу завершено|Queue complete|Очередь завершена\nChromium відсутній у збірці. Перевстановіть програму.|Chromium is missing from this build. Reinstall the app.|Chromium отсутствует в сборке. Переустановите программу.\nНекоректний пакет Chromium.|Invalid Chromium package.|Некорректный пакет Chromium.\nНе вдалося відкрити захищений браузер. Перевірте проксі та сесію Steam.|Could not open the protected browser. Check the proxy and Steam session.|Не удалось открыть защищённый браузер. Проверьте прокси и сессию Steam.\nSteam тимчасово обмежив запити (HTTP 429). Спробуйте пізніше.|Steam temporarily limited requests (HTTP 429). Try again later.|Steam временно ограничил запросы (HTTP 429). Попробуйте позже.\nНе вдалося підготувати розширення браузера. Перевірте список Chrome Web Store у налаштуваннях.|Could not prepare browser extensions. Check the Chrome Web Store list in settings.|Не удалось подготовить расширения браузера. Проверьте список Chrome Web Store в настройках.\nВкажіть ID або HTTPS-посилання Chrome Web Store.|Enter a Chrome Web Store ID or HTTPS link.|Укажите ID или HTTPS-ссылку Chrome Web Store.\nНеправильне посилання Chrome Web Store.|Invalid Chrome Web Store link.|Неправильная ссылка Chrome Web Store.\nДозволено лише канонічне HTTPS-посилання Chrome Web Store.|Only a canonical Chrome Web Store HTTPS link is allowed.|Допускается только каноническая HTTPS-ссылка Chrome Web Store.\nДозволено не більше 20 розширень.|Up to 20 extensions are allowed.|Допускается не более 20 расширений.\nРозширення не пройшло перевірку безпеки.|Extension security verification failed.|Расширение не прошло проверку безопасности.\nВідновлення акаунта|Account recovery|Восстановление аккаунта\nСтворення API-ключа|API key creation|Создание API-ключа\nІнше підтвердження Steam (тип {type})|Other Steam confirmation (type {type})|Другое подтверждение Steam (тип {type})\nЛише ручне підтвердження|Manual confirmation only|Только ручное подтверждение\nДо 20 розширень Manifest V3. Розширення з доступом до проксі, nativeMessaging або debugger не підтримуються.|Up to 20 Manifest V3 extensions. Extensions with proxy, nativeMessaging or debugger access are unsupported.|До 20 расширений Manifest V3. Расширения с доступом к прокси, nativeMessaging или debugger не поддерживаются.",
  translationTable_f5ced0f:
    "Увімкнути Smart Trader|Enable Smart Trader|Включить Smart Trader\nТакож автоматично натискає Allow у вікні дозволів Smart Trader. Угода, дозволи й налаштування розширення зберігаються в цьому профілі браузера.|Also automatically clicks Allow in Smart Trader's permission dialog. The agreement, permissions and extension settings are saved in this browser profile.|Также автоматически нажимает Allow в окне разрешений Smart Trader. Соглашение, разрешения и настройки расширения сохраняются в этом профиле браузера.\nАвтоматично приймати початкову угоду Smart Trader|Automatically accept Smart Trader's initial agreement|Автоматически принимать начальное соглашение Smart Trader\nПід час першого запуску позначає всі прапорці ліцензії, сторонніх сервісів та автоматизації й натискає кнопку підтвердження незалежно від мови.|On first run, checks all license, third-party service and automation checkboxes and clicks the confirmation button in any language.|При первом запуске отмечает все флажки лицензии, сторонних сервисов и автоматизации и нажимает кнопку подтверждения независимо от языка.\nДодаткові розширення Chrome Web Store — одне посилання на рядок|Additional Chrome Web Store extensions — one link per line|Дополнительные расширения Chrome Web Store — одна ссылка на строку\nБлокування програми закриває браузери. Зміна налаштувань розширень також закриває відкриті вікна.|Locking the app closes its browsers. Changing extension settings also closes open windows.|Блокировка программы закрывает браузеры. Изменение настроек расширений также закрывает окна.\nДо 20 розширень Manifest V3 загалом, включно з увімкненим Smart Trader. Розширення з доступом до проксі, nativeMessaging або debugger не підтримуються.|Up to 20 Manifest V3 extensions in total, including Smart Trader when enabled. Extensions with proxy, nativeMessaging or debugger access are unsupported.|Всего до 20 расширений Manifest V3, включая включённый Smart Trader. Расширения с доступом к прокси, nativeMessaging или debugger не поддерживаются.",
  translationTable_da1481d:
    "Окрема вебсесія браузера|Separate browser web session|Отдельная веб-сессия браузера\nSteam Web у браузері використовує Chrome на Windows і зберігається окремо від сесії автентифікатора. Якщо вимкнути, браузер використовує сесію автентифікатора, як раніше.|Steam Web in the browser uses Chrome on Windows and is saved separately from the authenticator session. When disabled, the browser uses the authenticator session as before.|Steam Web в браузере использует Chrome на Windows и сохраняется отдельно от сессии аутентификатора. Если отключить, браузер использует сессию аутентификатора, как раньше.\nВигляд і мова браузера|Browser appearance and language|Внешний вид и язык браузера\nТема браузера|Browser theme|Тема браузера\nМова браузера|Browser language|Язык браузера\nЯк у системі|System default|Как в системе\nЗакладки браузера|Browser bookmarks|Закладки браузера\nПоказувати панель закладок|Show bookmarks bar|Показывать панель закладок\nНазва закладки|Bookmark title|Название закладки\nАдреса закладки|Bookmark URL|Адрес закладки\nВидалити закладку|Remove bookmark|Удалить закладку\nДодати закладку|Add bookmark|Добавить закладку\nДо 100 закладок. Назва — до 120 символів; адреса — HTTP або HTTPS без логіна та пароля.|Up to 100 bookmarks. Titles can contain up to 120 characters; URLs must use HTTP or HTTPS without a username or password.|До 100 закладок. Название — до 120 символов; адрес — HTTP или HTTPS без логина и пароля.\nЗміна налаштувань браузера закриває відкриті вікна. Нові параметри застосовуються під час наступного відкриття.|Changing browser settings closes open windows. New settings apply the next time you open the browser.|Изменение настроек браузера закрывает открытые окна. Новые параметры применяются при следующем открытии.\nРозширення браузера|Browser extensions|Расширения браузера\nУсі ввімкнені розширення закріплено на панелі браузера.|All enabled extensions are pinned to the browser toolbar.|Все включённые расширения закреплены на панели браузера.",
  translationTable_37366ab:
    "Збережіть пароль акаунта для створення окремої вебсесії Steam.|Save the account password to create a separate Steam web session.|Сохраните пароль аккаунта для создания отдельной веб-сессии Steam.\nSteam потребує додаткового підтвердження входу у вебсесію.|Steam requires additional confirmation to sign in to the web session.|Steam требует дополнительного подтверждения входа в веб-сессию.\nНекоректні налаштування браузера.|Invalid browser settings.|Некорректные настройки браузера.\nНекоректна закладка браузера.|Invalid browser bookmark.|Некорректная закладка браузера.\nНекоректна адреса закладки.|Invalid bookmark URL.|Некорректный адрес закладки.\nЗакладки підтримують лише HTTP(S) без облікових даних.|Bookmarks support only HTTP(S) without credentials.|Закладки поддерживают только HTTP(S) без учётных данных.\nЗбережений список додається до кожного нового профілю. Зміни закладок у Chromium не синхронізуються зі smart-auth.|The saved list is added to each new profile. Bookmark changes made in Chromium do not sync with smart-auth.|Сохранённый список добавляется в каждый новый профиль. Изменения закладок в Chromium не синхронизируются со smart-auth.",
  translationTable_8fd86e1:
    "Розподіл проксі|Proxy allocation|Распределение прокси\nКожен акаунт отримує один проксі з кожного списку. Перший список — основний маршрут, наступні — резервні.|Each account receives one proxy from each list. The first list provides the primary route; subsequent lists provide backups.|Каждый аккаунт получает один прокси из каждого списка. Первый список задаёт основной маршрут, последующие — резервные.\nОкремі проксі додаються вручну як додаткові маршрути. Повторне використання проксі зі списків потребує окремого підтвердження.|Individual proxies are added manually as additional routes. Reusing proxies from lists requires separate confirmation.|Отдельные прокси добавляются вручную как дополнительные маршруты. Повторное использование прокси из списков требует отдельного подтверждения.\nМаршрути імпортованих акаунтів|Imported account routes|Маршруты импортируемых аккаунтов\nВикористати списки папки / Зберегти з імпорту|Use folder lists / Keep imported routes|Использовать списки папки / Сохранить из импорта\nВибрати списки та окремі проксі|Choose lists and individual proxies|Выбрать списки и отдельные прокси\nПеревірка розподілу проксі|Review proxy allocation|Проверка распределения прокси\nАкаунтів для розподілу: {count}|Accounts to allocate: {count}|Аккаунтов для распределения: {count}\nДоступно: {available}. Потрібно: {required}. Бракує: {shortage}.|Available: {available}. Required: {required}. Short: {shortage}.|Доступно: {available}. Нужно: {required}. Не хватает: {shortage}.\nСпочатку призначаються різні проксі. Лише акаунти, яким їх бракує, повторно отримають проксі цього списку по колу.|Distinct proxies are assigned first. Only accounts without a proxy reuse this list’s proxies in order.|Сначала назначаются разные прокси. Только аккаунты, которым прокси не хватило, повторно получат прокси этого списка по кругу.\nДозволити повторне використання зі списку «{name}» для {count} акаунтів.|Allow reuse from list “{name}” for {count} accounts.|Разрешить повторное использование из списка «{name}» для {count} аккаунтов.\nПідтвердити розподіл|Confirm allocation|Подтвердить распределение\nРозподіл проксі застосовано|Proxy allocation applied|Распределение прокси применено\nЗберегти й перерозподілити проксі|Save and redistribute proxies|Сохранить и перераспределить прокси\nНе вдалося підготувати розподіл проксі.|Could not prepare proxy allocation.|Не удалось подготовить распределение прокси.",
  translationTable_9f08c30:
    "Маршрути акаунтів|Account routes|Маршруты аккаунтов\nЗберегти ручні маршрути / Використати списки папки|Keep manual routes / Use folder lists|Сохранить ручные маршруты / Использовать списки папки\nУ цьому списку немає проксі. Додайте проксі до списку перед розподілом.|This list has no proxies. Add proxies to the list before allocating.|В этом списке нет прокси. Добавьте прокси в список перед распределением.",
  translationTable_19c1b56:
    "Некоректний розподіл проксі. Повторіть попередній перегляд.|Invalid proxy allocation. Prepare a new preview.|Некорректное распределение прокси. Повторите предварительный просмотр.\nНевідома дія розподілу проксі.|Unknown proxy allocation action.|Неизвестное действие распределения прокси.\nПопередній перегляд розподілу застарів. Повторіть перевірку.|The allocation preview is stale. Review it again.|Предварительный просмотр распределения устарел. Повторите проверку.\nПопередній перегляд імпорту застарів. Повторіть імпорт.|The import preview is stale. Start the import again.|Предварительный просмотр импорта устарел. Повторите импорт.\nУ вибраному списку немає проксі. Додайте адреси або виберіть інший список.|The selected list has no proxies. Add addresses or choose another list.|В выбранном списке нет прокси. Добавьте адреса или выберите другой список.\nПідтвердіть повторне використання для кожного списку, де не вистачає проксі.|Confirm reuse for each list that has a proxy shortage.|Подтвердите повторное использование для каждого списка, в котором не хватает прокси.",
  translationTable_7a1f6ed:
    "Некоректні параметри розподілу.|Invalid allocation options.|Некорректные параметры распределения.\nСписок проксі потребує індивідуального розподілу між акаунтами.|This proxy list needs individual allocation across accounts.|Этот список прокси требует индивидуального распределения между аккаунтами.",
  translationTable_257c114:
    "Нових акаунтів: {imported}. Оновлених: {updated}. Наявних: {duplicates}.|New accounts: {imported}. Updated: {updated}. Existing: {duplicates}.|Новых аккаунтов: {imported}. Обновляемых: {updated}. Существующих: {duplicates}.\nПаролів буде додано: {count}|Passwords to add: {count}|Будет добавлено паролей: {count}",
  keepImportedFolders_06042ca: "Сохранить папки из импорта",
  translationTable_88b587b:
    "Перевіряємо захист сховища… Це може тривати кілька секунд.|Checking vault protection… This may take a few seconds.|Проверяем защиту хранилища… Это может занять несколько секунд.\nЗабагато спроб. Спробуйте через {seconds} с.|Too many attempts. Try again in {seconds} seconds.|Слишком много попыток. Повторите через {seconds} с.\nШифрування сховища|Vault encryption|Шифрование хранилища\nПарольний захист: scrypt (256 МіБ) та AES-256-GCM.|Password protection: scrypt (256 MiB) and AES-256-GCM.|Защита паролем: scrypt (256 МиБ) и AES-256-GCM.\nПарольне сховище автоматично переходить на scrypt (256 МіБ) та AES-256-GCM після повного розблокування.|Password-protected vaults automatically upgrade to scrypt (256 MiB) and AES-256-GCM after full authentication.|Хранилище с паролем автоматически переходит на scrypt (256 МиБ) и AES-256-GCM после полной разблокировки.\nПароль вимкнено. Захист файла покладається на засоби доступу Windows.|Password protection is off. File protection relies on Windows access controls.|Пароль отключён. Защита файла зависит от средств доступа Windows.\nЛокальний TOTP перевіряє вхід у застосунок, але не є окремим фактором шифрування файла сховища.|Local TOTP verifies access to the app, but is not an independent factor for encrypting the vault file.|Локальный TOTP проверяет вход в приложение, но не является отдельным фактором шифрования файла хранилища.",
  translationTable_c147bf0:
    "Чинний пароль коротший за 15 символів. Змініть його на довшу унікальну парольну фразу.|Your current password is shorter than 15 characters. Change it to a longer, unique passphrase.|Текущий пароль короче 15 символов. Замените его более длинной уникальной парольной фразой.\nПароль має містити щонайменше 15 символів.|Password must contain at least 15 characters.|Пароль должен содержать не менее 15 символов.\nПеревірка доступу вже виконується.|An access check is already running.|Проверка доступа уже выполняется.\nНекоректні параметри захисту сховища.|Invalid vault protection parameters.|Некорректные параметры защиты хранилища.\nНевідома версія сховища.|Unknown vault version.|Неизвестная версия хранилища.",
  couldNotSaveBruteForceProtectionCheckFilePermissions:
    "Не вдалося зберегти захист від перебору. Перевірте права доступу.",
  couldNotSaveBruteForceProtectionCheckFilePermissions_d06195b:
    "Не удалось сохранить защиту от перебора. Проверьте права доступа.",
  translationTable_f80ecba:
    "Менеджер паролів|Password manager|Менеджер паролей\n2fa (not steam)|2fa (not steam)|2fa (not steam)\nОбрати всі за фільтром (усі сторінки)|Select all filtered accounts (all pages)|Выбрать все по фильтру (все страницы)\nПослідовна перевірка проксі з паузою 1 секунда між акаунтами.|Proxies are checked one account at a time, with a one-second pause between accounts.|Прокси проверяются по одному аккаунту с паузой в одну секунду.\nПроксі працює: {count}|Working proxies: {count}|Прокси работают: {count}\nПеревірку проксі завершено|Proxy checks complete|Проверка прокси завершена\n◌ Перевірка проксі…|◌ Checking proxy…|◌ Проверка прокси…",
  translationTable_fb698e4:
    "Масові операції|Bulk operations|Массовые операции\nОдночасних завдань акаунтів|Concurrent account tasks|Одновременных задач аккаунтов\nОдночасних перевірок проксі|Concurrent proxy checks|Одновременных проверок прокси\nОдночасних запусків браузера|Concurrent browser launches|Одновременных запусков браузера\nПауза між стартами завдань, мс|Delay between task starts, ms|Пауза между стартами задач, мс\nПауза між стартами браузера, мс|Delay between browser starts, ms|Пауза между стартами браузера, мс\nВідновити рекомендовані|Restore recommended values|Восстановить рекомендуемые\nЦе наш обережний початковий профіль, а не гарантовані ліміти Valve. Зміни застосовуються до нових операцій після збереження.|This is our conservative starting profile, not guaranteed Valve limits. Changes apply to new operations after saving.|Это наш осторожный начальный профиль, а не гарантированные лимиты Valve. Изменения применяются к новым операциям после сохранения.\nМережевий захист: до 12 HTTP-запитів одночасно; один запит на маршрут і сервер, пауза щонайменше 750 мс. Для одного акаунта — щонайменше 500 мс між запитами.|Network protection: up to 12 concurrent HTTP requests; one request per route and server, at least 750 ms between starts. For one account, at least 500 ms between requests.|Сетевая защита: до 12 HTTP-запросов одновременно; один запрос на маршрут и сервер, пауза не менее 750 мс. Для одного аккаунта — не менее 500 мс между запросами.\nПеревірка проксі використовує налаштування масових операцій.|Proxy checks use the bulk operation settings.|Проверка прокси использует настройки массовых операций.\nВиконується одночасно: {count}|Running concurrently: {count}|Выполняется одновременно: {count}",
  translationTable_666490e:
    "Перебіг масової операції|Bulk operation progress|Ход массовой операции\nУ черзі|Queued|В очереди\nВиконується|Running|Выполняется\nЗавершено|Completed|Завершено\nОчікує підтвердження|Awaiting confirmation|Ожидает подтверждения\nСкасовано|Cancelled|Отменено\nВиконання операції…|Working…|Выполнение операции…\nАкаунт|Account|Аккаунт\nСесія|Session|Сессия",
  chooseAction_2c74cda: "Выберите действие",
  run_224c8e9: "Выполнить",
  bulkAction_499b293: "Массовое действие",
  failed_72aecd9: "Ошибка",
  general_fdd17d1: "Общие",
  sendingConfirmations_105de49: "Отправка подтверждений",
  translationTable_058b212:
    "Профіль браузера|Browser profile|Профиль браузера\nПрофілі браузера|Browser profiles|Профили браузера\nCookies, історія та сховище зберігаються для цього користувача Windows окремо від резервної копії й експорту сховища.|Cookies, history and storage persist for this Windows user separately from vault backup and export.|Cookies, история и хранилище сохраняются для этого пользователя Windows отдельно от резервной копии и экспорта хранилища.\nЗвичайний Chromium; шум на рівні документа. Це не повний рушій Dolphin і не обхід анонімності чи лімітів. UA та ОС залишаються рідними. Мова й часовий пояс — вручну або системні; геолокація не рандомізується.|Stock Chromium; document-level noise. Not the full Dolphin engine or an anonymity or rate-limit bypass. Native UA and OS retained. Language and timezone are manual or system; geolocation is not randomized.|Обычный Chromium; шум на уровне документа. Это не полный движок Dolphin и не обход анонимности или лимитов. UA и ОС остаются родными. Язык и часовой пояс — вручную или системные; геолокация не рандомизируется.\nГенерація змінює відбиток без очищення даних браузера. Відкрийте браузер повторно для застосування.|Generation changes the fingerprint without clearing browser data. Reopen the browser to apply.|Генерация меняет отпечаток без очистки данных браузера. Откройте браузер повторно для применения.\nЛише позначені поля зміняться для всіх вибраних акаунтів. Генерація створює окремий відбиток кожному.|Only checked fields change for every selected account. Generation creates a separate fingerprint for each.|Только отмеченные поля изменятся у всех выбранных аккаунтов. Генерация создает отдельный отпечаток каждому.\nГенерація|Generation|Генерация\nЗастосувати це поле|Apply this field|Применить это поле\nЧасовий пояс|Timezone|Часовой пояс\nЕкран|Screen|Экран\nЕкран для сайтів|Screen reported to websites|Экран для сайтов\nПотоки CPU|CPU threads|Потоки CPU\nПам’ять (ГБ)|Memory (GB)|Память (ГБ)\nГеолокація|Geolocation|Геолокация\nБлокувати сторонні cookies|Block third-party cookies|Блокировать сторонние cookies\nЗгенерувати окремі профілі|Generate separate profiles|Создать отдельные профили\nПозначте поля для зміни.|Check fields to change.|Отметьте поля для изменения.\nСпочатку закрийте браузери вибраних акаунтів.|Close the selected accounts’ browsers first.|Сначала закройте браузеры выбранных аккаунтов.\nПрофілі збережено. Відкрийте браузер повторно.|Profiles saved. Reopen the browser.|Профили сохранены. Откройте браузер повторно.",
  translationTable_510e1d6:
    "Некоректні параметри профілю браузера.|Invalid browser profile settings.|Некорректные параметры профиля браузера.\nНекоректний список акаунтів.|Invalid account list.|Некорректный список аккаунтов.",
  invalidBrowserProfileFields_8489fc2: "Некорректные поля профиля браузера.",
  invalidBrowserProfile_d31a1b8: "Некорректный профиль браузера.",
  browserProfileGenerationExhausted_a7d74e2:
    "Лимит поколений профиля браузера исчерпан.",
  translationTable_8578ae2:
    "Закрити|Close|Закрыть\nЗастосувати|Apply|Применить\nТак|Yes|Да\nНі|No|Нет\nРідний|Native|Родной\nШум|Noise|Шум\nВимкнено|Disabled|Отключено\nБлокувати|Block|Блокировать\nЗапитувати|Ask|Спрашивать\nЗахищений|Protected|Защищенный",
  newFingerprint_249c189: "Новый fingerprint",
  newFingerprintForEach_7adf5f7: "Новый fingerprint для каждого",
  stockChromiumPageLevelChangesFullFingerprintIsolationIsNotGuaranteedNativeUAAnd_af65c61:
    "Обычный Chromium; изменения на уровне страниц. Полная изоляция fingerprint не гарантируется. UA и ОС остаются родными; язык и часовой пояс — вручную или системные; геолокация не рандомизируется.",
  translationTable_7725c7e:
    "Не вдалося перевірити з’єднання зі Steam. Перевірте доступність і налаштування проксі.|Could not check the connection to Steam. Check proxy availability and settings.|Не удалось проверить соединение со Steam. Проверьте доступность и настройки прокси.\nНе вдалося створити вебсесію Steam. Перевірте дані входу та повторіть спробу.|Could not create a Steam web session. Check your login details and try again.|Не удалось создать веб-сессию Steam. Проверьте данные входа и повторите попытку.\nНе вдалося підтвердити акаунт вебсесії Steam. Повторіть вхід у браузер.|Could not verify the Steam web session account. Sign in to the browser again.|Не удалось подтвердить аккаунт веб-сессии Steam. Повторите вход в браузер.\nНе вдалося підготувати розширення браузера. Перевірте налаштування розширень.|Could not prepare browser extensions. Check the extension settings.|Не удалось подготовить расширения браузера. Проверьте настройки расширений.\nНе вдалося запустити локальне з’єднання браузера. Повторіть спробу.|Could not start the local browser connection. Try again.|Не удалось запустить локальное соединение браузера. Повторите попытку.\nНе вдалося відкрити профіль браузера. Закрийте його інші вікна та перевірте доступ до папки даних.|Could not open the browser profile. Close its other windows and check access to the data folder.|Не удалось открыть профиль браузера. Закройте его другие окна и проверьте доступ к папке данных.\nНе вдалося запустити Chromium. Перевірте наявність браузера та повторіть спробу.|Could not start Chromium. Check that the browser is installed and try again.|Не удалось запустить Chromium. Проверьте наличие браузера и повторите попытку.\nНе вдалося відкрити сторінку Steam у браузері. Перевірте з’єднання та повторіть спробу.|Could not open the Steam page in the browser. Check the connection and try again.|Не удалось открыть страницу Steam в браузере. Проверьте соединение и повторите попытку.\nНе вдалося активувати вікно браузера. Повторіть спробу.|Could not activate the browser window. Try again.|Не удалось активировать окно браузера. Повторите попытку.\nВідкриття браузера скасовано. Повторіть спробу.|Browser opening was cancelled. Try again.|Открытие браузера отменено. Повторите попытку.",
  translationTable_212034c:
    "Відстежувати вхідні обміни|Watch incoming trade offers|Отслеживать входящие обмены\nАвтоматично приймати подарунки|Automatically accept gifts|Автоматически принимать подарки\nВідстеження вхідних обмінів|Watching incoming offers|Отслеживание входящих обменов\nПриймання подарунків|Accepting gifts|Приём подарков\nПотрібна дія|Action needed|Требуется действие\nІнтервал, секунд|Interval, seconds|Интервал, секунд\nІнтервал, секунд (порожньо — без змін)|Interval, seconds (blank to keep unchanged)|Интервал, секунд (пусто — без изменений)\nПереглянути дію в браузері|View action in browser|Посмотреть действие в браузере",
  translationTable_14196c3:
    "Нові вхідні обміни|New incoming trade offers|Новые входящие обмены\nЩе стеків: {count}|More stacks: {count}|Ещё стаков: {count}\nУсі предмети — у smart-auth|View all items in smart-auth|Все предметы — в smart-auth",
  translationTable_88925a0:
    "Схеми Loot|Loot schemes|Схемы Loot\nНова схема|New scheme|Новая схема\nОчікування завершення поточної операції акаунта|Waiting for the account's current operation to finish|Ожидание завершения текущей операции аккаунта\nПопередня операція акаунта ще не завершилась. Спробуйте відкрити браузер пізніше.|The account's previous operation is still running. Try opening the browser later.|Предыдущая операция аккаунта ещё не завершилась. Попробуйте открыть браузер позже.\nЗупинити|Stop|Остановить\nСтворюйте окремі маршрути збору й запускайте кілька схем одночасно.|Create separate collection routes and run multiple schemes at once.|Создавайте отдельные маршруты сбора и запускайте несколько схем одновременно.\nЩе немає схем|No schemes yet|Пока нет схем\nДодайте джерела, склади та правила відправлення в новому вікні.|Add sources, warehouses and sender rules in a new window.|Добавьте источники, склады и правила отправки в новом окне.\nПрацює|Running|Работает\nЗа розкладом|Scheduled|По расписанию\nРучний запуск|Manual start|Ручной запуск\nДжерела|Sources|Источники\nСклади|Warehouses|Склады\nПаралельні акаунти|Concurrent accounts|Параллельные аккаунты\nІнтервал, годин|Interval, hours|Интервал, часов\nОбмінів надіслано: {count}|Offers sent: {count}|Обменов отправлено: {count}\nБез дозволеного складу: {count}|Without an allowed warehouse: {count}|Без разрешённого склада: {count}\nВідкрити схему|Open scheme|Открыть схему\nВидалити схему Loot?|Delete Loot scheme?|Удалить схему Loot?\nСпочатку зупиніть схему й перевірте незавершені обміни.|Stop the scheme and check its pending offers first.|Сначала остановите схему и проверьте незавершённые обмены.",
  someImagesAreUnavailableAllItemsAndQuantitiesAreShownBelow_1beda8e:
    "Часть изображений недоступна. Все предметы и количества показаны ниже.",
  periodicCheckingControlsConfirmationsAndNotificationsIncomingOffersAndGiftsHaveSeparateRules_e47c20e:
    "Периодическая проверка управляет подтверждениями и уведомлениями. Входящие обмены и подарки имеют отдельные правила.",
  translationTable_3abb087:
    "Показати ще 100 стеків|Show 100 more stacks|Показать ещё 100 стаков\nПоказано стеків: {shown} із {total}. Залишилось: {remaining}.|Stacks shown: {shown} of {total}. Remaining: {remaining}.|Показано стаков: {shown} из {total}. Осталось: {remaining}.\nВіддаєте|Give|Отдаёте\nОтримуєте|Receive|Получаете",
  translationTable_c4c42b6:
    "Перемістити до папки|Move to folder|Переместить в папку\nАкаунт використовується як склад Loot|Account is used as a Loot warehouse|Аккаунт используется как склад Loot\nВимкнення приймання подарунків може перервати автоматичний Loot. Оберіть дію для цих складів:|Disabling gift acceptance may interrupt automatic Loot. Choose an action for these warehouses:|Отключение приёма подарков может прервать автоматический Loot. Выберите действие для этих складов:\nВидалити зі складів і вимкнути|Remove from warehouses and disable|Удалить из складов и отключить\nЗалишити складом і вимкнути|Keep as warehouse and disable|Оставить складом и отключить\nЗміни скасовано|Changes cancelled|Изменения отменены\nОновіть дані та повторіть спробу.|Refresh and try again.|Обновите данные и повторите попытку.\nАдміністратори Steam|Steam administrators|Администраторы Steam\nДовірені SteamID64: відстеження вхідних обмінів автоматично приймає будь-який обмін від них, включно з передаванням ваших предметів. Список порожній за замовчуванням.|Trusted SteamID64s: watching incoming offers automatically accepts any trade from them, including giving your items. The list is empty by default.|Доверенные SteamID64: отслеживание входящих обменов автоматически принимает любой обмен от них, включая передачу ваших предметов. Список пуст по умолчанию.\nАкаунт зі сховища|Account from vault|Аккаунт из хранилища\nОберіть акаунт|Choose account|Выберите аккаунт\nЗовнішній SteamID64|External SteamID64|Внешний SteamID64\nДодати адміністратора|Add administrator|Добавить администратора\nНемає адміністраторів Steam|No Steam administrators|Нет администраторов Steam\nАдміністраторів Steam збережено|Steam administrators saved|Администраторы Steam сохранены\nОновити аватари|Refresh avatars|Обновить аватары\nВведіть коректний SteamID64 особистого акаунта.|Enter a valid personal SteamID64.|Введите корректный SteamID64 личного аккаунта.\nЦей SteamID64 вже додано.|This SteamID64 is already added.|Этот SteamID64 уже добавлен.",
  translationTable_d4b6682:
    "Community banned — unavailable|Community-блокування — недоступно|Community-блокировка — недоступно\nKnown Community-banned accounts are excluded from sources, folders and warehouses.|Відомі акаунти з Community-блокуванням виключено з джерел, папок і складів.|Известные аккаунты с Community-блокировкой исключены из источников, папок и складов.\nSent (awaiting delivery)|Надіслано (очікує доставки)|Отправлено (ожидает доставки)\nDelivered (verified)|Доставлено (перевірено)|Доставлено (проверено)\ndelivered|Доставлено (перевірено)|Доставлено (проверено)\nreview|Потрібна перевірка|Требуется проверка\nrollback-review|Потрібна перевірка повернення|Требуется проверка возврата\naccepted-awaiting-proof|Прийнято, очікує перевірки доставки|Принято, ожидает проверки доставки\nTrade Protection games (currently Counter-Strike 2) are sent in separate offers for each protected game. Other inventories may share an offer. The configured delay applies between every actual send, including separate offers from one account and sends from different accounts.|Ігри з Trade Protection (наразі Counter-Strike 2) надсилаються окремими обмінами для кожної захищеної гри. Інші інвентарі можуть об’єднуватися в обмін. Задана пауза діє між усіма фактичними надсиланнями, зокрема окремими обмінами одного акаунта та надсиланнями різних акаунтів.|Игры с Trade Protection (сейчас Counter-Strike 2) отправляются отдельными обменами для каждой защищённой игры. Остальные инвентари могут объединяться в обмен. Заданная пауза действует между всеми фактическими отправками, включая отдельные обмены одного аккаунта и отправки разных аккаунтов.\nTrade Protection games are sent separately, with the configured delay between actual sends. Sent offers remain pending until delivery is verified.|Ігри з Trade Protection надсилаються окремо із заданою паузою між фактичними надсиланнями. Надіслані обміни очікують перевірки доставки.|Игры с Trade Protection отправляются отдельно с заданной паузой между фактическими отправками. Отправленные обмены ожидают проверки доставки.\nScheme name|Назва схеми|Название схемы\nNew scheme|Нова схема|Новая схема\nConcurrent accounts|Одночасних акаунтів|Одновременных аккаунтов\nRetry failed sources after (seconds)|Повторити невдалі джерела через (секунд)|Повторить неудавшиеся источники через (секунд)\nAdditional retry attempts|Додаткових спроб|Дополнительных попыток\nRetry failed sources after the full source pass. Zero additional attempts disables retries. This delay is independent of the schedule interval. Unresolved offers are checked before retrying.|Повторні спроби невдалих джерел починаються після повного проходу джерел. Нуль додаткових спроб вимикає повтори. Ця пауза не залежить від інтервалу розкладу. Невизначені офери перевіряються перед повторною спробою.|Повторные попытки неудавшихся источников начинаются после полного прохода источников. Ноль дополнительных попыток отключает повторы. Эта пауза не зависит от интервала расписания. Неопределённые предложения проверяются перед повторной попыткой.\nDelay between trade sends, seconds|Пауза між надсиланням обмінів, секунд|Пауза между отправками обменов, секунд\nMinimum pause between actual outgoing trade sends, including sends from different source accounts.|Мінімальна пауза між фактичними надсиланнями обмінів, зокрема з різних акаунтів-джерел.|Минимальная пауза между фактическими отправками обменов, в том числе с разных аккаунтов-источников.\nUp to 4 accounts across all schemes. The same Steam account runs one operation at a time.|До 4 акаунтів у всіх схемах разом. Один Steam-акаунт виконує лише одну операцію за раз.|До 4 аккаунтов во всех схемах вместе. Один Steam-аккаунт выполняет только одну операцию за раз.\nAllowed senders|Дозволені відправники|Разрешённые отправители\nAll scheme sources|Усі джерела схеми|Все источники схемы\nOnly selected scheme sources can send. Folders include descendants.|Надсилають лише обрані джерела схеми. Папки включають вкладені папки.|Отправляют только выбранные источники схемы. Папки включают вложенные папки.\nApply|Застосувати|Применить\nWarehouse coverage|Покриття складами|Покрытие складами\nSources without a warehouse|Джерела без складу|Источники без склада\nAll sources have a warehouse|Усі джерела мають склад|У всех источников есть склад\nEnter a scheme name.|Введіть назву схеми.|Введите название схемы.\nConcurrency must be between 1 and 8.|Кількість одночасних акаунтів має бути від 1 до 8.|Количество одновременных аккаунтов должно быть от 1 до 8.\nOpen account profile|Відкрити профіль акаунта|Открыть профиль аккаунта\nExternal warehouse has no vault profile|Зовнішній склад не має профілю у сховищі|У внешнего склада нет профиля в хранилище\nLoot|Loot|Loot\nCollect tradable inventory into your warehouses.|Збирайте предмети для обміну на свої склади.|Собирайте предметы для обмена на свои склады.\nSave settings|Зберегти налаштування|Сохранить настройки\nPreview Loot|Попередній перегляд Loot|Предварительный просмотр Loot\nCancel run|Скасувати запуск|Отменить запуск\nSchedule|Розклад|Расписание\nEnable automatic Loot|Увімкнути автоматичний Loot|Включить автоматический Loot\nInterval, hours|Інтервал, годин|Интервал, часов\nMaximum positions per run|Ліміт позицій за запуск|Лимит позиций за запуск\nOne stack is one position. The 8192 limit does not limit the quantity inside a stack.|Один стак — одна позиція; кількість у стаку не обмежується лімітом 8192.|Один стак — одна позиция; количество в стаке не ограничивается лимитом 8192.\nInventories|Інвентарі|Инвентари\nCustom App ID|Власний App ID|Свой App ID\nAdd|Додати|Добавить\nRemove|Видалити|Удалить\nSources|Джерела|Источники\nAll accounts|Усі акаунти|Все аккаунты\nGroups and individual accounts are combined. Warehouses are excluded from sources.|Папки й окремі акаунти об’єднуються. Склади виключаються з джерел.|Папки и отдельные аккаунты объединяются. Склады исключаются из источников.\nFolders|Папки|Папки\nAccounts|Акаунти|Аккаунты\nSearch accounts|Пошук акаунтів|Поиск аккаунтов\nWarehouses|Склади|Склады\nAccount from vault|Акаунт зі сховища|Аккаунт из хранилища\nChoose account|Оберіть акаунт|Выберите аккаунт\nExternal SteamID64|Зовнішній SteamID64|Внешний SteamID64\nTrade URL or token|URL обміну або токен|URL обмена или токен\nRequired when the recipient is not a friend. Stored securely; leave blank to keep an existing token.|Потрібно, якщо одержувач не є другом. Зберігається безпечно; порожнє поле зберігає наявний токен.|Требуется, если получатель не друг. Хранится безопасно; пустое поле сохраняет имеющийся токен.\nAdd warehouse|Додати склад|Добавить склад\nNew internal warehouses enable gift acceptance. Existing warehouse rules remain as configured.|Нові внутрішні склади вмикають приймання подарунків. Правила наявних складів зберігаються.|Новые внутренние склады включают приём подарков. Правила существующих складов сохраняются.\nNo warehouses yet|Складів ще немає|Складов пока нет\nStatus|Стан|Состояние\nIdle|Очікування|Ожидание\nRunning|Виконується|Выполняется\nLast run|Останній запуск|Последний запуск\nNext run|Наступний запуск|Следующий запуск\nJournal|Журнал|Журнал\nNo activity yet|Активності ще немає|Активности пока нет\nRefresh|Оновити|Обновить\nVault locked. Unlock the main window to use Loot.|Сховище заблоковано. Розблокуйте головне вікно для Loot.|Хранилище заблокировано. Разблокируйте главное окно для Loot.\nSettings saved|Налаштування збережено|Настройки сохранены\nInvalid personal SteamID64.|Некоректний SteamID64 особистого акаунта.|Некорректный SteamID64 личного аккаунта.\nThis warehouse is already added.|Цей склад уже додано.|Этот склад уже добавлен.\nInvalid Steam trade URL or token.|Некоректний URL обміну Steam або токен.|Некорректный URL обмена Steam или токен.\nTrade URL does not match the recipient.|URL обміну не відповідає одержувачу.|URL обмена не соответствует получателю.\nEnter a positive App ID.|Введіть додатний App ID.|Введите положительный App ID.\nSelect at least one inventory, source and warehouse.|Оберіть хоча б один інвентар, джерело та склад.|Выберите хотя бы один инвентарь, источник и склад.\nCheck the schedule numbers.|Перевірте числа розкладу.|Проверьте числа расписания.\nReview outgoing trades|Перевірка вихідних обмінів|Проверка исходящих обменов\nSources: {sources} · Positions: {positions} · Units: {units} · Offers: {offers}|Джерел: {sources} · Позицій: {positions} · Одиниць: {units} · Обмінів: {offers}|Источников: {sources} · Позиций: {positions} · Единиц: {units} · Обменов: {offers}\nItems leave the source accounts and go to the listed warehouses. Confirm only after checking the recipients.|Предмети залишать акаунти-джерела й надійдуть указаним складам. Підтвердіть після перевірки одержувачів.|Предметы покинут аккаунты-источники и поступят указанным складам. Подтвердите после проверки получателей.\nStart Loot|Запустити Loot|Запустить Loot\nSend reviewed plan|Надіслати перевірений план|Отправить проверенный план\nCancel|Скасувати|Отмена\nNothing to send|Немає предметів для надсилання|Нет предметов для отправки\nRun started|Запуск розпочато|Запуск начат\nCancellation requested|Надіслано запит скасування|Отправлен запрос отмены\nitems|предметів|предметов\npositions|позицій|позиций\nunits|одиниць|единиц\noffers|обмінів|обменов\nGift acceptance is disabled|Приймання подарунків вимкнено|Приём подарков выключен\nToken stored|Токен збережено|Токен сохранён\nPreview expired. Create a new preview.|Попередній перегляд застарів. Створіть новий.|Предварительный просмотр устарел. Создайте новый.\nShow more|Показати ще|Показать ещё\nDiscovered so far|Виявлено наразі|Обнаружено на данный момент\nAttempted sources: {attempted} / {total}|Опрацьовано джерел: {attempted} / {total}|Обработано источников: {attempted} / {total}\nTotals are discovered as each account is processed.|Підсумкову кількість буде визначено під час обробки акаунтів.|Итоговое количество будет определено при обработке аккаунтов.\nproxy|Перевірка проксі|Проверка прокси\nsession|Перевірка сесії|Проверка сессии\nauth|Вхід у Steam|Вход в Steam\nauthenticating|Вхід у Steam|Вход в Steam\ninventory|Читання інвентарю|Чтение инвентаря\nretry-wait|Очікування повторної спроби|Ожидание повторной попытки\nretry-preparing|Підготовка повторної спроби|Подготовка повторной попытки\nRetry attempt {attempt} / {max}|Повторна спроба {attempt} / {max}|Повторная попытка {attempt} / {max}\nRetry attempt: {attempt}|Повторна спроба: {attempt}|Повторная попытка: {attempt}\nFailed sources awaiting retry: {count}|Джерел очікують повторної спроби: {count}|Источников ожидают повторной попытки: {count}\nNext retry|Наступна спроба|Следующая попытка\nrunning|Виконується|Выполняется\npreparing|Підготовка|Подготовка\ncancelling|Скасування|Отмена\ncancelled|Скасовано|Отменено\ncomplete|Завершено|Завершено\ncompleted|Завершено|Завершено\nfailed|Помилка|Ошибка\ndispatching|Надсилання|Отправка\nunknown|Результат невідомий|Результат неизвестен\nsent|Надіслано|Отправлено\nmobile-confirmation|Потрібне мобільне підтвердження|Требуется мобильное подтверждение\nemail-confirmation|Потрібне підтвердження електронною поштою|Требуется подтверждение по электронной почте\naccepted|Прийнято|Принято\ndeclined|Відхилено|Отклонено\nexpired|Термін минув|Срок истёк\ninvalid|Недійсний|Недействительный\nescrow|Утримання Steam|Удержание Steam\nnot-found|Офер не знайдено — доступно для наступного збору|Предложение не найдено — доступно для следующего сбора\nnot-dispatched|Не надіслано|Не отправлено\nsending|Надсилання|Отправка\nconfirming|Підтвердження|Подтверждение\nqueued|У черзі|В очереди\npending|Очікується завершення|Ожидается завершение\nAccount progress|Стан акаунтів|Состояние аккаунтов\nSkipped accounts|Пропущені акаунти|Пропущенные аккаунты\nFailed accounts|Акаунти з помилками|Аккаунты с ошибками\nShow older events|Показати попередні події|Показать предыдущие события\nOlder events available: {count}|Доступно попередніх подій: {count}|Доступно предыдущих событий: {count}\nNewer events available: {count}|Доступно нових подій: {count}|Доступно новых событий: {count}\nInventory page read|Сторінку інвентарю прочитано|Страница инвентаря прочитана\nSource processed|Джерело опрацьовано|Источник обработан\nOffer accepted; awaiting delivery verification|Офер прийнято; очікується перевірка доставки|Офер принят; ожидается проверка доставки\nSteam result {result}|Результат Steam: {result}|Результат Steam: {result}\nOffer {id}|Офер {id}|Офер {id}\nGame {count}|Гра {count}|Игра {count}\nPage {count}|Сторінка {count}|Страница {count}\nTotal positions: {count}|Усього позицій: {count}|Всего позиций: {count}\nTradable positions: {count}|Доступних для обміну позицій: {count}|Доступных для обмена позиций: {count}\nInventory revalidation|Повторна перевірка інвентарю|Повторная проверка инвентаря\nChecking session|Перевірка сесії|Проверка сессии\nPreparing account|Підготовка акаунта|Подготовка аккаунта\nSource failed|Помилка джерела|Ошибка источника\nSource cancelled|Обробку джерела скасовано|Обработка источника отменена\nLive activity|Журнал виконання|Журнал выполнения\nSource progress|Перебіг обробки джерел|Ход обработки источников\nFollow latest|Стежити за новими подіями|Следить за новыми событиями\nNo events yet|Подій ще немає|Событий пока нет\nEvents: {count} · Latest sequence: {sequence}|Подій: {count} · Останній номер: {sequence}|Событий: {count} · Последний номер: {sequence}\nEarlier events omitted: {count}|Попередніх подій не показано: {count}|Предыдущих событий не показано: {count}\nTotal sources|Усього джерел|Всего источников\nActive sources|Активних джерел|Активных источников\nAttempted sources|Опрацьовано джерел|Обработано источников\nCompleted sources|Завершених джерел|Завершённых источников\nFailed sources|Джерел з помилками|Источников с ошибками\nSkipped sources|Пропущених джерел|Пропущенных источников\nRetrying sources|Джерел на повторній спробі|Источников на повторной попытке\nPending sources|Джерел у черзі|Источников в очереди\nUnknown account|Невідомий акаунт|Неизвестный аккаунт\nRun|Запуск|Запуск\nProcessing source|Обробка джерела|Обработка источника\nActivity update|Оновлення стану|Обновление состояния\nReading inventory|Читання інвентарю|Чтение инвентаря\nInventory read|Інвентар прочитано|Инвентарь прочитан\nSource skipped|Джерело пропущено|Источник пропущен\nChecking trade before sending|Перевірка обміну перед надсиланням|Проверка обмена перед отправкой\nSending offer|Надсилання офера|Отправка офера\nConfirming offer|Підтвердження офера|Подтверждение офера\nOffer sent; awaiting delivery|Офер надіслано; очікується доставка|Офер отправлен; ожидается доставка\nDelivery verified|Доставку перевірено|Доставка проверена\nSending failed|Помилка надсилання|Ошибка отправки\nSource queued for retry|Джерело очікує повторної спроби|Источник ожидает повторной попытки\nRetrying source|Повторна обробка джерела|Повторная обработка источника\nSource processing finished|Обробку джерел завершено|Обработка источников завершена\nRun cancelled|Запуск скасовано|Запуск отменён\nRun failed|Запуск завершився помилкою|Запуск завершился ошибкой\nChecking proxy|Перевірка проксі|Проверка прокси\nProxy failed|Помилка проксі|Ошибка прокси\nProxy ready|Проксі готовий|Прокси готов\nReusing verified proxy|Повторне використання перевіреного проксі|Повторное использование проверенного прокси\nSession ready|Сесія готова|Сессия готова\nSession refreshed|Сесію оновлено|Сессия обновлена\nRefreshing session|Оновлення сесії|Обновление сессии\nSigning in to Steam|Вхід у Steam|Вход в Steam\nSteam sign-in completed|Вхід у Steam завершено|Вход в Steam завершён\nTrade permission denied|Steam не дозволяє обмін|Steam не разрешает обмен\nSteam authentication needs attention|Потрібна перевірка входу в Steam|Требуется проверка входа в Steam\nProxy connection failed|Не вдалося підключити проксі|Не удалось подключить прокси\nNo available items|Немає доступних предметів|Нет доступных предметов\nSteam rate limit|Обмеження частоти запитів Steam|Ограничение частоты запросов Steam\nSend result unknown; checking before retry|Результат надсилання невідомий; перевірка перед повтором|Результат отправки неизвестен; проверка перед повтором\nCould not save session or trade journal|Не вдалося зберегти сесію або журнал обмінів|Не удалось сохранить сессию или журнал обменов\nTemporary failure|Тимчасова помилка|Временная ошибка\nCould not verify the result|Не вдалося підтвердити результат|Не удалось подтвердить результат\nProxy attempt {attempt} / {total}|Проксі: спроба {attempt} / {total}|Прокси: попытка {attempt} / {total}\nBackup proxy|Резервний проксі|Резервный прокси\nWait {seconds} seconds|Очікування {seconds} секунд|Ожидание {seconds} секунд\nskipped|Пропущено|Пропущено\nRefresh trade status|Оновити стан обмінів|Обновить состояние обменов",
  message_8ce6ecd: "Не вдалося підтвердити повний інвентар або сесію Steam.",
  ruText_06c705c: "Не удалось проверить полный инвентарь или сессию Steam.",
  message_1da6628: "Попередній офер знайдено; повтор не потрібен.",
  ruText_bf5ee24: "Предыдущее предложение найдено; повтор не нужен.",
  message_cd0ff01: "Не вдалося підтвердити безпечне відправлення.",
  ruText_5ecc735: "Не удалось подтвердить безопасную отправку.",
  message_5137be9:
    "Steam не підтвердив дозволи на обмін для предметів цього офера.",
  ruText_c8fbefa:
    "Steam не подтвердил разрешения на обмен для предметов этого предложения.",
  pattern_849cbd6:
    "^Steam не дозволяє (джерелу відправляти|складу отримувати) предмети гри ([1-9]\\d{0,9})\\.$",
  message_7bc7d54: "джерелу відправляти",
  message_45beae8: "Steam не разрешает источнику отправлять предметы игры ",
  message_7858b85: "Steam не разрешает складу получать предметы игры ",
  translationTable_5bd4ee1:
    "Could not safely save the backup.|Не вдалося безпечно зберегти резервну копію.|Не удалось безопасно сохранить резервную копию.\nCould not save the vault. The backup may have different access settings; keep both files.|Не вдалося зберегти сховище. Резервна копія може мати інші налаштування доступу; збережіть обидва файли.|Не удалось сохранить хранилище. Резервная копия может иметь другие настройки доступа; сохраните оба файла.\nPassword manager|Менеджер паролів|Менеджер паролей\nNew entry|Новий запис|Новая запись\nEdit entry|Редагування запису|Изменение записи\nNew folder|Нова папка|Новая папка\nGenerator|Генератор|Генератор\nBack up vault|Копія сховища|Копия хранилища\nLock|Заблокувати|Заблокировать\nAll entries|Усі записи|Все записи\nFavorites|Обране|Избранное\nRecycle bin|Кошик|Корзина\nFolders|Папки|Папки\nSearch entries|Пошук записів|Поиск записей\nNo entries found|Записів не знайдено|Записи не найдены\nSelect an entry or create a new one.|Виберіть запис або створіть новий.|Выберите запись или создайте новую.\nLoading…|Завантаження…|Загрузка…\nTitle|Назва|Название\nUsername|Ім’я користувача|Имя пользователя\nURL|Адреса|Адрес\nFolder|Папка|Папка\nNo folder|Без папки|Без папки\nTags (comma separated)|Теги через кому|Теги через запятую\nFavorite|Обране|Избранное\nPassword|Пароль|Пароль\nSecure notes|Захищені нотатки|Защищённые заметки\nCustom fields|Власні поля|Пользовательские поля\nAdd field|Додати поле|Добавить поле\nField name|Назва поля|Название поля\nProtected|Приховане|Скрытое\nRemove field|Прибрати поле|Убрать поле\nShow / edit|Показати / редагувати|Показать / изменить\nHide|Приховати|Скрыть\nCopy|Копіювати|Копировать\nClear saved value|Очистити збережене значення|Очистить сохранённое значение\nSaved value is kept unless changed.|Збережене значення лишається без змін.|Сохранённое значение остаётся без изменений.\nHidden|Приховано|Скрыто\nSave entry|Зберегти запис|Сохранить запись\nDelete entry|Перемістити в кошик|Переместить в корзину\nRestore entry|Відновити запис|Восстановить запись\nDelete permanently|Видалити назавжди|Удалить навсегда\nReload saved entry|Завантажити збережений запис|Загрузить сохранённую запись\nHistory|Історія|История\nNo previous versions.|Попередніх версій немає.|Предыдущих версий нет.\nRestore this version|Відновити цю версію|Восстановить эту версию\nUnsaved changes|Незбережені зміни|Несохранённые изменения\nSaved|Збережено|Сохранено\nSaving…|Збереження…|Сохранение…\nThis entry changed elsewhere. Your draft is kept. Reload before saving.|Запис змінено в іншому вікні. Чернетку збережено. Завантажте запис перед збереженням.|Запись изменена в другом окне. Черновик сохранён. Загрузите запись перед сохранением.\nOperation failed. Your draft is still here.|Операція не вдалася. Чернетка лишилася у вікні.|Операция не выполнена. Черновик остался в окне.\nCould not load the manager.|Не вдалося відкрити менеджер.|Не удалось открыть менеджер.\nDiscard unsaved changes?|Відкинути незбережені зміни?|Отменить несохранённые изменения?\nMove this entry to the recycle bin?|Перемістити цей запис у кошик?|Переместить эту запись в корзину?\nPermanently delete this entry and its history? This cannot be undone.|Назавжди видалити запис та його історію? Це неможливо скасувати.|Навсегда удалить запись и её историю? Это невозможно отменить.\nRestore this historical version? Current changes will be replaced.|Відновити цю версію? Поточні зміни буде замінено.|Восстановить эту версию? Текущие изменения будут заменены.\nDelete this folder? Entries will move to No folder.|Видалити папку? Записи перейдуть до «Без папки».|Удалить папку? Записи перейдут в «Без папки».\nRename folder|Перейменувати папку|Переименовать папку\nDelete folder|Видалити папку|Удалить папку\nFolder name|Назва папки|Название папки\nSave folder|Зберегти папку|Сохранить папку\nCancel|Скасувати|Отмена\nClose|Закрити|Закрыть\nCopied. Clipboard clears after 10 seconds.|Скопійовано. Буфер очищується через 10 секунд.|Скопировано. Буфер очищается через 10 секунд.\nBackup saved.|Резервну копію збережено.|Резервная копия сохранена.\nSecret generator|Генератор секретів|Генератор секретов\nKind|Тип|Тип\nHex token|Токен hex|Токен hex\nBase64url token|Токен base64url|Токен base64url\nLength|Довжина|Длина\nRandom bytes|Випадкових байтів|Случайных байтов\nLowercase|Малі літери|Строчные буквы\nUppercase|Великі літери|Заглавные буквы\nDigits|Цифри|Цифры\nSymbols|Символи|Символы\nExclude ambiguous characters|Без схожих символів|Без похожих символов\nGenerate|Згенерувати|Сгенерировать\nGenerating…|Генерація…|Генерация…\nGenerated secret|Згенерований секрет|Созданный секрет\nApply to entry password|Вставити як пароль запису|Вставить как пароль записи\nSelect or create an entry to apply a generated password.|Виберіть або створіть запис для вставлення пароля.|Выберите или создайте запись для вставки пароля.\nSecrets are generated locally. Save the entry to keep the result.|Секрети генеруються локально. Збережіть запис, щоб зберегти результат.|Секреты создаются локально. Сохраните запись, чтобы сохранить результат.\nChoose at least one character class.|Виберіть принаймні один набір символів.|Выберите хотя бы один набор символов.\nChanged outside this window|Змінено поза цим вікном|Изменено вне этого окна\nEntry restored.|Запис відновлено.|Запись восстановлена.\nEntry deleted.|Запис видалено.|Запись удалена.\nRevision|Версія|Версия\nCurrent revision|Поточна версія|Текущая версия\nCreated|Створено|Создано\nUpdated|Оновлено|Обновлено\nEntry limit reached.|Досягнуто ліміт записів.|Достигнут лимит записей.\nField limit reached.|Досягнуто ліміт полів.|Достигнут лимит полей.\nField value|Значення поля|Значение поля\nGenerated secret expired. Generate another one.|Згенерований секрет застарів. Створіть новий.|Созданный секрет устарел. Создайте новый.\nUse an HTTP or HTTPS URL without credentials.|Використайте HTTP або HTTPS без облікових даних.|Используйте HTTP или HTTPS без учётных данных.\nInvalid entry. Check required fields and limits.|Перевірте обов’язкові поля та обмеження запису.|Проверьте обязательные поля и ограничения записи.\nThe entry no longer exists.|Запис більше не існує.|Запись больше не существует.\nThe folder no longer exists.|Папка більше не існує.|Папка больше не существует.\nThis historical version no longer exists.|Ця версія більше не існує.|Эта версия больше не существует.\nRestore this entry from the recycle bin first.|Спочатку відновіть запис із кошика.|Сначала восстановите запись из корзины.\nEntry is too large. Reduce notes or fields.|Запис завеликий. Скоротіть нотатки або поля.|Запись слишком велика. Сократите заметки или поля.\nThe manager storage limit was reached.|Досягнуто обмеження обсягу менеджера.|Достигнуто ограничение объёма менеджера.\nCould not generate secret. Try again.|Не вдалося згенерувати секрет. Спробуйте ще раз.|Не удалось создать секрет. Повторите попытку.\nTry again|Повторити|Повторить",
  message_4b42de6: "Запис змінено. Оновіть менеджер паролів.",
  message_736daec: "Згенерований пароль застарів. Створіть новий.",
  message_8e5d73a: "Адреса має бути HTTP або HTTPS без облікових даних.",
  message_abfcee9: "Некоректні дані менеджера паролів.",
  message_2387c17: "Запис менеджера паролів не знайдено.",
  message_b0c9f84: "Папку менеджера паролів не знайдено.",
  message_2c1654c: "Версію запису не знайдено.",
  restoreThisEntryFromTheRecycleBinFirst: "Спочатку відновіть запис із кошика.",
  message_7e4cb60: "Запис менеджера паролів завеликий.",
  message_f12eb74: "Менеджер паролів перевищив доступний обсяг.",
  message_2c4a397: "Оберіть хоча б один набір символів.",
  message_9018d29: "Не вдалося згенерувати пароль. Повторіть спробу.",
  unlockTheAppToView_5170939: "Разблокируйте приложение для просмотра",
  unlock_d4ab263: "Разблокировать",
});
