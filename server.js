require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const requiredVariables = [
  "FIREBASE_PROJECT_ID",
  "DATA_ENCRYPTION_KEY",
  "SESSION_SECRET",
  "ADMIN_PASSWORD_HASH"
];
const missingVariables = requiredVariables.filter(name => !process.env[name]);
if (missingVariables.length) {
  console.error(`Faltan variables de configuración: ${missingVariables.join(", ")}`);
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET debe tener al menos 32 caracteres aleatorios.");
  process.exit(1);
}

const encryptionKey = Buffer.from(process.env.DATA_ENCRYPTION_KEY, "base64");
if (encryptionKey.length !== 32) {
  console.error("DATA_ENCRYPTION_KEY debe ser una clave aleatoria de 32 bytes codificada en base64.");
  process.exit(1);
}

const passwordHashParts = process.env.ADMIN_PASSWORD_HASH.split(":");
if (
  passwordHashParts.length !== 2 ||
  !/^[a-f0-9]{32}$/i.test(passwordHashParts[0]) ||
  !/^[a-f0-9]{128}$/i.test(passwordHashParts[1])
) {
  console.error("ADMIN_PASSWORD_HASH no tiene un formato válido. Ejecuta npm run create-admin-hash.");
  process.exit(1);
}

if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON debe contener un JSON válido.");
      process.exit(1);
    }
    if (
      serviceAccount.type !== "service_account" ||
      serviceAccount.project_id !== process.env.FIREBASE_PROJECT_ID ||
      typeof serviceAccount.private_key !== "string" ||
      typeof serviceAccount.client_email !== "string"
    ) {
      console.error("La cuenta de servicio no coincide con FIREBASE_PROJECT_ID.");
      process.exit(1);
    }
    initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  } else {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }
}

const db = getFirestore();
const productsDocument = db.collection("privateApp").doc("products");
const devicesCollection = db.collection("authorizedDevices");
const pairingCollection = db.collection("devicePairings");
const app = express();
const isProduction = process.env.NODE_ENV === "production";

if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());

const adminCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "strict",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000
};
const deviceCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "strict",
  path: "/",
  maxAge: 365 * 24 * 60 * 60 * 1000
};

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function encryptProducts(products) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ products, updatedAt: new Date().toISOString() }), "utf8"),
    cipher.final()
  ]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptProducts(document) {
  if (!document.exists) return { products: [], updatedAt: null };
  const stored = document.data();
  if (stored.version !== 1 || !stored.iv || !stored.tag || !stored.ciphertext) {
    throw new Error("El documento cifrado tiene un formato no compatible.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(stored.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(stored.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
  const value = JSON.parse(plaintext);
  if (!value || !Array.isArray(value.products)) {
    throw new Error("Los datos descifrados no son una lista.");
  }
  return {
    products: value.products,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null
  };
}

function createAdminSession() {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + adminCookieOptions.maxAge
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function getAdminSessionExpiry(value) {
  if (typeof value !== "string") return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const expiresAt = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp;
    return expiresAt > Date.now() ? expiresAt : null;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const expiresAt = getAdminSessionExpiry(req.cookies.admin_session);
  if (expiresAt) {
    req.adminSessionExpiresAt = expiresAt;
    return next();
  }
  return res.status(401).json({ error: "Inicia sesión como administrador." });
}

function getDeviceToken(req) {
  const authorization = req.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return bearer || req.cookies.device_token || "";
}

async function requireDevice(req, res, next) {
  const token = getDeviceToken(req);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return res.status(401).json({ error: "Esta tableta debe ser autorizada por el administrador." });
  }
  try {
    const snapshot = await devicesCollection.doc(hash(token)).get();
    if (!snapshot.exists || snapshot.data().active !== true) {
      res.clearCookie("device_token", { ...deviceCookieOptions, maxAge: undefined });
      return res.status(401).json({ error: "Esta tableta ya no está autorizada." });
    }
    req.authorizedDevice = snapshot.data();
    req.deviceTokenHash = hash(token);
    req.authorizedDeviceReference = devicesCollection.doc(req.deviceTokenHash);
    return next();
  } catch (error) {
    console.error("Error verificando autorización de tableta.", error);
    return res.status(503).json({ error: "No se pudo verificar la tableta. Intenta de nuevo." });
  }
}

function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  if (!origin || origin !== expectedOrigin) {
    return res.status(403).json({ error: "Solicitud no permitida." });
  }
  return next();
}

function normalizeProducts(value) {
  if (!Array.isArray(value) || value.length > 2000) {
    throw new Error("La lista no es válida.");
  }
  return value.map(product => {
    if (
      !product ||
      typeof product.id !== "string" ||
      product.id.length > 80 ||
      typeof product.name !== "string" ||
      !product.name.trim() ||
      product.name.trim().length > 80 ||
      !Number.isFinite(product.tablePrice) ||
      product.tablePrice < 0 ||
      !Number.isFinite(product.boxPrice) ||
      product.boxPrice < 0
    ) {
      throw new Error("Cada producto debe tener nombre y precios válidos.");
    }
    return {
      id: product.id,
      name: product.name.trim(),
      tablePrice: product.tablePrice,
      boxPrice: product.boxPrice
    };
  });
}

async function getDecryptedProducts() {
  return decryptProducts(await productsDocument.get());
}

function sendProductStream(res, snapshot) {
  try {
    const value = decryptProducts(snapshot);
    res.write(`data: ${JSON.stringify(value)}\n\n`);
  } catch (error) {
    console.error("No se pudieron descifrar los productos para la transmisión.", error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "No se pudieron leer los precios." })}\n\n`);
  }
}

function openProductStream(res, documentReference, authorizationReference, maxLifetimeMs) {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  let closed = false;
  let unsubscribeProducts = () => {};
  let unsubscribeAuthorization = () => {};
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25000);
  const sessionExpiry = setTimeout(
    () => res.end(),
    Math.min(Math.max(0, maxLifetimeMs), 2147483647)
  );
  const closeStream = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    clearTimeout(sessionExpiry);
    unsubscribeProducts();
    unsubscribeAuthorization();
  };
  unsubscribeProducts = documentReference.onSnapshot(
    snapshot => sendProductStream(res, snapshot),
    error => {
      console.error("Se interrumpió la transmisión de precios.", error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Se perdió la conexión en vivo." })}\n\n`);
      res.end();
      closeStream();
    }
  );
  if (authorizationReference) {
    unsubscribeAuthorization = authorizationReference.onSnapshot(snapshot => {
      if (!snapshot.exists || snapshot.data().active !== true) {
        res.write("event: revoked\ndata: {}\n\n");
        res.end();
        closeStream();
      }
    }, error => {
      console.error("No se pudo verificar el acceso de la tableta conectada.", error);
      res.end();
      closeStream();
    });
  }
  res.on("close", closeStream);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." }
});
const pairingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de vinculación. Espera 15 minutos." }
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/app.js", (req, res) => res.sendFile(path.join(__dirname, "app.js")));
app.get("/colorado.png", (req, res) => res.sendFile(path.join(__dirname, "colorado.png")));

app.post("/api/admin/login", requireSameOrigin, loginLimiter, (req, res) => {
  const password = req.body && req.body.password;
  if (typeof password !== "string" || password.length > 256) {
    return res.status(400).json({ error: "Escribe la contraseña." });
  }
  const [saltHex, hashHex] = passwordHashParts;
  const expected = Buffer.from(hashHex, "hex");
  crypto.scrypt(password, Buffer.from(saltHex, "hex"), expected.length, (error, actual) => {
    if (error) {
      console.error("No se pudo validar la contraseña de administrador.", error);
      return res.status(500).json({ error: "No se pudo verificar la contraseña." });
    }
    if (!crypto.timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: "Contraseña incorrecta." });
    }
    res.cookie("admin_session", createAdminSession(), adminCookieOptions);
    return res.json({ authenticated: true });
  });
});

app.post("/api/admin/logout", requireSameOrigin, (req, res) => {
  res.clearCookie("admin_session", { ...adminCookieOptions, maxAge: undefined });
  return res.json({ authenticated: false });
});

app.get("/api/admin/session", requireAdmin, (req, res) => res.json({ authenticated: true }));

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    return res.json(await getDecryptedProducts());
  } catch (error) {
    console.error("No se pudieron leer los productos cifrados.", error);
    return res.status(500).json({ error: "No se pudieron leer los precios." });
  }
});

app.put("/api/admin/products", requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const products = normalizeProducts(req.body && req.body.products);
    await productsDocument.set(encryptProducts(products));
    return res.json({ saved: true });
  } catch (error) {
    if (error.message.includes("no es válida") || error.message.includes("Cada producto")) {
      return res.status(400).json({ error: error.message });
    }
    console.error("No se pudieron guardar los productos cifrados.", error);
    return res.status(500).json({ error: "No se pudieron guardar los precios." });
  }
});

app.post("/api/admin/pairing-codes", requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const code = crypto.randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    await pairingCollection.doc(hash(code)).create({ expiresAt, used: false });
    return res.json({ code, expiresAt });
  } catch (error) {
    console.error("No se pudo crear el código de autorización.", error);
    return res.status(500).json({ error: "No se pudo crear el código." });
  }
});

app.get("/api/admin/devices", requireAdmin, async (req, res) => {
  try {
    const snapshot = await devicesCollection.where("active", "==", true).get();
    const devices = snapshot.docs.map(document => ({
      id: document.id,
      name: document.data().name,
      createdAt: document.data().createdAt || null
    }));
    return res.json({ devices });
  } catch (error) {
    console.error("No se pudo cargar la lista de tabletas.", error);
    return res.status(500).json({ error: "No se pudo cargar la lista de tabletas." });
  }
});

app.delete("/api/admin/devices/:id", requireSameOrigin, requireAdmin, async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.id)) {
    return res.status(400).json({ error: "Identificador de tableta no válido." });
  }
  try {
    await devicesCollection.doc(req.params.id).delete();
    return res.json({ revoked: true });
  } catch (error) {
    console.error("No se pudo revocar la tableta.", error);
    return res.status(500).json({ error: "No se pudo revocar la tableta." });
  }
});

app.post("/api/device/pair", requireSameOrigin, pairingLimiter, async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "Tableta del negocio";
  if (!/^[A-F0-9]{12}$/.test(code)) {
    return res.status(400).json({ error: "El código debe tener 12 caracteres." });
  }

  const pairingReference = pairingCollection.doc(hash(code));
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hash(token);
  try {
    await db.runTransaction(async transaction => {
      const pairing = await transaction.get(pairingReference);
      if (!pairing.exists || pairing.data().used || pairing.data().expiresAt < Date.now()) {
        throw new Error("PAIRING_CODE_INVALID");
      }
      transaction.update(pairingReference, { used: true });
      transaction.create(devicesCollection.doc(tokenHash), {
        active: true,
        name: name || "Tableta del negocio",
        createdAt: new Date().toISOString()
      });
    });
    res.cookie("device_token", token, deviceCookieOptions);
    return res.json({ paired: true });
  } catch (error) {
    if (error.message === "PAIRING_CODE_INVALID") {
      return res.status(401).json({ error: "Código inválido, vencido o ya utilizado." });
    }
    console.error("No se pudo vincular la tableta.", error);
    return res.status(500).json({ error: "No se pudo vincular la tableta." });
  }
});

app.post("/api/device/unpair", requireSameOrigin, (req, res) => {
  res.clearCookie("device_token", { ...deviceCookieOptions, maxAge: undefined });
  return res.json({ paired: false });
});

app.get("/api/products", requireDevice, async (req, res) => {
  try {
    return res.json(await getDecryptedProducts());
  } catch (error) {
    console.error("No se pudieron leer los productos cifrados.", error);
    return res.status(500).json({ error: "No se pudieron leer los precios." });
  }
});

app.get("/api/products/stream", requireDevice, (req, res) => {
  openProductStream(res, productsDocument, req.authorizedDeviceReference, deviceCookieOptions.maxAge);
});

app.get("/api/admin/products/stream", requireAdmin, (req, res) => {
  openProductStream(res, productsDocument, null, req.adminSessionExpiresAt - Date.now());
});

app.use((error, req, res, next) => {
  console.error("Error inesperado en el servidor.", error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: "Ocurrió un error inesperado." });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Lista de precios disponible en el puerto ${port}.`);
});
