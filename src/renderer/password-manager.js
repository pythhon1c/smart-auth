"use strict";
const passwordManagerLocale = window.SmartLocaleData;
(() => {
  const api = window.passwordManager,
    i18n = window.PasswordManagerI18n,
    root = document.getElementById("manager");
  let serial = 0,
    snapshot = { folders: [], entries: [], appearance: {} },
    scope = "all",
    query = "",
    editor = null,
    refreshing = false,
    again = false,
    disposed = false,
    loaded = false,
    refreshPromise = Promise.resolve();
  const t = (key) => i18n.t(key);
  const node = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const message = (tag, key, cls) => {
    const n = node(tag, cls);
    n.dataset.i18n = key;
    n.textContent = t(key);
    return n;
  };
  const button = (key, handler, cls = "") => {
    const b = message("button", key, cls);
    b.type = "button";
    b.onclick = handler;
    return b;
  };
  const input = (type = "text", value = "", max) => {
    const n = node("input");
    n.type = type;
    n.value = value;
    if (max) n.maxLength = max;
    n.autocomplete = "off";
    n.spellcheck = false;
    return n;
  };
  const field = (parent, key, control) => {
    const wrap = node("label"),
      caption = message("span", key);
    control.id ||= `pm-control-${++serial}`;
    wrap.htmlFor = control.id;
    wrap.append(caption, control);
    parent.append(wrap);
    return control;
  };
  const check = (parent, key, value = false) => {
    const wrap = node("label", "check"),
      c = input("checkbox");
    c.checked = value;
    wrap.append(c, message("span", key));
    parent.append(wrap);
    return c;
  };
  const call = (action, payload = {}) => api.call(action, payload);
  const errorText = (failure) => {
    const errors = {
      [passwordManagerLocale.couldNotSafelySaveTheBackup]:
        "Could not safely save the backup.",
      [passwordManagerLocale.couldNotSaveTheVaultTheBackupMayHaveDifferentAccessSettingsKeepBoth]:
        "Could not save the vault. The backup may have different access settings; keep both files.",
      [passwordManagerLocale.message_4b42de6]:
        "This entry changed elsewhere. Your draft is kept. Reload before saving.",
      [passwordManagerLocale.message_736daec]:
        "Generated secret expired. Generate another one.",
      [passwordManagerLocale.message_8e5d73a]:
        "Use an HTTP or HTTPS URL without credentials.",
      [passwordManagerLocale.message_abfcee9]:
        "Invalid entry. Check required fields and limits.",
      [passwordManagerLocale.message_2387c17]: "The entry no longer exists.",
      [passwordManagerLocale.message_b0c9f84]: "The folder no longer exists.",
      [passwordManagerLocale.message_2c1654c]:
        "This historical version no longer exists.",
      [passwordManagerLocale.restoreThisEntryFromTheRecycleBinFirst]:
        "Restore this entry from the recycle bin first.",
      [passwordManagerLocale.message_7e4cb60]:
        "Entry is too large. Reduce notes or fields.",
      [passwordManagerLocale.message_f12eb74]:
        "The manager storage limit was reached.",
      [passwordManagerLocale.message_2c4a397]:
        "Choose at least one character class.",
      [passwordManagerLocale.message_9018d29]:
        "Could not generate secret. Try again.",
    };
    return t(
      errors[failure?.message] || "Operation failed. Your draft is still here.",
    );
  };
  const date = (value) => {
    try {
      return new Intl.DateTimeFormat(
        { ua: "uk-UA", ru: "ru-RU", en: "en-US" }[i18n.locale],
        { dateStyle: "short", timeStyle: "short" },
      ).format(new Date(value));
    } catch {
      return "—";
    }
  };
  function revisionCaption(caption, revision, updatedAt, current = false) {
    caption.dataset.revision = String(revision);
    caption.dataset.revisionDate = updatedAt;
    caption.dataset.currentRevision = String(current);
    caption.textContent = `${t(current ? "Current revision" : "Revision")} ${revision} · ${date(updatedAt)}`;
    return caption;
  }
  const shell = node("div", "shell"),
    header = node("header", "topbar"),
    workspace = node("main", "workspace"),
    sidebar = node("nav", "sidebar"),
    entries = node("section", "entries"),
    entryHeader = node("div", "entries-header"),
    list = node("div"),
    detail = node("section", "editor"),
    status = node("p", "global-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  sidebar.setAttribute("aria-label", t("Folders"));
  const search = input("search");
  search.setAttribute("aria-label", t("Search entries"));
  search.placeholder = t("Search entries");
  search.dataset.search = "true";
  search.oninput = () => {
    query = search.value;
    drawList();
  };
  entryHeader.append(search);
  entries.append(entryHeader, list);
  workspace.append(sidebar, entries, detail);
  header.append(
    message("h1", "Password manager"),
    button("New entry", () => choose(null)),
    button("New folder", () => folderDialog()),
    button("Generator", () => openGenerator()),
    button("Back up vault", async () => {
      try {
        const result = await call("backup");
        if (!result?.cancelled && !result?.canceled)
          status.textContent = t("Backup saved.");
      } catch (failure) {
        status.textContent = errorText(failure);
      }
    }),
    button("Lock", async () => {
      wipe();
      try {
        await call("lock");
      } catch {}
    }),
  );
  shell.append(header, workspace, status);
  root.append(shell);
  function dirty() {
    return editor?.dirty === true;
  }
  function markDirty() {
    if (!editor) return;
    editor.dirty = true;
    editor.state.textContent = t("Unsaved changes");
  }
  function mayDiscard() {
    return !dirty() || window.confirm(t("Discard unsaved changes?"));
  }
  function setScope(next) {
    scope = next;
    drawNavigation();
    drawList();
  }
  function drawNavigation() {
    const focused = document.activeElement?.dataset.folderId;
    sidebar.replaceChildren();
    for (const [id, key] of [
      ["all", "All entries"],
      ["favorites", "Favorites"],
      ["trash", "Recycle bin"],
    ]) {
      const b = button(
        key,
        () => setScope(id),
        "nav" + (scope === id ? " active" : ""),
      );
      b.dataset.scope = id;
      if (scope === id) b.setAttribute("aria-current", "page");
      sidebar.append(b);
    }
    sidebar.append(message("h3", "Folders"));
    for (const folder of snapshot.folders) {
      const row = node("div", "folder-row"),
        b = button(
          "",
          () => setScope(folder.id),
          "nav" + (scope === folder.id ? " active" : ""),
        ),
        name = node("span"),
        count = node("span");
      delete b.dataset.i18n;
      name.textContent = folder.name;
      count.textContent = String(
        snapshot.entries.filter((e) => !e.deletedAt && e.folderId === folder.id)
          .length,
      );
      count.setAttribute("aria-hidden", "true");
      b.append(name, count);
      b.dataset.folderId = folder.id;
      b.title = folder.name;
      if (scope === folder.id) b.setAttribute("aria-current", "page");
      const edit = button("Rename folder", () => folderDialog(folder), "icon");
      edit.textContent = "✎";
      delete edit.dataset.i18n;
      edit.setAttribute("aria-label", t("Rename folder") + ": " + folder.name);
      row.append(b, edit);
      sidebar.append(row);
    }
    if (focused)
      sidebar.querySelectorAll("[data-folder-id]").forEach((b) => {
        if (b.dataset.folderId === focused) b.focus({ preventScroll: true });
      });
  }
  function drawList() {
    const oldScroll = entries.scrollTop;
    list.replaceChildren();
    const found = snapshot.entries.filter(
      (e) =>
        (scope === "trash" ? !!e.deletedAt : !e.deletedAt) &&
        (scope !== "favorites" || e.favorite) &&
        (["all", "favorites", "trash"].includes(scope) ||
          e.folderId === scope) &&
        `${e.title} ${e.username} ${e.url} ${(e.tags || []).join(" ")}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
    found.sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
    for (const entry of found) {
      const b = node(
          "button",
          "entry" + (editor?.id === entry.id ? " selected" : ""),
        ),
        title = node("strong"),
        sub = node("small");
      b.type = "button";
      b.dataset.entryId = entry.id;
      title.textContent = (entry.favorite ? "★ " : "") + entry.title;
      sub.textContent = entry.username || entry.url || date(entry.updatedAt);
      b.append(title, sub);
      b.onclick = () => choose(entry.id);
      if (editor?.id === entry.id) b.setAttribute("aria-current", "true");
      list.append(b);
    }
    if (!found.length) list.append(message("p", "No entries found", "empty"));
    entries.scrollTop = oldScroll;
  }
  function applyAppearance() {
    const a = snapshot.appearance || {};
    i18n.set(a.locale || "en");
    document.documentElement.dataset.theme = ["light", "dark"].includes(a.theme)
      ? a.theme
      : "system";
    document.title = t("Password manager") + " — smart-auth";
    document
      .querySelectorAll("[data-i18n]")
      .forEach((n) => (n.textContent = t(n.dataset.i18n)));
    document
      .querySelectorAll("[data-i18n-placeholder]")
      .forEach((n) => (n.placeholder = t(n.dataset.i18nPlaceholder)));
    document
      .querySelectorAll("[data-i18n-aria]")
      .forEach((n) => n.setAttribute("aria-label", t(n.dataset.i18nAria)));
    search.placeholder = t("Search entries");
    search.setAttribute("aria-label", t("Search entries"));
    sidebar.setAttribute("aria-label", t("Folders"));
    document.querySelectorAll("[data-revision]").forEach((caption) => {
      revisionCaption(
        caption,
        caption.dataset.revision,
        caption.dataset.revisionDate,
        caption.dataset.currentRevision === "true",
      );
    });
  }
  async function refresh() {
    if (disposed) return;
    if (refreshing) {
      again = true;
      return refreshPromise;
    }
    refreshing = true;
    refreshPromise = (async () => {
      do {
        again = false;
        try {
          const fresh = await call("snapshot");
          if (disposed) return;
          if (fresh.locked) {
            window.SmartWindowLock?.lock(fresh.uiGeneration);
            return;
          }
          snapshot = fresh;
          if (!loaded) {
            loaded = true;
            status.textContent = "";
          }
          applyAppearance();
          syncEditorFolders();
          drawNavigation();
          drawList();
          if (editor?.id) {
            const current = snapshot.entries.find((e) => e.id === editor.id);
            editor.notice.hidden =
              !!current && current.revision === editor.revision;
            editor.notice.textContent = t(
              "This entry changed elsewhere. Your draft is kept. Reload before saving.",
            );
          }
        } catch (failure) {
          status.textContent = t("Could not load the manager.");
        }
      } while (again && !disposed);
    })().finally(() => {
      refreshing = false;
    });
    return refreshPromise;
  }
  function clearEditor() {
    if (editor) {
      for (const r of editor.secretRows) r.destroy();
      for (const c of detail.querySelectorAll("input,textarea")) c.value = "";
    }
    editor = null;
    detail.replaceChildren();
  }
  function syncEditorFolders() {
    const select = editor?.folderControl;
    if (!select) return;
    const selected = select.value;
    const choices = [{ id: "", name: t("No folder") }, ...snapshot.folders];
    const signature = JSON.stringify(choices.map(({ id, name }) => [id, name]));
    if (select.dataset.optionsSignature === signature) return;
    select.replaceChildren(
      ...choices.map(({ id, name }) => {
        const option = node("option");
        option.value = id;
        option.textContent = name;
        return option;
      }),
    );
    select.value = choices.some(({ id }) => id === selected) ? selected : "";
    select.dataset.optionsSignature = signature;
  }
  function choose(id, force = false) {
    if (!force && !mayDiscard()) return;
    clearEditor();
    const meta = id ? snapshot.entries.find((e) => e.id === id) : null;
    if (id && !meta) return;
    buildEditor(meta);
    drawList();
  }
  function secretControl(
    parent,
    { key, label, id, hasValue = false, notes = false, custom = false },
  ) {
    const wrap = node("div", "secret-row"),
      control = notes ? node("textarea") : input("password"),
      mask = message("div", "Hidden", "secret-mask"),
      actions = node("div", "actions");
    control.maxLength = notes ? 65536 : 16384;
    control.spellcheck = false;
    control.autocomplete = "off";
    control.dataset.secretField = key || id || "new";
    if (!label) {
      control.dataset.i18nAria = "Field value";
      control.setAttribute("aria-label", t("Field value"));
    }
    if (hasValue) {
      control.dataset.i18nPlaceholder = "Saved value is kept unless changed.";
      control.placeholder = t("Saved value is kept unless changed.");
    }
    if (label) field(wrap, label, control);
    else wrap.append(control);
    let touched = false,
      revealedBaseline = null,
      preserveRevealed = false,
      loaded = false,
      visible = false,
      timer = null,
      epoch = 0;
    const setMasked = () => {
      ++epoch;
      visible = false;
      if (!touched) {
        control.value = "";
        revealedBaseline = null;
        loaded = false;
      }
      if (notes) {
        control.hidden = Boolean(touched && control.value);
        mask.hidden = !control.hidden;
      } else control.type = "password";
      show.textContent = t("Show / edit");
      show.dataset.i18n = "Show / edit";
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(setMasked, 15000);
    };
    const reveal = async () => {
      if (visible) {
        setMasked();
        return;
      }
      const current = editor,
        captured = ++epoch;
      show.disabled = true;
      try {
        if (!touched && !loaded && hasValue && current?.id) {
          const result = await call("revealField", {
            id: current.id,
            revision: current.revision,
            field: key || id,
          });
          if (
            disposed ||
            editor !== current ||
            captured !== epoch ||
            !wrap.isConnected
          )
            return;
          control.value = result.value;
          // Inputs/textarea normalize line endings (password inputs also strip
          // newlines). Returning to the displayed original must preserve the
          // exact saved secret, rather than write that normalized projection.
          revealedBaseline = control.value;
          loaded = true;
        }
        visible = true;
        if (notes) {
          control.hidden = false;
          mask.hidden = true;
        } else control.type = "text";
        show.textContent = t("Hide");
        show.dataset.i18n = "Hide";
        control.focus({ preventScroll: true });
        arm();
      } catch (failure) {
        if (editor === current) editor.error.textContent = errorText(failure);
      } finally {
        show.disabled = false;
      }
    };
    const show = button("Show / edit", reveal),
      copy = button("Copy", async () => {
        if (!editor?.id || touched) return;
        copy.disabled = true;
        const current = editor;
        try {
          await call("copyField", {
            id: current.id,
            revision: current.revision,
            field: key || id,
          });
          if (editor === current)
            status.textContent = t(
              "Copied. Clipboard clears after 10 seconds.",
            );
        } catch (failure) {
          if (editor === current) editor.error.textContent = errorText(failure);
        } finally {
          copy.disabled = !hasValue || touched;
        }
      }),
      clear = button("Clear saved value", () => {
        control.value = "";
        touched = true;
        preserveRevealed = false;
        loaded = false;
        copy.disabled = true;
        control.placeholder = "";
        delete control.dataset.i18nPlaceholder;
        setMasked();
        markDirty();
      });
    copy.disabled = !hasValue;
    control.oninput = () => {
      touched = true;
      preserveRevealed = true;
      copy.disabled = true;
      markDirty();
      arm();
    };
    mask.hidden = true;
    mask.setAttribute("aria-hidden", "true");
    actions.append(show, copy, clear);
    wrap.append(mask, actions);
    parent.append(wrap);
    const row = {
      control,
      wrap,
      get touched() {
        return (
          touched &&
          (!preserveRevealed ||
            revealedBaseline === null ||
            control.value !== revealedBaseline)
        );
      },
      get value() {
        return control.value;
      },
      mask: setMasked,
      destroy() {
        ++epoch;
        clearTimeout(timer);
        control.value = "";
        revealedBaseline = null;
      },
      generated(value) {
        control.value = value;
        touched = true;
        preserveRevealed = false;
        copy.disabled = true;
        loaded = true;
        setMasked();
        markDirty();
      },
    };
    editor.secretRows.push(row);
    return row;
  }
  function buildEditor(meta) {
    const form = node("form", "editor-form"),
      notice = message(
        "p",
        "This entry changed elsewhere. Your draft is kept. Reload before saving.",
        "notice",
      ),
      error = node("p", "error"),
      saveState = node("span", "editor-state");
    error.setAttribute("role", "alert");
    notice.hidden = true;
    saveState.setAttribute("role", "status");
    editor = {
      id: meta?.id || null,
      revision: meta?.revision,
      dirty: false,
      secretRows: [],
      custom: [],
      state: saveState,
      notice,
      error,
      form,
      busy: false,
    };
    const current = editor;
    const heading = node("div", "row");
    heading.append(message("h2", meta ? "Edit entry" : "New entry"), saveState);
    form.append(heading, notice);
    if (meta)
      form.append(
        revisionCaption(
          node("p", "muted"),
          meta.revision,
          meta.updatedAt,
          true,
        ),
      );
    if (meta?.deletedAt) {
      const title = node("p");
      title.textContent = meta.title;
      form.append(
        title,
        button(
          "Restore entry",
          () => entryOperation("restoreEntry", current),
          "primary",
        ),
        button(
          "Delete permanently",
          () => {
            if (
              window.confirm(
                t(
                  "Permanently delete this entry and its history? This cannot be undone.",
                ),
              )
            )
              void entryOperation("purgeEntry", current);
          },
          "danger",
        ),
      );
      form.append(error);
      detail.append(form);
      return;
    }
    const title = field(form, "Title", input("text", meta?.title || "", 200));
    title.required = true;
    title.dataset.entryTitle = "true";
    const basic = node("div", "two-columns"),
      username = field(
        basic,
        "Username",
        input("text", meta?.username || "", 512),
      ),
      url = field(basic, "URL", input("url", meta?.url || "", 2048));
    form.append(basic);
    const folder = node("select");
    folder.dataset.entryFolder = "true";
    current.folderControl = folder;
    syncEditorFolders();
    folder.value = meta?.folderId || "";
    field(form, "Folder", folder);
    const tags = field(
        form,
        "Tags (comma separated)",
        input("text", (meta?.tags || []).join(", "), 2112),
      ),
      favorite = check(form, "Favorite", meta?.favorite || false);
    // The comma-separated editor is not a lossless encoding of existing tags:
    // an individual stored tag may itself contain a comma. Preserve its array
    // unless the user actually changes the displayed text.
    const originalTagsText = tags.value;
    const metadataBaseline = {
      title: title.value,
      username: username.value,
      url: url.value,
      folderId: folder.value || null,
      favorite: favorite.checked,
    };
    current.password = secretControl(form, {
      key: "password",
      label: "Password",
      hasValue: meta?.hasPassword,
    });
    current.notes = secretControl(form, {
      key: "notes",
      label: "Secure notes",
      hasValue: meta?.hasNotes,
      notes: true,
    });
    form.append(message("h3", "Custom fields"));
    const customBody = node("div");
    form.append(customBody);
    const addCustom = (saved = {}) => {
      if (current.custom.length >= 32) {
        error.textContent = t("Field limit reached.");
        return;
      }
      const wrapper = node("section", "custom-row"),
        head = node("div", "row"),
        label = input("text", saved.label || "", 120);
      label.required = true;
      const caption = node("label", "field-label");
      caption.append(message("span", "Field name"), label);
      head.append(caption);
      const protectedFlag = check(head, "Protected", saved.protected !== false);
      wrapper.append(head);
      customBody.append(wrapper);
      const value = secretControl(wrapper, {
        id: saved.id,
        hasValue: saved.hasValue,
        custom: true,
      });
      const row = { id: saved.id, label, protectedFlag, value, wrapper };
      current.custom.push(row);
      head.append(
        button(
          "Remove field",
          () => {
            value.destroy();
            wrapper.remove();
            current.custom = current.custom.filter((r) => r !== row);
            markDirty();
          },
          "danger",
        ),
      );
      label.oninput = markDirty;
      protectedFlag.onchange = markDirty;
    };
    for (const saved of meta?.fields || []) addCustom(saved);
    form.append(
      button("Add field", () => {
        addCustom();
        markDirty();
      }),
    );
    for (const control of [title, username, url, tags])
      control.oninput = markDirty;
    folder.onchange = markDirty;
    favorite.onchange = markDirty;
    const actions = node("div", "actions"),
      save = button("Save entry", () => void saveEntry(), "primary");
    save.dataset.saveEntry = "true";
    actions.append(
      save,
      button("Reload saved entry", () => choose(current.id)),
    );
    if (meta)
      actions.append(
        button(
          "Delete entry",
          () => {
            if (
              mayDiscard() &&
              window.confirm(t("Move this entry to the recycle bin?"))
            )
              void entryOperation("deleteEntry", current);
          },
          "danger",
        ),
      );
    form.append(actions, error);
    form.onsubmit = (event) => {
      event.preventDefault();
      void saveEntry();
    };
    async function saveEntry() {
      if (current.busy || editor !== current || !form.reportValidity()) return;
      current.busy = true;
      status.textContent = "";
      save.disabled = true;
      error.textContent = "";
      saveState.textContent = t("Saving…");
      const payload = {
        ...(current.id ? { id: current.id, revision: current.revision } : {}),
        title: title.value,
        username: username.value,
        url: url.value,
        folderId: folder.value || null,
        ...(meta && tags.value === originalTagsText
          ? {}
          : {
              tags: [
                ...new Set(
                  tags.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                ),
              ],
            }),
        favorite: favorite.checked,
        fields: current.custom.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          label: r.label.value,
          protected: r.protectedFlag.checked,
          ...(r.value.touched ? { value: r.value.value } : {}),
        })),
        ...(current.password.touched
          ? { password: current.password.value }
          : {}),
        ...(current.notes.touched ? { notes: current.notes.value } : {}),
      };
      if (meta) {
        for (const [key, value] of Object.entries(metadataBaseline)) {
          if (payload[key] === value) delete payload[key];
        }
        const unchangedFields =
          payload.fields.length === meta.fields.length &&
          payload.fields.every((item, index) => {
            const before = meta.fields[index];
            return (
              item.id === before.id &&
              item.label === before.label &&
              item.protected === before.protected &&
              !Object.hasOwn(item, "value")
            );
          });
        if (unchangedFields) delete payload.fields;
      }
      const release = disableEditor(form);
      try {
        const result = await call("saveEntry", payload);
        if (disposed || editor !== current) return;
        current.dirty = false;
        current.id = result.id;
        snapshot.entries = [
          ...snapshot.entries.filter((entry) => entry.id !== result.id),
          result,
        ];
        await refresh();
        if (editor === current) {
          choose(result.id, true);
          status.textContent = t("Saved");
        }
      } catch (failure) {
        if (editor === current) {
          error.textContent = errorText(failure);
          saveState.textContent = t("Unsaved changes");
        }
      } finally {
        release();
        current.busy = false;
        save.disabled = false;
      }
    }
    form.append(message("h3", "History"));
    if (!meta?.history?.length)
      form.append(message("p", "No previous versions.", "muted"));
    for (const version of [...(meta?.history || [])].reverse()) {
      const row = node("div", "history-row"),
        caption = node("span");
      revisionCaption(caption, version.revision, version.updatedAt);
      row.append(
        caption,
        button("Restore this version", () => {
          if (
            mayDiscard() &&
            window.confirm(
              t(
                "Restore this historical version? Current changes will be replaced.",
              ),
            )
          )
            void entryOperation("restoreHistory", current, {
              historyRevision: version.revision,
            });
        }),
      );
      form.append(row);
    }
    if (meta) {
      const info = node("p", "muted");
      info.textContent = `${t("Created")}: ${date(meta.createdAt)} · ${t("Updated")}: ${date(meta.updatedAt)}`;
      form.append(info);
    }
    detail.append(form);
    title.focus({ preventScroll: true });
  }
  async function entryOperation(action, current, extra = {}) {
    if (current.busy) return;
    current.busy = true;
    current.error.textContent = "";
    const release = disableEditor(current.form);
    try {
      await call(action, {
        id: current.id,
        revision: current.revision,
        ...extra,
      });
      if (disposed || editor !== current) return;
      current.dirty = false;
      await refresh();
      if (action === "purgeEntry") {
        clearEditor();
        detail.append(
          message("p", "Select an entry or create a new one.", "empty"),
        );
      } else choose(current.id, true);
      drawList();
    } catch (failure) {
      if (editor === current) current.error.textContent = errorText(failure);
    } finally {
      release();
      current.busy = false;
    }
  }
  function disableEditor(form) {
    const states = [
      ...form.querySelectorAll("input,textarea,select,button"),
    ].map((control) => ({ control, disabled: control.disabled }));
    for (const { control } of states) control.disabled = true;
    return () => {
      for (const { control, disabled } of states) control.disabled = disabled;
    };
  }
  function folderDialog(folder) {
    const dialog = node("dialog"),
      form = node("form"),
      heading = node("div", "dialog-heading"),
      name = input("text", folder?.name || "", 120),
      error = node("p", "error");
    heading.append(
      message("h2", folder ? "Rename folder" : "New folder"),
      button("Close", () => dialog.close()),
    );
    name.required = true;
    form.append(heading);
    field(form, "Folder name", name);
    error.setAttribute("role", "alert");
    form.append(error);
    const actions = node("div", "actions"),
      save = button("Save folder", async () => {
        if (!form.reportValidity()) return;
        save.disabled = true;
        try {
          await call("saveFolder", {
            ...(folder ? { id: folder.id } : {}),
            name: name.value,
          });
          await refresh();
          dialog.close();
        } catch (failure) {
          error.textContent = errorText(failure);
        } finally {
          save.disabled = false;
        }
      });
    actions.append(
      save,
      button("Cancel", () => dialog.close()),
    );
    if (folder)
      actions.append(
        button(
          "Delete folder",
          async () => {
            if (
              !window.confirm(
                t("Delete this folder? Entries will move to No folder."),
              )
            )
              return;
            try {
              await call("deleteFolder", { id: folder.id });
              if (scope === folder.id) scope = "all";
              await refresh();
              dialog.close();
            } catch (failure) {
              error.textContent = errorText(failure);
            }
          },
          "danger",
        ),
      );
    form.append(actions);
    form.onsubmit = (event) => {
      event.preventDefault();
      save.click();
    };
    dialog.append(form);
    root.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        name.value = "";
        dialog.remove();
      },
      { once: true },
    );
    dialog.showModal();
    name.focus();
  }
  const generator = node("dialog"),
    generatorForm = node("form"),
    generatorHeading = node("div", "dialog-heading"),
    kind = node("select");
  generatorHeading.append(
    message("h2", "Secret generator"),
    button("Close", () => generator.close()),
  );
  generatorForm.append(generatorHeading);
  for (const [value, key] of [
    ["password", "Password"],
    ["hex", "Hex token"],
    ["base64url", "Base64url token"],
  ]) {
    const o = message("option", key);
    o.value = value;
    kind.append(o);
  }
  field(generatorForm, "Kind", kind);
  const passwordOptions = node("div"),
    length = input("number", "32");
  length.min = 8;
  length.max = 128;
  field(passwordOptions, "Length", length);
  const classes = node("div", "generator-options");
  const lower = check(classes, "Lowercase", true),
    upper = check(classes, "Uppercase", true),
    digits = check(classes, "Digits", true),
    symbols = check(classes, "Symbols", true),
    ambiguous = check(classes, "Exclude ambiguous characters", false);
  passwordOptions.append(classes);
  const tokenOptions = node("div"),
    bytes = input("number", "32");
  bytes.min = 16;
  bytes.max = 128;
  field(tokenOptions, "Random bytes", bytes);
  tokenOptions.hidden = true;
  kind.onchange = () => {
    passwordOptions.hidden = kind.value !== "password";
    tokenOptions.hidden = kind.value === "password";
  };
  generatorForm.append(passwordOptions, tokenOptions);
  const generated = input("password"),
    generatorError = node("p", "error");
  generated.readOnly = true;
  generated.dataset.generatedSecret = "true";
  field(generatorForm, "Generated secret", generated);
  generatorError.setAttribute("role", "alert");
  generatorForm.append(
    generatorError,
    message(
      "p",
      "Secrets are generated locally. Save the entry to keep the result.",
      "muted",
    ),
  );
  let generatedToken = null,
    generatorEpoch = 0,
    generatorTimer = null;
  const generate = button("Generate", async () => {
    if (!generatorForm.reportValidity()) return;
    if (
      kind.value === "password" &&
      ![lower, upper, digits, symbols].some((c) => c.checked)
    ) {
      generatorError.textContent = t("Choose at least one character class.");
      return;
    }
    const epoch = ++generatorEpoch;
    generate.disabled = true;
    generatorError.textContent = t("Generating…");
    try {
      const result = await call(
        "generateSecret",
        kind.value === "password"
          ? {
              kind: "password",
              length: Number(length.value),
              lower: lower.checked,
              upper: upper.checked,
              digits: digits.checked,
              symbols: symbols.checked,
              excludeAmbiguous: ambiguous.checked,
            }
          : { kind: kind.value, bytes: Number(bytes.value) },
      );
      if (disposed || !generator.open || epoch !== generatorEpoch) return;
      generated.value = result.value;
      generatedToken = result.token;
      generated.type = "password";
      generatorError.textContent = "";
      copyGenerated.disabled = false;
      applyGenerated.disabled =
        !editor ||
        !!snapshot.entries.find((e) => e.id === editor.id)?.deletedAt;
      clearTimeout(generatorTimer);
      generatorTimer = setTimeout(() => {
        generated.type = "password";
      }, 15000);
    } catch (failure) {
      generatorError.textContent = errorText(failure);
    } finally {
      generate.disabled = false;
    }
  });
  const revealGenerated = button("Show / edit", () => {
    generated.type = generated.type === "password" ? "text" : "password";
    clearTimeout(generatorTimer);
    generatorTimer = setTimeout(() => {
      generated.type = "password";
    }, 15000);
  });
  const copyGenerated = button("Copy", async () => {
      if (!generatedToken) return;
      try {
        await call("copyGenerated", { token: generatedToken });
        status.textContent = t("Copied. Clipboard clears after 10 seconds.");
      } catch (failure) {
        generatorError.textContent = errorText(failure);
      }
    }),
    applyGenerated = button("Apply to entry password", () => {
      if (!editor?.password || !generated.value) return;
      editor.password.generated(generated.value);
      generator.close();
    });
  copyGenerated.disabled = true;
  applyGenerated.disabled = true;
  const generatorActions = node("div", "actions");
  generatorActions.append(
    generate,
    revealGenerated,
    copyGenerated,
    applyGenerated,
  );
  generatorForm.append(generatorActions);
  generatorForm.onsubmit = (event) => {
    event.preventDefault();
    generate.click();
  };
  generator.append(generatorForm);
  root.append(generator);
  function openGenerator() {
    generator.showModal();
    length.focus();
  }
  generator.addEventListener("close", () => {
    ++generatorEpoch;
    clearTimeout(generatorTimer);
    generated.value = "";
    generated.type = "password";
    generatedToken = null;
    copyGenerated.disabled = true;
    applyGenerated.disabled = true;
    generatorError.textContent = "";
  });
  function maskSecrets() {
    ++generatorEpoch;
    for (const row of editor?.secretRows || []) row.mask();
    generated.type = "password";
  }
  function wipe() {
    disposed = true;
    maskSecrets();
    clearEditor();
    generated.value = "";
    generatedToken = null;
    ++generatorEpoch;
    clearTimeout(generatorTimer);
    for (const control of root.querySelectorAll("input,textarea"))
      control.value = "";
  }
  window.addEventListener("blur", maskSecrets);
  window.addEventListener("pagehide", wipe);
  window.addEventListener("beforeunload", (event) => {
    if (dirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  let lastTouch = 0;
  const touch = () => {
    if (Date.now() - lastTouch < 1000) return;
    lastTouch = Date.now();
    void call("touch").catch(() => {});
  };
  document.addEventListener("pointerdown", touch, { passive: true });
  document.addEventListener("keydown", touch, { passive: true });
  detail.append(message("p", "Select an entry or create a new one.", "empty"));
  window.SmartWindowLock?.onLock(() => {
    serial++;
    wipe();
    snapshot = { folders: [], entries: [], appearance: {} };
    root.replaceChildren();
  });
  api.onChanged((change) => {
    if (change?.locked === true)
      window.SmartWindowLock?.lock(change.uiGeneration);
    else if (!disposed) void refresh();
  });
  status.textContent = t("Loading…");
  void refresh();
})();
