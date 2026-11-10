"use strict";
// Decode only in an expendable worker: image pixels and QR contents never leave
// the local process tree, and cancellation can stop expensive malformed inputs.
const { parentPort, workerData } = require("node:worker_threads");
const jsQR = require("jsqr");
try {
  const { width, height } = workerData;
  const pixels = new Uint8ClampedArray(workerData.pixels);
  const result = jsQR(pixels, width, height, {
    inversionAttempts: "attemptBoth",
  });
  pixels.fill(0);
  parentPort.postMessage(result ? { value: result.data } : { error: true });
} catch {
  parentPort.postMessage({ error: true });
}
