"use strict";
const localeText = require("../locales/application.json");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { imageSize } = require("image-size");
const LIMITS = Object.freeze({
  files: 32,
  fileBytes: 8 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  pixels: 8 * 1024 * 1024,
  side: 4096,
  textBytes: 256 * 1024,
});
class ImportFileError extends Error {}
function cancelled(signal) {
  if (signal?.aborted) throw Error(localeText.message_8ee986f);
}
function checkDimensions(width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > LIMITS.side ||
    height > LIMITS.side ||
    width * height > LIMITS.pixels
  )
    throw Error(localeText.message_3ad597e);
}
function decodeQr({ data, width, height }, signal) {
  cancelled(signal);
  checkDimensions(width, height);
  if (
    !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
    data.byteLength !== width * height * 4
  )
    throw Error(localeText.message_45312a1);
  return new Promise((resolve, reject) => {
    const pixels = Uint8Array.from(data);
    const worker = new Worker(
      path.join(__dirname, "authenticator-qr-worker.cjs"),
      {
        workerData: { pixels: pixels.buffer, width, height },
        transferList: [pixels.buffer],
        resourceLimits: {
          maxOldGenerationSizeMb: 192,
          maxYoungGenerationSizeMb: 32,
        },
      },
    );
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(Error(localeText.message_8ee986f));
    const timer = setTimeout(
      () => finish(Error(localeText.message_5b79c11)),
      10000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.once("error", () => finish(Error(localeText.message_45312a1)));
    worker.once("exit", () => {
      if (!done) finish(Error(localeText.message_ecd8587));
    });
    worker.once("message", (result) => {
      if (
        result.error ||
        typeof result.value !== "string" ||
        !result.value ||
        result.value.length > LIMITS.textBytes
      )
        finish(Error(localeText.message_69603be));
      else finish(null, result.value);
    });
    if (signal?.aborted) abort();
  });
}
async function readBounded(file, limit) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > limit)
      throw new ImportFileError(localeText.message_bcc8a1b);
    const data = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await handle.read(
        data,
        offset,
        data.length - offset,
        offset,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size)
      throw new ImportFileError(localeText.message_20401a5);
    return data.subarray(0, offset);
  } finally {
    await handle.close();
  }
}
async function readAuthenticatorFiles(paths, { decodeImage, signal } = {}) {
  if (
    !Array.isArray(paths) ||
    !paths.length ||
    paths.length > LIMITS.files ||
    paths.some((p) => typeof p !== "string")
  )
    throw Error(localeText.message_68b6054);
  let total = 0;
  const values = [];
  for (const file of paths) {
    cancelled(signal);
    const extension = path.extname(file).toLowerCase();
    if (![".txt", ".png", ".jpg", ".jpeg", ".webp"].includes(extension))
      throw Error(localeText.message_9b4385c);
    let bytes;
    try {
      bytes = await readBounded(
        file,
        extension === ".txt" ? LIMITS.textBytes : LIMITS.fileBytes,
      );
    } catch (error) {
      if (error instanceof ImportFileError) throw error;
      throw Error(localeText.message_6abe3de);
    }
    try {
      total += bytes.length;
      if (total > LIMITS.totalBytes) throw Error(localeText.message_d4904b3);
      cancelled(signal);
      if (extension === ".txt") {
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          throw Error(localeText.message_4d9da56);
        }
        values.push(text.replace(/^\uFEFF/, ""));
      } else {
        let dimensions;
        try {
          dimensions = imageSize(bytes);
        } catch {
          throw Error(localeText.message_45312a1);
        }
        if (!["png", "jpg", "webp"].includes(dimensions.type))
          throw Error(localeText.message_95df329);
        checkDimensions(dimensions.width, dimensions.height);
        let bitmap;
        try {
          bitmap = decodeImage(bytes);
        } catch {
          throw Error(localeText.message_45312a1);
        }
        try {
          values.push(await decodeQr(bitmap, signal));
        } finally {
          bitmap?.data?.fill?.(0);
        }
      }
    } finally {
      bytes.fill(0);
    }
  }
  cancelled(signal);
  return values;
}
module.exports = { readAuthenticatorFiles, decodeQr, LIMITS };
