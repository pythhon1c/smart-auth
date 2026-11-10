"use strict";
const featuresLocale = window.SmartLocaleData;
// Public preferences and explicit import/edit workflows. All parsing and storage
// of authenticator secrets stays in the main process.
function appearanceControls(onChange, disabled = false) {
  const box = el("div", "appearance-controls"),
    prefs = window.SmartI18n.preferences;
  const language = select(
    [
      ["ua", featuresLocale.message_181bf51],
      ["en", "English"],
      ["ru", featuresLocale.message_5537fc8],
    ],
    prefs.language,
  );
  const theme = select(
    [
      ["dark", featuresLocale.dark],
      ["light", featuresLocale.light],
    ],
    prefs.theme,
  );
  field(box, featuresLocale.language, language);
  field(box, featuresLocale.theme, theme);
  const update = (value) => {
    window.SmartI18n.choose(value);
    onChange?.();
  };
  language.disabled = theme.disabled = disabled;
  language.onchange = () => update({ language: language.value });
  theme.onchange = () => update({ theme: theme.value });
  return box;
}
function orderedPicker(form, title, items, initial = []) {
  const chosen = initial.filter((id) => items.some((p) => p.id === id)),
    outer = el("div"),
    box = el("div", "route-list"),
    filter = input("search", "", featuresLocale.search);
  let page = 0;
  filter.className = "picker-search";
  outer.append(filter, box);
  const controls = el("div", "picker-controls");
  outer.append(controls);
  const rows = () => {
    box.replaceChildren();
    controls.replaceChildren();
    const lookup = new Map(items.map((p) => [p.id, p])),
      order = [
        ...chosen,
        ...items.map((p) => p.id).filter((id) => !chosen.includes(id)),
      ].filter((id) =>
        lookup.get(id).name.toLowerCase().includes(filter.value.toLowerCase()),
      );
    page = Math.min(page, Math.max(0, Math.ceil(order.length / 50) - 1));
    order.slice(page * 50, (page + 1) * 50).forEach((id) => {
      const item = lookup.get(id),
        rank = chosen.indexOf(id),
        row = el("div", "ordered-row"),
        check = checkbox(displayProxyAddress(item.name), rank >= 0);
      check.input.onchange = () => {
        if (check.input.checked) chosen.push(id);
        else chosen.splice(chosen.indexOf(id), 1);
        rows();
      };
      row.append(check.node);
      if (rank >= 0) {
        row.append(
          el("small", "", `${featuresLocale.templateText_a5f4179}${rank + 1}`),
        );
        const up = btn("↑", () => {
            if (rank > 0) {
              [chosen[rank - 1], chosen[rank]] = [
                chosen[rank],
                chosen[rank - 1],
              ];
              rows();
            }
          }),
          down = btn("↓", () => {
            if (rank < chosen.length - 1) {
              [chosen[rank], chosen[rank + 1]] = [
                chosen[rank + 1],
                chosen[rank],
              ];
              rows();
            }
          });
        up.title = t(featuresLocale.moveUp);
        down.title = t(featuresLocale.moveDown);
        up.disabled = rank === 0;
        down.disabled = rank === chosen.length - 1;
        append(row, up, down);
      }
      box.append(row);
    });
    if (!order.length) box.append(el("p", "", featuresLocale.noResults));
    if (order.length > 50)
      append(
        controls,
        btn("←", () => {
          page--;
          rows();
        }),
        el("small", "", `${page + 1} / ${Math.ceil(order.length / 50)}`),
        btn("→", () => {
          page++;
          rows();
        }),
      );
    if (controls.firstChild) controls.firstChild.disabled = page === 0;
    if (controls.lastChild)
      controls.lastChild.disabled = page >= Math.ceil(order.length / 50) - 1;
  };
  filter.oninput = () => {
    page = 0;
    rows();
  };
  rows();
  field(form, title, outer);
  return () => [...chosen];
}

function listPicker(form, ids = []) {
  form.append(
    el(
      "p",
      "",
      featuresLocale.eachAccountReceivesOneProxyFromEachListTheFirstListProvidesThePrimary,
    ),
  );
  return orderedPicker(
    form,
    featuresLocale.listOrder,
    data.proxyLists || [],
    ids,
  );
}
function proxyAllocationOptions(form, initial = {}) {
  const box = el("section", "proxy-allocation-options");
  box.append(el("h3", "", featuresLocale.proxyAllocation));
  const mode = initial.preserve
    ? field(
        box,
        initial.moving
          ? featuresLocale.accountRoutes
          : featuresLocale.importedAccountRoutes,
        select(
          [
            [
              "preserve",
              initial.moving
                ? featuresLocale.keepManualRoutesUseFolderLists
                : featuresLocale.useFolderListsKeepImportedRoutes,
            ],
            ["explicit", featuresLocale.chooseListsAndIndividualProxies],
          ],
          "preserve",
        ),
      )
    : null;
  const choices = el("div");
  const lists = listPicker(choices, initial.proxyListIds || []);
  const manual = routePicker(choices, initial.proxyIds || []);
  choices.append(
    el(
      "p",
      "muted",
      featuresLocale.individualProxiesAreAddedManuallyAsAdditionalRoutesReusingProxiesFromListsRequiresSeparate,
    ),
  );
  box.append(choices);
  if (mode) {
    choices.hidden = true;
    mode.onchange = () => {
      choices.hidden = mode.value !== "explicit";
    };
  }
  form.append(box);
  return () =>
    mode?.value === "preserve"
      ? {}
      : { proxyListIds: lists(), proxyIds: manual() };
}

function afterDialogCloses(cleanup) {
  const listener = () => {
    // HTMLDialogElement queues its close event. A dialog opened in the same
    // turn belongs to a new review and must retain its token and cleanup hook.
    if (modal.open) return;
    modal.removeEventListener("close", listener);
    cleanup();
  };
  modal.addEventListener("close", listener);
}

async function prepareProxyAllocationReview(
  action,
  payload,
  { onApplied, onCancelled, message } = {},
) {
  const generation = lockGeneration,
    dialogGeneration = sensitiveDialogGeneration;
  const progressIds = action === "moveAccounts" ? payload.ids : null;
  const currentForm = content.querySelector("form");
  const preview =
    progressIds && currentForm
      ? await atomicBulkProgress(currentForm, progressIds, () =>
          call("prepareProxyAllocation", { action, payload }),
        )
      : await call("prepareProxyAllocation", { action, payload });
  if (
    locked ||
    generation !== lockGeneration ||
    dialogGeneration !== sensitiveDialogGeneration
  ) {
    if (preview?.token)
      await call("cancelProxyAllocation", { token: preview.token }).catch(
        () => {},
      );
    return;
  }
  if (!preview?.token)
    throw Error(t(featuresLocale.couldNotPrepareProxyAllocation));
  showProxyAllocationReview(preview, {
    onApplied,
    onCancelled,
    message,
    progressIds,
  });
}

function showProxyAllocationReview(
  preview,
  {
    onApplied,
    onCancelled,
    message = featuresLocale.proxyAllocationApplied,
    progressIds,
  } = {},
) {
  let token = preview.token;
  dialog(featuresLocale.reviewProxyAllocation, (form) => {
    const generation = lockGeneration;
    if (Number.isInteger(preview.result?.imported))
      form.append(
        el(
          "p",
          "",
          t(featuresLocale.newAccountsUpdatedExisting)
            .replace("{imported}", preview.result.imported)
            .replace(
              "{updated}",
              (preview.result.updated || 0) + (preview.result.enriched || 0),
            )
            .replace("{duplicates}", preview.result.duplicates || 0),
        ),
      );
    if (Number.isInteger(preview.result?.passwordAdded))
      form.append(
        el(
          "p",
          "",
          t(featuresLocale.passwordsToAdd).replace(
            "{count}",
            preview.result.passwordAdded,
          ),
        ),
      );
    form.append(
      el(
        "p",
        "",
        t(featuresLocale.accountsToAllocate).replace(
          "{count}",
          preview.accountCount,
        ),
      ),
    );
    form.append(
      el(
        "p",
        "muted",
        featuresLocale.eachAccountReceivesOneProxyFromEachListTheFirstListProvidesThePrimary,
      ),
    );
    const consents = [],
      backups = [];
    for (const list of preview.lists || []) {
      const card = el("section", "proxy-allocation-list");
      card.dataset.allocationList = list.id;
      const name = el("h3");
      name.textContent = displayProxyAddress(list.name);
      card.append(
        name,
        el(
          "p",
          "",
          t(featuresLocale.availableRequiredShort)
            .replace("{available}", list.available)
            .replace("{required}", list.required)
            .replace("{shortage}", list.shortage),
        ),
      );
      if (list.blocked)
        card.append(
          el(
            "p",
            "error",
            featuresLocale.thisListHasNoProxiesAddProxiesToTheListBeforeAllocating,
          ),
        );
      if (list.shortage > 0) {
        card.append(
          el(
            "p",
            "warn",
            featuresLocale.distinctProxiesAreAssignedFirstOnlyAccountsWithoutAProxyReuseThisListS,
          ),
        );
        const consent = checkbox(
          t(featuresLocale.allowReuseFromListForAccounts)
            .replace("{name}", displayProxyAddress(list.name))
            .replace("{count}", list.shortage),
          false,
        );
        consent.input.dataset.reuseList = list.id;
        consent.input.disabled = list.blocked === true;
        consents.push({ id: list.id, input: consent.input });
        card.append(consent.node);
      }
      if (
        list.spareAvailable > 0 &&
        list.backupAccountCount > 0 &&
        list.maxBackupsPerAccount > 0
      ) {
        const consent = checkbox(
          featuresLocale.assignAvailableSpareProxies,
          false,
        );
        consent.input.dataset.backupList = list.id;
        card.append(consent.node);
        const count = field(
          card,
          featuresLocale.maximumSpareProxiesPerAccount,
          input("number", 1),
        );
        count.min = "1";
        count.max = String(list.maxBackupsPerAccount);
        count.step = "1";
        count.required = true;
        count.dataset.backupCount = list.id;
        const summary = el("p", "muted");
        summary.setAttribute("aria-live", "polite");
        const updateBackups = () => {
          count.disabled = !consent.input.checked;
          summary.textContent = t(
            featuresLocale.availableAccountsSparesToAssign,
          )
            .replace("{available}", list.spareAvailable)
            .replace("{accounts}", list.backupAccountCount)
            .replace(
              "{total}",
              consent.input.checked
                ? Math.min(
                    list.spareAvailable,
                    (Number(count.value) || 0) * list.backupAccountCount,
                  )
                : 0,
            );
        };
        consent.input.onchange = updateBackups;
        count.oninput = updateBackups;
        card.append(
          summary,
          el(
            "p",
            "muted",
            featuresLocale.ifThereAreTooFewFreeProxiesForAFullRoundTheLastAccounts,
          ),
        );
        backups.push({ id: list.id, input: consent.input, count });
        updateBackups();
      }
      form.append(card);
    }
    const error = el("p", "error");
    error.setAttribute("role", "alert");
    form.append(error);
    footer(
      form,
      async () => {
        if (
          !token ||
          (preview.lists || []).some((list) => list.blocked) ||
          consents.some((consent) => !consent.input.checked)
        )
          return;
        if (
          backups.some(
            ({ input, count }) => input.checked && !count.reportValidity(),
          )
        )
          return;
        const current = token;
        try {
          const commitPayload = {
            token: current,
            backupCounts: Object.fromEntries(
              backups.map(({ id, input, count }) => [
                id,
                input.checked ? Number(count.value) : 0,
              ]),
            ),
            reuseListIds: consents
              .filter((consent) => consent.input.checked)
              .map((consent) => consent.id),
          };
          const result = progressIds
            ? await atomicBulkProgress(form, progressIds, () =>
                call("commitProxyAllocation", commitPayload),
              )
            : await call("commitProxyAllocation", commitPayload);
          token = null;
          if (locked || generation !== lockGeneration || !form.isConnected)
            return;
          await onApplied?.(result);
          if (progressIds)
            form
              .closest("form")
              .querySelector(".modal-footer")
              ?.replaceChildren(btn(featuresLocale.done, () => modal.close()));
          else modal.close();
          await refresh();
          toast(message);
        } catch (failure) {
          if (!locked && generation === lockGeneration && form.isConnected)
            error.textContent = t(failure.message);
        }
      },
      featuresLocale.confirmAllocation,
    );
    const approve = form.querySelector('button[type="submit"]');
    const update = () => {
      approve.disabled =
        (preview.lists || []).some((list) => list.blocked) ||
        consents.some((consent) => !consent.input.checked);
    };
    for (const consent of consents) consent.input.onchange = update;
    update();
  });
  afterDialogCloses(() => {
    if (token) {
      call("cancelProxyAllocation", { token }).catch(() => {});
      onCancelled?.();
    }
    token = null;
  });
}
function proxyImportDialog() {
  dialog(featuresLocale.importProxies, (f) => {
    const mode = field(
      f,
      featuresLocale.source,
      select(
        [
          ["files", featuresLocale.fromFiles],
          ["text", featuresLocale.pasteText],
        ],
        "files",
      ),
    );
    const name = field(f, featuresLocale.listName, input());
    const protocol = field(
      f,
      featuresLocale.protocol,
      select(
        [
          ["http", "HTTP"],
          ["https", "HTTPS"],
          ["socks5", "SOCKS5 (remote DNS)"],
        ],
        "http",
      ),
    );
    f.append(
      el(
        "p",
        "",
        featuresLocale.oneProxyPerLineHostPortHostPortUserPasswordOrURLSOCKS5Uses,
      ),
    );
    const text = el("textarea");
    text.rows = 7;
    text.spellcheck = false;
    const wrap = el("div");
    field(wrap, featuresLocale.proxyText, text);
    f.append(wrap);
    wrap.hidden = true;
    mode.onchange = () => (wrap.hidden = mode.value !== "text");
    footer(
      f,
      async () => {
        let result;
        try {
          result = await call("importProxies", {
            mode: mode.value,
            name: name.value,
            protocol: protocol.value,
            ...(mode.value === "text" ? { text: text.value } : {}),
          });
        } finally {
          text.value = "";
        }
        if (result?.cancelled || result?.canceled) return;
        if (result?.errors?.length) {
          showProxyImportErrors(result.errors);
          return;
        }
        modal.close();
        await refresh();
        toast(
          `${featuresLocale.templateText_01cecfd}${result.imported || 0}${featuresLocale.templateText_27ccd5d}${result.duplicates || 0}`,
        );
      },
      featuresLocale.import_68f804f,
    );
  });
}
function editProxyList(list) {
  dialog(list ? featuresLocale.editList : featuresLocale.newList, (f) => {
    const name = field(
      f,
      featuresLocale.title,
      input(
        displayProxyAddress(list?.name) === String(list?.name ?? "")
          ? "text"
          : "password",
        list?.name,
      ),
    );
    const routes = orderedPicker(
      f,
      featuresLocale.listMembersAndOrder,
      data.proxies,
      list?.proxyIds || [],
    );
    footer(f, () =>
      mutate(
        list ? "updateProxyList" : "addProxyList",
        {
          ...(list ? { id: list.id } : {}),
          name: name.value,
          proxyIds: routes(),
        },
        featuresLocale.listSaved,
      ),
    );
    if (list)
      f.append(
        btn(featuresLocale.editAddresses, () => editProxyListText(list)),
      );
  });
}
async function editProxyListText(list) {
  const generation = lockGeneration;
  const result = await call("proxyListText", { id: list.id });
  if (locked || generation !== lockGeneration) return;
  dialog(featuresLocale.editAddresses, (f) => {
    const name = field(
      f,
      featuresLocale.title,
      input(
        displayProxyAddress(list.name) === list.name ? "text" : "password",
        list.name,
      ),
    );
    const protocol = field(
      f,
      featuresLocale.protocol,
      select(
        [
          ["http", "HTTP"],
          ["https", "HTTPS"],
          ["socks5", "SOCKS5 (remote DNS)"],
        ],
        "http",
      ),
    );
    const text = el("textarea");
    text.rows = 9;
    text.spellcheck = false;
    text.value = typeof result === "string" ? result : result.text || "";
    field(f, featuresLocale.proxyText, text);
    f.append(
      el(
        "p",
        "",
        featuresLocale.oneProxyPerLineHostPortHostPortUserPasswordOrURLSOCKS5Uses,
      ),
    );
    footer(f, async () => {
      try {
        await mutate(
          "updateProxyList",
          {
            id: list.id,
            name: name.value,
            text: text.value,
            protocol: protocol.value,
          },
          featuresLocale.listSaved,
        );
      } finally {
        text.value = "";
      }
    });
  });
}
let activeImportToken = null;
function discardImport() {
  if (activeImportToken) {
    const token = activeImportToken;
    activeImportToken = null;
    call("cancelAccountImport", { token }).catch(() => {});
  }
}
function importBanOptions(form) {
  const vac = checkbox(featuresLocale.skipVACBannedAccounts, false);
  const community = checkbox(featuresLocale.skipCommunityBannedAccounts, false);
  vac.input.dataset.skipVacBanned = "true";
  community.input.dataset.skipCommunityBanned = "true";
  form.append(vac.node, community.node);
  return () => ({
    skipVacBanned: vac.input.checked,
    skipCommunityBanned: community.input.checked,
  });
}
function appendImportBanSummary(form, preview) {
  if (!preview.banFilter) return;
  const status = preview.banFilter;
  form.append(
    el(
      "p",
      "ban-import-summary",
      t(featuresLocale.skippedVACCommunityChecked)
        .replace("{vac}", status.skippedVac || 0)
        .replace("{community}", status.skippedCommunity || 0)
        .replace("{checked}", status.checked || 0),
    ),
  );
  if (status.unknown)
    form.append(
      el(
        "p",
        "warn ban-import-warning",
        t(
          featuresLocale.banStatusIsUnknownForAccountsTheyCannotBeConsideredChecked,
        ).replace("{count}", status.unknown),
      ),
    );
}
function importAccountsDialog() {
  discardImport();
  dialog(featuresLocale.importAccounts, (f) => {
    const mode = field(
      f,
      featuresLocale.source,
      select(
        [
          ["files", featuresLocale.filesMaFileJSONTXTSteamsession],
          ["text", featuresLocale.oneAccountFromText],
          ["folder", featuresLocale.folderGroup],
        ],
        "files",
      ),
    );
    const format = field(
      f,
      featuresLocale.format,
      select(
        [
          ["auto", featuresLocale.autoDetect],
          ["portable", "smart-auth"],
          ["sih", "SIH"],
          ["nebula", "Nebula"],
          ["sda", "SDA"],
          ["deps", "Deps"],
          ["nan", "Nan"],
          ["tbs", "Trade Bots System v1"],
        ],
        "auto",
      ),
    );
    format.onchange = () => {
      if (format.value === "portable") portableImportDialog();
    };
    f.append(btn(featuresLocale.importSmartSDA, portableImportDialog));
    f.append(
      el(
        "p",
        "",
        featuresLocale.tradeBotsSystemOneJSONMultipleFilesOrAPackageFolderWithManifestJson,
      ),
    );
    f.append(
      el(
        "p",
        "",
        featuresLocale.autoDetectChecksStructureSIHNebulaSDADepsNanSelectTheExpectedFormatIncompatible,
      ),
    );
    const folder = field(
      f,
      featuresLocale.folder,
      select(
        [
          ["", featuresLocale.noFolder],
          ...data.groups.map((g) => [g.id, g.name]),
        ],
        group,
      ),
    );
    const banOptions = importBanOptions(f);
    const allocationOptions = proxyAllocationOptions(f, { preserve: true });
    const wrap = el("div"),
      text = el("textarea");
    text.rows = 8;
    text.spellcheck = false;
    field(wrap, featuresLocale.accountText, text);
    wrap.append(
      el(
        "p",
        "",
        featuresLocale.singleAccountJSONOrLoginPasswordSecretsAreProcessedLocallyAndExcludedFromThe,
      ),
    );
    f.append(wrap);
    wrap.hidden = true;
    mode.onchange = () => {
      wrap.hidden = mode.value !== "text";
      folder.disabled = mode.value === "folder";
    };
    footer(
      f,
      async () => {
        const generation = lockGeneration,
          dialogGeneration = sensitiveDialogGeneration;
        let preview;
        try {
          preview = await call("prepareAccountImport", {
            ...banOptions(),
            mode: mode.value,
            format: format.value,
            groupId: mode.value === "folder" ? null : folder.value || null,
            ...(mode.value === "text" ? { text: text.value } : {}),
          });
        } finally {
          text.value = "";
        }
        if (
          locked ||
          generation !== lockGeneration ||
          dialogGeneration !== sensitiveDialogGeneration ||
          !f.isConnected
        ) {
          if (preview?.token)
            await call(
              preview.format === "tbs"
                ? "cancelPortableImport"
                : "cancelAccountImport",
              { token: preview.token },
            ).catch(() => {});
          return;
        }
        if (preview?.cancelled || preview?.canceled) return;
        if (preview.format === "tbs")
          showPortableImportReview(preview, allocationOptions());
        else showImportReview(preview, allocationOptions());
      },
      featuresLocale.reviewBeforeImport,
    );
  });
}
function showImportReview(preview, allocationOptions = {}) {
  activeImportToken = preview.token;
  dialog(featuresLocale.importReview, (f) => {
    appendImportBanSummary(f, preview);
    const counts = preview.counts || {};
    f.append(
      el(
        "p",
        "",
        `${featuresLocale.templateText_6d248a2}${counts.ready || 0}${featuresLocale.templateText_27ccd5d}${counts.duplicates || 0}${featuresLocale.templateText_565159c}${counts.invalid || 0}`,
      ),
    );
    f.append(
      el(
        "p",
        "",
        t(featuresLocale.passwordsToAddConflicts)
          .replace("{added}", counts.passwordAdded || 0)
          .replace("{conflicts}", counts.passwordConflicts || 0),
      ),
    );
    if (counts.passwordConflicts)
      f.append(
        el(
          "p",
          "error",
          featuresLocale.existingPasswordsAreNeverOverwrittenConflictingRecordsAreSkipped,
        ),
      );
    if (preview.createsGroup)
      f.append(
        el(
          "p",
          "",
          `${featuresLocale.templateText_220d5be}${preview.groupName || ""}`,
        ),
      );
    const rows = el("div", "review-list");
    (preview.accounts || []).forEach((a) =>
      rows.append(
        append(
          el("div", "table-row"),
          append(
            el("div"),
            el("strong", "", a.name),
            el(
              "p",
              "",
              [a.steamId, a.source, a.groupName].filter(Boolean).join(" · "),
            ),
            a.warnings?.length
              ? el("p", "error", a.warnings.map(t).join(" · "))
              : null,
            el(
              "p",
              "",
              a.passwordChange === "added"
                ? featuresLocale.passwordWillBeAdded
                : a.hasPassword
                  ? featuresLocale.steamPasswordSaved
                  : featuresLocale.noSteamPasswordSaved,
            ),
          ),
          el(
            "span",
            "badge " + (a.duplicate ? "warn" : "healthy"),
            a.passwordChange === "added" && a.duplicate
              ? featuresLocale.passwordAddition
              : a.duplicate
                ? featuresLocale.duplicate
                : featuresLocale.ready,
          ),
        ),
      ),
    );
    f.append(rows);
    if (preview.errors?.length) {
      f.append(el("h3", "", featuresLocale.importErrors));
      preview.errors.forEach((e) =>
        f.append(
          append(
            el("div", "error"),
            el("strong", "", e.source),
            el("p", "", t(e.reason)),
          ),
        ),
      );
    }
    const controls = el("div", "modal-footer"),
      back = btn(featuresLocale.back, () => importAccountsDialog()),
      apply = btn(
        featuresLocale.applyImport,
        async () => {
          await prepareProxyAllocationReview(
            "commitAccountImport",
            { token: preview.token, ...allocationOptions },
            {
              onApplied: () => {
                activeImportToken = null;
              },
              message: featuresLocale.importCompleted,
            },
          );
        },
        "primary",
      );
    apply.disabled = !(counts.ready || counts.passwordAdded);
    append(controls, back, apply);
    f.append(controls);
  });
  afterDialogCloses(() => {
    if (activeImportToken === preview.token) discardImport();
  });
}
function bulkProgressView(ids, status = {}) {
  const box = el("section", "bulk-progress");
  box.dataset.bulkProgress = "true";
  const total = status.total ?? ids.length;
  const processed = Math.min(total, Math.max(0, status.processed || 0));
  const summary = el(
    "p",
    "bulk-progress-summary",
    t(featuresLocale.processed)
      .replace("{processed}", processed)
      .replace("{total}", total),
  );
  if (status.indeterminate) summary.textContent = t(featuresLocale.working);
  summary.setAttribute("role", "status");
  const bar = el("progress");
  bar.max = Math.max(1, total);
  if (!status.indeterminate) bar.value = processed;
  bar.setAttribute("aria-label", t(featuresLocale.bulkOperationProgress));
  const rows = el("ol", "bulk-progress-items");
  const labels = {
    queued: featuresLocale.queued,
    running: featuresLocale.running_af4dd92,
    complete: featuresLocale.completed,
    pending: featuresLocale.awaitingConfirmation,
    failed: featuresLocale.failed,
    cancelled: featuresLocale.cancelled,
  };
  const items = new Map((status.items || []).map((item) => [item.id, item]));
  const activeIds = new Set(status.currentIds || []);
  const names = new Map(
    data.accounts.map((account) => [account.id, account.name]),
  );
  const failures = new Map(
    [...(status.failed || []), ...(status.result?.failed || [])].map((item) => [
      item.id || item.accountId,
      item,
    ]),
  );
  for (const id of ids) {
    const item =
      items.get(id) ||
      (failures.has(id)
        ? { state: "failed", message: failures.get(id).message }
        : {
            state: activeIds.has(id)
              ? "running"
              : status.state === "cancelled"
                ? "cancelled"
                : "queued",
          });
    const row = el("li", "bulk-progress-item");
    row.dataset.accountId = id;
    row.dataset.progressState = item.state;
    const name = el("span", "bulk-progress-name");
    name.textContent = names.get(id) || id;
    name.title = name.textContent;
    row.append(
      name,
      el(
        "span",
        "bulk-progress-state",
        labels[item.state] || featuresLocale.queued,
      ),
    );
    if (item.message)
      row.append(el("p", "bulk-progress-message", item.message));
    rows.append(row);
  }
  const phaseLabels = {
    preparing: featuresLocale.reviewConfirmations,
    committing: featuresLocale.sendingConfirmations,
  };
  if (phaseLabels[status.phase])
    box.append(el("p", "bulk-progress-phase", phaseLabels[status.phase]));
  box.append(summary, bar, rows);
  return box;
}
function updateBulkProgress(host, ids, status, summary) {
  const old = host.querySelector("[data-bulk-progress]");
  const scroll = old?.querySelector("ol")?.scrollTop || 0;
  const next = bulkProgressView(ids, status);
  if (summary) host.replaceChildren(next, summary);
  else if (old) old.replaceWith(next);
  else host.prepend(next);
  next.querySelector("ol").scrollTop = scroll;
}
async function atomicBulkProgress(form, ids, action) {
  const generation = lockGeneration,
    dialogGeneration = sensitiveDialogGeneration;
  updateBulkProgress(form, ids, {
    indeterminate: true,
    items: ids.map((id) => ({ id, state: "running" })),
  });
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    dialogGeneration === sensitiveDialogGeneration &&
    form.isConnected;
  try {
    const result = await action();
    const cancelled =
      result?.cancelled || result?.canceled || result?.saved === false;
    if (active())
      updateBulkProgress(form, ids, {
        total: ids.length,
        processed: cancelled ? 0 : ids.length,
        items: ids.map((id) => ({
          id,
          state: cancelled ? "cancelled" : "complete",
        })),
      });
    return result;
  } catch (error) {
    if (active())
      updateBulkProgress(form, ids, {
        total: ids.length,
        processed: 0,
        items: ids.map((id) => ({
          id,
          state: "failed",
          message: error.message,
        })),
      });
    throw error;
  }
}
async function bulkCloseBrowsers(ids = selectedAccountIds()) {
  let host;
  dialog(featuresLocale.closeBrowsers, (form) => {
    host = form;
  });
  const generation = lockGeneration,
    dialogGeneration = sensitiveDialogGeneration;
  try {
    await atomicBulkProgress(host, ids, () => call("closeBrowsers", { ids }));
    if (
      !locked &&
      generation === lockGeneration &&
      dialogGeneration === sensitiveDialogGeneration &&
      host.isConnected
    ) {
      host.closest("form").append(
        append(
          el("div", "modal-footer"),
          btn(featuresLocale.done, () => modal.close()),
        ),
      );
      await refresh();
    }
  } catch (error) {
    if (
      !locked &&
      generation === lockGeneration &&
      dialogGeneration === sensitiveDialogGeneration &&
      host.isConnected
    )
      host.closest("form").append(
        append(
          el("div", "modal-footer"),
          btn(featuresLocale.done, () => modal.close()),
        ),
      );
  }
}
function bulkMoveAccountsDialog(explicitIds = null) {
  const ids = explicitIds || selectedAccountIds();
  dialog(featuresLocale.moveToFolder, (form) => {
    form.append(
      el("p", "", t(featuresLocale.selected).replace("{count}", ids.length)),
    );
    const folder = field(
      form,
      featuresLocale.folder,
      select(
        [
          ["", featuresLocale.noFolder],
          ...data.groups.map((g) => [g.id, g.name]),
        ],
        explicitIds
          ? data.accounts.find((a) => a.id === ids[0])?.groupId
          : group,
      ),
    );
    const allocationOptions = proxyAllocationOptions(form, {
      preserve: true,
      moving: true,
    });
    footer(form, () =>
      prepareProxyAllocationReview(
        "moveAccounts",
        {
          ids,
          groupId: folder.value || null,
          ...allocationOptions(),
        },
        {
          onApplied: () => {
            bulkSelected.clear();
            bulkMode = false;
          },
          message: featuresLocale.accountsMoved,
        },
      ),
    );
  });
}
function bulkToolbar() {
  const box = el("div", "toolbar bulk-toolbar");
  const actions = [
    [
      "proxy-check",
      featuresLocale.checkProxies,
      () => proxyCheckDialog(selectedAccountIds()),
    ],
    ["ban-check", featuresLocale.checkBans, bulkBanCheckDialog],
    ["move", featuresLocale.moveToFolder, () => bulkMoveAccountsDialog()],
    [
      "export",
      featuresLocale.export,
      () => exportAccountsDialog(selectedAccountIds()),
    ],
    ["login", featuresLocale.logInToSteam_097c47f, bulkLoginDialog],
    [
      "browser-open",
      featuresLocale.openInBrowser,
      () => openBrowsersDialog(selectedAccountIds()),
    ],
    [
      "browser-close",
      featuresLocale.closeBrowsers,
      () => bulkCloseBrowsers(selectedAccountIds()),
    ],
    [
      "browser-profiles",
      featuresLocale.browserProfiles,
      () => browserProfilesDialog(selectedAccountIds()),
    ],
    ["policy", featuresLocale.automaticConfirmations, bulkPolicyDialog],
    [
      "market",
      featuresLocale.confirmMarket,
      () => bulkConfirmationReview("market"),
    ],
    [
      "purchase",
      featuresLocale.confirmMarketPurchases,
      () => bulkConfirmationReview("purchase"),
    ],
    [
      "trade",
      featuresLocale.confirmTrades,
      () => bulkConfirmationReview("trade"),
    ],
  ];
  const picker = select(
    [
      ["", featuresLocale.chooseAction],
      ...actions.map(([id, label]) => [id, label]),
    ],
    bulkAction,
  );
  picker.dataset.bulkActionPicker = "true";
  picker.dataset.bulkAction = "true";
  picker.setAttribute("aria-label", t(featuresLocale.bulkAction));
  picker.disabled = bulkSelected.size === 0;
  const run = btn(
    featuresLocale.run,
    () => {
      if (!bulkSelected.size)
        throw Error(t(featuresLocale.selectAtLeastOneAccount));
      const action = actions.find(([id]) => id === picker.value);
      if (action) return action[2]();
    },
    "primary",
  );
  run.dataset.bulkActionRun = "true";
  run.dataset.bulkAction = "true";
  run.syncDisabled = () => {
    run.disabled = !bulkSelected.size || !picker.value;
  };
  picker.onchange = () => {
    bulkAction = picker.value;
    run.syncDisabled();
  };
  run.syncDisabled();
  const count = el(
    "small",
    "bulk-count",
    t(featuresLocale.selected).replace("{count}", bulkSelected.size),
  );
  count.dataset.bulkCount = "true";
  box.append(picker, run, count);
  box.classList.toggle("bulk-active", bulkSelected.size > 0);
  return box;
}
async function proxyCheckDialog(ids) {
  let host,
    controls,
    ticket = null,
    timer,
    stopped = false,
    finished = false;
  const generation = lockGeneration;
  dialog(featuresLocale.checkProxies, (form) => {
    host = form;
    updateBulkProgress(host, ids, { total: ids.length });
    form.append(
      el("p", "", featuresLocale.proxyChecksUseTheBulkOperationSettings),
    );
    controls = el("div", "modal-footer");
    form.append(controls);
  });
  const dialogGeneration = sensitiveDialogGeneration;
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    dialogGeneration === sensitiveDialogGeneration &&
    host.isConnected &&
    modal.open;
  const stop = async () => {
    stopped = true;
    clearTimeout(timer);
    if (ticket && !finished)
      await call("cancelProxyCheck", { ticket }).catch(() => {});
  };
  afterDialogCloses(() => {
    void stop();
  });
  try {
    ticket = (await call("startProxyCheck", { ids })).ticket;
    if (!active() || stopped) {
      await stop();
      return;
    }
    const poll = async () => {
      if (!active() || stopped) {
        await stop();
        return;
      }
      try {
        const status = await call("proxyCheckStatus", { ticket });
        if (!active() || stopped) {
          await stop();
          return;
        }
        updateBulkProgress(
          host,
          ids,
          status,
          el(
            "p",
            "",
            t(featuresLocale.workingProxies).replace("{count}", status.passed),
          ),
        );
        if (status.currentIds?.length > 1)
          host.append(
            el(
              "p",
              "",
              t(featuresLocale.runningConcurrently).replace(
                "{count}",
                status.currentIds.length,
              ),
            ),
          );
        for (const failure of status.failed || [])
          host.append(
            el(
              "p",
              "error",
              `${data.accounts.find((account) => account.id === failure.accountId)?.name || ""}: ${t(failure.message)}`,
            ),
          );
        controls.replaceChildren();
        if (status.state === "running")
          controls.append(
            btn(featuresLocale.stopRemaining, async () => {
              await call("cancelProxyCheck", { ticket });
            }),
          );
        else {
          finished = true;
          host.append(
            el(
              "p",
              "",
              status.state === "cancelled"
                ? featuresLocale.queueStopped
                : featuresLocale.proxyChecksComplete,
            ),
          );
          controls.append(btn(featuresLocale.done, () => modal.close()));
        }
        await refresh(true);
        if (!finished && active()) timer = setTimeout(poll, 250);
      } catch (error) {
        await stop();
        if (active()) {
          host.append(el("p", "error", error.message));
          controls.replaceChildren(
            btn(featuresLocale.done, () => modal.close()),
          );
        }
      }
    };
    await poll();
  } catch (error) {
    await stop();
    if (active()) {
      host.append(el("p", "error", error.message));
      controls.replaceChildren(btn(featuresLocale.done, () => modal.close()));
    }
  }
}
function filteredAccounts() {
  return data.accounts.filter(
    (account) =>
      accountMatchesFilters(account) &&
      (!group || account.groupId === group) &&
      (!search ||
        `${account.name} ${account.steamId}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
}
function updateBulkSelectionControls() {
  const matches = filteredAccounts(),
    selected = matches.filter((account) => bulkSelected.has(account.id)).length;
  root.querySelectorAll("[data-select-all-accounts]").forEach((input) => {
    input.checked = matches.length > 0 && selected === matches.length;
    input.indeterminate = selected > 0 && selected < matches.length;
    input.disabled = !matches.length;
  });
  root.querySelectorAll("[data-account-select]").forEach((input) => {
    input.checked = bulkSelected.has(input.dataset.accountSelect);
    input.closest(".account")?.classList.toggle("selected", input.checked);
  });
  root.querySelectorAll("[data-bulk-action]").forEach((button) => {
    if (button.syncDisabled) button.syncDisabled();
    else button.disabled = bulkSelected.size === 0;
  });
  root
    .querySelector(".bulk-toolbar")
    ?.classList.toggle("bulk-active", bulkSelected.size > 0);
  root.querySelectorAll("[data-bulk-count]").forEach((count) => {
    count.textContent = t(featuresLocale.selected).replace(
      "{count}",
      bulkSelected.size,
    );
  });
}
function steamAdminsSettingsCard() {
  const card = el("section", "card steam-admins"),
    list = el("div", "steam-admin-list"),
    internal = field(
      card,
      featuresLocale.accountFromVault,
      select(
        [
          ["", featuresLocale.chooseAccount],
          ...data.accounts
            .filter((a) => a.steamId)
            .map((a) => [a.steamId, a.name + " · " + a.steamId]),
        ],
        "",
      ),
    ),
    external = field(
      card,
      featuresLocale.externalSteamID64,
      input("text", "", "7656119…"),
    );
  card.prepend(
    el("h2", "", featuresLocale.steamAdministrators),
    el(
      "p",
      "warn",
      featuresLocale.trustedSteamID64sWatchingIncomingOffersAutomaticallyAcceptsAnyTradeFromThemIncludingGivingYour,
    ),
  );
  external.inputMode = "numeric";
  external.maxLength = 128;
  const generation = lockGeneration;
  let admins = (data.steamAdmins || []).map((a) => ({ ...a })),
    saving = false;
  const current = () =>
    !locked && generation === lockGeneration && card.isConnected;
  const save = async (next) => {
    if (saving || !current()) return;
    saving = true;
    card.setAttribute("aria-busy", "true");
    card.querySelectorAll("button,input,select").forEach((node) => {
      node.disabled = true;
    });
    try {
      await call("saveSteamAdmins", {
        steamAdmins: next.map(({ steamId }) => ({ steamId })),
      });
      if (!current()) return;
      admins = next;
      internal.value = external.value = "";
      paint();
      toast(featuresLocale.steamAdministratorsSaved);
    } finally {
      saving = false;
      card.setAttribute("aria-busy", "false");
      card.querySelectorAll("button,input,select").forEach((node) => {
        node.disabled = false;
      });
    }
  };
  const paint = () => {
    list.replaceChildren();
    if (!admins.length)
      list.append(el("p", "muted", featuresLocale.noSteamAdministrators));
    for (const admin of admins) {
      const account = data.accounts.find((a) => a.steamId === admin.steamId),
        row = el("div", "steam-admin-row"),
        title = account?.name || admin.name || admin.steamId;
      row.append(
        accountAvatar({ name: title, avatar: admin.avatar || account?.avatar }),
        append(
          el("div", "steam-admin-label"),
          el("strong", "", title),
          el("small", "muted", admin.steamId),
        ),
        btn(featuresLocale.remove, () =>
          save(admins.filter((a) => a.steamId !== admin.steamId)),
        ),
      );
      list.append(row);
    }
  };
  const add = btn(featuresLocale.addAdministrator, () => {
    const steamId = external.value || internal.value;
    if (
      !/^765\d{14}$/.test(steamId) ||
      BigInt(steamId) <= 76561197960265728n ||
      BigInt(steamId) > 76561202255233023n
    )
      throw Error(t(featuresLocale.enterAValidPersonalSteamID64));
    if (admins.some((a) => a.steamId === steamId))
      throw Error(t(featuresLocale.thisSteamID64IsAlreadyAdded));
    return save([...admins, { steamId }]);
  });
  internal.onchange = () => {
    if (internal.value) external.value = "";
  };
  external.oninput = () => {
    if (external.value) internal.value = "";
  };
  card.append(
    add,
    list,
    btn(featuresLocale.refreshAvatars, async () => {
      await call("refreshSteamAdminAvatars");
      if (current()) await refresh(true);
    }),
  );
  card.dataset.steamAdmins = "true";
  card.syncSteamAdmins = () => {
    if (saving || !current()) return;
    admins = (data.steamAdmins || []).map((a) => ({ ...a }));
    paint();
  };
  paint();
  return card;
}
function banApiSettingsCard() {
  const card = el("section", "card ban-api-settings");
  card.append(el("h2", "", featuresLocale.steamBanChecks));
  const key = field(card, featuresLocale.steamWebAPIKey, input("password"));
  key.autocomplete = "off";
  key.dataset.sensitive = "ban-api-key";
  key.placeholder = data.banApiKeyConfigured ? t(featuresLocale.saved) : "";
  card.append(
    el(
      "p",
      "muted",
      featuresLocale.theKeyIsEncryptedAndExcludedFromAccountExportsVACIsAvailableWithoutA,
    ),
  );
  const actions = el("div", "actions");
  actions.append(
    btn(featuresLocale.saveKey, async () => {
      try {
        await call("saveBanApiKey", { key: key.value.trim() });
        await refresh();
        render();
      } finally {
        key.value = "";
      }
    }),
    btn(featuresLocale.removeKey, async () => {
      key.value = "";
      await call("saveBanApiKey", { key: "" });
      await refresh();
      render();
    }),
  );
  card.append(actions);
  return card;
}
function settingsPage(main) {
  header(
    main,
    featuresLocale.settings_2aac460,
    featuresLocale.appBehaviorSecurityAndBrowser,
  );
  const layout = el("div", "settings-grid"),
    appearance = el("section", "card");
  appearance.append(el("h2", "", featuresLocale.appearance));
  const language = field(
      appearance,
      featuresLocale.language,
      select(
        [
          ["ua", featuresLocale.message_181bf51],
          ["en", "English"],
          ["ru", featuresLocale.message_5537fc8],
        ],
        window.SmartI18n.preferences.language,
      ),
    ),
    theme = field(
      appearance,
      featuresLocale.theme,
      select(
        [
          ["dark", featuresLocale.dark],
          ["light", featuresLocale.light],
        ],
        window.SmartI18n.preferences.theme,
      ),
    );
  const perPage = field(
    appearance,
    featuresLocale.accountsPerPage,
    select(
      [10, 25, 50, 100, 200].map((n) => [String(n), String(n)]),
      String(accountPageSize()),
    ),
  );
  const behavior = el("section", "card");
  behavior.append(el("h2", "", featuresLocale.network));
  const direct = checkbox(
    featuresLocale.allowDirectConnectionWithoutARoute,
    data.settings.allowDirect === true,
  );
  append(
    behavior,
    direct.node,
    el(
      "p",
      "",
      featuresLocale.onlyForAccountsWithNoAssignedProxiesOrListsAFailedProxyNeverFalls,
    ),
  );
  const showProxyCredentials = checkbox(
    featuresLocale.showProxyUsernamesAndPasswords,
    data.settings.showProxyCredentials === true,
  );
  showProxyCredentials.input.dataset.privacySetting = "showProxyCredentials";
  const hideSecurityNotice = checkbox(
    featuresLocale.hideTheVaultProtectionReminder,
    data.settings.hideSecurityNotice === true,
  );
  hideSecurityNotice.input.dataset.privacySetting = "hideSecurityNotice";
  const tray = el("section", "card tray-settings");
  const trayEnabled = checkbox(
    featuresLocale.showIconInTheSystemTray,
    data.settings.trayEnabled !== false,
  );
  const trayMinimize = checkbox(
    featuresLocale.minimizeToTray,
    data.settings.trayMinimizeToTray === true,
  );
  const trayClose = checkbox(
    featuresLocale.closeWindowToTray,
    data.settings.trayCloseToTray === true,
  );
  const trayIds = new Set(
    (data.settings.trayAccountIds || [])
      .filter((id) => data.accounts.some((account) => account.id === id))
      .slice(0, 10),
  );
  const traySearch = field(
    tray,
    featuresLocale.trayAccountsUpTo10,
    input("search", ""),
  );
  traySearch.placeholder = t(featuresLocale.searchAccountsForTheTray);
  const trayCount = el("p", "muted"),
    traySelected = el("div", "tray-account-list"),
    trayResults = el("div", "tray-account-list");
  const updateTrayPicker = () => {
    trayCount.textContent = `${trayIds.size} / 10`;
    traySelected.replaceChildren();
    trayResults.replaceChildren();
    const addRow = (account, target) => {
      const control = checkbox(
        account.name || account.id,
        trayIds.has(account.id),
      );
      control.node.title = account.name || account.id;
      control.input.disabled =
        !trayEnabled.input.checked ||
        (!trayIds.has(account.id) && trayIds.size >= 10);
      control.input.onchange = () => {
        control.input.checked
          ? trayIds.add(account.id)
          : trayIds.delete(account.id);
        updateTrayPicker();
      };
      target.append(control.node);
    };
    for (const account of data.accounts)
      if (trayIds.has(account.id)) addRow(account, traySelected);
    const query = traySearch.value.trim().toLocaleLowerCase();
    if (query)
      for (const account of data.accounts
        .filter(
          (account) =>
            !trayIds.has(account.id) &&
            `${account.name} ${account.steamId || ""}`
              .toLocaleLowerCase()
              .includes(query),
        )
        .slice(0, 20))
        addRow(account, trayResults);
    traySearch.disabled = !trayEnabled.input.checked;
    trayMinimize.input.disabled = !trayEnabled.input.checked;
    trayClose.input.disabled = !trayEnabled.input.checked;
  };
  traySearch.oninput = updateTrayPicker;
  trayEnabled.input.onchange = updateTrayPicker;
  tray.prepend(trayEnabled.node, trayMinimize.node, trayClose.node);
  tray.prepend(el("h2", "", featuresLocale.systemTray));
  append(
    tray,
    trayCount,
    traySelected,
    trayResults,
    el(
      "p",
      "muted",
      featuresLocale.searchShowsUpTo20MatchesTrayActionsOpenAReviewBeforeConfirmation,
    ),
  );
  updateTrayPicker();
  behavior.append(showProxyCredentials.node);
  const performance = el("section", "card");
  performance.append(el("h2", "", featuresLocale.bulkOperations));
  const performanceFields = [
    ["bulkConcurrency", featuresLocale.concurrentAccountTasks, 8, 1, 16],
    ["proxyCheckConcurrency", featuresLocale.concurrentProxyChecks, 8, 1, 16],
    [
      "browserLaunchConcurrency",
      featuresLocale.concurrentBrowserLaunches,
      2,
      1,
      3,
    ],
    [
      "taskStartDelayMs",
      featuresLocale.delayBetweenTaskStartsMs,
      100,
      50,
      2000,
    ],
    [
      "browserLaunchDelayMs",
      featuresLocale.delayBetweenBrowserStartsMs,
      750,
      250,
      5000,
    ],
  ].map(([key, label, recommended, min, max]) => {
    const control = field(
      performance,
      label,
      input("number", data.settings[key] ?? recommended),
    );
    Object.assign(control, { min, max, step: 1 });
    control.dataset.setting = key;
    return { key, control, recommended };
  });
  performance.append(
    el(
      "p",
      "",
      featuresLocale.thisIsOurConservativeStartingProfileNotGuaranteedValveLimitsChangesApplyToNew,
    ),
    el(
      "p",
      "",
      featuresLocale.networkProtectionUpTo12ConcurrentHTTPRequestsOneRequestPerRouteAndServer,
    ),
    btn(featuresLocale.restoreRecommendedValues, () => {
      for (const { control, recommended } of performanceFields)
        control.value = recommended;
    }),
  );
  const locking = el("section", "card");
  locking.append(el("h2", "", featuresLocale.locking));
  const pinTimeout = field(
    locking,
    featuresLocale.pinLockAfterInactivityMinutes,
    input("number", data.settings.pinLockMinutes ?? 2),
  );
  pinTimeout.min = 0;
  pinTimeout.max = 1440;
  const passwordTimeout = field(
    locking,
    featuresLocale.passwordLockAfterInactivityMinutes,
    input(
      "number",
      data.settings.passwordLockMinutes ?? data.settings.autoLockMinutes ?? 10,
    ),
  );
  passwordTimeout.min = 0;
  passwordTimeout.max = 1440;
  append(
    locking,
    el(
      "p",
      "",
      featuresLocale.text0DisablesTheCorrespondingTimerBothTimersStartFromTheLastUserActivityThe,
    ),
    el(
      "p",
      "",
      featuresLocale.pinHidesAccountsAndStopsOperationsButRetainsTheKeyInMemoryPasswordLock,
    ),
    el(
      "p",
      "",
      featuresLocale.aSuccessfulPINUnlockRestartsBothTimersAnIncorrectPINDoesNotExtendThe,
    ),
  );
  behavior.append(
    el(
      "p",
      "",
      featuresLocale.setTheCheckIntervalInAccountSettingsOrForSelectedAccounts,
    ),
  );
  const notifications = el("section", "card");
  const browser = el("section", "card");
  browser.append(el("h2", "", featuresLocale.chromiumBrowser));
  const separateSession = checkbox(
    featuresLocale.separateBrowserWebSession,
    data.settings.browserSeparateSession !== false,
  );
  browser.append(
    separateSession.node,
    el(
      "p",
      "help",
      featuresLocale.steamWebInTheBrowserUsesChromeOnWindowsAndIsSavedSeparatelyFrom,
    ),
  );
  const browserLimit = field(
    browser,
    featuresLocale.maximumOpenAccounts,
    input("number", data.settings.browserMaxAccounts ?? 10),
  );
  browserLimit.min = 1;
  browserLimit.max = 100;
  const browserAppearance = el("div", "browser-settings-group");
  browserAppearance.append(
    el("h3", "", featuresLocale.browserAppearanceAndLanguage),
  );
  const browserTheme = field(
    browserAppearance,
    featuresLocale.browserTheme,
    select(
      [
        ["system", featuresLocale.systemDefault],
        ["light", featuresLocale.light],
        ["dark", featuresLocale.dark],
      ],
      data.settings.browserTheme ?? "system",
    ),
  );
  const browserLanguage = field(
    browserAppearance,
    featuresLocale.browserLanguage,
    select(
      [
        ["system", featuresLocale.systemDefault],
        ["en-US", featuresLocale.browserLanguageNames["en-US"]],
        ["uk", featuresLocale.browserLanguageNames["uk"]],
        ["ru", featuresLocale.browserLanguageNames["ru"]],
        ["de", featuresLocale.browserLanguageNames["de"]],
        ["fr", featuresLocale.browserLanguageNames["fr"]],
        ["es", featuresLocale.browserLanguageNames["es"]],
        ["pl", featuresLocale.browserLanguageNames["pl"]],
        ["pt-BR", featuresLocale.browserLanguageNames["pt-BR"]],
        ["tr", featuresLocale.browserLanguageNames["tr"]],
        ["zh-CN", featuresLocale.browserLanguageNames["zh-CN"]],
        ["ja", featuresLocale.browserLanguageNames["ja"]],
      ],
      data.settings.browserLanguage ?? "system",
    ),
  );
  const bookmarksGroup = el("div", "browser-settings-group");
  bookmarksGroup.append(el("h3", "", featuresLocale.browserBookmarks));
  const showBookmarks = checkbox(
    featuresLocale.showBookmarksBar,
    data.settings.browserShowBookmarksBar !== false,
  );
  bookmarksGroup.append(showBookmarks.node);
  const bookmarkList = el("div", "browser-bookmark-list");
  const bookmarkRows = [];
  const addBookmark = (bookmark = { title: "", url: "" }) => {
    const node = el("div", "browser-bookmark-row");
    const titleGroup = el("div"),
      urlGroup = el("div");
    const title = field(
      titleGroup,
      featuresLocale.bookmarkTitle,
      input("text", bookmark.title),
    );
    title.maxLength = 120;
    const url = field(
      urlGroup,
      featuresLocale.bookmarkURL,
      input("url", bookmark.url),
    );
    url.maxLength = 2048;
    url.placeholder = "https://example.com/";
    const row = { node, title, url };
    const remove = btn(featuresLocale.removeBookmark, () => {
      bookmarkRows.splice(bookmarkRows.indexOf(row), 1);
      node.remove();
      addBookmarkButton.disabled = bookmarkRows.length >= 100;
    });
    append(node, titleGroup, urlGroup, remove);
    bookmarkRows.push(row);
    bookmarkList.append(node);
  };
  const addBookmarkButton = btn(featuresLocale.addBookmark, () => {
    if (bookmarkRows.length < 100) addBookmark();
  });
  const addBookmarkClick = addBookmarkButton.onclick;
  addBookmarkButton.onclick = async () => {
    await addBookmarkClick();
    addBookmarkButton.disabled = bookmarkRows.length >= 100;
  };
  for (const bookmark of data.settings.browserBookmarks ?? [
    { title: "2ip.io", url: "https://2ip.io/" },
  ])
    addBookmark(bookmark);
  addBookmarkButton.disabled = bookmarkRows.length >= 100;
  append(
    bookmarksGroup,
    bookmarkList,
    addBookmarkButton,
    el(
      "p",
      "",
      featuresLocale.upTo100BookmarksTitlesCanContainUpTo120CharactersURLsMustUse,
    ),
    el(
      "p",
      "",
      featuresLocale.theSavedListIsAddedToEachNewProfileBookmarkChangesMadeInChromium,
    ),
  );
  append(
    browser,
    browserAppearance,
    bookmarksGroup,
    el(
      "p",
      "",
      featuresLocale.changingBrowserSettingsClosesOpenWindowsNewSettingsApplyTheNextTimeYouOpen,
    ),
    el("h3", "", featuresLocale.browserExtensions),
    el(
      "p",
      "",
      featuresLocale.allEnabledExtensionsArePinnedToTheBrowserToolbar,
    ),
  );
  const smartTraderId = "cikfmbllbfiplfpllhbomapngmcedglo";
  const isSmartTrader = (value) =>
    value.trim() === smartTraderId ||
    /^https:\/\/chromewebstore\.google\.com\/detail\/(?:[^/]+\/)?cikfmbllbfiplfpllhbomapngmcedglo\/?(?:[?#].*)?$/i.test(
      value.trim(),
    );
  const storedExtensions = data.settings.browserExtensions;
  const smartTrader = checkbox(
    featuresLocale.enableSmartTrader,
    data.settings.browserSmartTraderEnabled ??
      (storedExtensions == null || storedExtensions.some(isSmartTrader)),
  );
  const pinned = el("div", "browser-smart-trader");
  const pinnedHeader = el("div", "browser-smart-trader-header");
  pinnedHeader.append(smartTrader.node);
  const autoCheck = checkbox(
    featuresLocale.automaticallyAcceptSmartTraderSInitialAgreement,
    data.settings.browserSmartTraderAutoCheck === true,
  );
  autoCheck.node.classList.add("browser-smart-trader-option");
  const syncSmartTrader = () => {
    autoCheck.input.disabled = !smartTrader.input.checked;
  };
  smartTrader.input.onchange = syncSmartTrader;
  syncSmartTrader();
  append(
    pinned,
    pinnedHeader,
    autoCheck.node,
    el(
      "p",
      "",
      featuresLocale.onFirstRunChecksAllLicenseThirdPartyServiceAndAutomationCheckboxesAndClicks,
    ),
    el(
      "p",
      "",
      featuresLocale.alsoAutomaticallyClicksAllowInSmartTraderSPermissionDialogTheAgreementPermissionsAnd,
    ),
  );
  const storeReference = field(
    pinned,
    "Chrome Web Store",
    input(
      "text",
      `https://chromewebstore.google.com/detail/smart-trader-trading-tool/${smartTraderId}`,
    ),
  );
  storeReference.readOnly = true;
  storeReference.className = "browser-smart-trader-store";
  storeReference.onclick = () => storeReference.select();
  browser.append(pinned);
  const extensions = field(
    browser,
    featuresLocale.additionalChromeWebStoreExtensionsOneLinkPerLine,
    el("textarea"),
  );
  extensions.rows = 5;
  extensions.spellcheck = false;
  extensions.value = (storedExtensions ?? [])
    .filter((value) => !isSmartTrader(value))
    .join("\n");
  browser.append(
    el(
      "p",
      "",
      featuresLocale.eachAccountHasItsOwnWindowAndProfileAnAssignedProxyIsRequiredThere,
    ),
    el(
      "p",
      "",
      featuresLocale.lockingTheAppClosesItsBrowsersChangingExtensionSettingsAlsoClosesOpenWindows,
    ),
    el(
      "p",
      "",
      featuresLocale.upTo20ManifestV3ExtensionsInTotalIncludingSmartTraderWhenEnabledExtensions,
    ),
  );
  browser.append(
    btn(featuresLocale.closeAllBrowsers, async () => {
      const ids = (data.browsers || []).map((b) => b.accountId);
      if (ids.length) await call("closeBrowsers", { ids });
      await refresh();
    }),
  );
  notifications.append(el("h2", "", featuresLocale.notifications));
  const enabled = checkbox(
      featuresLocale.showSystemNotifications,
      data.settings.notificationsEnabled !== false,
    ),
    sound = checkbox(
      featuresLocale.playSound,
      data.settings.soundEnabled === true,
    ),
    errors = checkbox(
      featuresLocale.notifyAboutErrors,
      data.settings.notifyErrors !== false,
    );
  append(notifications, enabled.node, sound.node, errors.node);
  const volume = field(
    notifications,
    featuresLocale.volume,
    input("range", data.settings.soundVolume ?? 50),
  );
  volume.min = 0;
  volume.max = 100;
  const level = el("output", "", `${volume.value}%`);
  volume.oninput = () => (level.textContent = `${volume.value}%`);
  notifications.append(level);
  const values = () => ({
    ...Object.fromEntries(
      performanceFields.map(({ key, control }) => [key, Number(control.value)]),
    ),
    pinLockMinutes: Number(pinTimeout.value),
    passwordLockMinutes: Number(passwordTimeout.value),
    accountsPerPage: Number(perPage.value),
    theme: theme.value,
    language: language.value,
    allowDirect: direct.input.checked,
    showProxyCredentials: showProxyCredentials.input.checked,
    hideSecurityNotice: hideSecurityNotice.input.checked,
    trayEnabled: trayEnabled.input.checked,
    trayMinimizeToTray: trayMinimize.input.checked,
    trayCloseToTray: trayClose.input.checked,
    trayAccountIds: [...trayIds],
    notificationsEnabled: enabled.input.checked,
    soundEnabled: sound.input.checked,
    soundVolume: Number(volume.value),
    notifyErrors: errors.input.checked,
    browserMaxAccounts: Number(browserLimit.value),
    browserSeparateSession: separateSession.input.checked,
    browserTheme: browserTheme.value,
    browserLanguage: browserLanguage.value,
    browserShowBookmarksBar: showBookmarks.input.checked,
    browserBookmarks: bookmarkRows.map(({ title, url }) => ({
      title: title.value.trim(),
      url: url.value.trim(),
    })),
    browserSmartTraderEnabled: smartTrader.input.checked,
    browserSmartTraderAutoCheck: autoCheck.input.checked,
    browserExtensions: extensions.value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((value) => value && !isSmartTrader(value)),
  });
  const save = async () => {
    if (!showProxyCredentials.input.checked) proxyDetailsCache.clear();
    await call("settings", values());
    window.SmartI18n.acknowledge(values());
    window.SmartI18n.apply(values());
    await refresh();
  };
  notifications.append(
    btn(featuresLocale.testNotification, async () => {
      await save();
      await call("testNotification");
      toast(featuresLocale.testNotificationSent);
    }),
  );
  append(
    layout,
    appearance,
    behavior,
    tray,
    performance,
    locking,
    append(securitySettingsCard(true), hideSecurityNotice.node),
    notifications,
    browser,
    steamAdminsSettingsCard(),
    banApiSettingsCard(),
  );
  // Keep each label and its control together as cards reflow.
  layout.querySelectorAll("label[for]").forEach((caption) => {
    const control = caption.nextElementSibling;
    if (!control || control.id !== caption.htmlFor) return;
    const wrapper = el("div", "settings-field");
    caption.before(wrapper);
    wrapper.append(caption, control);
  });
  main.append(layout);
  append(
    main,
    el("div", "spacer"),
    btn(
      featuresLocale.saveSettings,
      async () => {
        await save();
        toast(featuresLocale.settingsSaved);
      },
      "primary",
    ),
  );
}
function activityPage(main) {
  header(
    main,
    featuresLocale.recentActivity_189c85b,
    featuresLocale.theVaultS20MostRecentEventsNewestFirst,
  );
  const log = el("section", "card activity-card");
  log.setAttribute("aria-label", t(featuresLocale.recentActivity_189c85b));
  const events = (data.audit || []).slice(-20).reverse();
  if (!events.length) log.append(el("p", "", featuresLocale.noEventsYet));
  events.forEach((event) =>
    log.append(
      append(
        el("div", "table-row"),
        el(
          "span",
          "",
          event.message || event.action || event.type || featuresLocale.event,
        ),
        el("small", "", event.time || event.timestamp || ""),
      ),
    ),
  );
  main.append(log);
}

function pagedRows(parent, items, createRow) {
  const filter = input("search", "", featuresLocale.search),
    body = el("div"),
    controls = el("div", "pagination");
  let page = 0;
  const draw = () => {
    const list = items.filter((x) =>
      (x.name + " " + (x.endpoint || ""))
        .toLowerCase()
        .includes(filter.value.toLowerCase()),
    );
    page = Math.min(page, Math.max(0, Math.ceil(list.length / 50) - 1));
    body.replaceChildren();
    list
      .slice(page * 50, (page + 1) * 50)
      .forEach((x) => body.append(createRow(x)));
    if (!list.length) body.append(el("p", "", featuresLocale.noResults));
    controls.replaceChildren();
    const prev = btn("←", () => {
        page--;
        draw();
      }),
      next = btn("→", () => {
        page++;
        draw();
      });
    prev.disabled = page === 0;
    next.disabled = page >= Math.ceil(list.length / 50) - 1;
    append(
      controls,
      prev,
      el(
        "small",
        "",
        `${page + 1} / ${Math.max(1, Math.ceil(list.length / 50))} · ${list.length}`,
      ),
      next,
    );
  };
  filter.oninput = () => {
    page = 0;
    draw();
  };
  append(parent, filter, body, controls);
  draw();
}
function displayProxyAddress(value) {
  const address = String(value ?? "");
  if (data.settings.showProxyCredentials === true) return address;
  return address
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s]*@/gi, "$1••••@")
    .replace(/(^|[\s(])[^\s/@:]+(?::[^\s/@]*)?@/g, "$1••••@")
    .replace(
      /((?:\[[a-f0-9:]+\]|[a-z0-9_.-]+):\d{1,5}):[^\s:]+:[^\s]+/gi,
      "$1:••••",
    );
}
function proxyPage(main) {
  if (data.settings.showProxyCredentials !== true) proxyDetailsCache.clear();
  header(
    main,
    featuresLocale.proxies_f1fa83d,
    featuresLocale.separateAccountAndFolderRoutesBackupsFollowTheSelectedOrder,
    append(
      el("div", "actions"),
      btn(featuresLocale.importProxies, () => proxyImportDialog()),
      btn(featuresLocale.addProxy, () => editProxy(), "primary"),
    ),
  );
  main.append(
    el(
      "p",
      "",
      data.settings.allowDirect
        ? featuresLocale.directConnectionIsAllowedForAccountsWithoutARoute
        : featuresLocale.withoutAssignedProxiesNetworkOperationsAreBlockedDirectModeIsDisabledByDefault,
    ),
  );
  const lists = el("section", "card");
  append(
    lists,
    append(
      el("div", "heading"),
      el("h2", "", featuresLocale.proxyLists),
      btn(featuresLocale.newList_e9b6916, () => editProxyList()),
    ),
  );
  pagedRows(lists, data.proxyLists || [], (list) =>
    append(
      el("div", "table-row"),
      append(
        el("div"),
        el("strong", "", displayProxyAddress(list.name)),
        el(
          "p",
          "",
          `${featuresLocale.templateText_074ef29}${list.proxyIds.length}`,
        ),
      ),
      append(
        el("div", "actions"),
        btn(featuresLocale.edit, () => editProxyList(list)),
        btn(
          featuresLocale.remove,
          () =>
            confirmDelete(featuresLocale.deleteList, () =>
              mutate("deleteProxyList", { id: list.id }),
            ),
          "danger",
        ),
      ),
    ),
  );
  main.append(lists);
  const proxies = el("section", "card activity-card");
  proxies.append(el("h2", "", featuresLocale.individualProxies));
  pagedRows(proxies, data.proxies, (p) => {
    const row = append(
      el("div", "table-row"),
      append(
        el("div"),
        el("strong", "", displayProxyAddress(p.name)),
        el(
          "p",
          "proxy-full-url",
          displayProxyAddress(proxyDetailsCache.get(p.id) || p.endpoint),
        ),
      ),
      append(
        el("div", "actions"),
        btn(featuresLocale.edit, () => editProxy(p)),
        btn(
          featuresLocale.remove,
          () =>
            confirmDelete(featuresLocale.deleteProxy, () =>
              mutate("deleteProxy", { id: p.id }),
            ),
          "danger",
        ),
      ),
    );
    row.querySelector(".proxy-full-url").dataset.proxyDetail = p.id;
    return row;
  });
  main.append(proxies);
  if (data.settings.showProxyCredentials !== true) return;
  const generation = lockGeneration;
  call("proxyDetails")
    .then((details) => {
      if (
        locked ||
        generation !== lockGeneration ||
        view !== "proxies" ||
        data.settings.showProxyCredentials !== true ||
        !main.isConnected
      )
        return;
      proxyDetailsCache.clear();
      for (const detail of details || [])
        if (typeof detail.id === "string" && typeof detail.url === "string")
          proxyDetailsCache.set(detail.id, detail.url);
      proxies.querySelectorAll("[data-proxy-detail]").forEach((node) => {
        node.textContent =
          proxyDetailsCache.get(node.dataset.proxyDetail) || node.textContent;
      });
    })
    .catch((error) => {
      if (!locked && main.isConnected) toast(error.message);
    });
}
function showProxyImportErrors(errors) {
  dialog(featuresLocale.importErrors, (f) => {
    f.append(
      el("p", "", featuresLocale.importCancelledCorrectTheErrorsAndTryAgain),
    );
    errors.forEach((e) =>
      append(
        f,
        append(
          el("div", "error"),
          el("strong", "", e.source || t(featuresLocale.pastedText)),
          el(
            "p",
            "",
            t(e.reason || e.message || featuresLocale.invalidProxyURL),
          ),
        ),
      ),
    );
    append(
      f,
      el("div", "spacer"),
      btn(featuresLocale.back, () => proxyImportDialog()),
    );
  });
}

let audioContext;
function notificationSound(event) {
  if (locked || !data.settings.soundEnabled || data.settings.soundVolume <= 0)
    return;
  if (event.kind === "error" && !data.settings.notifyErrors) return;
  try {
    audioContext ||= new AudioContext();
    audioContext
      .resume()
      .then(() => {
        const oscillator = audioContext.createOscillator(),
          gain = audioContext.createGain(),
          now = audioContext.currentTime;
        oscillator.type = "sine";
        oscillator.frequency.value = event.kind === "error" ? 330 : 740;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(
          Math.min(1, Math.max(0, (data.settings.soundVolume ?? 50) / 100)) *
            0.18,
          now + 0.025,
        );
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.32);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      })
      .catch(() => {});
  } catch {}
}
window.smartSda.onNotification?.((event) => {
  if (locked) return;
  if (event.kind === "error" && !data.settings.notifyErrors) return;
  toast(notificationToastText(event));
  notificationSound(event);
});

function accountPagination(total) {
  const box = el("div", "pagination"),
    pages = Math.max(1, Math.ceil(total / accountPageSize())),
    previous = btn("←", () => {
      accountPage--;
      render();
    }),
    next = btn("→", () => {
      accountPage++;
      render();
    });
  previous.disabled = accountPage === 0;
  next.disabled = accountPage >= pages - 1;
  append(
    box,
    previous,
    el("small", "", `${accountPage + 1} / ${pages} · ${total}`),
    next,
  );
  return box;
}

function primeAudio() {
  if (locked || !data.settings.soundEnabled) return;
  try {
    audioContext ||= new AudioContext();
    audioContext.resume().catch(() => {});
  } catch {}
}
document.addEventListener("pointerdown", primeAudio, { passive: true });

document.getElementById("modal").addEventListener("close", discardImport);

function securitySettingsCard(includePassword = true) {
  const card = el("section", "card settings-security");
  card.append(el("h2", "", featuresLocale.accessSecurity));
  if (includePassword) {
    append(
      card,
      el(
        "p",
        "",
        data.security.passwordEnabled
          ? featuresLocale.passwordEnabled
          : featuresLocale.passwordDisabled,
      ),
      append(
        el("div", "actions"),
        btn(
          data.security.passwordEnabled
            ? featuresLocale.changePassword
            : featuresLocale.enablePassword,
          () => passwordDialog(),
        ),
        data.security.passwordEnabled
          ? btn(
              featuresLocale.disablePassword,
              () => passwordDialog(true),
              "danger",
            )
          : null,
      ),
      el("div", "spacer"),
    );
  }
  if (includePassword)
    append(
      card,
      el("h3", "", "Google Authenticator"),
      el(
        "span",
        "badge",
        data.security.totpEnabled
          ? featuresLocale.enabled
          : featuresLocale.notConfigured,
      ),
      btn(
        data.security.totpEnabled
          ? featuresLocale.disableTOTP
          : featuresLocale.setUpTOTP,
        () => (data.security.totpEnabled ? disableTotp() : enrollTotp()),
      ),
    );
  append(
    card,
    el("h3", "", featuresLocale.quickPIN),
    el(
      "span",
      "badge",
      data.security.pinEnabled
        ? featuresLocale.enabled
        : featuresLocale.notConfigured,
    ),
    el(
      "p",
      "",
      featuresLocale.a612DigitPINQuicklyRestoresTheCurrentSessionItDoesNotReplace,
    ),
    append(
      el("div", "actions"),
      btn(
        data.security.pinEnabled
          ? featuresLocale.changePIN
          : featuresLocale.setUpPIN,
        () => pinSettingsDialog(),
      ),
      data.security.pinEnabled
        ? btn(
            featuresLocale.disablePIN,
            () => pinSettingsDialog(true),
            "danger",
          )
        : null,
    ),
  );
  append(
    card,
    el("h3", "", featuresLocale.vaultEncryption),
    el(
      "p",
      "",
      data.security.passwordEnabled
        ? data.security.vaultVersion === 2 && data.security.kdf?.N === 262144
          ? featuresLocale.passwordProtectionScrypt256MiBAndAES256GCM
          : featuresLocale.passwordProtectedVaultsAutomaticallyUpgradeToScrypt256MiBAndAES256GCMAfter
        : featuresLocale.passwordProtectionIsOffFileProtectionReliesOnWindowsAccessControls,
    ),
    el(
      "p",
      "",
      featuresLocale.localTOTPVerifiesAccessToTheAppButIsNotAnIndependentFactorFor,
    ),
  );
  if (data.security.passwordNeedsUpgrade)
    card.append(
      el(
        "p",
        "warn",
        featuresLocale.yourCurrentPasswordIsShorterThan15CharactersChangeItToALongerUnique,
      ),
    );
  return card;
}
function pinSettingsDialog(disable = false) {
  dialog(
    disable
      ? featuresLocale.disablePIN_2be7521
      : data.security.pinEnabled
        ? featuresLocale.changePIN_96db4dc
        : featuresLocale.pinSetup,
    (f) => {
      f.append(
        el(
          "p",
          "",
          featuresLocale.changingPINRequiresTheCurrentPasswordAndAuthenticatorCodeWhenTheseProtectionsAreEnabled,
        ),
      );
      const password = data.security.passwordEnabled
          ? field(f, featuresLocale.currentPassword, input("password"))
          : null,
        code = data.security.totpEnabled
          ? field(f, featuresLocale.authenticatorCode, input())
          : null,
        pin = disable
          ? null
          : field(f, featuresLocale.newPIN, input("password")),
        repeat = disable
          ? null
          : field(f, featuresLocale.confirmPIN, input("password"));
      if (password) password.autocomplete = "current-password";
      for (const n of [pin, repeat])
        if (n) {
          n.inputMode = "numeric";
          n.pattern = "[0-9]{6,12}";
          n.minLength = 6;
          n.maxLength = 12;
          n.autocomplete = "off";
        }
      const error = el("p", "error");
      f.append(error);
      let feedback;
      const submit = footer(f, async () => {
        if (!feedback.begin()) return;
        error.textContent = "";
        try {
          if (pin && !/^\d{6,12}$/.test(pin.value))
            throw Error(featuresLocale.pinMustContain612Digits);
          if (pin && pin.value !== repeat.value)
            throw Error(featuresLocale.pinsDoNotMatch);
          await mutate(
            disable ? "disablePin" : "enablePin",
            {
              currentPassword: password?.value || "",
              code: code?.value || "",
              ...(pin ? { pin: pin.value } : {}),
            },
            disable ? featuresLocale.pinDisabled : featuresLocale.pinSaved,
          );
        } catch (e) {
          error.textContent = t(e.message);
          await feedback.refresh();
        } finally {
          feedback.finish();
          for (const n of [password, code, pin, repeat]) if (n) n.value = "";
        }
      });
      feedback = authFeedback(f, submit, data.security);
    },
  );
}
function pinAuth(status) {
  root.replaceChildren();
  const frame = el("main", "auth"),
    card = el("section", "auth-card");
  frame.dataset.pinLock = "true";
  append(
    card,
    append(
      el("div", "brand"),
      el("span", "", "◈ "),
      el("span", "", "smart-auth"),
    ),
    el("div", "eyebrow", featuresLocale.quickLOCK),
    el("h1", "", featuresLocale.enterPIN),
    el("p", "", featuresLocale.unlockTheAppToView),
  );
  const form = el("form"),
    pin = field(form, "PIN", input("password"));
  pin.inputMode = "numeric";
  pin.autocomplete = "off";
  pin.minLength = 6;
  pin.maxLength = 12;
  pin.pattern = "[0-9]{6,12}";
  const error = el("p", "error");
  let feedback;
  const submit = btn(
    featuresLocale.unlock,
    async () => {
      if (!feedback.begin()) return;
      error.textContent = "";
      const generation = ++lockGeneration;
      try {
        if (!/^\d{6,12}$/.test(pin.value))
          throw Error(featuresLocale.pinMustContain612Digits);
        await call("unlockPin", { pin: pin.value });
        if (generation !== lockGeneration) return;
        locked = false;
        await refresh();
      } catch (e) {
        error.textContent = t(e.message);
        await feedback.refresh();
      } finally {
        feedback.finish();
        pin.value = "";
      }
    },
    "primary",
  );
  submit.type = "submit";
  form.onsubmit = (e) => e.preventDefault();
  append(
    form,
    submit,
    error,
    btn(featuresLocale.unlockWithPassword, async () => {
      await call("lock");
      enterLocked(await call("status"));
    }),
  );
  append(
    card,
    form,
    el(
      "p",
      "secure-note",
      featuresLocale.thePasswordTimerContinuesDuringPINLockWhenEnabled,
    ),
    appearanceControls(() => {
      if (!feedback.isBusy) {
        feedback.dispose();
        auth(feedback.status);
      }
    }, status.authPending === true),
  );
  frame.append(card);
  root.append(frame);
  feedback = authFeedback(form, submit, status);
  pin.focus();
}

function savedPasswordActions(account) {
  return append(
    el("div", "actions"),
    account.hasPassword
      ? btn(featuresLocale.viewPassword, () => showSavedPassword(account))
      : null,
    account.hasPassword
      ? btn(featuresLocale.copyPassword, async () => {
          const generation = lockGeneration;
          await call("copyAccountPassword", { id: account.id });
          if (!locked && generation === lockGeneration)
            toast(featuresLocale.passwordCopied);
        })
      : null,
    btn(
      account.hasPassword
        ? featuresLocale.editSavedPassword
        : featuresLocale.addSavedPassword,
      () => editSavedPassword(account),
    ),
  );
}
function editSavedPassword(account) {
  if (locked || selected !== account.id) return;
  dialog(
    account.hasPassword
      ? featuresLocale.editSavedPassword
      : featuresLocale.addSavedPassword,
    (form) => {
      form.append(
        el(
          "p",
          "",
          featuresLocale.thisChangesOnlyThePasswordInTheLocalVaultItDoesNotChangeYour,
        ),
      );
      const password = field(
          form,
          featuresLocale.newSavedPassword,
          input("password"),
        ),
        repeat = field(
          form,
          featuresLocale.confirmSavedPassword,
          input("password"),
        );
      for (const node of [password, repeat]) {
        node.dataset.sensitive = "account-password";
        node.autocomplete = "new-password";
        node.maxLength = 16384;
      }
      const error = el("p", "error");
      form.append(error);
      sensitiveAccountId = account.id;
      footer(form, async () => {
        error.textContent = "";
        if (!password.value || /[\r\n\0]/.test(password.value)) {
          error.textContent = t(featuresLocale.enterAValidSavedPassword);
          return;
        }
        if (password.value !== repeat.value) {
          error.textContent = t(featuresLocale.passwordsDoNotMatch);
          return;
        }
        try {
          await mutate(
            "updateAccountPassword",
            { id: account.id, password: password.value },
            featuresLocale.savedPasswordUpdated,
          );
        } catch (e) {
          error.textContent = t(e.message);
        } finally {
          password.value = "";
          repeat.value = "";
        }
      });
    },
  );
}
async function showSavedPassword(account) {
  if (locked || selected !== account.id) return;
  const generation = lockGeneration;
  let fieldNode, form, toggle;
  dialog(featuresLocale.savedSteamPassword, (f) => {
    form = f;
    f.append(
      el(
        "p",
        "",
        featuresLocale.thePasswordIsAvailableOnlyInThisDialogCloseItToRemoveThePassword,
      ),
    );
    fieldNode = field(f, featuresLocale.steamPassword, input("password"));
    fieldNode.readOnly = true;
    fieldNode.autocomplete = "off";
    fieldNode.dataset.sensitive = "account-password";
    toggle = btn(featuresLocale.show, () => {
      fieldNode.type = fieldNode.type === "password" ? "text" : "password";
      toggle.textContent = t(
        fieldNode.type === "password"
          ? featuresLocale.show
          : featuresLocale.hide,
      );
    });
    toggle.disabled = true;
    append(
      f,
      append(
        el("div", "modal-footer"),
        toggle,
        btn(featuresLocale.done, () => modal.close(), "primary"),
      ),
    );
    sensitiveAccountId = account.id;
  });
  const dialogGeneration = sensitiveDialogGeneration;
  let result;
  try {
    result = await call("accountPassword", { id: account.id });
    if (
      locked ||
      generation !== lockGeneration ||
      dialogGeneration !== sensitiveDialogGeneration ||
      selected !== account.id ||
      !modal.open ||
      !form?.isConnected
    )
      return;
    if (typeof result?.password !== "string" || !result.password)
      throw Error(featuresLocale.noSteamPasswordSaved);
    fieldNode.value = result.password;
    toggle.disabled = false;
  } catch (error) {
    if (
      !locked &&
      generation === lockGeneration &&
      dialogGeneration === sensitiveDialogGeneration &&
      form?.isConnected
    )
      form.append(el("p", "error", error.message));
  } finally {
    if (result && typeof result === "object") result.password = "";
    result = null;
  }
}

function accountAvatar(account) {
  const node = el("div", "avatar", account.name.slice(0, 2).toUpperCase());
  if (
    typeof account.avatar === "string" &&
    /^data:image\/(?:png|jpeg|webp);base64,/.test(account.avatar)
  ) {
    const image = el("img");
    image.src = account.avatar;
    image.alt = "";
    node.replaceChildren(image);
  }
  return node;
}
function editAccountNote(account) {
  dialog(featuresLocale.note, (form) => {
    const note = field(form, featuresLocale.note, el("textarea"));
    note.value = account.note || "";
    note.maxLength = 2000;
    footer(form, () =>
      mutate(
        "updateAccount",
        { id: account.id, note: note.value },
        featuresLocale.noteSaved,
      ),
    );
  });
}
function selectedAccountIds() {
  const ids = [...bulkSelected].filter((id) =>
    data.accounts.some((a) => a.id === id),
  );
  if (!ids.length) throw Error(t(featuresLocale.selectAtLeastOneAccount));
  return ids;
}
function bulkPolicyDialog() {
  const ids = selectedAccountIds();
  dialog(featuresLocale.automaticConfirmations, (form) => {
    form.append(
      el(
        "p",
        "",
        t(featuresLocale.selectedAccounts).replace("{count}", ids.length),
      ),
    );
    const values = confirmationPolicyFields(form, null);
    footer(form, async () => {
      const generation = lockGeneration,
        dialogGeneration = sensitiveDialogGeneration;
      await atomicBulkProgress(form, ids, () =>
        call("bulkAccountPolicy", { ids, ...values() }),
      );
      if (
        locked ||
        generation !== lockGeneration ||
        dialogGeneration !== sensitiveDialogGeneration ||
        !form.isConnected
      )
        return;
      await refresh();
      if (
        locked ||
        generation !== lockGeneration ||
        dialogGeneration !== sensitiveDialogGeneration ||
        !form.isConnected
      )
        return;
      const controls = form.closest("form").querySelector(".modal-footer");
      if (controls?.isConnected)
        controls.replaceChildren(btn(featuresLocale.done, () => modal.close()));
    });
  });
}
async function bulkConfirmationReview(kind, explicitIds = null) {
  const ids =
      explicitIds === null
        ? selectedAccountIds()
        : [...new Set(explicitIds)]
            .filter((id) => data.accounts.some((account) => account.id === id))
            .slice(0, 10),
    generation = lockGeneration;
  let host,
    ticket = null,
    stopped = false,
    finished = false,
    reviewFailures = [];
  dialog(featuresLocale.reviewConfirmations, (form) => {
    host = form;
    updateBulkProgress(host, ids, { total: ids.length });
  });
  const dialogGeneration = sensitiveDialogGeneration;
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    dialogGeneration === sensitiveDialogGeneration &&
    host.isConnected &&
    modal.open;
  const stop = () => {
    stopped = true;
    if (ticket && !finished)
      void call("cancelBulkConfirmations", { ticket }).catch(() => {});
  };
  afterDialogCloses(stop);
  const controls = el("div", "modal-footer");
  host.closest("form").append(controls);
  const poll = async () => {
    while (active() && !stopped) {
      const status = await call("bulkConfirmationStatus", { ticket });
      if (!active() || stopped) {
        stop();
        return null;
      }
      updateBulkProgress(host, ids, {
        ...status,
        failed: [...reviewFailures, ...(status.failed || [])],
      });
      if (status.state !== "running") return status;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    stop();
    return null;
  };
  const stopButton = () =>
    btn(featuresLocale.stopRemaining, async () => {
      if (ticket) await call("cancelBulkConfirmations", { ticket });
    });
  const showCancelled = () => {
    finished = true;
    host.append(el("p", "", featuresLocale.queueStopped));
    controls.replaceChildren(btn(featuresLocale.done, () => modal.close()));
  };
  try {
    ticket = (await call("startBulkConfirmationPrepare", { ids, kind })).ticket;
    if (!active()) {
      stop();
      return;
    }
    controls.replaceChildren(stopButton());
    const status = await poll();
    if (!status) return;
    if (status.state === "cancelled") {
      showCancelled();
      return;
    }
    const plan = status.review;
    if (!plan)
      throw Error(t(featuresLocale.actionFailedCheckTheInputProxiesAndSession));
    reviewFailures = plan.failed || [];
    const review = el("section", "bulk-confirmation-review");
    review.append(
      el(
        "p",
        "",
        t(featuresLocale.confirmationsToApprove).replace("{count}", plan.count),
      ),
      el(
        "p",
        "",
        kind === "market"
          ? featuresLocale.market
          : kind === "purchase"
            ? featuresLocale.marketPurchases
            : kind === "trade"
              ? featuresLocale.trades
              : featuresLocale.confirming,
      ),
    );
    for (const account of plan.accounts || []) {
      const accountReview = el("section", "confirmation-account-review");
      accountReview.append(el("h3", "", account.name + ": " + account.count));
      for (const confirmation of account.confirmations || []) {
        const request = el("article", "confirmation-bulk-request");
        request.append(
          el(
            "strong",
            "",
            confirmation.headline ||
              confirmation.typeName ||
              featuresLocale.steamRequest,
          ),
          el(
            "p",
            "muted",
            Array.isArray(confirmation.summary)
              ? confirmation.summary.join(" · ")
              : "",
          ),
          createConfirmationDetails(
            account,
            confirmation,
            () => active() && request.isConnected && !stopped,
          ),
        );
        accountReview.append(request);
      }
      review.append(accountReview);
    }
    for (const failure of plan.failed || [])
      review.append(el("p", "error", t(failure.message)));
    host.append(review);
    const approve = btn(
      featuresLocale.approveReviewedConfirmations,
      async () => {
        if (!active() || stopped) return;
        review.remove();
        controls.replaceChildren(stopButton());
        updateBulkProgress(host, ids, {
          total: plan.accounts.length,
          failed: reviewFailures,
        });
        try {
          await call("startBulkConfirmationCommit", { ticket });
          if (!active()) {
            stop();
            return;
          }
          const completed = await poll();
          if (!completed) return;
          if (completed.state === "cancelled") {
            showCancelled();
            return;
          }
          finished = true;
          const result = completed.result;
          host.append(
            el(
              "h2",
              "",
              t(featuresLocale.confirmed).replace("{count}", result.confirmed),
            ),
          );
          host.append(
            el(
              "p",
              "",
              featuresLocale.steamAcknowledgedTheRequestTradeCompletionIsUnverified,
            ),
          );
          controls.replaceChildren(
            btn(featuresLocale.done, () => modal.close()),
          );
        } catch (error) {
          if (active()) {
            host.append(el("p", "error", error.message));
            controls.replaceChildren(
              btn(featuresLocale.done, () => modal.close()),
            );
          }
          stop();
        }
      },
      "primary",
    );
    approve.disabled = !plan.count;
    controls.replaceChildren(
      btn(featuresLocale.cancel, () => modal.close()),
      approve,
    );
  } catch (error) {
    if (active()) {
      host.append(el("p", "error", error.message));
      controls.replaceChildren(btn(featuresLocale.done, () => modal.close()));
    }
    stop();
  }
}

async function openBrowserAction(account, kind, offerId) {
  return openBrowsersDialog([account.id], {
    id: account.id,
    kind,
    ...(offerId ? { offerId: String(offerId) } : {}),
  });
}
// The caller keeps ownership of the modal and its lock generation throughout
// installation, so completing a download never revives an abandoned open request.
async function ensureBrowserRuntime(host, active) {
  let status = await call("browserRuntimeStatus");
  if (!active()) return false;
  if (status.state === "ready") return true;
  return new Promise((resolve) => {
    let finished = false,
      timer,
      checking = false,
      downloading = false;
    const busyStates = ["downloading", "verifying", "extracting"];
    const finish = (ready) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      modal.removeEventListener("close", close);
      if (!ready && downloading)
        call("cancelBrowserRuntimeDownload", {}).catch(() => {});
      resolve(ready);
    };
    const close = () => finish(false);
    modal.addEventListener("close", close, { once: true });
    const render = () => {
      downloading = busyStates.includes(status.state);
      host.replaceChildren(el("h3", "", featuresLocale.browserRuntimeTitle));
      host.append(el("p", "", featuresLocale.browserRuntimeSource));
      const size = status.totalBytes || status.downloadBytes;
      host.append(
        el(
          "p",
          "",
          t(featuresLocale.browserRuntimeDetails)
            .replace(
              "{version}",
              status.version || t(featuresLocale.browserRuntimeUnknown),
            )
            .replace(
              "{size}",
              size
                ? `${(size / 1048576).toFixed(1)} MB`
                : t(featuresLocale.browserRuntimeUnknown),
            ),
        ),
      );
      const controls = el("div", "modal-footer");
      if (downloading) {
        const label =
          status.state === "verifying"
            ? featuresLocale.browserRuntimeVerifying
            : status.state === "extracting"
              ? featuresLocale.browserRuntimeExtracting
              : featuresLocale.browserRuntimeBusy;
        host.append(el("p", "", label));
        const progress = el("progress");
        progress.max = 100;
        if (Number.isFinite(status.percent))
          progress.value = Math.max(0, Math.min(100, status.percent));
        progress.setAttribute("aria-label", t(label));
        host.append(progress);
        if (status.receivedBytes)
          host.append(
            el("p", "", `${(status.receivedBytes / 1048576).toFixed(1)} MB`),
          );
      } else {
        if (["error", "invalid"].includes(status.state))
          host.append(el("p", "error", featuresLocale.browserRuntimeError));
        const terms = el("div", "actions");
        for (const [kind, label] of [
          ["google", featuresLocale.browserRuntimeGoogleTerms],
          ["chrome", featuresLocale.browserRuntimeChromeTerms],
        ])
          terms.append(
            btn(label, () => call("openBrowserRuntimeTerms", { kind })),
          );
        const consent = checkbox(featuresLocale.browserRuntimeConsent, false);
        const download = btn(
          featuresLocale.browserRuntimeDownload,
          async () => {
            if (!active() || !consent.input.checked || checking) return;
            checking = true;
            download.disabled = true;
            try {
              status = await call("startBrowserRuntimeDownload", {
                acceptedTerms: true,
              });
              if (finished || !active()) {
                call("cancelBrowserRuntimeDownload", {}).catch(() => {});
                finish(false);
                return;
              }
              if (status.state === "ready") return finish(true);
              render();
            } catch {
              status = { ...status, state: "error" };
              if (!finished && active()) render();
            } finally {
              checking = false;
            }
          },
          "primary",
        );
        download.disabled = true;
        consent.input.onchange = () => {
          download.disabled = !consent.input.checked;
        };
        host.append(terms, consent.node);
        controls.append(download);
      }
      controls.append(
        btn(featuresLocale.browserRuntimeCancel, () => {
          finish(false);
          modal.close();
        }),
      );
      host.append(controls);
    };
    const poll = async () => {
      if (finished) return;
      if (!active()) return finish(false);
      if (!checking && downloading) {
        checking = true;
        try {
          status = await call("browserRuntimeStatus");
          if (finished || !active()) return finish(false);
          if (status.state === "ready") return finish(true);
          render();
        } catch {
          status = { ...status, state: "error" };
          if (active()) render();
        } finally {
          checking = false;
        }
      }
      timer = setTimeout(poll, 700);
    };
    render();
    timer = setTimeout(poll, 700);
  });
}
async function openBrowsersDialog(ids, action = null) {
  const limit = data.settings.browserMaxAccounts ?? 10;
  if (!ids.length) throw Error(t(featuresLocale.selectAtLeastOneAccount));
  if (ids.length > limit)
    throw Error(t(featuresLocale.browserLimitExceededChangeItInSettings));
  let host,
    controls,
    ticket = null,
    timer,
    stopped = false;
  const generation = lockGeneration;
  dialog(featuresLocale.openInBrowser, (form) => {
    host = form;
    updateBulkProgress(host, ids, { total: ids.length });
    form.append(
      el("p", "", featuresLocale.preparingSessionsProxiesAndExtensions),
    );
    controls = el("div", "modal-footer");
    form.append(controls);
  });
  const dialogGeneration = sensitiveDialogGeneration;
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    dialogGeneration === sensitiveDialogGeneration &&
    host.isConnected &&
    modal.open;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (ticket) call("cancelBrowserOpen", { ticket }).catch(() => {});
  };
  modal.addEventListener("close", stop, { once: true });
  try {
    if (!(await ensureBrowserRuntime(host, active)) || !active()) {
      stop();
      return;
    }
    host.replaceChildren();
    updateBulkProgress(host, ids, { total: ids.length });
    host.append(
      el("p", "", featuresLocale.preparingSessionsProxiesAndExtensions),
    );
    controls.replaceChildren();
    ticket = (
      await call(
        action ? "browserOpenAction" : "startBrowserOpen",
        action || { ids },
      )
    ).ticket;
    if (!active()) {
      stop();
      return;
    }
    const poll = async () => {
      if (stopped || !active()) {
        stop();
        return;
      }
      try {
        const status = await call("browserOpenStatus", { ticket });
        if (!active()) {
          stop();
          return;
        }
        updateBulkProgress(
          host,
          ids,
          status,
          el(
            "p",
            "",
            t(featuresLocale.browsersOpened).replace("{count}", status.opened),
          ),
        );
        if (status.currentIds?.length > 1)
          host.append(
            el(
              "p",
              "",
              t(featuresLocale.runningConcurrently).replace(
                "{count}",
                status.currentIds.length,
              ),
            ),
          );
        for (const failure of status.failed || [])
          host.append(
            el(
              "p",
              "error",
              (data.accounts.find((a) => a.id === failure.id)?.name || "") +
                ": " +
                t(failure.message),
            ),
          );
        if (status.state === "running") {
          controls.replaceChildren(
            btn(featuresLocale.stopRemaining, async () => {
              await call("cancelBrowserOpen", { ticket });
            }),
          );
          timer = setTimeout(poll, 700);
        } else {
          ticket = null;
          host.append(
            el(
              "p",
              "",
              status.state === "cancelled"
                ? featuresLocale.queueStopped
                : featuresLocale.queueComplete,
            ),
          );
          controls.replaceChildren(
            btn(featuresLocale.done, () => modal.close()),
          );
        }
      } catch (error) {
        if (active()) {
          host.append(el("p", "error", t(error.message)));
          controls.replaceChildren(
            btn(featuresLocale.done, () => modal.close()),
          );
        }
        stop();
      }
    };
    await poll();
  } catch (error) {
    if (active()) {
      host.replaceChildren(el("p", "error", t(error.message)));
      controls.replaceChildren(btn(featuresLocale.done, () => modal.close()));
    }
    stop();
  }
}

async function bulkLoginDialog() {
  const ids = selectedAccountIds(),
    generation = lockGeneration;
  let host,
    controls,
    ticket = null,
    stopped = false,
    timer;
  dialog(featuresLocale.bulkSteamLogin, (form) => {
    host = form;
    updateBulkProgress(host, ids, { total: ids.length });
    form.append(el("p", "", featuresLocale.starting));
    controls = el("div", "modal-footer");
    form.append(controls);
  });
  const dialogGeneration = sensitiveDialogGeneration;
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    dialogGeneration === sensitiveDialogGeneration &&
    host.isConnected &&
    modal.open;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (ticket) call("cancelBulkLogin", { ticket }).catch(() => {});
  };
  modal.addEventListener("close", stop, { once: true });
  try {
    const result = await call("startBulkLogin", { ids });
    ticket = result.ticket;
    if (!active()) {
      stop();
      return;
    }
    const poll = async () => {
      if (stopped || !active()) {
        stop();
        return;
      }
      try {
        const status = await call("bulkLoginStatus", { ticket });
        if (!active()) {
          stop();
          return;
        }
        updateBulkProgress(
          host,
          ids,
          status,
          el(
            "p",
            "",
            t(featuresLocale.successfulAwaitingApproval)
              .replace("{complete}", status.complete)
              .replace("{pending}", status.pending),
          ),
        );
        if (status.currentIds?.length > 1)
          host.append(
            el(
              "p",
              "",
              t(featuresLocale.runningConcurrently).replace(
                "{count}",
                status.currentIds.length,
              ),
            ),
          );
        for (const failure of status.failed || [])
          host.append(
            el(
              "p",
              "error",
              (data.accounts.find((a) => a.id === failure.id)?.name ||
                failure.id) +
                ": " +
                t(failure.message),
            ),
          );
        if (status.state === "running") {
          host.append(
            el(
              "p",
              "",
              featuresLocale.stoppingCancelsRemainingQueuedAccountsAttemptsAlreadyStartedMayFinish,
            ),
          );
          controls.replaceChildren(
            btn(featuresLocale.stopRemaining, async () => {
              await call("cancelBulkLogin", { ticket });
            }),
          );
          timer = setTimeout(poll, 1000);
        } else {
          ticket = null;
          host.append(
            el(
              "p",
              "",
              status.state === "cancelled"
                ? featuresLocale.queueStopped
                : featuresLocale.queueComplete,
            ),
          );
          controls.replaceChildren(
            btn(featuresLocale.done, () => modal.close()),
          );
        }
      } catch (error) {
        if (active()) {
          host.append(el("p", "error", t(error.message)));
          stop();
        }
      }
    };
    await poll();
  } catch (error) {
    if (active()) {
      host.replaceChildren(el("p", "error", t(error.message)));
      controls.replaceChildren(btn(featuresLocale.done, () => modal.close()));
    }
    stop();
  }
}

async function bulkBanCheckDialog() {
  const ids = selectedAccountIds(),
    generation = lockGeneration;
  let host,
    controls,
    ticket = null,
    stopped = false,
    timer;
  dialog(featuresLocale.checkBans, (form) => {
    host = form;
    updateBulkProgress(host, ids, { total: ids.length });
    form.append(el("p", "", featuresLocale.starting));
    controls = el("div", "modal-footer");
    form.append(controls);
  });
  const dialogGeneration = sensitiveDialogGeneration;
  const active = () =>
    !locked &&
    generation === lockGeneration &&
    dialogGeneration === sensitiveDialogGeneration &&
    host.isConnected &&
    modal.open;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (ticket) call("cancelBulkBanCheck", { ticket }).catch(() => {});
  };
  modal.addEventListener("close", stop, { once: true });
  try {
    const result = await call("startBulkBanCheck", { ids });
    ticket = result.ticket;
    if (!active()) {
      stop();
      return;
    }
    const poll = async () => {
      if (stopped || !active()) {
        stop();
        return;
      }
      try {
        const status = await call("bulkBanCheckStatus", { ticket });
        if (!active()) {
          stop();
          return;
        }
        updateBulkProgress(
          host,
          ids,
          status,
          el(
            "p",
            "",
            t(featuresLocale.checksCompletedUnknown)
              .replace("{complete}", status.checked ?? status.complete ?? 0)
              .replace("{pending}", status.unknown ?? 0),
          ),
        );
        host.append(controls);
        if (status.currentIds?.length > 1)
          host.append(
            el(
              "p",
              "",
              t(featuresLocale.runningConcurrently).replace(
                "{count}",
                status.currentIds.length,
              ),
            ),
          );
        for (const failure of status.failed || [])
          host.append(
            el(
              "p",
              "error",
              (data.accounts.find((a) => a.id === failure.id)?.name ||
                failure.id) +
                ": " +
                t(failure.message),
            ),
          );
        if (status.state === "running") {
          host.append(
            el(
              "p",
              "",
              featuresLocale.stoppingCancelsRemainingQueuedAccountsAttemptsAlreadyStartedMayFinish,
            ),
          );
          controls.replaceChildren(
            btn(featuresLocale.stopRemaining, async () => {
              await call("cancelBulkBanCheck", { ticket });
            }),
          );
          timer = setTimeout(poll, 1000);
        } else {
          ticket = null;
          await refresh();
          host.append(
            el(
              "p",
              "",
              status.state === "cancelled"
                ? featuresLocale.queueStopped
                : featuresLocale.queueComplete,
            ),
          );
          controls.replaceChildren(
            btn(featuresLocale.done, () => modal.close()),
          );
        }
      } catch (error) {
        if (active()) {
          host.append(el("p", "error", t(error.message)));
          stop();
        }
      }
    };
    await poll();
  } catch (error) {
    if (active()) {
      host.replaceChildren(el("p", "error", t(error.message)));
      controls.replaceChildren(btn(featuresLocale.done, () => modal.close()));
    }
    stop();
  }
}

function exportAccountsDialog(ids) {
  if (!ids.length) return;
  dialog(featuresLocale.exportAccounts, (form) => {
    form.append(
      el(
        "p",
        "",
        t(featuresLocale.selectedAccounts).replace("{count}", ids.length),
      ),
    );
    const format = field(
      form,
      featuresLocale.format,
      select(
        [
          ["smart-sda", "smart-auth JSON"],
          ["mafile", featuresLocale.classicMaFileSDANebula],
        ],
        "smart-sda",
      ),
    );
    const proxies = checkbox(featuresLocale.includeProxies, false),
      encrypted = checkbox(featuresLocale.encryptExport, true);
    form.append(proxies.node, encrypted.node);
    const fields = el("div");
    form.append(fields);
    const key = field(fields, featuresLocale.exportPassword, input("password")),
      repeat = field(
        fields,
        featuresLocale.confirmExportPassword,
        input("password"),
      );
    for (const node of [key, repeat]) {
      node.dataset.sensitive = "export-key";
      node.autocomplete = "new-password";
      node.minLength = 15;
      node.placeholder = t(featuresLocale.atLeast15Characters);
    }
    const warning = el(
      "p",
      "warn",
      featuresLocale.unencryptedExportContainsPasswordsSessionsAnd2FASecretsStoreItSecurely,
    );
    warning.hidden = true;
    form.append(warning);
    encrypted.input.onchange = () => {
      fields.hidden = !encrypted.input.checked;
      warning.hidden = encrypted.input.checked;
      if (!encrypted.input.checked) {
        key.value = "";
        repeat.value = "";
      }
    };
    format.onchange = () => {
      const classic = format.value === "mafile";
      encrypted.input.disabled = classic;
      proxies.input.disabled = classic;
      encrypted.input.checked = !classic;
      if (classic) proxies.input.checked = false;
      encrypted.input.onchange();
    };
    const error = el("p", "error");
    form.append(error);
    footer(
      form,
      async () => {
        error.textContent = "";
        if (encrypted.input.checked && [...key.value].length < 15) {
          error.textContent = t(
            featuresLocale.exportPasswordMustContainAtLeast15Characters,
          );
          return;
        }
        if (encrypted.input.checked && key.value !== repeat.value) {
          error.textContent = t(featuresLocale.passwordsDoNotMatch);
          return;
        }
        const generation = lockGeneration,
          dialogGeneration = sensitiveDialogGeneration;
        try {
          const result = await atomicBulkProgress(form, ids, () =>
            call("exportAccounts", {
              ids,
              format: format.value,
              includeProxies: proxies.input.checked,
              ...(encrypted.input.checked ? { key: key.value } : {}),
            }),
          );
          if (
            locked ||
            generation !== lockGeneration ||
            dialogGeneration !== sensitiveDialogGeneration ||
            !form.isConnected
          )
            return;
          if (result.saved) {
            form
              .closest("form")
              .querySelector(".modal-footer")
              ?.replaceChildren(btn(featuresLocale.done, () => modal.close()));
            toast(
              t(featuresLocale.accountsExported).replace(
                "{count}",
                result.count,
              ),
            );
          }
        } catch (e) {
          if (!locked && generation === lockGeneration && form.isConnected)
            error.textContent = t(e.message);
        } finally {
          key.value = "";
          repeat.value = "";
        }
      },
      featuresLocale.saveExport,
    );
  });
}
function portableImportDialog() {
  dialog(featuresLocale.importSmartSDA, (form) => {
    form.append(
      el(
        "p",
        "",
        featuresLocale.chooseASmartSDAFileEnterItsPasswordIfEncryptedLeaveTheFieldEmpty,
      ),
    );
    const key = field(form, featuresLocale.filePassword, input("password"));
    key.dataset.sensitive = "portable-key";
    key.autocomplete = "off";
    const destination = field(
      form,
      featuresLocale.folder,
      select(
        [
          ["", featuresLocale.keepImportedFolders],
          ...data.groups.map((folder) => [folder.id, folder.name]),
        ],
        "",
      ),
    );
    destination.dataset.portableDestination = "true";
    const banOptions = importBanOptions(form);
    const allocationOptions = proxyAllocationOptions(form, { preserve: true });
    const error = el("p", "error");
    form.append(error);
    footer(
      form,
      async () => {
        const generation = lockGeneration,
          dialogGeneration = sensitiveDialogGeneration;
        let preview;
        try {
          preview = await call("preparePortableImport", {
            ...banOptions(),
            ...(key.value ? { key: key.value } : {}),
            ...(destination.value ? { groupId: destination.value } : {}),
          });
          if (
            locked ||
            generation !== lockGeneration ||
            dialogGeneration !== sensitiveDialogGeneration ||
            !form.isConnected
          ) {
            if (preview?.token)
              await call("cancelPortableImport", {
                token: preview.token,
              }).catch(() => {});
            return;
          }
          if (preview?.cancelled) return;
          showPortableImportReview(preview, allocationOptions());
        } catch (e) {
          if (!locked && generation === lockGeneration && form.isConnected)
            error.textContent = t(e.message);
        } finally {
          key.value = "";
        }
      },
      featuresLocale.chooseFileAndReview,
    );
  });
}
function showPortableImportReview(preview, allocationOptions = {}) {
  let token = preview.token;
  dialog(
    preview.format === "tbs"
      ? featuresLocale.reviewTradeBotsSystemImport
      : featuresLocale.reviewSmartSDAImport,
    (form) => {
      appendImportBanSummary(form, preview);
      const generation = lockGeneration;
      form.append(
        el(
          "p",
          "",
          t(featuresLocale.readyDuplicates)
            .replace("{ready}", preview.ready)
            .replace("{duplicates}", preview.duplicates),
        ),
        el(
          "p",
          "",
          t(featuresLocale.foldersProxies)
            .replace("{groups}", preview.groups)
            .replace("{proxies}", preview.proxies),
        ),
        el(
          "p",
          "",
          preview.encrypted
            ? featuresLocale.encryptedFile
            : featuresLocale.unencryptedFile,
        ),
      );
      form.append(
        el(
          "p",
          "warn",
          featuresLocale.automaticConfirmationsAreDisabledForNewAndReplacedAccountsReviewAccountsBeforeEnablingRules,
        ),
      );
      const duplicatePolicy =
        preview.duplicates > 0
          ? field(
              form,
              featuresLocale.existingAccounts,
              select(
                [
                  ["skip", featuresLocale.skip],
                  ["replace", featuresLocale.replace],
                  ["merge", featuresLocale.fillMissingFields],
                  ["cancel", featuresLocale.cancelEntireImport],
                ],
                "skip",
              ),
            )
          : null;
      const policyHelp = el("p", "muted");
      if (duplicatePolicy) form.append(policyHelp);
      const explainPolicy = () => {
        policyHelp.textContent = t(
          duplicatePolicy?.value === "replace"
            ? featuresLocale.replaceImportedFieldsReplaceStoredValuesAccountIDAndHistoryRemainAutomaticConfirmationsAre
            : duplicatePolicy?.value === "merge"
              ? featuresLocale.fillMissingFieldsAddOnlyAMissingPasswordAvatarNoteAndWhollyAbsentSession
              : featuresLocale.skipExistingAccountsRemainUnchanged,
        );
      };
      explainPolicy();
      const rows = el("div", "import-rows");
      for (const account of preview.accounts || []) {
        rows.append(
          el("p", "", account.name + " · " + (account.steamId || "Steam")),
        );
        for (const warning of account.warnings || [])
          rows.append(el("p", "warn", t(warning)));
      }
      form.append(rows);
      footer(
        form,
        async () => {
          const current = token;
          try {
            await prepareProxyAllocationReview(
              "commitPortableImport",
              {
                token: current,
                duplicatePolicy: duplicatePolicy?.value || "skip",
                ...allocationOptions,
              },
              {
                onApplied: () => {
                  token = null;
                },
                message: featuresLocale.importCompleted,
              },
            );
          } catch (error) {
            if (!locked && generation === lockGeneration && form.isConnected)
              form.append(el("p", "error", t(error.message)));
          }
        },
        featuresLocale.applyImport,
      );
      const approve = form.querySelector("button[type=submit]");
      const updateApproval = () => {
        approve.disabled = !(
          preview.ready > 0 ||
          (preview.duplicates > 0 &&
            ["replace", "merge"].includes(duplicatePolicy?.value))
        );
        explainPolicy();
      };
      if (duplicatePolicy)
        duplicatePolicy.onchange = () => {
          if (duplicatePolicy.value === "cancel") {
            modal.close();
            return;
          }
          updateApproval();
        };
      updateApproval();
    },
  );
  afterDialogCloses(() => {
    if (token) call("cancelPortableImport", { token }).catch(() => {});
    token = null;
  });
}

function confirmationPolicyFields(form, account) {
  const box = el("section", "confirmation-policy");
  form.append(box);
  box.append(el("h3", "", featuresLocale.checkingAndConfirmations));
  const definitions = [
    [
      "checkConfirmations",
      featuresLocale.checkConfirmationsPeriodically,
      account?.checkConfirmations ??
        Boolean(
          account?.autoMarket ||
            account?.autoTrades ||
            account?.autoMarketPurchases,
        ),
    ],
    [
      "notifyConfirmations",
      featuresLocale.notifyAboutNewConfirmations,
      account?.notifyConfirmations !== false,
    ],
    [
      "autoMarket",
      featuresLocale.automaticallyConfirmMarketListings,
      account?.autoMarket === true,
    ],
    [
      "autoMarketPurchases",
      featuresLocale.automaticallyConfirmMarketPurchases,
      account?.autoMarketPurchases === true,
    ],
    [
      "autoTrades",
      featuresLocale.automaticallyConfirmTrades,
      account?.autoTrades === true,
    ],
    [
      "watchIncomingTrades",
      featuresLocale.watchIncomingTradeOffers,
      account?.watchIncomingTrades === true,
    ],
    [
      "autoAcceptGifts",
      featuresLocale.automaticallyAcceptGifts,
      account?.autoAcceptGifts === true,
    ],
  ];
  const controls = {},
    intervals = {};
  for (const [key, label, value] of definitions) {
    const row = el("div", "confirmation-policy-function");
    box.append(row);
    if (account) {
      const control = checkbox(label, value);
      row.append(control.node);
      controls[key] = control.input;
    } else
      controls[key] = field(
        row,
        label,
        select(
          [
            ["unchanged", featuresLocale.unchanged],
            ["enable", featuresLocale.enable],
            ["disable", featuresLocale.disable],
          ],
          "unchanged",
        ),
      );
    controls[key].name = key;
    const interval = field(
      row,
      account
        ? featuresLocale.intervalSeconds
        : featuresLocale.intervalSecondsBlankToKeepUnchanged,
      input(
        "number",
        account
          ? (account.functionIntervalsSeconds?.[key] ??
              account.confirmationIntervalSeconds ??
              60)
          : "",
      ),
    );
    interval.min = 30;
    interval.max = 86400;
    interval.step = 1;
    interval.name = "functionIntervalsSeconds." + key;
    intervals[key] = interval;
    const update = () => {
      interval.disabled = account
        ? !controls[key].checked
        : controls[key].value === "disable";
    };
    controls[key].onchange = update;
    update();
  }
  for (const key of ["autoMarket", "autoMarketPurchases", "autoTrades"]) {
    const update = controls[key].onchange;
    controls[key].onchange = () => {
      update();
      if (account ? controls[key].checked : controls[key].value === "enable") {
        if (account) controls.checkConfirmations.checked = true;
        else controls.checkConfirmations.value = "enable";
        controls.checkConfirmations.onchange?.();
      }
    };
  }
  box.append(
    el(
      "p",
      "muted",
      featuresLocale.periodicCheckingControlsConfirmationsAndNotificationsIncomingOffersAndGiftsHaveSeparateRules,
    ),
  );
  box.append(
    el(
      "p",
      "warn",
      featuresLocale.anEnabledRuleAllowsConfirmationWithoutAnotherPrompt,
    ),
  );
  return () => {
    const value = {},
      functionIntervalsSeconds = {};
    for (const [key, node] of Object.entries(controls)) {
      if (account) value[key] = node.checked;
      else if (node.value !== "unchanged") value[key] = node.value === "enable";
      const interval = intervals[key];
      if (!interval.disabled && (account || interval.value !== "")) {
        const seconds = Number(interval.value);
        if (!Number.isInteger(seconds) || seconds < 30 || seconds > 86400)
          throw Error(
            t(featuresLocale.intervalMustBeAnIntegerFrom30To86400Seconds),
          );
        functionIntervalsSeconds[key] = seconds;
      }
    }
    if (Object.keys(functionIntervalsSeconds).length)
      value.functionIntervalsSeconds = functionIntervalsSeconds;
    return value;
  };
}

function accountConfirmationCard(account) {
  const form = el("form", "card account-confirmation-card"),
    generation = lockGeneration,
    values = confirmationPolicyFields(form, account);
  form.dataset.accountId = account.id;
  const current = () =>
    !locked &&
    generation === lockGeneration &&
    form.isConnected &&
    selected === account.id &&
    data.accounts.some((a) => a.id === account.id);
  let busy = false;
  const save = btn(
    featuresLocale.save,
    async () => {
      if (busy || !current()) return;
      busy = true;
      try {
        await call("updateAccount", { id: account.id, ...values() });
        if (!current()) return;
        await refresh();
        if (
          !locked &&
          generation === lockGeneration &&
          selected === account.id &&
          data.accounts.some((a) => a.id === account.id)
        )
          toast(featuresLocale.confirmationRulesSaved);
      } catch (error) {
        if (current()) throw error;
      } finally {
        busy = false;
      }
    },
    "primary",
  );
  save.type = "submit";
  save.dataset.confirmationSave = "true";
  const error = automationError(account);
  if (error) form.append(error);
  form.append(append(el("div", "actions account-confirmation-actions"), save));
  form.onsubmit = (event) => event.preventDefault();
  return form;
}

function editAccountConfirmationPolicy(account) {
  dialog(featuresLocale.checkingAndConfirmations, (form) => {
    const generation = lockGeneration,
      dialogGeneration = sensitiveDialogGeneration,
      values = confirmationPolicyFields(form, account);
    footer(form, async () => {
      const current = () =>
        !locked &&
        generation === lockGeneration &&
        dialogGeneration === sensitiveDialogGeneration &&
        modal.open &&
        form.isConnected &&
        data.accounts.some((a) => a.id === account.id);
      if (!current()) return;
      try {
        await call("updateAccount", { id: account.id, ...values() });
        if (!current()) return;
        const closed = new Promise((resolve) =>
          modal.addEventListener("close", resolve, { once: true }),
        );
        modal.close();
        await closed;
        const closedGeneration = sensitiveDialogGeneration;
        const stillCurrent = () =>
          !locked &&
          generation === lockGeneration &&
          !modal.open &&
          closedGeneration === sensitiveDialogGeneration &&
          data.accounts.some((a) => a.id === account.id);
        if (!stillCurrent()) return;
        await refresh();
        if (stillCurrent()) toast(featuresLocale.confirmationRulesSaved);
      } catch (error) {
        if (current()) throw error;
      }
    });
  });
}
