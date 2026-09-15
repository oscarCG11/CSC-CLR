/**
 * Servidor HTTP para el sistema de datos compartidos.
 * Proporciona una API para almacenar y recuperar datos en un archivo JSON.
 * También sirve archivos estáticos desde el directorio raíz.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/**
 * Puerto en el que escucha el servidor.
 */
const puerto = 8000;
const raiz = __dirname;
const archivoDatos = path.join(raiz, "datos-compartidos.json");
const directorioDocumentos = path.join(raiz, "documentos-pdf");
const claveDocumentos = "__historial_documentos_pdf__";
const idDocumentosFirebase = "historial_documentos_pdf";
const limiteDocumento = 25 * 1024 * 1024;
const tipos = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
let db = null;

try {
    const archivoCredenciales = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(raiz, "firebase-service-account.json");
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        const credenciales = {
            project_id: process.env.FIREBASE_PROJECT_ID,
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        };
        admin.initializeApp({ credential: admin.cert(credenciales) });
        db = getFirestore();
        console.log("Firebase Firestore conectado.");
    } else if (fs.existsSync(archivoCredenciales)) {
        const credenciales = require(archivoCredenciales);
        admin.initializeApp({ credential: admin.cert(credenciales) });
        db = getFirestore();
        console.log("Firebase Firestore conectado.");
    }
} catch (error) {
    console.error("Firebase no configurado. Usando almacenamiento local:", error.message);
}

function crearHashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
}
function verificarPassword(password, almacenada) {
    const partes = String(almacenada || "").split("$");
    if (partes.length !== 3 || partes[0] !== "scrypt") return false;
    const hash = crypto.scryptSync(password, partes[1], 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(partes[2], "hex"));
}

/**
 * 
 * @returns 
 */
function leerBase() {
    try { return JSON.parse(fs.readFileSync(archivoDatos, "utf8")); }
    catch { return {}; }
}
/**
 * Guarda la base de datos en el archivo JSON.
 * @param {Object} base - La base de datos a guardar.
 */
function guardarBase(base) {
    fs.writeFileSync(archivoDatos, JSON.stringify(base, null, 2), "utf8");
    if (db) {
        guardarBaseFirebase(base).catch(() => {});
    }
}
function idFirebase(clave) {
    return clave === claveDocumentos ? idDocumentosFirebase : clave;
}
function claveDesdeFirebase(id) {
    return id === idDocumentosFirebase ? claveDocumentos : id;
}
function leerDocumentos() {
    const base = leerBase();
    return Array.isArray(base[claveDocumentos]) ? base[claveDocumentos] : [];
}
function guardarDocumentos(documentos) {
    const base = leerBase();
    base[claveDocumentos] = documentos;
    guardarBase(base);
}

async function leerBaseFirebase() {
    if (!db) return null;
    try {
        const snapshot = await db.collection("appData").get();
        const datos = {};
        snapshot.forEach((documento) => {
            datos[claveDesdeFirebase(documento.id)] = documento.data().valor;
        });
        return datos;
    } catch {
        return null;
    }
}

async function guardarBaseFirebase(base) {
    if (!db) return;
    try {
        const batch = db.batch();
        Object.entries(base).forEach(([clave, valor]) => {
            batch.set(db.collection("appData").doc(idFirebase(clave)), { valor });
        });
        await batch.commit();
    } catch {
        // Se mantiene como respaldo local si no hay conexión.
    }
}

async function asegurarColeccionesFirebase() {
    if (!db) return;
    const colecciones = [
        "usuarios",
        "sucursales",
        "inventarios",
        "checklists",
        "bajas",
        "documentos",
        "appData"
    ];
    for (const nombre of colecciones) {
        try {
            const snapshot = await db.collection(nombre).limit(1).get();
            if (!snapshot.empty) continue;
            await db.collection(nombre).doc("seed").set({ createdAt: new Date().toISOString(), inicializado: true });
        } catch {
            // La colección se crea al escribir datos reales.
        }
    }

    try {
        const usuarios = db.collection("usuarios");
        const doc = await usuarios.doc("Oscar").get();
        if (!doc.exists) {
            await usuarios.doc("Oscar").set({
                usuario: "Oscar",
                passwordHash: crearHashPassword(process.env.ADMIN_PASSWORD || (() => { throw new Error("ADMIN_PASSWORD no configurada"); })()),
                nombre: "Oscar",
                rol: "admin",
                activo: true,
                createdAt: new Date().toISOString()
            });
        } else if (doc.data().password && !doc.data().passwordHash) {
            await usuarios.doc("Oscar").update({ passwordHash: crearHashPassword(doc.data().password), password: FieldValue.delete() });
        }
    } catch {
        // Si no se alcanza Firebase, se usa el respaldo local.
    }
}

async function inicializarFirebase() {
    await asegurarColeccionesFirebase();
    await guardarBaseFirebase(leerBase());
}

inicializarFirebase().catch((error) => {
    console.error("No se pudieron crear las colecciones de Firebase:", error.message);
});
/**
 * Envía una respuesta HTTP.
 * @param {*} respuesta 
 * @param {*} codigo 
 * @param {*} contenido 
 * @param {*} tipo 
 */
function responder(respuesta, codigo, contenido, tipo = "application/json; charset=utf-8") {
    respuesta.writeHead(codigo, { "Content-Type": tipo });
    respuesta.end(contenido);
}
/* Servidor HTTP 
*/
http.createServer((solicitud, respuesta) => {
    const url = new URL(solicitud.url, "http://localhost");
    if (url.pathname === "/api/login" && solicitud.method === "POST") {
        let cuerpo = "";
        solicitud.on("data", (parte) => { cuerpo += parte; });
        solicitud.on("end", async () => {
            try {
                const datos = JSON.parse(cuerpo);
                const usuario = String(datos.usuario || "").trim();
                const password = String(datos.password || "");
                const base = db ? await leerBaseFirebase() : null;
                const usuarios = db ? await db.collection("usuarios").get() : null;
                const registro = usuarios?.docs.find((documento) => documento.data().usuario?.toLowerCase() === usuario.toLowerCase())?.data();
                const valido = registro?.passwordHash ? verificarPassword(password, registro.passwordHash) : false;
                if (!valido) return responder(respuesta, 401, JSON.stringify({ error: "Usuario o contraseña incorrectos" }));
                return responder(respuesta, 200, JSON.stringify({ ok: true, usuario: registro.usuario, nombre: registro.nombre || registro.usuario }));
            } catch { return responder(respuesta, 400, JSON.stringify({ error: "Solicitud invalida" })); }
        });
        return;
    }
    if (url.pathname === "/api/documentos" && solicitud.method === "GET") {
        return responder(respuesta, 200, JSON.stringify({ documentos: leerDocumentos() }));
    }
    if (url.pathname === "/api/documentos" && solicitud.method === "POST") {
        let cuerpo = "";
        solicitud.on("data", (parte) => {
            cuerpo += parte;
            if (cuerpo.length > limiteDocumento * 1.4) solicitud.destroy();
        });
        solicitud.on("end", () => {
            try {
                const dato = JSON.parse(cuerpo);
                const contenido = String(dato.contenido || "");
                const nombre = String(dato.nombre || "documento.pdf").trim().slice(0, 160);
                if (!/^data:application\/pdf;base64,/i.test(contenido)) throw new Error("PDF invalido");
                const base64 = contenido.replace(/^data:application\/pdf;base64,/i, "");
                const tamano = Buffer.byteLength(base64, "base64");
                if (!tamano || tamano > limiteDocumento || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("Tamaño invalido");
                fs.mkdirSync(directorioDocumentos, { recursive: true });
                const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                const archivo = id + ".pdf";
                fs.writeFileSync(path.join(directorioDocumentos, archivo), Buffer.from(base64, "base64"));
                const documento = {
                    id, nombre: nombre.toLowerCase().endsWith(".pdf") ? nombre : nombre + ".pdf",
                    sucursal: String(dato.sucursal || "Todas las sucursales").trim().slice(0, 120),
                    descripcion: String(dato.descripcion || "").trim().slice(0, 300),
                    tamano, fecha: new Date().toISOString(), archivo
                };
                guardarDocumentos([documento, ...leerDocumentos()]);
                responder(respuesta, 201, JSON.stringify({ ok: true, documento }));
            } catch { responder(respuesta, 400, JSON.stringify({ error: "Documento PDF invalido" })); }
        });
        return;
    }
    if (url.pathname.startsWith("/api/documentos/") && solicitud.method === "GET") {
        const id = decodeURIComponent(url.pathname.slice("/api/documentos/".length));
        const documento = leerDocumentos().find((item) => item.id === id);
        if (!documento || !/^[\w-]+\.pdf$/u.test(documento.archivo)) return responder(respuesta, 404, "No encontrado", "text/plain");
        const archivo = path.join(directorioDocumentos, documento.archivo);
        return fs.readFile(archivo, (error, contenido) => {
            if (error) return responder(respuesta, 404, "No encontrado", "text/plain");
            respuesta.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(documento.nombre)}"` });
            respuesta.end(contenido);
        });
    }
    if (url.pathname.startsWith("/api/datos/")) {
        const clave = decodeURIComponent(url.pathname.slice("/api/datos/".length));
        if (!/^[\w ._-]+$/u.test(clave)) return responder(respuesta, 400, JSON.stringify({ error: "Clave no valida" }));
        if (solicitud.method === "GET") {
            return leerBaseFirebase().then((baseRemota) => {
                const base = baseRemota || leerBase();
                responder(respuesta, 200, JSON.stringify({ existe: Object.hasOwn(base, clave), valor: base[clave] }));
            }).catch(() => {
                const base = leerBase();
                responder(respuesta, 200, JSON.stringify({ existe: Object.hasOwn(base, clave), valor: base[clave] }));
            });
        }
        if (solicitud.method === "PUT") {
            let cuerpo = "";
            solicitud.on("data", (parte) => {
                cuerpo += parte;
                if (cuerpo.length > 12 * 1024 * 1024) solicitud.destroy();
            });
            solicitud.on("end", () => {
                try {
                    const dato = JSON.parse(cuerpo);
                    const base = leerBase();
                    base[clave] = dato.valor;
                    guardarBase(base);
                    responder(respuesta, 200, JSON.stringify({ ok: true }));
                } catch { responder(respuesta, 400, JSON.stringify({ error: "Datos invalidos" })); }
            });
            return;
        }
        return responder(respuesta, 405, JSON.stringify({ error: "Metodo no permitido" }));
    }
/* Servidor HTTP */
    const archivoSolicitado = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const archivo = path.resolve(raiz, archivoSolicitado);
    if (!archivo.startsWith(raiz + path.sep) && archivo !== path.join(raiz, "index.html")) return responder(respuesta, 403, "Prohibido", "text/plain");
    fs.readFile(archivo, (error, contenido) => {
        if (error) return responder(respuesta, 404, "No encontrado", "text/plain");
        responder(respuesta, 200, contenido, tipos[path.extname(archivo).toLowerCase()] || "application/octet-stream");
    });
}).listen(puerto, "0.0.0.0", () => {
    console.log("Sistema disponible en http://localhost:" + puerto);
    const interfaces = os.networkInterfaces();
    Object.values(interfaces).flat().forEach((interfaz) => {
        if (interfaz && interfaz.family === "IPv4" && !interfaz.internal) {
            console.log("Acceso desde el telefono: http://" + interfaz.address + ":" + puerto);
        }
    });
    console.log("Mantén este servidor abierto y conecta el telefono a la misma red Wi-Fi.");
});
