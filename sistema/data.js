/* Datos compartidos para el sistema */
const clavesAuth = {
    usuarioActual: "usuarioActual",
    passwordActual: "passwordActual",
    usuarios: "usuariosSistema"
};

function base64Encode(bytes) {
    let texto = "";
    bytes.forEach((byte) => texto += String.fromCharCode(byte));
    return btoa(texto);
}

function base64Decode(texto) {
    const bytes = Uint8Array.from(atob(texto), (char) => char.charCodeAt(0));
    return bytes;
}

async function derivarClave(password, salt) {
    const base = new TextEncoder().encode(password + salt);
    const keyMaterial = await crypto.subtle.digest("SHA-256", base);
    return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function cifrarTexto(texto, password) {
    const salt = "scc-2026";
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derivarClave(password, salt);
    const contenido = new TextEncoder().encode(texto);
    const bloque = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, contenido);
    return JSON.stringify({ iv: Array.from(iv), valor: base64Encode(new Uint8Array(bloque)) });
}

async function descifrarTexto(cifrado, password) {
    if (!cifrado || typeof cifrado !== "string") return null;
    try {
        const payload = JSON.parse(cifrado);
        const iv = Uint8Array.from(payload.iv || []);
        const key = await derivarClave(password, "scc-2026");
        const bloque = base64Decode(payload.valor || "");
        const texto = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bloque);
        return new TextDecoder().decode(texto);
    } catch {
        return null;
    }
}

window.appAuth = {
    usuariosPorDefecto() {
        return [
            { usuario: "Oscar", nombre: "Oscar" }
        ];
    },
    cargarUsuarios() {
        const guardados = JSON.parse(localStorage.getItem(clavesAuth.usuarios) || "null");
        return Array.isArray(guardados) && guardados.length ? guardados : this.usuariosPorDefecto();
    },
    guardarUsuarios(usuarios) {
        localStorage.setItem(clavesAuth.usuarios, JSON.stringify(usuarios));
    },
    obtenerUsuarioActual() {
        return localStorage.getItem(clavesAuth.usuarioActual) || "";
    },
    obtenerPasswordActual() {
        return localStorage.getItem(clavesAuth.passwordActual) || "";
    },
    async iniciarSesion(usuario, password) {
        try {
            const respuesta = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usuario, password })
            });
            if (respuesta.ok) {
                const encontrado = await respuesta.json();
                localStorage.setItem(clavesAuth.usuarioActual, encontrado.usuario);
                localStorage.setItem(clavesAuth.passwordActual, String(password));
                return true;
            }
        } catch { /* Permite el respaldo local si el servidor no responde. */ }
        const usuarios = this.cargarUsuarios();
        const encontrado = usuarios.find((item) => item.usuario.toLowerCase() === String(usuario).trim().toLowerCase() && item.password && item.password === String(password));
        if (!encontrado) return false;
        localStorage.setItem(clavesAuth.usuarioActual, encontrado.usuario);
        localStorage.setItem(clavesAuth.passwordActual, String(password));
        return true;
    },
    cerrarSesion() {
        localStorage.removeItem(clavesAuth.usuarioActual);
        localStorage.removeItem(clavesAuth.passwordActual);
        window.location.href = "login.html";
    },
    usuarioActual() {
        const usuario = this.obtenerUsuarioActual();
        return usuario ? { usuario, nombre: this.cargarUsuarios().find((item) => item.usuario === usuario)?.nombre || usuario } : null;
    }
};

window.appSecure = {
    async guardar(clave, valor) {
        const password = appAuth.obtenerPasswordActual();
        if (!password) {
            localStorage.setItem(clave, JSON.stringify(valor));
            return;
        }
        const texto = JSON.stringify(valor);
        const cifrado = await cifrarTexto(texto, password);
        localStorage.setItem(clave, cifrado);
    },
    async leer(clave, valorPorDefecto = null) {
        const valor = localStorage.getItem(clave);
        if (!valor) return valorPorDefecto;
        const password = appAuth.obtenerPasswordActual();
        if (!password) {
            try { return JSON.parse(valor); } catch { return valorPorDefecto; }
        }
        const texto = await descifrarTexto(valor, password);
        if (texto === null) return valorPorDefecto;
        try { return JSON.parse(texto); } catch { return texto; }
    }
};

window.datosCompartidos = {
    async obtener(clave) {
        try {
            const respuesta = await fetch("/api/datos/" + encodeURIComponent(clave));
            if (!respuesta.ok) return null;
            const dato = await respuesta.json();
            const valor = dato.existe ? dato.valor : null;
            if (typeof valor === "string" && valor.startsWith("{")) {
                return valor;
            }
            return valor;
        } catch {
            return null;
        }
    },
    guardar(clave, valor) {
        const password = appAuth.obtenerPasswordActual();
        const contenido = password ? cifrarTexto(JSON.stringify(valor), password).then((cifrado) => ({ valor: cifrado })) : Promise.resolve({ valor });
        contenido.then((payload) => {
            fetch("/api/datos/" + encodeURIComponent(clave), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }).catch(() => {
                // El navegador conserva una copia local si el servidor no esta disponible.
            });
        }).catch(() => {
            // Se mantiene la copia local cuando no es posible cifrar.
        });
    }
};
