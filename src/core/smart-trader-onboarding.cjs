"use strict";
const { DEFAULT_EXTENSION_ID } = require("./browser-extensions.cjs");
const {
  prepareSmartTraderNativePermission,
} = require("./smart-trader-native-permission.cjs");
const CONSENT_URL = `chrome-extension://${DEFAULT_EXTENSION_ID}/src/consent.html`;
const CHECKBOX_SELECTOR =
  'main > section input[type="checkbox"]:visible:enabled';
const CONFIRM_SELECTOR = 'main > section #answer > button#agree[type="button"]';
// This inspection never changes extension state. Prepared descriptors come only
// from BrowserExtensionManager's signed-package verification. Future versions may
// change checkbox count or language while retaining this consent-page structure.
function inspectConsent(extensionId) {
  if (
    location.href !== `chrome-extension://${extensionId}/src/consent.html` ||
    chrome.runtime.id !== extensionId
  )
    return { status: "unsupported" };
  if (document.readyState !== "complete") return { status: "pending" };
  const sections = [...document.querySelectorAll("main > section")];
  const section = sections.find((s) =>
    s.querySelector('#license-text[role="region"]'),
  );
  const answer = section?.querySelector("#answer");
  const agree = answer?.querySelector('button#agree[type="button"]');
  const later = answer?.querySelector('button#later[type="button"]');
  if (
    sections.length !== 1 ||
    !section ||
    !document.querySelector('h1[data-i18n="consentTitle"]') ||
    !answer ||
    answer.hidden ||
    !agree ||
    !later ||
    agree.parentElement !== answer ||
    later.parentElement !== answer ||
    ![...document.scripts].some(
      (s) => new URL(s.src).pathname === "/src/consent.js",
    )
  )
    return { status: "unsupported" };
  const boxes = [...section.querySelectorAll('input[type="checkbox"]')].filter(
    (b) =>
      !b.disabled &&
      b.getClientRects().length &&
      getComputedStyle(b).visibility !== "hidden",
  );
  if (!boxes.length) return { status: "unsupported" };
  return {
    status: "ready",
    count: boxes.length,
    allChecked: boxes.every((b) => b.checked),
    extensionName: chrome.runtime.getManifest().name,
  };
}

function attachSmartTraderOnboarding(
  context,
  {
    enabled = false,
    extensions = [],
    signal,
    profilePath,
    prepareNativePermission = prepareSmartTraderNativePermission,
  } = {},
) {
  const supported = extensions.some(
    (extension) =>
      extension.id === DEFAULT_EXTENSION_ID &&
      typeof extension.path === "string" &&
      extension.path.length > 0,
  );
  if (!enabled || !supported || signal?.aborted) return () => {};
  let stopped = false;
  const nativeAbort = new AbortController();
  const pages = new Map();
  const detachPage = (page) => {
    const state = pages.get(page);
    if (!state) return;
    clearTimeout(state.timer);
    state.nativeApproval?.cancel();
    page.off("domcontentloaded", state.start);
    page.off("framenavigated", state.navigate);
    page.off("close", state.close);
    pages.delete(page);
  };
  const watch = (page) => {
    if (stopped || pages.has(page)) return;
    const state = {
      timer: null,
      running: false,
      attempts: 0,
      completed: false,
      generation: 0,
      deadline: null,
    };
    const inspect = async () => {
      if (
        stopped ||
        state.running ||
        state.completed ||
        !pages.has(page) ||
        page.url() !== CONSENT_URL
      )
        return;
      if (state.deadline === null) state.deadline = Date.now() + 15000;
      if (Date.now() >= state.deadline) {
        state.completed = true;
        return;
      }
      state.running = true;
      const generation = state.generation;
      let result;
      try {
        result = await page.evaluate(inspectConsent, DEFAULT_EXTENSION_ID);
        if (result.status === "ready") {
          const active = () =>
            !stopped &&
            Date.now() < state.deadline &&
            pages.has(page) &&
            generation === state.generation &&
            page.url() === CONSENT_URL;
          const boxes = page.locator(CHECKBOX_SELECTOR);
          for (let i = 0; i < result.count && active(); i++)
            await boxes.nth(i).setChecked(true, { timeout: 4000 });
          if (active()) {
            const verified = await page.evaluate(
              inspectConsent,
              DEFAULT_EXTENSION_ID,
            );
            if (
              verified.status === "ready" &&
              verified.count === result.count &&
              verified.allChecked &&
              active()
            ) {
              if (typeof verified.extensionName === "string") {
                // Only this verified extension's own trusted consent click can
                // arm native approval. The helper independently scopes the PID,
                // profile, localized extension name, and Chromium dialog class.
                state.nativeApproval = await prepareNativePermission({
                  context,
                  profilePath,
                  extensionName: verified.extensionName,
                  signal: nativeAbort.signal,
                });
              }
              if (active()) {
                state.completed = true; // Never repeat a confirmation attempt.
                await page.locator(CONFIRM_SELECTOR).click({ timeout: 4000 });
                if (active()) await state.nativeApproval?.approve();
              }
              state.nativeApproval?.cancel();
            }
          }
          result = { status: state.completed ? "complete" : "pending" };
        }
      } catch {
        state.nativeApproval?.cancel();
        result = { status: "pending" };
      }
      state.running = false;
      if (stopped || !pages.has(page)) return;
      if (generation !== state.generation) {
        state.start();
        return;
      }
      if (
        state.completed ||
        result.status === "complete" ||
        result.status === "unsupported"
      )
        state.completed = true;
      else if (++state.attempts < 60 && page.url() === CONSENT_URL)
        state.timer = setTimeout(inspect, 250);
    };
    state.start = () => {
      clearTimeout(state.timer);
      void inspect();
    };
    state.navigate = (frame) => {
      if (frame !== page.mainFrame()) return;
      clearTimeout(state.timer);
      state.nativeApproval?.cancel();
      state.generation++;
      state.deadline = null;
      state.completed = false;
      state.attempts = 0;
      state.start();
    };
    state.close = () => detachPage(page);
    pages.set(page, state);
    page.on("domcontentloaded", state.start);
    page.on("framenavigated", state.navigate);
    page.on("close", state.close);
    state.start();
  };
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    nativeAbort.abort();
    context.off("page", watch);
    context.off("close", cleanup);
    signal?.removeEventListener("abort", cleanup);
    for (const page of pages.keys()) detachPage(page);
  };
  context.on("page", watch);
  context.on("close", cleanup);
  signal?.addEventListener("abort", cleanup, { once: true });
  for (const page of context.pages()) watch(page);
  return cleanup;
}
module.exports = { attachSmartTraderOnboarding, CONSENT_URL };
