"use strict";
(() => {
  const api = window.authenticator,
    root = document.getElementById("authenticator"),
    dialog = document.getElementById("editor"),
    notice = document.getElementById("notice"),
    i18n = window.AuthenticatorI18n;
  let data = { folders: [], entries: [], appearance: {} },
    scope = "all",
    query = "",
    selected = new Set(),
    serial = 0,
    codeSerial = 0,
    fetching = false,
    refreshVersion = 0,
    disposed = false,
    importToken = null,
    importPending = 0,
    importSequence = 0,
    editorKind = null;
  const t = (k) => i18n.t(k),
    el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    },
    msg = (tag, key, cls) => {
      const n = el(tag, cls, t(key));
      n.dataset.i18n = key;
      return n;
    },
    button = (key, fn, cls) => {
      const n = msg("button", key, cls);
      n.type = "button";
      if (["Edit folder", "Delete folder"].includes(key))
        n.dataset.folderAction = "true";
      n.onclick = async () => {
        n.disabled = true;
        try {
          await fn();
        } catch (error) {
          if (n.isConnected && !disposed) notify(error.message);
        } finally {
          if (n.isConnected) {
            n.disabled = false;
            if (n.dataset.selectionAction) syncSelection();
          }
        }
      };
      return n;
    },
    notify = (key) => {
      notice.textContent = t(key);
      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => (notice.textContent = ""), 4000);
    };
  const shell = el("div", "shell"),
    side = el("aside", "sidebar"),
    main = el("main", "main"),
    folders = el("nav", "folder-list"),
    cards = el("div", "codes");
  side.append(
    msg("strong", "Folders"),
    folders,
    button("New folder", () => folderEditor()),
    button("Edit folder", () => {
      const folder = data.folders.find((f) => f.id === scope);
      if (folder) folderEditor(folder);
    }),
    button("Delete folder", () => {
      const folder = data.folders.find((f) => f.id === scope);
      if (!folder) return;
      confirmDialog("Delete folder", async () => {
        await api.call("deleteFolder", { id: folder.id });
        scope = "all";
        await refresh();
      });
    }),
    button("Backup", () => api.call("backup")),
    button("Lock", () => api.call("lock")),
  );
  main.append(msg("h1", "2fa (not steam)"));
  const tools = el("div", "toolbar"),
    search = el("input");
  search.type = "search";
  search.dataset.placeholder = "Search issuer or account";
  search.placeholder = t(search.dataset.placeholder);
  search.setAttribute("aria-label", t(search.dataset.placeholder));
  search.oninput = () => {
    query = search.value;
    renderCards();
  };
  tools.append(
    search,
    button("Add account", () => entryEditor()),
    button("Import", () => importEditor()),
  );
  main.append(tools);
  const selectionTools = el("div", "toolbar"),
    allLabel = el("label", "check"),
    all = el("input");
  all.type = "checkbox";
  all.dataset.selectAll = "true";
  allLabel.append(all, msg("span", "Select all filtered"));
  const move = el("select");
  move.setAttribute("aria-label", t("Move selected to folder"));
  move.dataset.label = "Move selected to folder";
  const moveButton = button("Move selected", async () => {
      await api.call("moveEntries", {
        ids: [...selected],
        folderId: move.value || null,
      });
      selected.clear();
      await refresh();
    }),
    removeButton = button("Delete selected", () =>
      confirmDialog("Delete selected", async () => {
        for (const id of [...selected]) {
          const entry = data.entries.find((e) => e.id === id);
          if (entry)
            await api.call("deleteEntry", { id, revision: entry.revision });
        }
        selected.clear();
        await refresh();
      }),
    );
  selectionTools.append(allLabel, move, moveButton, removeButton);
  moveButton.dataset.selectionAction = "true";
  removeButton.dataset.selectionAction = "true";
  main.append(selectionTools, cards);
  shell.append(side, main);
  root.append(shell);
  function field(parent, key, type = "text", value = "") {
    const label = el("label"),
      input = el(
        type === "textarea"
          ? "textarea"
          : type === "select"
            ? "select"
            : "input",
      );
    if (!["textarea", "select"].includes(type)) input.type = type;
    input.value = value ?? "";
    label.append(msg("span", key), input);
    input.setAttribute("aria-label", t(key));
    input.dataset.label = key;
    parent.append(label);
    return input;
  }
  function options(input, items, value) {
    input.replaceChildren();
    for (const [v, label] of items) {
      const o = el("option", "", label);
      o.value = v;
      input.append(o);
    }
    input.value = value ?? "";
  }
  function folderOptions(input, value = input.value) {
    options(
      input,
      [["", t("No folder")], ...data.folders.map((f) => [f.id, f.name])],
      value,
    );
    if (![...input.options].some((o) => o.value === (value || "")))
      input.value = "";
  }
  function applyAppearance() {
    const appearance = data.appearance || {};
    i18n.set(appearance.locale || appearance.language || "en");
    document.documentElement.lang = i18n.locale;
    document.title = t("2fa (not steam)");
    document.documentElement.dataset.theme = [
      "light",
      "dark",
      "system",
    ].includes(appearance.theme)
      ? appearance.theme
      : "system";
    document
      .querySelectorAll("[data-i18n]")
      .forEach((n) => (n.textContent = t(n.dataset.i18n)));
    document
      .querySelectorAll("[data-label]")
      .forEach((n) => n.setAttribute("aria-label", t(n.dataset.label)));
    search.placeholder = t(search.dataset.placeholder);
    search.setAttribute("aria-label", t(search.dataset.placeholder));
    dialog.querySelectorAll("[data-duplicate-policy]").forEach((input) => {
      const value = input.value;
      options(
        input,
        [
          ["skip", t("Skip existing")],
          ["replace", t("Replace existing")],
        ],
        value,
      );
    });
  }
  function matching() {
    return data.entries.filter(
      (e) =>
        (scope === "all" ||
          (scope === "none" ? !e.folderId : e.folderId === scope)) &&
        `${e.issuer} ${e.account}`.toLowerCase().includes(query.toLowerCase()),
    );
  }
  function renderFolders() {
    side.querySelectorAll("[data-folder-action]").forEach((button) => {
      button.disabled = !data.folders.some((folder) => folder.id === scope);
    });
    folders.replaceChildren();
    for (const [id, name, count] of [
      ["all", t("All accounts"), data.entries.length],
      ["none", t("No folder"), data.entries.filter((e) => !e.folderId).length],
      ...data.folders.map((f) => [
        f.id,
        f.name,
        data.entries.filter((e) => e.folderId === f.id).length,
      ]),
    ]) {
      const b = el("button", "folder-button" + (scope === id ? " active" : ""));
      b.type = "button";
      b.dataset.folder = id;
      b.append(
        el("span", "folder-name", name),
        el("span", "folder-count", String(count)),
      );
      b.onclick = () => {
        scope = id;
        renderFolders();
        renderCards();
      };
      folders.append(b);
    }
    folderOptions(move);
    dialog
      .querySelectorAll("select[data-folder-picker]")
      .forEach((n) => folderOptions(n));
  }
  function syncSelection() {
    const entries = matching(),
      n = entries.filter((e) => selected.has(e.id)).length;
    all.checked = entries.length > 0 && n === entries.length;
    all.indeterminate = n > 0 && n < entries.length;
    all.disabled = !entries.length;
    moveButton.disabled = removeButton.disabled = selected.size === 0;
  }
  all.onchange = () => {
    for (const entry of matching())
      if (all.checked) selected.add(entry.id);
      else selected.delete(entry.id);
    renderCards();
  };
  function renderCards() {
    codeSerial++;
    cards.replaceChildren();
    const entries = matching();
    if (!entries.length) cards.append(msg("p", "No accounts found"));
    for (const entry of entries) {
      const card = el("article", "code-card");
      card.dataset.entry = entry.id;
      const heading = el("div", "card-heading"),
        check = el("input");
      check.type = "checkbox";
      check.checked = selected.has(entry.id);
      check.setAttribute(
        "aria-label",
        `${t("Select")}: ${entry.issuer} ${entry.account}`,
      );
      check.onchange = () => {
        if (check.checked) selected.add(entry.id);
        else selected.delete(entry.id);
        syncSelection();
      };
      const label = el("div");
      label.append(
        el("strong", "", entry.issuer || entry.account),
        el("div", "account", entry.account),
      );
      const pick = el("label", "check entry-select");
      pick.append(check);
      heading.append(pick, label);
      const code = button(
        "Hidden code",
        async () => {
          await api.call("copyCode", { id: entry.id });
          notify("Code copied");
        },
        "code",
      );
      code.dataset.code = entry.id;
      code.setAttribute(
        "aria-label",
        `${t("Copy code")}: ${entry.issuer} ${entry.account}`,
      );
      const timer = el("progress", "timer");
      timer.dataset.timer = entry.id;
      timer.max = entry.period || 30;
      timer.value = 0;
      timer.hidden = entry.type === "hotp";
      const countdown = el("span", "countdown");
      countdown.dataset.countdown = entry.id;
      countdown.hidden = entry.type === "hotp";
      const meta = el(
          "div",
          "code-meta",
          `${String(entry.type).toUpperCase()} · ${entry.algorithm} · ${entry.digits}`,
        ),
        actions = el("div", "card-actions");
      if (entry.type === "hotp")
        meta.textContent += ` · ${t("Counter")}: ${entry.counter}`;
      actions.append(button("Edit", () => entryEditor(entry)));
      if (entry.type === "hotp")
        actions.append(
          button("Next HOTP code", async () => {
            await api.call("advanceCounter", {
              id: entry.id,
              revision: entry.revision,
            });
            await refresh();
          }),
        );
      card.append(heading, code, timer, countdown, meta, actions);
      cards.append(card);
    }
    syncSelection();
    void updateCodes();
  }
  function clearCodes() {
    codeSerial++;
    cards
      .querySelectorAll("[data-code]")
      .forEach((n) => (n.textContent = t("Hidden code")));
    cards.querySelectorAll("progress").forEach((n) => (n.value = 0));
    cards
      .querySelectorAll("[data-countdown]")
      .forEach((n) => (n.textContent = ""));
  }
  async function updateCodes() {
    if (disposed || document.hidden || fetching) return;
    const generation = codeSerial;
    fetching = true;
    try {
      const ids = [...cards.querySelectorAll("[data-code]")].map(
        (n) => n.dataset.code,
      );
      for (let start = 0; start < ids.length; start += 100) {
        const result = await api.call("codes", {
          ids: ids.slice(start, start + 100),
        });
        if (disposed || document.hidden || generation !== codeSerial) return;
        for (const value of result.codes || []) {
          const code = [...cards.querySelectorAll("[data-code]")].find(
            (n) => n.dataset.code === value.id,
          );
          if (code) code.textContent = value.code;
          const timer = [...cards.querySelectorAll("[data-timer]")].find(
            (n) => n.dataset.timer === value.id,
          );
          if (timer) {
            timer.max = value.period || 30;
            timer.value = value.remaining ?? 0;
            timer.setAttribute(
              "aria-label",
              `${t("Seconds remaining")}: ${value.remaining ?? 0}`,
            );
          }
          const countdown = [
            ...cards.querySelectorAll("[data-countdown]"),
          ].find((n) => n.dataset.countdown === value.id);
          if (countdown && value.remaining !== null)
            countdown.textContent = `${value.remaining} ${t("seconds")}`;
        }
      }
    } catch (error) {
      if (disposed || document.hidden || generation !== codeSerial) return;
      clearCodes();
      await refresh();
      if (!disposed) notify(error.message);
    } finally {
      fetching = false;
    }
  }
  function closeEditor() {
    if (editorKind === "Import accounts" && importPending) {
      importPending = 0;
      void api.call("cancelImport", {}).catch(() => {});
    }
    dialog
      .querySelectorAll("input[type=password],textarea")
      .forEach((n) => (n.value = ""));
    dialog.close();
    editorKind = null;
    const token = importToken;
    importToken = null;
    if (token) void api.call("cancelImport", { token }).catch(() => {});
  }
  function openEditor(title) {
    closeEditor();
    dialog.replaceChildren();
    editorKind = title;
    const heading = el("header", "dialog-heading"),
      body = el("div", "dialog-body"),
      footer = el("div", "dialog-footer");
    heading.append(msg("h2", title), button("Close", closeEditor));
    footer.append(button("Cancel", closeEditor));
    dialog.append(heading, body, footer);
    dialog.showModal();
    return { body, footer };
  }
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeEditor();
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open) closeEditor();
  });
  function confirmDialog(title, action) {
    const { body, footer } = openEditor(title);
    body.append(msg("p", "Confirm this action?"));
    footer.append(
      button(
        "Confirm",
        async () => {
          await action();
          closeEditor();
        },
        "primary",
      ),
    );
  }
  function folderEditor(folder) {
    const { body, footer } = openEditor(folder ? "Edit folder" : "New folder"),
      name = field(body, "Folder name", "text", folder?.name || "");
    name.maxLength = 120;
    footer.append(
      button(
        "Save",
        async () => {
          await api.call("saveFolder", {
            ...(folder ? { id: folder.id } : {}),
            name: name.value.trim(),
          });
          closeEditor();
          await refresh();
        },
        "primary",
      ),
    );
    name.focus();
  }
  function entryEditor(entry) {
    const { body, footer } = openEditor(entry ? "Edit account" : "Add account"),
      issuer = field(body, "Issuer", "text", entry?.issuer),
      account = field(body, "Account", "text", entry?.account),
      secret = field(body, "Base32 secret", "password");
    secret.autocomplete = "off";
    secret.spellcheck = false;
    body.append(
      msg(
        "p",
        entry
          ? "Leave the secret empty to keep it unchanged."
          : "Enter the Base32 secret from the service setup screen. It stays encrypted in your vault.",
      ),
    );
    const grid = el("div", "field-grid");
    body.append(grid);
    const type = field(grid, "Type", "select");
    options(
      type,
      [
        ["totp", "TOTP"],
        ["hotp", "HOTP"],
      ],
      entry?.type || "totp",
    );
    const algorithm = field(grid, "Algorithm", "select");
    options(
      algorithm,
      ["SHA1", "SHA256", "SHA512"].map((v) => [v, v]),
      entry?.algorithm || "SHA1",
    );
    const digits = field(grid, "Digits", "select");
    options(
      digits,
      [6, 8].map((v) => [String(v), String(v)]),
      String(entry?.digits || 6),
    );
    const period = field(
        grid,
        "Period (seconds)",
        "number",
        entry?.period || 30,
      ),
      counter = field(grid, "Counter", "number", entry?.counter || 0);
    period.min = 15;
    period.max = 120;
    counter.min = 0;
    const folder = field(body, "Folder", "select");
    folder.dataset.folderPicker = "true";
    folderOptions(
      folder,
      entry?.folderId ||
        (data.folders.some((f) => f.id === scope) ? scope : ""),
    );
    const sync = () => {
      period.parentElement.hidden = type.value === "hotp";
      counter.parentElement.hidden = type.value !== "hotp";
    };
    type.onchange = sync;
    sync();
    footer.append(
      button(
        "Save",
        async () => {
          const payload = {
            ...(entry ? { id: entry.id, revision: entry.revision } : {}),
            issuer: issuer.value.trim(),
            account: account.value.trim(),
            type: type.value,
            algorithm: algorithm.value,
            digits: Number(digits.value),
            period: Number(period.value),
            counter: type.value === "hotp" ? Number(counter.value) : 0,
            folderId: folder.value || null,
          };
          if (secret.value.trim()) payload.secret = secret.value.trim();
          await api.call("saveEntry", payload);
          secret.value = "";
          closeEditor();
          await refresh();
        },
        "primary",
      ),
    );
    issuer.focus();
  }
  function importEditor() {
    const { body, footer } = openEditor("Import accounts");
    body.append(
      msg(
        "p",
        "Google Authenticator: open Transfer accounts → Export accounts, select the accounts, then save or capture every QR code. Import all images together; nothing is uploaded.",
      ),
    );
    const text = field(body, "Authenticator URIs", "textarea");
    text.placeholder = "otpauth://…\notpauth-migration://…";
    text.spellcheck = false;
    const requestImport = async (action, payload) => {
      const generation = serial,
        pending = ++importSequence;
      importPending = pending;
      const sourceButtons = [...footer.querySelectorAll("button")].slice(1);
      sourceButtons.forEach((button) => (button.disabled = true));
      try {
        const preview = await api.call(action, payload);
        text.value = "";
        if (
          disposed ||
          generation !== serial ||
          !dialog.open ||
          !body.isConnected ||
          importPending !== pending
        ) {
          if (preview?.token)
            await api
              .call("cancelImport", { token: preview.token })
              .catch(() => {});
          return;
        }
        importPending = 0;
        if (preview?.token) importPreview(preview);
      } finally {
        if (importPending === pending) importPending = 0;
        if (body.isConnected)
          sourceButtons.forEach((button) => (button.disabled = false));
      }
    };
    footer.append(
      button("Choose QR images or text files", () =>
        requestImport("importFiles", {}),
      ),
      button(
        "Review import",
        () => requestImport("previewImport", { text: text.value }),
        "primary",
      ),
    );
  }
  function importPreview(preview) {
    const { body, footer } = openEditor("Review import");
    importToken = preview.token;
    for (const entry of preview.entries || []) {
      const row = el("div", "preview-row");
      row.textContent = `${entry.issuer} · ${entry.account} · ${String(entry.type).toUpperCase()} · ${entry.algorithm} · ${entry.digits}${entry.duplicate ? " · " + t("Duplicate") : ""}`;
      body.append(row);
    }
    const folder = field(body, "Folder", "select");
    folder.dataset.folderPicker = "true";
    folderOptions(
      folder,
      data.folders.some((f) => f.id === scope) ? scope : "",
    );
    const duplicates = field(body, "Duplicates", "select");
    duplicates.dataset.duplicatePolicy = "true";
    options(
      duplicates,
      [
        ["skip", t("Skip existing")],
        ["replace", t("Replace existing")],
      ],
      "skip",
    );
    footer.append(
      button(
        "Apply import",
        async () => {
          await api.call("commitImport", {
            token: importToken,
            folderId: folder.value || null,
            duplicates: duplicates.value,
          });
          importToken = null;
          closeEditor();
          await refresh();
          notify("Import complete");
        },
        "primary",
      ),
    );
  }
  async function refresh() {
    if (disposed) return;
    const generation = serial,
      version = ++refreshVersion;
    try {
      const next = await api.call("snapshot");
      if (disposed || generation !== serial || version !== refreshVersion)
        return;
      if (next.locked) {
        window.SmartWindowLock?.lock(next.uiGeneration);
        return;
      }
      data = {
        folders: next.folders || [],
        entries: next.entries || [],
        appearance: next.appearance || {},
      };
      const ids = new Set(data.entries.map((e) => e.id));
      selected = new Set([...selected].filter((id) => ids.has(id)));
      if (
        !["all", "none"].includes(scope) &&
        !data.folders.some((f) => f.id === scope)
      )
        scope = "all";
      applyAppearance();
      renderFolders();
      renderCards();
    } catch (error) {
      dispose(error.message);
    }
  }
  function dispose(message = "Locked") {
    if (disposed) return;
    disposed = true;
    serial++;
    clearCodes();
    closeEditor();
    clearInterval(timer);
    clearTimeout(notify.timer);
    notice.textContent = "";
    data = { folders: [], entries: [], appearance: {} };
    selected.clear();
    root.replaceChildren(msg("p", message));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearCodes();
    else void updateCodes();
  });
  document.addEventListener("pointerdown", (event) => {
    if (event.isTrusted && !disposed) void api.call("touch").catch(() => {});
  });
  document.addEventListener("keydown", (event) => {
    if (event.isTrusted && !disposed) void api.call("touch").catch(() => {});
  });
  window.addEventListener("pagehide", () => dispose());
  window.SmartWindowLock?.onLock(() => dispose(""));
  api.onChanged?.((change) => {
    if (change?.locked === true)
      window.SmartWindowLock?.lock(change.uiGeneration);
    else void refresh();
  });
  const timer = setInterval(() => void updateCodes(), 1000);
  void refresh();
})();
