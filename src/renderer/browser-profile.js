const browserProfileLocale = window.SmartLocaleData;
function browserProfileError(error) {
  const message = error.message || String(error);
  const known = {
    "Invalid browser profile fields.":
      browserProfileLocale.invalidBrowserProfileFields,
    "Invalid browser profile.": browserProfileLocale.invalidBrowserProfile,
    "Browser profile generation exhausted.":
      browserProfileLocale.browserProfileGenerationExhausted,
  };
  return t(known[message] || message);
}
function browserProfilesDialog(ids) {
  ids = [...new Set(ids)];
  if (!ids.length || locked) return;
  const generation = lockGeneration;
  let host,
    epoch = 0,
    profiles = [],
    busy = false;
  dialog(browserProfileLocale.browserProfile, (form) => {
    host = form;
    form.append(el("p", "", browserProfileLocale.loading));
  });
  const dialogGeneration = sensitiveDialogGeneration;
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    dialogGeneration === sensitiveDialogGeneration &&
    host.isConnected &&
    modal.open;
  const message = el("p", "", "");
  message.setAttribute("role", "status");
  const results = el("ul", "browser-profile-results");
  results.tabIndex = 0;
  const controls = [],
    fields = new Map();
  function fieldControl(key, label, node, read) {
    node.dataset.profileField = key;
    const row = el("div", "browser-profile-field");
    field(row, label, node);
    let enabled;
    if (ids.length > 1) {
      const check = checkbox(browserProfileLocale.applyThisField, false);
      enabled = check.input;
      enabled.dataset.profileEnable = key;
      row.append(check.node);
      controls.push(enabled);
      node.disabled = true;
      enabled.onchange = () => {
        node.disabled = busy || !enabled.checked;
      };
    }
    controls.push(node);
    fields.set(key, { node, enabled, read });
    grid.append(row);
  }
  const grid = el("div", "browser-profile-grid");
  async function load() {
    const token = ++epoch;
    const result = await call("getBrowserProfiles", { ids });
    if (!active() || token !== epoch) return;
    profiles = result.profiles;
    paint();
  }
  function paint() {
    host.replaceChildren();
    controls.length = 0;
    fields.clear();
    grid.replaceChildren();
    host.append(
      el(
        "p",
        "",
        browserProfileLocale.cookiesHistoryAndStoragePersistForThisWindowsUserSeparatelyFromVaultBackupAnd,
      ),
      el(
        "p",
        "muted",
        browserProfileLocale.stockChromiumPageLevelChangesFullFingerprintIsolationIsNotGuaranteedNativeUAAnd,
      ),
      el(
        "p",
        "muted",
        browserProfileLocale.generationChangesTheFingerprintWithoutClearingBrowserDataReopenTheBrowserToApply,
      ),
    );
    const identities = el("div", "browser-profile-identities");
    identities.tabIndex = 0;
    identities.setAttribute("role", "region");
    identities.setAttribute("aria-label", t(browserProfileLocale.accounts));
    for (const item of profiles)
      identities.append(
        el(
          "p",
          "browser-profile-identity",
          `${item.name}: ${item.profile.id.slice(0, 8)} · ${t(browserProfileLocale.generation)} ${item.profile.generation}`,
        ),
      );
    host.append(identities);
    if (ids.length > 1)
      host.append(
        el(
          "p",
          "",
          browserProfileLocale.onlyCheckedFieldsChangeForEverySelectedAccountGenerationCreatesASeparateFingerprintFor,
        ),
      );
    host.append(grid);
    const p = profiles[0]?.profile || {};
    for (const [key, label] of [
      ["locale", browserProfileLocale.browserLanguage],
      ["timezoneId", browserProfileLocale.timezone],
    ])
      fieldControl(key, label, input("text", p[key] || "system"), (node) =>
        node.value.trim(),
      );
    const screen = select(
      [
        ["1280x720", "1280 × 720"],
        ["1366x768", "1366 × 768"],
        ["1440x900", "1440 × 900"],
        ["1920x1080", "1920 × 1080"],
        ["2560x1440", "2560 × 1440"],
      ],
      `${p.screen?.width}x${p.screen?.height}`,
    );
    if (!screen.value && p.screen) {
      const option = el("option", "", `${p.screen.width} × ${p.screen.height}`);
      option.value = `${p.screen.width}x${p.screen.height}`;
      screen.append(option);
      screen.value = option.value;
    }
    fieldControl(
      "screen",
      browserProfileLocale.screenReportedToWebsites,
      screen,
      (node) => {
        const [width, height] = node.value.split("x").map(Number);
        return { width, height };
      },
    );
    const specs = [
      [
        "hardwareConcurrency",
        browserProfileLocale.cpuThreads,
        [2, 4, 8, 12, 16],
      ],
      ["deviceMemory", browserProfileLocale.memoryGB, [2, 4, 8]],
      ["canvasMode", "Canvas", ["native", "noise"]],
      ["audioMode", "Audio", ["native", "noise"]],
      ["webglMode", "WebGL", ["native", "disabled"]],
      ["webgpuMode", "WebGPU", ["native", "disabled"]],
      ["geolocationMode", browserProfileLocale.geolocation, ["block", "ask"]],
      ["webrtcMode", "WebRTC", ["protected", "disabled"]],
      ["doNotTrack", "Do Not Track", [true, false]],
      [
        "blockThirdPartyCookies",
        browserProfileLocale.blockThirdPartyCookies,
        [true, false],
      ],
    ];
    for (const [key, label, values] of specs)
      fieldControl(
        key,
        label,
        select(
          values.map((v) => [
            String(v),
            typeof v === "boolean"
              ? v
                ? browserProfileLocale.yes
                : browserProfileLocale.no
              : {
                  native: browserProfileLocale.native,
                  noise: browserProfileLocale.noise,
                  disabled: browserProfileLocale.disabled,
                  block: browserProfileLocale.block,
                  ask: browserProfileLocale.ask,
                  protected: browserProfileLocale.protected,
                }[v] || String(v),
          ]),
          String(p[key]),
        ),
        (node) =>
          typeof values[0] === "number"
            ? Number(node.value)
            : typeof values[0] === "boolean"
              ? node.value === "true"
              : node.value,
      );
    const actions = el("div", "modal-footer");
    const random = btn(
      ids.length > 1
        ? browserProfileLocale.newFingerprintForEach
        : browserProfileLocale.newFingerprint,
      () => mutateProfiles("randomizeBrowserProfiles"),
    );
    const save = btn(
      browserProfileLocale.apply,
      () => {
        const patch = {};
        for (const [key, f] of fields)
          if (!f.enabled || f.enabled.checked) patch[key] = f.read(f.node);
        if (!Object.keys(patch).length) {
          message.textContent = t(browserProfileLocale.checkFieldsToChange);
          return;
        }
        return mutateProfiles("saveBrowserProfiles", patch);
      },
      "primary",
    );
    controls.push(random, save);
    actions.append(
      btn(browserProfileLocale.close, () => modal.close()),
      random,
      save,
    );
    host.append(message, results, actions);
    if (profiles.some((p) => p.running)) {
      message.textContent = t(
        browserProfileLocale.closeTheSelectedAccountsBrowsersFirst,
      );
      controls.forEach((n) => (n.disabled = true));
    }
  }
  async function mutateProfiles(action, patch) {
    if (busy || !active()) return;
    busy = true;
    controls.forEach((n) => (n.disabled = true));
    message.textContent = t(browserProfileLocale.working);
    results.replaceChildren(
      ...profiles.map((item) =>
        el(
          "li",
          "",
          `${item.name}: ${t(browserProfileLocale.running_af4dd92)}`,
        ),
      ),
    );
    try {
      const result = await call(action, { ids, ...(patch ? { patch } : {}) });
      if (!active()) return;
      results.replaceChildren(
        ...(result.items || []).map((item) =>
          el(
            "li",
            "",
            `${profiles.find((p) => p.id === item.id)?.name || item.id}: ${t(item.state === "completed" ? browserProfileLocale.completed : browserProfileLocale.failed)}${item.message ? " · " + t(item.message) : ""}`,
          ),
        ),
      );
      message.textContent = t(
        browserProfileLocale.profilesSavedReopenTheBrowser,
      );
      const next = await call("getBrowserProfiles", { ids });
      if (!active()) return;
      profiles = next.profiles;
      const rows = [...results.children].map((n) => n.cloneNode(true));
      paint();
      results.replaceChildren(...rows);
    } catch (error) {
      if (active()) message.textContent = browserProfileError(error);
      if (active())
        results.replaceChildren(
          ...profiles.map((item) =>
            el("li", "", `${item.name}: ${t(browserProfileLocale.failed)}`),
          ),
        );
    } finally {
      busy = false;
      if (active()) {
        for (const control of controls)
          control.disabled = profiles.some((p) => p.running);
        for (const f of fields.values())
          if (f.enabled)
            f.node.disabled =
              profiles.some((p) => p.running) || !f.enabled.checked;
      }
    }
  }
  return load().catch((error) => {
    if (active())
      host.replaceChildren(el("p", "warn", browserProfileError(error)));
  });
}
