"use strict";
// Loopback relay for one account. DNS for destination names is delegated to the
// selected upstream. No destination socket is ever opened by this process.
const http = require("node:http"),
  net = require("node:net"),
  tls = require("node:tls"),
  crypto = require("node:crypto");
const { validateProxy } = require("./transport.cjs");
const fail = () => Error("Browser proxy connection failed");
function targetFor(raw, connect = false) {
  if (typeof raw !== "string" || raw.length > 8192 || /[\r\n\0]/.test(raw))
    throw fail();
  let u;
  try {
    u = new URL(connect ? `http://${raw}` : raw);
  } catch {
    throw fail();
  }
  const host = u.hostname.toLowerCase();
  if (
    (!connect && !["http:", "ws:"].includes(u.protocol)) ||
    u.username ||
    u.password ||
    u.hash ||
    (connect && (u.pathname !== "/" || u.search)) ||
    !host.includes(".") ||
    host.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/.test(
      host,
    ) ||
    net.isIP(host) ||
    /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|onion)$/.test(
      host,
    )
  )
    throw fail();
  const port = Number(u.port || (connect ? 80 : 80));
  if (![80, 443].includes(port) || (!connect && port !== 80)) throw fail();
  return { host, port, path: u.pathname + u.search };
}
function read(socket, n) {
  return new Promise((resolve, reject) => {
    const clean = () => {
      socket.off("readable", available);
      socket.off("error", bad);
      socket.off("end", bad);
      socket.off("close", bad);
    };
    const bad = () => {
      clean();
      reject(fail());
    };
    const available = () => {
      const value = socket.read(n);
      if (value !== null) {
        clean();
        resolve(value);
      }
    };
    socket.on("readable", available);
    socket.once("error", bad);
    socket.once("end", bad);
    socket.once("close", bad);
    if (socket.destroyed || socket.readableEnded) bad();
    else available();
  });
}
function headersFor(req, target) {
  const blocked = new Set([
    "proxy-authorization",
    "proxy-authenticate",
    "proxy-connection",
    "connection",
    "keep-alive",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
  ]);
  for (const value of String(req.headers.connection || "").split(","))
    blocked.add(value.trim().toLowerCase());
  const headers = {};
  for (const [k, v] of Object.entries(req.headers))
    if (!blocked.has(k)) headers[k] = v;
  if (target)
    headers.host = target.host + (target.port === 80 ? "" : ":" + target.port);
  headers.connection = "close";
  return headers;
}
async function createBrowserProxy({
  proxy,
  handshakeTimeoutMs = 10000,
  maxConnections = 64,
  idleTimeoutMs = 120000,
} = {}) {
  const upstream = new URL(
    validateProxy(typeof proxy === "string" ? proxy : proxy?.url),
  );
  for (const [value, min, max] of [
    [handshakeTimeoutMs, 100, 30000],
    [maxConnections, 1, 256],
    [idleTimeoutMs, 1000, 3600000],
  ])
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw fail();
  const username = crypto.randomBytes(24).toString("hex"),
    password = crypto.randomBytes(32).toString("hex"),
    authorization = Buffer.from(
      "Basic " + Buffer.from(username + ":" + password).toString("base64"),
    );
  function authenticated(req) {
    const supplied = req.headers["proxy-authorization"];
    if (typeof supplied !== "string") return false;
    const value = Buffer.from(supplied);
    return (
      value.length === authorization.length &&
      crypto.timingSafeEqual(value, authorization)
    );
  }
  const challenge = {
    "Proxy-Authenticate": 'Basic realm="smart-auth browser relay"',
    Connection: "close",
    "Content-Length": "0",
  };
  function challengeSocket(client) {
    client.end(
      "HTTP/1.1 407 Proxy Authentication Required\r\n" +
        Object.entries(challenge)
          .map(([k, v]) => k + ": " + v + "\r\n")
          .join("") +
        "\r\n",
    );
  }
  let closed = false;
  const sockets = new Set(),
    clients = new Set();
  const track = (s) => {
    sockets.add(s);
    s.on("error", () => {});
    s.once("close", () => sockets.delete(s));
    s.setTimeout(idleTimeoutMs, () => s.destroy());
    if (closed) s.destroy();
    return s;
  };
  async function tunnel(target, owner) {
    if (closed) throw fail();
    const hostname = upstream.hostname.replace(/^\[|\]$/g, "");
    const s = track(
      upstream.protocol === "https:"
        ? tls.connect({
            host: hostname,
            port: Number(upstream.port) || 443,
            servername: net.isIP(hostname) ? undefined : hostname,
            rejectUnauthorized: true,
            ALPNProtocols: ["http/1.1"],
          })
        : net.connect({
            host: hostname,
            port:
              Number(upstream.port) ||
              (upstream.protocol === "http:" ? 80 : 1080),
          }),
    );
    const timer = setTimeout(() => s.destroy(), handshakeTimeoutMs);
    const cancel = () => s.destroy();
    owner.once("close", cancel);
    owner.once("end", cancel);
    s.once("close", () => {
      owner.off("close", cancel);
      owner.off("end", cancel);
    });
    if (owner.destroyed) s.destroy();
    try {
      await new Promise((resolve, reject) => {
        const event =
          upstream.protocol === "https:" ? "secureConnect" : "connect";
        const cleanup = () => {
          s.off(event, ok);
          s.off("error", bad);
          s.off("close", bad);
        };
        const ok = () => {
            cleanup();
            resolve();
          },
          bad = () => {
            cleanup();
            reject(fail());
          };
        s.once(event, ok);
        s.once("error", bad);
        s.once("close", bad);
      });
      if (upstream.protocol === "socks5h:") {
        const user = Buffer.from(decodeURIComponent(upstream.username)),
          pass = Buffer.from(decodeURIComponent(upstream.password));
        if (user.length > 255 || pass.length > 255) throw fail();
        const auth = user.length || pass.length;
        s.write(Buffer.from(auth ? [5, 1, 2] : [5, 1, 0]));
        const greeting = await read(s, 2);
        if (greeting[0] !== 5 || greeting[1] !== (auth ? 2 : 0)) throw fail();
        if (auth) {
          s.write(
            Buffer.concat([
              Buffer.from([1, user.length]),
              user,
              Buffer.from([pass.length]),
              pass,
            ]),
          );
          const a = await read(s, 2);
          if (a[0] !== 1 || a[1] !== 0) throw fail();
        }
        const host = Buffer.from(target.host, "ascii"),
          port = Buffer.alloc(2);
        port.writeUInt16BE(target.port);
        s.write(
          Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, port]),
        );
        const response = await read(s, 4);
        if (response[0] !== 5 || response[1] !== 0 || response[2] !== 0)
          throw fail();
        if (response[3] === 1) await read(s, 6);
        else if (response[3] === 4) await read(s, 18);
        else if (response[3] === 3) {
          const n = await read(s, 1);
          await read(s, n[0] + 2);
        } else throw fail();
      } else {
        const auth =
          upstream.username || upstream.password
            ? `Proxy-Authorization: Basic ${Buffer.from(decodeURIComponent(upstream.username) + ":" + decodeURIComponent(upstream.password)).toString("base64")}\r\n`
            : "";
        s.write(
          `CONNECT ${target.host}:${target.port} HTTP/1.1\r\nHost: ${target.host}:${target.port}\r\n${auth}Proxy-Connection: close\r\n\r\n`,
        );
        let header = "";
        while (!header.endsWith("\r\n\r\n")) {
          if (header.length >= 16384) throw fail();
          header += (await read(s, 1)).toString("latin1");
        }
        if (!/^HTTP\/1\.[01] 200(?: |\r\n)/.test(header)) throw fail();
      }
      if (closed || s.destroyed) throw fail();
      return s;
    } catch {
      s.destroy();
      throw fail();
    } finally {
      clearTimeout(timer);
    }
  }
  const server = http.createServer(
    { maxHeaderSize: 16384 },
    async (req, res) => {
      req.on("error", () => {});
      if (!authenticated(req)) {
        res.writeHead(407, challenge);
        res.end();
        return;
      }
      let socket, agent;
      try {
        const target = targetFor(req.url);
        socket = await tunnel(target, req.socket);
        if (req.destroyed || res.destroyed) {
          socket.destroy();
          return;
        }
        agent = new http.Agent({ keepAlive: false });
        agent.createConnection = () => socket;
        const outbound = http.request(
          {
            hostname: target.host,
            port: target.port,
            path: target.path,
            method: req.method,
            headers: headersFor(req, target),
            agent,
          },
          (incoming) => {
            res.writeHead(
              incoming.statusCode,
              headersFor({ headers: incoming.headers }),
            );
            incoming.pipe(res);
            incoming.on("error", () => res.destroy());
          },
        );
        outbound.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end("Browser proxy connection failed");
        });
        res.once("close", () => {
          outbound.destroy();
          socket.destroy();
          agent.destroy();
        });
        req.pipe(outbound);
      } catch {
        socket?.destroy();
        agent?.destroy();
        if (!res.headersSent) res.writeHead(502);
        res.end("Browser proxy connection failed");
      }
    },
  );
  server.on("connect", async (req, client, head) => {
    if (!authenticated(req)) return challengeSocket(client);
    try {
      const target = targetFor(req.url, true),
        socket = await tunnel(target, client);
      if (client.destroyed) {
        socket.destroy();
        return;
      }
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) socket.write(head);
      client.pipe(socket);
      socket.pipe(client);
      client.once("close", () => socket.destroy());
      socket.once("close", () => client.destroy());
    } catch {
      client.end(
        "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
    }
  });
  server.on("upgrade", async (req, client, head) => {
    if (!authenticated(req)) return challengeSocket(client);
    try {
      if (String(req.headers.upgrade).toLowerCase() !== "websocket")
        throw fail();
      const target = targetFor(req.url),
        socket = await tunnel(target, client);
      if (client.destroyed) {
        socket.destroy();
        return;
      }
      const headers = headersFor(req, target);
      headers.connection = "Upgrade";
      headers.upgrade = "websocket";
      socket.write(
        `${req.method} ${target.path} HTTP/1.1\r\n` +
          Object.entries(headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`)
            .join("") +
          "\r\n",
      );
      if (head.length) socket.write(head);
      client.pipe(socket);
      socket.pipe(client);
      client.once("close", () => socket.destroy());
      socket.once("close", () => client.destroy());
    } catch {
      client.destroy();
    }
  });
  server.on("connection", (s) => {
    if (closed || clients.size >= maxConnections) {
      s.destroy();
      return;
    }
    clients.add(s);
    track(s);
    s.once("close", () => clients.delete(s));
  });
  server.on("clientError", (_e, s) => s.destroy());
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 1000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return Object.freeze({
    url: `http://127.0.0.1:${server.address().port}`,
    username,
    password,
    async close() {
      if (closed) return;
      closed = true;
      for (const s of sockets) s.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  });
}
module.exports = { createBrowserProxy };
