"use strict";
async function runTaskPool(
  items,
  task,
  {
    concurrency = 8,
    startIntervalMs = 100,
    isCancelled = () => false,
    signal,
    onActive = () => {},
  } = {},
) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
    throw Error("Concurrency must be an integer from 1 to 16.");
  if (
    !Number.isInteger(startIntervalMs) ||
    startIntervalMs < 0 ||
    startIntervalMs > 60000
  )
    throw Error("Start interval must be an integer from 0 to 60000 ms.");
  const input = Array.from(items),
    results = new Array(input.length),
    active = new Map();
  let failure,
    failed = false,
    lastStart = null,
    wake;
  const fail = (error) => {
    if (!failed) {
      failed = true;
      failure = error;
    }
    wake?.();
  };
  const cancelled = () => signal?.aborted || isCancelled();
  const pause = (ms) =>
    new Promise((resolve) => {
      let timer;
      const finish = () => {
        wake = null;
        clearTimeout(timer);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      wake = finish;
      signal?.addEventListener("abort", finish, { once: true });
      timer = setTimeout(finish, ms);
      if (signal?.aborted) finish();
    });
  try {
    for (let index = 0; index < input.length; index++) {
      while (active.size >= concurrency && !failed && !cancelled())
        await Promise.race([...active.values()].map((entry) => entry.promise));
      if (failed || cancelled()) break;
      if (lastStart !== null) {
        const remaining = startIntervalMs - (performance.now() - lastStart);
        if (remaining > 0) await pause(Math.ceil(remaining));
      }
      if (failed || cancelled()) break;
      const entry = { item: input[index], promise: null };
      active.set(index, entry);
      lastStart = performance.now();
      entry.promise = (async () => {
        onActive([...active.values()].map((value) => value.item));
        if (!cancelled()) return await task(input[index], index);
      })()
        .then((result) => {
          results[index] = result;
        })
        .catch((error) => {
          fail(error);
        })
        .finally(() => {
          active.delete(index);
          try {
            onActive([...active.values()].map((value) => value.item));
          } catch (error) {
            fail(error);
          }
        });
    }
  } catch (error) {
    fail(error);
  } finally {
    await Promise.allSettled(
      [...active.values()].map((entry) => entry.promise),
    );
  }
  if (failed) throw failure;
  return results;
}
module.exports = { runTaskPool };
