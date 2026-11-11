"use strict";
const lootLocale = window.SmartLocaleData;
(() => {
  const api = window.lootApi,
    root = document.getElementById("loot"),
    dialog = document.getElementById("loot-preview"),
    notice = document.getElementById("notice"),
    t = (key) => window.LootI18n.t(key);
  let data = null,
    draft = null,
    draftName = "",
    coverageHost,
    busy = false,
    disposed = false,
    generation = 0,
    statusHost,
    logHost,
    logCountsHost,
    logSummaryHost,
    logFollowInput,
    logOlderButton,
    logVisibleLimit = 200,
    logWindowStart = null,
    logFollow = true,
    logRunKey = null,
    logViewport = null,
    logNodes = new Map(),
    journalHost,
    startButton,
    previewButton,
    cancelButton,
    journalLimit = 100,
    fetching = false,
    refreshPending = false,
    refreshTimer = null,
    refreshLockEpoch = 0;
  const systemColors = window.matchMedia("(prefers-color-scheme: dark)");
  let selectedTheme = "system";
  function applyTheme() {
    document.documentElement.dataset.theme =
      selectedTheme === "system" ? (systemColors.matches ? "dark" : "light") : selectedTheme;
  }
  systemColors.addEventListener("change", applyTheme);
  applyTheme();
  const el = (tag, cls = "", text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = t(text);
    return node;
  };
  const notify = (message) => {
    notice.textContent = t(message);
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      notice.textContent = "";
    }, 6000);
  };
  const button = (label, action, cls = "") => {
    const node = el("button", cls, label);
    node.type = "button";
    node.onclick = async () => {
      if (busy) return;
      busy = true;
      node.disabled = true;
      try {
        await action();
      } catch (error) {
        if (!disposed) notify(error.message || String(error));
      } finally {
        busy = false;
        node.disabled = false;
        paintStatus();
      }
    };
    return node;
  };
  const check = (label, checked, change, disabled = false) => {
    const node = el("label", "check"),
      input = el("input");
    input.type = "checkbox";
    input.checked = disabled ? false : checked;
    input.disabled = disabled;
    if (disabled) node.classList.add("unavailable-account");
    input.onchange = () => change(input.checked);
    node.append(input, el("span", "", label));
    return node;
  };
  const field = (parent, label, input) => {
    const node = el("label", "field");
    node.append(el("span", "", label), input);
    parent.append(node);
    return input;
  };
  const input = (type, value = "") => {
    const node = el("input");
    node.type = type;
    node.value = value;
    return node;
  };
  const card = (label, cls = "") => {
    const node = el("section", "card " + cls);
    node.append(el("h2", "", label));
    return node;
  };
  const name = (id) =>
    data?.accounts?.find((account) => account.id === id)?.name || id;
  const personalId = (value) =>
    /^765\d{14}$/.test(value) &&
    BigInt(value) > 76561197960265728n &&
    BigInt(value) <= 76561202255233023n;
  function tradeToken(value, steamId) {
    value = value.trim();
    if (!value) return undefined;
    if (/^[A-Za-z0-9_-]{8}$/.test(value)) return value;
    try {
      const url = new URL(value);
      if (
        url.origin !== "https://steamcommunity.com" ||
        url.pathname !== "/tradeoffer/new/" ||
        url.username ||
        url.password ||
        url.hash ||
        [...url.searchParams.keys()].some(
          (key) => !["partner", "token"].includes(key),
        ) ||
        url.searchParams.getAll("partner").length !== 1 ||
        url.searchParams.getAll("token").length !== 1
      )
        throw Error();
      const partner = url.searchParams.get("partner"),
        token = url.searchParams.get("token");
      if (!/^[1-9]\d{0,9}$/.test(partner) || !/^[A-Za-z0-9_-]{8}$/.test(token))
        throw Error();
      if (BigInt(partner) + 76561197960265728n !== BigInt(steamId))
        throw Error(t("Trade URL does not match the recipient."));
      return token;
    } catch (error) {
      if (error.message === t("Trade URL does not match the recipient."))
        throw error;
      throw Error(t("Invalid Steam trade URL or token."));
    }
  }
  const communityBanned = (account) => account?.bans?.community === true;
  const accountLabel = (account) =>
    account.name +
    " · " +
    (account.steamId || "") +
    (communityBanned(account)
      ? " · " + t("Community banned — unavailable")
      : "");
  function selectedAccounts(selection) {
    const groups = new Set(selection.groupIds || []);
    let previous;
    do {
      previous = groups.size;
      for (const group of data.groups || [])
        if (groups.has(group.parentId)) groups.add(group.id);
    } while (groups.size !== previous);
    return (data.accounts || []).filter(
      (a) =>
        !communityBanned(a) &&
        (selection.all ||
          (selection.accountIds || []).includes(a.id) ||
          groups.has(a.groupId)),
    );
  }
  function coverage() {
    const warehouses = new Set(draft.warehouses.map((w) => w.steamId));
    const allowed = new Set();
    for (const warehouse of draft.warehouses.filter(
      (w) =>
        !communityBanned(data.accounts.find((a) => a.steamId === w.steamId)),
    ))
      for (const account of selectedAccounts(
        warehouse.allowedSenders || { all: true },
      ))
        allowed.add(account.id);
    return selectedAccounts(draft.sources).filter(
      (a) => !warehouses.has(a.steamId) && !allowed.has(a.id),
    );
  }
  function paintCoverage() {
    if (!coverageHost || !draft) return;
    const missing = coverage();
    coverageHost.replaceChildren(
      el(
        "strong",
        "",
        missing.length
          ? "Sources without a warehouse"
          : "All sources have a warehouse",
      ),
    );
    for (const a of missing)
      coverageHost.append(el("p", "", a.name + " · " + (a.steamId || a.id)));
  }
  function requireCoverage() {
    const missing = coverage();
    if (missing.length)
      throw Error(
        t("Sources without a warehouse") +
          ": " +
          missing.map((a) => a.name + " · " + (a.steamId || a.id)).join(", "),
      );
  }
  function senderDialog(warehouse) {
    const selection = structuredClone(
      warehouse.allowedSenders || { all: true, groupIds: [], accountIds: [] },
    );
    const modal = document.createElement("dialog");
    modal.setAttribute("aria-label", t("Allowed senders"));
    modal.append(
      el("h2", "", "Allowed senders"),
      el(
        "p",
        "muted",
        "Known Community-banned accounts are excluded from sources, folders and warehouses.",
      ),
      el(
        "p",
        "muted",
        "Only selected scheme sources can send. Folders include descendants.",
      ),
    );
    const choices = el("div", "pick-list");
    choices.hidden = selection.all;
    modal.append(
      check("All scheme sources", selection.all, (value) => {
        selection.all = value;
        choices.hidden = value;
      }),
      choices,
    );
    for (const [key, label, items] of [
      ["groupIds", "Folders", data.groups || []],
      ["accountIds", "Accounts", data.accounts || []],
    ]) {
      choices.append(el("h3", "", label));
      for (const item of items)
        choices.append(
          check(
            key === "accountIds" ? accountLabel(item) : item.name,
            selection[key].includes(item.id),
            (value) => {
              selection[key] = selection[key].filter((id) => id !== item.id);
              if (value) selection[key].push(item.id);
            },
            key === "accountIds" && communityBanned(item),
          ),
        );
    }
    modal.append(
      button("Apply", () => {
        warehouse.allowedSenders = selection;
        paintCoverage();
        modal.close();
        modal.remove();
      }),
      button("Cancel", () => {
        modal.close();
        modal.remove();
      }),
    );
    document.body.append(modal);
    modal.showModal();
  }
  function normalized(requireReady = false) {
    const value = structuredClone(draft);
    if (!draftName.trim()) throw Error(t("Enter a scheme name."));
    if (
      !Number.isInteger(value.concurrency) ||
      value.concurrency < 1 ||
      value.concurrency > 8
    )
      throw Error(t("Concurrency must be between 1 and 8."));
    if (requireReady || value.enabled) requireCoverage();
    if (
      !Number.isInteger(value.intervalHours) ||
      value.intervalHours < 1 ||
      value.intervalHours > 8760 ||
      !Number.isInteger(value.delaySeconds) ||
      value.delaySeconds < 0 ||
      value.delaySeconds > 86400 ||
      !Number.isInteger(value.retryDelaySeconds) ||
      value.retryDelaySeconds < 30 ||
      value.retryDelaySeconds > 86400 ||
      !Number.isInteger(value.maxRetryAttempts) ||
      value.maxRetryAttempts < 0 ||
      value.maxRetryAttempts > 10 ||
      !Number.isInteger(value.maxItemsPerRun) ||
      value.maxItemsPerRun < 1 ||
      value.maxItemsPerRun > 1000000
    )
      throw Error(t("Check the schedule numbers."));
    if (
      !value.appIds.length ||
      ((requireReady || value.enabled) &&
        (!value.warehouses.length ||
          (!value.sources.all &&
            !value.sources.groupIds.length &&
            !value.sources.accountIds.length)))
    )
      throw Error(t("Select at least one inventory, source and warehouse."));
    return value;
  }
  async function save(requireReady = false) {
    const settings = normalized(requireReady),
      epoch = generation;
    const result = await api.call("saveLootSettings", {
      name: draftName.trim(),
      settings,
    });
    if (result.scheme) data.scheme = result.scheme;
    if (epoch !== generation || disposed) return false;
    draft = settings;
    await refresh();
    notify("Settings saved");
    return true;
  }
  const eventLabels = {
    "job-start": "Run started",
    "source-start": "Processing source",
    "phase-change": "Activity update",
    "inventory-start": "Reading inventory",
    "inventory-read": "Inventory read",
    "inventory-page": "Inventory page read",
    "source-completed": "Source processed",
    "offer-accepted": "Offer accepted; awaiting delivery verification",
    "cancel-requested": "Cancellation requested",
    "source-skipped": "Source skipped",
    "send-preflight": "Checking trade before sending",
    "send-start": "Sending offer",
    "confirmation-start": "Confirming offer",
    "offer-sent": "Offer sent; awaiting delivery",
    "offer-delivered": "Delivery verified",
    "send-error": "Sending failed",
    "retry-queued": "Source queued for retry",
    "retry-due": "Retrying source",
    "job-completed": "Source processing finished",
    "job-cancelled": "Run cancelled",
    "job-failed": "Run failed",
    "route-start": "Checking proxy",
    "route-failure": "Proxy failed",
    "route-ready": "Proxy ready",
    "route-cache-hit": "Reusing verified proxy",
    "session-ready": "Session ready",
    "session-refreshed": "Session refreshed",
    "session-refresh-start": "Refreshing session",
    "auth-start": "Signing in to Steam",
    "auth-success": "Steam sign-in completed",
  };
  const eventReasons = {
    permission: "Trade permission denied",
    authentication: "Steam authentication needs attention",
    proxy: "Proxy connection failed",
    empty: "No available items",
    "rate-limit": "Steam rate limit",
    "unknown-send": "Send result unknown; checking before retry",
    temporary: "Temporary failure",
    persistence: "Could not save session or trade journal",
    unknown: "Could not verify the result",
  };
  const phaseLabels = {
    proxy: "Checking proxy",
    session: "Checking session",
    auth: "Signing in to Steam",
    authenticating: "Signing in to Steam",
    inventory: "Reading inventory",
    preparing: "Preparing account",
    sending: "Sending offer",
    confirming: "Confirming offer",
    completed: "Source processed",
    failed: "Source failed",
    cancelled: "Source cancelled",
    skipped: "Source skipped",
  };
  const eventPhases = new Set([
    "proxy",
    "session",
    "auth",
    "authenticating",
    "inventory",
    "preparing",
    "sending",
    "confirming",
    "retry-wait",
    "retry-preparing",
    "completed",
    "failed",
    "cancelled",
    "skipped",
    "pending",
    "queued",
  ]);
  const logNumber = (value) => Number.isSafeInteger(value) && value >= 0;
  function logPosition() {
    if (!logHost) return logViewport;
    const row = [...logHost.children].find(
      (node) =>
        node.dataset.seq &&
        node.offsetTop + node.offsetHeight > logHost.scrollTop,
    );
    return {
      seq: row?.dataset.seq,
      offset: row ? row.offsetTop - logHost.scrollTop : 0,
      top: logHost.scrollTop,
    };
  }
  function paintLog(job) {
    if (!logHost) return;
    const runKey =
      (data.scheme?.id || "draft") + ":" + (job.id || job.startedAt || "none");
    if (runKey !== logRunKey) {
      logRunKey = runKey;
      logViewport = null;
      logVisibleLimit = 200;
      logWindowStart = null;
      logNodes.clear();
      logHost.replaceChildren();
    }
    const viewport = logHost.children.length ? logPosition() : logViewport;
    const seen = new Set();
    let events = (Array.isArray(job.events) ? job.events : [])
      .filter(
        (event) =>
          event &&
          logNumber(event.seq) &&
          !seen.has(event.seq) &&
          seen.add(event.seq),
      )
      .sort((a, b) => a.seq - b.seq);
    const allEvents = events;
    events =
      logFollow || logWindowStart === null
        ? allEvents.slice(-logVisibleLimit)
        : allEvents
            .filter((event) => event.seq >= logWindowStart)
            .slice(0, logVisibleLimit);
    const olderCount = events.length
        ? allEvents.filter((event) => event.seq < events[0].seq).length
        : 0,
      newerCount = events.length
        ? allEvents.filter((event) => event.seq > events.at(-1).seq).length
        : 0;
    if (!logFollow && events.length) logWindowStart = events[0].seq;
    const keys = new Set(events.map((event) => event.seq));
    for (const [seq, node] of logNodes)
      if (!keys.has(seq)) {
        node.remove();
        logNodes.delete(seq);
      }
    if (events.length) logHost.querySelector(".log-empty")?.remove();
    for (const event of events) {
      if (logNodes.has(event.seq)) continue;
      const level = ["warning", "error"].includes(event.level)
          ? event.level
          : "info",
        row = el("div", "loot-log-row"),
        time = el("time", "loot-log-time"),
        identity = el("span", "loot-log-identity"),
        body = el("span", "loot-log-message"),
        account = data.accounts?.find(
          (account) => account.id === event.accountId,
        ),
        validTime =
          typeof event.at === "string" &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(event.at) &&
          Number.isFinite(Date.parse(event.at));
      row.dataset.seq = String(event.seq);
      row.dataset.level = level;
      time.textContent = validTime
        ? new Date(event.at).toLocaleTimeString(document.documentElement.lang, {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            fractionalSecondDigits: 3,
          })
        : "—";
      if (validTime) {
        time.dateTime = event.at;
        time.title = event.at;
      }
      identity.textContent = account
        ? [account.name, account.steamId].filter(Boolean).join(" · ")
        : t(event.accountId ? "Unknown account" : "Run");
      const details =
          event.details && typeof event.details === "object"
            ? event.details
            : {},
        pieces = [
          t(
            event.code === "phase-change" && eventPhases.has(event.phase)
              ? phaseLabels[event.phase] || event.phase
              : Object.hasOwn(eventLabels, event.code)
                ? eventLabels[event.code]
                : "Activity update",
          ),
        ];
      if (
        typeof details.reason === "string" &&
        Object.hasOwn(eventReasons, details.reason)
      )
        pieces.push(t(eventReasons[details.reason]));
      if (logNumber(details.routeAttempt))
        pieces.push(
          t("Proxy attempt {attempt} / {total}")
            .replace("{attempt}", details.routeAttempt)
            .replace(
              "{total}",
              logNumber(details.routeCount) ? details.routeCount : "?",
            ),
        );
      if (details.backup === true) pieces.push(t("Backup proxy"));
      for (const [key, label] of [
        ["positions", "positions"],
        ["offers", "offers"],
        ["sourceCount", "Sources"],
      ])
        if (logNumber(details[key]))
          pieces.push(String(details[key]) + " " + t(label));
      if (
        typeof details.units === "string" &&
        /^\d{1,120}$/.test(details.units)
      )
        pieces.push(details.units + " " + t("units"));
      if (logNumber(details.retryAttempt))
        pieces.push(
          t("Retry attempt: {attempt}").replace(
            "{attempt}",
            details.retryAttempt,
          ),
        );
      if (logNumber(details.delayMs))
        pieces.push(
          t("Wait {seconds} seconds").replace(
            "{seconds}",
            Math.ceil(details.delayMs / 1000),
          ),
        );
      if (
        logNumber(details.httpStatus) &&
        details.httpStatus >= 100 &&
        details.httpStatus <= 599
      )
        pieces.push("HTTP " + details.httpStatus);
      if (logNumber(details.steamResult) && details.steamResult <= 1000000)
        pieces.push(
          t("Steam result {result}").replace("{result}", details.steamResult),
        );
      if (
        typeof details.offerId === "string" &&
        /^[1-9]\d{0,31}$/.test(details.offerId)
      )
        pieces.push(t("Offer {id}").replace("{id}", details.offerId));
      for (const [key, label] of [
        ["appId", "Game {count}"],
        ["page", "Page {count}"],
        ["totalPositions", "Total positions: {count}"],
        ["tradablePositions", "Tradable positions: {count}"],
      ])
        if (logNumber(details[key]))
          pieces.push(t(label).replace("{count}", details[key]));
      if (details.revalidate === true) pieces.push(t("Inventory revalidation"));
      // Only stable codes and explicitly validated fields are rendered. Raw messages and extra fields stay out of the UI.
      body.textContent = pieces.join(" · ");
      row.append(time, identity, body);
      const last = logHost.lastElementChild;
      if (!last || Number(last.dataset.seq) < event.seq) logHost.append(row);
      else
        logHost.insertBefore(
          row,
          [...logHost.children].find(
            (node) => Number(node.dataset.seq) > event.seq,
          ) || null,
        );
      logNodes.set(event.seq, row);
    }
    if (!events.length && !logHost.children.length)
      logHost.append(el("p", "muted log-empty", "No events yet"));
    logOlderButton.hidden = olderCount === 0;
    const truncated = logNumber(job.eventsTruncated) ? job.eventsTruncated : 0,
      sequence = logNumber(job.eventSequence)
        ? job.eventSequence
        : events.at(-1)?.seq || 0;
    logSummaryHost.textContent =
      t("Events: {count} · Latest sequence: {sequence}")
        .replace("{count}", events.length)
        .replace("{sequence}", sequence) +
      (truncated
        ? " · " +
          t("Earlier events omitted: {count}").replace("{count}", truncated)
        : "") +
      (olderCount
        ? " · " +
          t("Older events available: {count}").replace("{count}", olderCount)
        : "") +
      (newerCount
        ? " · " +
          t("Newer events available: {count}").replace("{count}", newerCount)
        : "");
    const progress = job.progressSummary || {},
      accounts = Array.isArray(job.accounts) ? job.accounts : [],
      active =
        progress.activeSources ??
        accounts.filter((a) =>
          [
            "proxy",
            "session",
            "auth",
            "authenticating",
            "inventory",
            "preparing",
            "sending",
            "confirming",
          ].includes(a.phase),
        ).length,
      counts = [
        ["Total sources", progress.totalSources ?? job.totalSources ?? 0],
        ["Active sources", active],
        [
          "Attempted sources",
          progress.attemptedSources ?? job.attemptedSources ?? 0,
        ],
        [
          "Completed sources",
          progress.completedSources ??
            accounts.filter((a) => a.state === "completed").length,
        ],
        ["Failed sources", progress.failedSources ?? job.failedAccounts ?? 0],
        [
          "Skipped sources",
          progress.skippedSources ??
            accounts.filter((a) => a.state === "skipped").length,
        ],
        [
          "Retrying sources",
          progress.retryingSources ?? job.retryPendingSources ?? 0,
        ],
        [
          "Pending sources",
          progress.pendingSources ??
            Math.max(0, (job.totalSources || 0) - (job.attemptedSources || 0)),
        ],
      ];
    logCountsHost.replaceChildren();
    for (const [label, value] of counts) {
      const item = el("div");
      item.append(
        el("dt", "", label),
        el("dd", "", String(logNumber(value) ? value : 0)),
      );
      logCountsHost.append(item);
    }
    logFollowInput.checked = logFollow;
    logHost.setAttribute("aria-live", logFollow ? "polite" : "off");
    if (logFollow) logHost.scrollTop = logHost.scrollHeight;
    else if (viewport) {
      const anchor = logNodes.get(Number(viewport.seq));
      logHost.scrollTop = anchor
        ? anchor.offsetTop - viewport.offset
        : viewport.top;
    }
    logViewport = logPosition();
  }
  function paintStatus() {
    if (!statusHost || !data || data.locked) return;
    paintCoverage();
    const status = data.loot || {},
      job = status.job || {},
      running =
        status.running === true ||
        status.preparing === true ||
        ["running", "preparing", "cancelling"].includes(
          job.state || job.status,
        );
    statusHost.replaceChildren(el("strong", "", running ? "Running" : "Idle"));
    const processed =
        job.dispatchedOffers ?? job.completedOffers ?? job.processed,
      total = job.totalOffers ?? job.total,
      discovering = job.streaming === true && job.totalsKnown !== true,
      sentCount = (sent, discovered, unit) =>
        String(sent) +
        (discovering
          ? " " +
            t(unit) +
            (discovered !== undefined
              ? " · " +
                t("Discovered so far") +
                ": " +
                discovered +
                " " +
                t(unit)
              : "")
          : (discovered !== undefined ? " / " + discovered : "") +
            " " +
            t(unit));
    const info = [
      t(job.state || job.status || ""),
      t(job.phase || ""),
      processed !== undefined
        ? t("Sent (awaiting delivery)") +
          ": " +
          sentCount(processed, total, "offers")
        : "",
      t(job.message || job.error || ""),
    ].filter(Boolean);
    if (info.length)
      statusHost.append(el("p", "status", [...new Set(info)].join(" · ")));
    if (job.totalSources !== undefined)
      statusHost.append(
        el(
          "p",
          "source-progress",
          t("Attempted sources: {attempted} / {total}")
            .replace("{attempted}", job.attemptedSources ?? 0)
            .replace("{total}", job.totalSources),
        ),
      );
    if (discovering)
      statusHost.append(
        el("p", "muted", "Totals are discovered as each account is processed."),
      );
    if ((job.retryAttempt || 0) > 0 || (job.retryPendingSources || 0) > 0) {
      statusHost.append(
        el(
          "p",
          "",
          t("Retry attempt {attempt} / {max}")
            .replace("{attempt}", job.retryAttempt || 0)
            .replace("{max}", job.maxRetryAttempts ?? draft.maxRetryAttempts),
        ),
      );
      if (job.retryPendingSources)
        statusHost.append(
          el(
            "p",
            "",
            t("Failed sources awaiting retry: {count}").replace(
              "{count}",
              job.retryPendingSources,
            ),
          ),
        );
      if (job.nextRetryAt)
        statusHost.append(
          el("p", "", t("Next retry") + ": " + dateText(job.nextRetryAt)),
        );
    }
    if (job.currentAccountId)
      statusHost.append(
        el(
          "p",
          "",
          name(job.currentAccountId) +
            (job.currentPartnerSteamId
              ? " → " + job.currentPartnerSteamId
              : ""),
        ),
      );
    if (job.totalItems !== undefined)
      statusHost.append(
        el(
          "p",
          "",
          t("Sent (awaiting delivery)") +
            ": " +
            sentCount(
              job.dispatchedItems ?? job.completedItems ?? 0,
              job.totalItems,
              "positions",
            ),
        ),
      );
    if (job.totalUnits !== undefined)
      statusHost.append(
        el(
          "p",
          "",
          t("Sent (awaiting delivery)") +
            ": " +
            sentCount(
              job.dispatchedUnits ?? job.completedUnits ?? "0",
              job.totalUnits,
              "units",
            ),
        ),
      );
    if ((status.deliveredOffers ?? job.deliveredOffers) !== undefined)
      statusHost.append(
        el(
          "p",
          "",
          t("Delivered (verified)") +
            ": " +
            (status.deliveredOffers ?? job.deliveredOffers) +
            " " +
            t("offers") +
            " · " +
            (status.deliveredItems ?? job.deliveredItems ?? 0) +
            " " +
            t("positions") +
            " · " +
            (status.deliveredUnits ?? job.deliveredUnits ?? "0") +
            " " +
            t("units"),
        ),
      );
    if (job.accounts?.length)
      statusHost.append(progressList(job.accounts, "Account progress"));
    if (job.skipped?.length)
      statusHost.append(progressList(job.skipped, "Skipped accounts"));
    if (job.failedAccounts)
      statusHost.append(
        el("p", "warn", t("Failed accounts") + ": " + job.failedAccounts),
      );
    for (const [key, label] of [
      ["lastRunAt", "Last run"],
      ["nextRunAt", "Next run"],
    ]) {
      if (status[key])
        statusHost.append(
          el("p", "muted", t(label) + ": " + dateText(status[key])),
        );
    }
    paintLog(job);
    if (startButton) startButton.disabled = busy || running;
    if (previewButton) previewButton.disabled = busy || running;
    if (cancelButton) cancelButton.disabled = busy || !running;
    if (!journalHost) return;
    journalHost.replaceChildren();
    const journal = Array.isArray(status.journal) ? status.journal : [];
    if (!journal.length)
      journalHost.append(el("p", "muted", "No activity yet"));
    for (const entry of [...journal].reverse().slice(0, journalLimit)) {
      const row = el("div", "journal-row");
      row.append(
        el(
          "time",
          "",
          dateText(entry.at || entry.timestamp || entry.createdAt),
        ),
        el(
          "span",
          "",
          [
            entry.accountId ? name(entry.accountId) : "",
            t(entry.status || entry.state || entry.kind || ""),
            t(entry.message || entry.error || ""),
            entry.itemCount !== undefined
              ? entry.itemCount + " " + t("positions")
              : "",
            entry.unitCount !== undefined
              ? entry.unitCount + " " + t("units")
              : "",
            entry.partnerSteamId || entry.warehouseSteamId || "",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      journalHost.append(row);
    }
    if (journal.length > journalLimit)
      journalHost.append(
        button("Show more", () => {
          journalLimit += 100;
          paintStatus();
        }),
      );
  }
  function progressList(accounts, label) {
    const details = el("details"),
      summary = el("summary", "", t(label) + " (" + accounts.length + ")");
    details.append(summary);
    const active = (account) =>
      ["running", "preparing", "sending", "retry-wait"].includes(
        account.state,
      ) ||
      [
        "proxy",
        "session",
        "auth",
        "authenticating",
        "inventory",
        "sending",
      ].includes(account.phase);
    details.open = accounts.some(active);
    const visible = [
      ...accounts.filter(active),
      ...accounts.filter((account) => !active(account)),
    ];
    for (const account of visible.slice(0, 100))
      details.append(
        el(
          "p",
          "status",
          [
            name(account.accountId),
            t(account.state || ""),
            account.phase !== account.state ? t(account.phase || "") : "",
            account.completedOffers !== undefined
              ? t("Sent (awaiting delivery)") +
                ": " +
                String(account.completedOffers) +
                " " +
                t("offers")
              : "",
            account.completedItems !== undefined
              ? String(account.completedItems) + " " + t("positions")
              : "",
            account.completedUnits !== undefined
              ? account.completedUnits + " " + t("units")
              : "",
            account.retryAttempt > 0
              ? t("Retry attempt: {attempt}").replace(
                  "{attempt}",
                  account.retryAttempt,
                )
              : "",
            t(account.reason || ""),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );
    return details;
  }
  function dateText(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString(document.documentElement.lang);
  }
  function render() {
    if (logHost) logViewport = logPosition();
    logHost =
      logCountsHost =
      logSummaryHost =
      logFollowInput =
      logOlderButton =
        null;
    logNodes = new Map();
    root.replaceChildren();
    statusHost =
      journalHost =
      startButton =
      previewButton =
      cancelButton =
        null;
    if (data.locked) {
      logViewport = null;
      logRunKey = null;
      root.append(el("p", "", lootLocale.unlockTheAppToView));
      return;
    }
    const heading = el("header"),
      title = el("div"),
      actions = el("div", "toolbar"),
      grid = el("div", "grid");
    title.append(
      el("h1", "", "Loot"),
      el("p", "muted", "Collect tradable inventory into your warehouses."),
    );
    document.title = (draftName || t("New scheme")) + " · Loot · smart-auth";
    const nameInput = field(title, "Scheme name", input("text", draftName));
    nameInput.maxLength = 100;
    nameInput.oninput = () => {
      draftName = nameInput.value;
      document.title = (draftName || t("New scheme")) + " · Loot · smart-auth";
    };
    startButton = button("Start Loot", start, "primary");
    previewButton = button("Preview Loot", prepare);
    cancelButton = button("Cancel run", async () => {
      await api.call("cancelLoot");
      notify("Cancellation requested");
      await refresh();
    });
    actions.append(
      button("Save settings", async () => {
        if (await save()) await refresh();
      }),
      startButton,
      previewButton,
      cancelButton,
    );
    heading.append(title, actions);
    root.append(heading, grid);
    const schedule = card("Schedule"),
      numbers = el("div", "numbers");
    schedule.append(
      check("Enable automatic Loot", draft.enabled, (value) => {
        draft.enabled = value;
      }),
    );
    for (const [key, label, min, max, step] of [
      ["concurrency", "Concurrent accounts", 1, 8, 1],
      ["intervalHours", "Interval, hours", 1, 8760, 1],
      ["delaySeconds", "Delay between trade sends, seconds", 0, 86400, 1],
      [
        "retryDelaySeconds",
        "Retry failed sources after (seconds)",
        30,
        86400,
        1,
      ],
      ["maxRetryAttempts", "Additional retry attempts", 0, 10, 1],
      ["maxItemsPerRun", "Maximum positions per run", 1, 1000000, 1],
    ]) {
      const node = field(numbers, label, input("number", draft[key]));
      Object.assign(node, { min, max, step });
      node.oninput = () => {
        draft[key] = node.value === "" ? NaN : Number(node.value);
      };
    }
    schedule.append(
      numbers,
      el(
        "p",
        "muted",
        "Retry failed sources after the full source pass. Zero additional attempts disables retries. This delay is independent of the schedule interval. Unresolved offers are checked before retrying.",
      ),
      el(
        "p",
        "muted",
        "Minimum pause between actual outgoing trade sends, including sends from different source accounts.",
      ),
      el(
        "p",
        "muted",
        "Up to 4 accounts across all schemes. The same Steam account runs one operation at a time.",
      ),
      el(
        "p",
        "muted",
        "One stack is one position. The 8192 limit does not limit the quantity inside a stack.",
      ),
    );
    const apps = card("Inventories"),
      appList = el("div", "toolbar");
    const common = new Map([
      [730, "Counter-Strike 2"],
      [570, "Dota 2"],
      [440, "Team Fortress 2"],
      [753, "Steam"],
      [252490, "Rust"],
    ]);
    const paintApps = () => {
      appList.replaceChildren();
      for (const [id, label] of common)
        appList.append(
          check(label, draft.appIds.includes(id), (value) => {
            draft.appIds = draft.appIds.filter((n) => n !== id);
            if (value) draft.appIds.push(id);
          }),
        );
      for (const id of draft.appIds.filter((n) => !common.has(n))) {
        const tag = el("span", "app-tag", "App " + id),
          remove = button("Remove", () => {
            draft.appIds = draft.appIds.filter((n) => n !== id);
            paintApps();
          });
        remove.setAttribute("aria-label", t("Remove") + " App " + id);
        tag.append(remove);
        appList.append(tag);
      }
    };
    const custom = field(apps, "Custom App ID", input("number"));
    custom.min = 1;
    custom.max = 2147483647;
    custom.step = 1;
    apps.append(
      el(
        "p",
        "muted",
        "Trade Protection games (currently Counter-Strike 2) are sent in separate offers for each protected game. Other inventories may share an offer. The configured delay applies between every actual send, including separate offers from one account and sends from different accounts.",
      ),
      appList,
      button("Add", () => {
        const id = Number(custom.value);
        if (!Number.isInteger(id) || id < 1 || id > 2147483647)
          throw Error(t("Enter a positive App ID."));
        if (!draft.appIds.includes(id)) draft.appIds.push(id);
        custom.value = "";
        paintApps();
      }),
    );
    paintApps();
    const warehouses = card("Warehouses"),
      recipients = el("div"),
      internal = el("select");
    const empty = el("option", "", "Choose account");
    empty.value = "";
    internal.append(empty);
    for (const account of data.accounts || []) {
      if (!personalId(account.steamId || "")) continue;
      const option = el("option", "", account.name + " · " + account.steamId);
      option.value = account.steamId;
      option.disabled = communityBanned(account);
      if (option.disabled) option.textContent = accountLabel(account);
      internal.append(option);
    }
    field(warehouses, "Account from vault", internal);
    const external = field(warehouses, "External SteamID64", input("text"));
    external.inputMode = "numeric";
    external.maxLength = 128;
    const token = field(warehouses, "Trade URL or token", input("password"));
    token.autocomplete = "off";
    warehouses.append(
      el(
        "p",
        "muted",
        "Required when the recipient is not a friend. Stored securely; leave blank to keep an existing token.",
      ),
    );
    internal.onchange = () => {
      if (internal.value) external.value = "";
    };
    external.oninput = () => {
      if (external.value) internal.value = "";
    };
    const paintWarehouses = () => {
      recipients.replaceChildren();
      paintCoverage();
      if (!draft.warehouses.length)
        recipients.append(el("p", "muted", "No warehouses yet"));
      for (const warehouse of draft.warehouses) {
        const account = data.accounts.find(
            (a) => a.steamId === warehouse.steamId,
          ),
          row = el("div", "recipient"),
          identity = el("div", "identity"),
          avatar = button(
            "",
            async () => {
              await api.call("openLootAccount", { steamId: warehouse.steamId });
            },
            "avatar avatar-link",
          );
        avatar.textContent = (account?.name || "ST").slice(0, 2);
        avatar.disabled = !account;
        avatar.title = t(
          account
            ? "Open account profile"
            : "External warehouse has no vault profile",
        );
        avatar.setAttribute("aria-label", avatar.title);
        const imageData = warehouse.avatar || account?.avatar;
        if (
          typeof imageData === "string" &&
          /^data:image\/(?:png|jpeg|webp);base64,/.test(imageData)
        ) {
          const image = el("img", "avatar");
          image.src = imageData;
          image.alt = "";
          avatar.replaceChildren(image);
        }
        row.append(avatar);
        identity.append(
          el("strong", "", account?.name || warehouse.steamId),
          el(
            "small",
            communityBanned(account) ? "community-banned-steamid" : "",
            warehouse.steamId,
          ),
        );
        if (communityBanned(account))
          identity.append(
            el("small", "warn", "Community banned — unavailable"),
          );
        if (account && !account.autoAcceptGifts)
          identity.append(el("small", "warn", "Gift acceptance is disabled"));
        if (warehouse.tradeToken)
          identity.append(el("small", "", "Token stored"));
        row.append(
          identity,
          button("Allowed senders", () => senderDialog(warehouse)),
          button("Remove", () => {
            draft.warehouses = draft.warehouses.filter(
              (w) => w.steamId !== warehouse.steamId,
            );
            paintWarehouses();
          }),
        );
        recipients.append(row);
      }
    };
    warehouses.append(
      button("Add warehouse", () => {
        const steamId = external.value || internal.value;
        if (communityBanned(data.accounts.find((a) => a.steamId === steamId)))
          throw Error(t("Community banned — unavailable"));
        if (!personalId(steamId)) throw Error(t("Invalid personal SteamID64."));
        if (draft.warehouses.some((w) => w.steamId === steamId))
          throw Error(t("This warehouse is already added."));
        const value = tradeToken(token.value, steamId);
        draft.warehouses.push({
          steamId,
          allowedSenders: { all: true, groupIds: [], accountIds: [] },
          ...(value ? { tradeToken: value } : {}),
        });
        internal.value = external.value = token.value = "";
        paintWarehouses();
      }),
      recipients,
      el(
        "p",
        "muted",
        "New internal warehouses enable gift acceptance. Existing warehouse rules remain as configured.",
      ),
    );
    paintWarehouses();
    const sources = card("Sources"),
      choices = el("div");
    sources.append(
      el(
        "p",
        "muted",
        "Known Community-banned accounts are excluded from sources, folders and warehouses.",
      ),
      check("All accounts", draft.sources.all, (value) => {
        draft.sources.all = value;
        choices.hidden = value;
        paintCoverage();
      }),
      el(
        "p",
        "muted",
        "Groups and individual accounts are combined. Warehouses are excluded from sources.",
      ),
      choices,
    );
    choices.hidden = draft.sources.all;
    const folderList = el("div", "pick-list");
    folderList.setAttribute("aria-label", t("Folders"));
    for (const group of data.groups || [])
      folderList.append(
        check(
          group.name,
          draft.sources.groupIds.includes(group.id),
          (value) => {
            draft.sources.groupIds = draft.sources.groupIds.filter(
              (id) => id !== group.id,
            );
            if (value) draft.sources.groupIds.push(group.id);
            paintCoverage();
          },
        ),
      );
    const search = field(choices, "Search accounts", input("search")),
      accountList = el("div", "pick-list");
    accountList.setAttribute("aria-label", t("Accounts"));
    let accountLimit = 100;
    const paintAccounts = () => {
      accountList.replaceChildren();
      const accounts = data.accounts.filter((a) =>
        (a.name + " " + a.steamId)
          .toLowerCase()
          .includes(search.value.toLowerCase()),
      );
      for (const account of accounts.slice(0, accountLimit))
        accountList.append(
          check(
            accountLabel(account),
            draft.sources.accountIds.includes(account.id),
            (value) => {
              draft.sources.accountIds = draft.sources.accountIds.filter(
                (id) => id !== account.id,
              );
              if (value) draft.sources.accountIds.push(account.id);
              paintCoverage();
            },
            communityBanned(account),
          ),
        );
      if (accounts.length > accountLimit)
        accountList.append(
          button("Show more", () => {
            accountLimit += 100;
            paintAccounts();
          }),
        );
    };
    search.oninput = () => {
      accountLimit = 100;
      paintAccounts();
    };
    choices.prepend(el("h3", "", "Folders"), folderList);
    choices.append(accountList);
    paintAccounts();
    const status = card("Status", "wide");
    statusHost = el("div", "status");
    statusHost.setAttribute("role", "status");
    status.append(statusHost, button("Refresh", refresh));
    const activity = card("Live activity", "wide");
    logCountsHost = el("dl", "loot-progress-counts");
    logCountsHost.setAttribute("aria-label", t("Source progress"));
    logSummaryHost = el("p", "muted loot-log-summary");
    const logControls = el("div", "toolbar"),
      follow = check("Follow latest", logFollow, (value) => {
        logFollow = value;
        logWindowStart = value
          ? null
          : Number(logHost.firstElementChild?.dataset.seq) || null;
        paintLog(data.loot?.job || {});
      });
    logFollowInput = follow.querySelector("input");
    logHost = el("div", "loot-live-log");
    logHost.setAttribute("role", "log");
    logHost.setAttribute("aria-label", t("Live activity"));
    logHost.tabIndex = 0;
    const scrollHost = logHost;
    const pauseFollowing = () => {
      if (logHost !== scrollHost || !scrollHost.isConnected) return;
      logFollow = false;
      logWindowStart = Number(logHost.firstElementChild?.dataset.seq) || null;
      logFollowInput.checked = false;
      logHost.setAttribute("aria-live", "off");
    };
    logHost.addEventListener(
      "wheel",
      (event) => {
        if (event.deltaY < 0) pauseFollowing();
      },
      { passive: true },
    );
    logHost.addEventListener("keydown", (event) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key)) pauseFollowing();
    });
    logHost.addEventListener("scroll", () => {
      if (logHost !== scrollHost || !scrollHost.isConnected) return;
      if (
        logFollow &&
        logHost.scrollHeight - logHost.clientHeight - logHost.scrollTop > 12
      ) {
        logFollow = false;
        logWindowStart = Number(logHost.firstElementChild?.dataset.seq) || null;
        logFollowInput.checked = false;
        logHost.setAttribute("aria-live", "off");
      }
      logViewport = logPosition();
    });
    logOlderButton = button("Show older events", () => {
      logFollow = false;
      const events = (data.loot?.job?.events || [])
          .filter((event) => logNumber(event?.seq))
          .sort((a, b) => a.seq - b.seq),
        first = Number(logHost.firstElementChild?.dataset.seq),
        index = events.findIndex((event) => event.seq >= first);
      logWindowStart = events[Math.max(0, index - 200)]?.seq ?? null;
      logVisibleLimit = Math.min(1000, logVisibleLimit + 200);
      paintLog(data.loot?.job || {});
    });
    logControls.append(follow, logOlderButton);
    activity.append(logCountsHost, logControls, logSummaryHost, logHost);
    const journal = card("Journal", "wide");
    journalHost = el("div", "journal");
    journal.append(
      button("Refresh trade status", async () => {
        await api.call("refreshLootJournal");
        await refresh();
      }),
      journalHost,
    );
    const coverageCard = card("Warehouse coverage", "wide");
    coverageHost = el("div", "warn");
    coverageHost.setAttribute("role", "status");
    coverageCard.append(coverageHost);
    grid.append(
      schedule,
      apps,
      warehouses,
      sources,
      coverageCard,
      status,
      activity,
      journal,
    );
    paintCoverage();
    paintStatus();
  }
  async function start() {
    if (!(await save(true))) return;
    if (disposed || data.locked) return;
    requireCoverage();
    await api.call("startLoot", {});
    notify("Run started");
    await refresh();
  }
  async function prepare() {
    if (!(await save(true))) return;
    const epoch = generation,
      preview = await api.call("prepareLoot");
    if (epoch !== generation || disposed || data.locked) return;
    dialog.replaceChildren(el("h2", "", "Review outgoing trades"));
    dialog.firstElementChild.id = "preview-title";
    dialog.append(
      el(
        "p",
        "warn",
        "Items leave the source accounts and go to the listed warehouses. Confirm only after checking the recipients.",
      ),
      el(
        "p",
        "",
        t(
          "Sources: {sources} · Positions: {positions} · Units: {units} · Offers: {offers}",
        )
          .replace("{sources}", preview.sourceCount || 0)
          .replace("{positions}", preview.assetCount ?? preview.itemCount ?? 0)
          .replace("{units}", preview.unitCount ?? "0")
          .replace("{offers}", preview.offerCount || 0),
      ),
    );
    dialog.append(
      el(
        "p",
        "muted",
        "Trade Protection games are sent separately, with the configured delay between actual sends. Sent offers remain pending until delivery is verified.",
      ),
    );
    const list = el("div", "preview-offers");
    if (preview.skipped?.length)
      dialog.append(progressList(preview.skipped, "Skipped accounts"));
    for (const offer of preview.offers || [])
      list.append(
        el(
          "p",
          "",
          name(offer.accountId) +
            " → " +
            offer.partnerSteamId +
            " · " +
            (offer.assetCount ?? offer.itemCount) +
            " " +
            t("positions") +
            " · " +
            (offer.unitCount ?? "0") +
            " " +
            t("units"),
        ),
      );
    if (!preview.offerCount) list.append(el("p", "muted", "Nothing to send"));
    const actions = el("div", "toolbar"),
      commit = button(
        "Send reviewed plan",
        async () => {
          if (
            preview.expiresAt &&
            new Date(preview.expiresAt).getTime() <= Date.now()
          )
            throw Error(t("Preview expired. Create a new preview."));
          if (epoch !== generation || data.locked) return;
          requireCoverage();
          await api.call("startLoot", { previewId: preview.id });
          dialog.close();
          dialog.replaceChildren();
          notify("Run started");
          await refresh();
        },
        "primary",
      );
    commit.disabled = !preview.offerCount;
    actions.append(
      button("Cancel", () => {
        dialog.close();
        dialog.replaceChildren();
      }),
      commit,
    );
    dialog.append(list, actions);
    dialog.showModal();
  }
  function showLocked(snapshot = {}) {
    window.SmartWindowLock?.lock(snapshot.uiGeneration);
    generation++;
    data = {
      locked: true,
      settings: snapshot.settings || data?.settings || {},
    };
    draft = null;
    dialog.close();
    dialog.replaceChildren();
    notice.textContent = "";
    document
      .querySelectorAll("dialog:not(#loot-preview)")
      .forEach((node) => node.remove());
    render();
  }
  function scheduleRefresh(immediate = false) {
    if (disposed) return;
    refreshPending = true;
    if (immediate) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
      void refresh();
    } else if (refreshTimer === null) {
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 150);
    }
  }
  async function refresh() {
    if (disposed) return;
    if (fetching) {
      refreshPending = true;
      return;
    }
    fetching = true;
    refreshPending = false;
    const requestLockEpoch = refreshLockEpoch;
    try {
      const snapshot = await api.call("snapshot");
      if (disposed) return;
      if (requestLockEpoch !== refreshLockEpoch && !snapshot.locked) {
        refreshPending = true;
        return;
      }
      const wasLocked = data?.locked,
        oldLanguage = data?.settings?.language,
        oldTheme = data?.settings?.theme;
      data = snapshot;
      window.LootI18n.set(data.settings?.language || "en");
      document.documentElement.lang =
        data.settings?.language === "ua"
          ? "uk"
          : data.settings?.language || "en";
      if (data.settings?.theme) selectedTheme = data.settings.theme;
      applyTheme();
      if (data.locked) {
        showLocked(data);
      } else if (!draft || wasLocked) {
        generation++;
        draftName = data.scheme?.name || t("New scheme");
        draft = {
          concurrency: 3,
          enabled: false,
          intervalHours: 4,
          delaySeconds: 30,
          retryDelaySeconds: 60,
          maxRetryAttempts: 2,
          maxItemsPerRun: 8192,
          appIds: [730, 570, 440, 753],
          warehouses: [],
          sources: { all: true, groupIds: [], accountIds: [] },
          ...structuredClone(data.loot?.settings || {}),
        };
        for (const warehouse of draft.warehouses)
          warehouse.allowedSenders ||= {
            all: true,
            groupIds: [],
            accountIds: [],
          };
        render();
      } else if (
        oldLanguage !== data.settings?.language ||
        oldTheme !== data.settings?.theme
      )
        render();
      else paintStatus();
    } catch (error) {
      if (!disposed) notify(error.message);
    } finally {
      fetching = false;
      if (refreshPending) scheduleRefresh();
    }
  }
  let lastTouch = 0;
  const touch = (event) => {
    if (event.isTrusted && !disposed && Date.now() - lastTouch > 1000) {
      lastTouch = Date.now();
      void api.call("touch").catch(() => {});
    }
  };
  document.addEventListener("pointerdown", touch);
  document.addEventListener("keydown", touch);
  const unsubscribe = api.onChanged?.((change) => {
    if (change?.locked === true) {
      refreshLockEpoch++;
      showLocked(change);
      scheduleRefresh(true);
    } else scheduleRefresh();
  });
  const timer = setInterval(() => {
    scheduleRefresh();
  }, 3000);
  window.addEventListener("beforeunload", () => {
    disposed = true;
    systemColors.removeEventListener("change", applyTheme);
    generation++;
    clearInterval(timer);
    clearTimeout(refreshTimer);
    clearTimeout(notify.timer);
    unsubscribe?.();
    draft = null;
    dialog.replaceChildren();
    root.replaceChildren();
  });
  void refresh();
})();
