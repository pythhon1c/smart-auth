"use strict";
const confirmationDetailsLocale = window.SmartLocaleData;
// All Steam text is inserted with textContent through el(); remote images are
// obtained as validated data URLs from the account's proxied backend.
const confirmationDetailQueues = new Map();
function confirmationDetailCall(account, method, payload, active) {
  const previous =
    confirmationDetailQueues.get(account.id) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(() => {
      if (!active())
        throw new Error(confirmationDetailsLocale.validationMessage);
      return call(method, payload);
    });
  confirmationDetailQueues.set(account.id, task);
  void task
    .finally(() => {
      if (confirmationDetailQueues.get(account.id) === task)
        confirmationDetailQueues.delete(account.id);
    })
    .catch(() => {});
  return task;
}
function renderConfirmationStackPreview(confirmation, options = {}) {
  const box = el("div", "confirmation-stack-preview");
  const items = confirmation.items || confirmation.detail?.items || [];
  const image =
    options.image || (() => el("span", "confirmation-image-placeholder", "◇"));
  for (const direction of ["outgoing", "incoming", "unknown"]) {
    const rows = items.filter((item) => item.direction === direction);
    if (!rows.length) continue;
    const group = el("div", "confirmation-stack-preview-group " + direction);
    group.append(
      el(
        "span",
        "confirmation-stack-direction",
        direction === "outgoing" ? "↑" : direction === "incoming" ? "↓" : "?",
      ),
    );
    for (const item of rows.slice(0, options.limit || 8)) {
      const tile = el("span", "confirmation-stack-tile");
      tile.title =
        (item.name || t(confirmationDetailsLocale.itemNameUnavailable)) +
        " × " +
        (item.quantity || 1);
      tile.append(
        image(item.image, item.name),
        el("span", "confirmation-stack-count", "× " + (item.quantity || 1)),
      );
      group.append(tile);
    }
    if (rows.length > (options.limit || 8))
      group.append(
        el(
          "span",
          "confirmation-stack-more",
          "+" + (rows.length - (options.limit || 8)),
        ),
      );
    box.append(group);
  }
  return box;
}
function createConfirmationDetails(account, confirmation, active = () => true) {
  const box = el("details", "confirmation-details"),
    summary = el("summary", "", confirmationDetailsLocale.requestDetails);
  const content = el("div", "confirmation-detail-content");
  box.append(summary, content);
  let loaded = false,
    loading = false;
  const image = (index, label) => {
    const placeholder = el("span", "confirmation-image-placeholder", "◇");
    if (!Number.isSafeInteger(index) || index < 0) return placeholder;
    void confirmationDetailCall(
      account,
      "confirmationImage",
      { id: account.id, confirmationId: confirmation.id, index },
      active,
    )
      .then((value) => {
        if (
          !active() ||
          typeof value !== "string" ||
          !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(
            value,
          )
        )
          return;
        const img = document.createElement("img");
        img.alt = label || "";
        img.className = "confirmation-item-image";
        img.src = value;
        placeholder.replaceWith(img);
      })
      .catch(() => {
        placeholder.title = t(confirmationDetailsLocale.imageUnavailable);
      });
    return placeholder;
  };
  const load = async () => {
    if (loaded || loading || !active()) return;
    loading = true;
    content.replaceChildren(
      el("p", "muted", confirmationDetailsLocale.loadingDetails),
    );
    try {
      const detail = await confirmationDetailCall(
        account,
        "confirmationDetails",
        { id: account.id, confirmationId: confirmation.id },
        active,
      );
      if (!active()) return;
      loaded = true;
      content.replaceChildren();
      const preview = box.parentElement?.querySelector(
        ":scope > .confirmation-stack-preview",
      );
      if (preview) {
        const fresh = renderConfirmationStackPreview(
          { items: detail.items },
          { image },
        );
        for (const person of detail.counterparties || []) {
          const identity = el("span", "confirmation-preview-person");
          identity.append(
            image(person.image, person.name),
            el(
              "span",
              "",
              person.name || t(confirmationDetailsLocale.counterparty),
            ),
          );
          fresh.prepend(identity);
        }
        preview.replaceWith(fresh);
      }
      if (detail.owner) {
        const owner = el(
          "div",
          "confirmation-counterparty confirmation-detail-owner",
        );
        const avatar =
          typeof detail.owner.avatar === "string" &&
          /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(
            detail.owner.avatar,
          )
            ? el("img", "confirmation-item-image")
            : image(detail.owner.image, detail.owner.name);
        if (avatar.tagName === "IMG") {
          avatar.src = detail.owner.avatar;
          avatar.alt = detail.owner.name || "";
        }
        owner.append(
          avatar,
          el("strong", "", detail.owner.name || account.name || ""),
        );
        content.append(owner);
      }
      if (detail.itemsTruncated)
        content.append(
          el(
            "p",
            "confirmation-detail-note",
            confirmationDetailsLocale.onlyTheFirst100ItemRowsAreShownMoreItemsWereOmittedReviewThe,
          ),
        );
      if (detail.imagesTruncated)
        content.append(
          el(
            "p",
            "confirmation-detail-note",
            confirmationDetailsLocale.someImagesAreUnavailableAllItemsAndQuantitiesAreShownBelow,
          ),
        );
      if (detail.offerId)
        content.append(
          el(
            "p",
            "confirmation-reference",
            `Trade offer ID: ${detail.offerId}`,
          ),
        );
      if (confirmation.creatorId)
        content.append(
          el(
            "p",
            "confirmation-reference",
            `Steam object ID: ${confirmation.creatorId}`,
          ),
        );
      for (const person of detail.counterparties || []) {
        const row = el("div", "confirmation-counterparty");
        row.append(
          image(person.image, person.name),
          append(
            el("div"),
            el(
              "strong",
              "",
              person.name || confirmationDetailsLocale.counterparty,
            ),
            el(
              "p",
              "confirmation-reference",
              person.steamId ? `SteamID64: ${person.steamId}` : person.url,
            ),
          ),
        );
        content.append(row);
      }
      if (detail.kind === "trade" && !(detail.counterparties || []).length)
        content.append(
          el(
            "p",
            "confirmation-detail-note",
            confirmationDetailsLocale.steamDidNotProvideCounterpartyDetails,
          ),
        );
      const groups = [
        ["outgoing", confirmationDetailsLocale.youGive],
        ["incoming", confirmationDetailsLocale.youReceive],
        ["unknown", confirmationDetailsLocale.itemsDirectionUnknown],
      ];
      const columns = el("div", "confirmation-item-groups");
      const itemRows = detail.items || [];
      const sections = new Map();
      let rendered = 0;
      const paging = el("div", "confirmation-item-paging");
      const progress = el("p", "muted");
      const more = btn(confirmationDetailsLocale.show100MoreStacks, () => {
        if (active()) renderPage();
      });
      const renderPage = () => {
        const stop = Math.min(rendered + 100, itemRows.length);
        for (; rendered < stop; rendered++) {
          const item = itemRows[rendered];
          const direction = ["incoming", "outgoing"].includes(item.direction)
            ? item.direction
            : "unknown";
          let group = sections.get(direction);
          if (!group) {
            group = el("section", `confirmation-item-group ${direction}`);
            group.append(
              el("h4", "", groups.find(([key]) => key === direction)[1]),
            );
            sections.set(direction, group);
            columns.append(group);
          }
          const row = el("div", "confirmation-item");
          row.dataset.stackCount = String(item.stackCount || 1);
          row.append(
            image(item.image, item.name),
            append(
              el("div", "confirmation-item-description"),
              el(
                "strong",
                "",
                item.name || confirmationDetailsLocale.itemNameUnavailable,
              ),
              el(
                "span",
                "confirmation-item-quantity",
                `× ${item.exactQuantity || item.quantity || 1}`,
              ),
              item.appId ? el("small", "muted", `App ID: ${item.appId}`) : null,
            ),
          );
          group.append(row);
        }
        const remaining = itemRows.length - rendered;
        progress.textContent = t(
          confirmationDetailsLocale.stacksShownOfRemaining,
        )
          .replace("{shown}", rendered)
          .replace("{total}", itemRows.length)
          .replace("{remaining}", remaining);
        more.hidden = remaining === 0;
        paging.hidden = itemRows.length <= 100;
      };
      paging.append(progress, more);
      renderPage();
      content.append(columns, paging);
      if (detail.partial)
        content.append(
          el(
            "p",
            "confirmation-detail-note",
            confirmationDetailsLocale.steamProvidedIncompleteItemDataCheckTheRequestTextBeforeConfirming,
          ),
        );
      const lines = detail.lines?.length
        ? detail.lines
        : detail.plainText
          ? [detail.plainText]
          : [];
      if (lines.length) {
        const steamText = el("div", "confirmation-steam-text");
        steamText.append(el("h4", "", confirmationDetailsLocale.steamData));
        for (const line of lines) steamText.append(el("p", "", line));
        content.append(steamText);
      }
      if (detail.lines?.length && detail.plainText) {
        const fullText = el("details", "confirmation-full-text");
        fullText.append(
          el("summary", "", confirmationDetailsLocale.fullSteamText),
          el("p", "", detail.plainText),
        );
        content.append(fullText);
      }
      if (!lines.length && !(detail.items || []).length)
        content.append(
          el(
            "p",
            "muted",
            confirmationDetailsLocale.steamProvidedNoAdditionalDetails,
          ),
        );
    } catch (error) {
      if (active())
        content.replaceChildren(
          el("p", "error", error.message || String(error)),
          btn(confirmationDetailsLocale.tryAgain, () => {
            box.open = false;
            queueMicrotask(() => {
              box.open = true;
            });
          }),
        );
    } finally {
      loading = false;
    }
  };
  box.addEventListener("toggle", () => {
    if (box.open) void load();
  });
  // Visible cards hydrate their collapsed identity and stack preview without
  // opening the disclosure. The account queue serializes network work.
  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void load();
      } else if (!active()) observer.disconnect();
    });
    observer.observe(box);
  }
  return box;
}
