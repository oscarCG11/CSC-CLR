const parametros = new URLSearchParams(window.location.search);
const usuarioActual = appAuth.obtenerUsuarioActual();
if (!usuarioActual) {
    window.location.href = "../login.html";
}
const carniceria = parametros.get("carniceria") || localStorage.getItem("carniceriaSeleccionada") || "Carniceria 1";
const imagenPredeterminada = "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80";
let tipoActual = "diario";

const listasBase = {
    diario: ["Verificar que las computadoras enciendan", "Comprobar conexion a Internet", "Revisar sistema de ventas", "Comprobar impresoras de tickets", "Verificar funcionamiento de camaras", "Revisar cables de red y conexiones"],
    semanal: ["Revisar espacio disponible en disco", "Verificar actualizaciones de Windows", "Comprobar respaldo de informacion", "Revisar almacenamiento del DVR", "Limpiar equipos y perifericos"],
    mensual: ["Revisar licencias de software", "Actualizar inventario tecnologico", "Comprobar antivirus en todos los equipos", "Revisar estado de switches y red", "Validar accesos de usuarios"]
};

const logoSucursal = document.getElementById("logoSucursal");
const imagenSucursal = localStorage.getItem("sucursalImagen_" + carniceria) || localStorage.getItem("sucursalImagen") || imagenPredeterminada;
logoSucursal.src = /^(https?:|data:|\/)/.test(imagenSucursal) ? imagenSucursal : "../" + imagenSucursal;
document.getElementById("nombreCarniceria").textContent = carniceria;
document.getElementById("fechaActual").textContent = new Date().toLocaleString("es-MX");
document.body.classList.add(carniceria.toLowerCase().includes("colorado") ? "tema-colorado" : "tema-reyes");

function claveChecklist() {
    return "checklist_" + usuarioActual + "_" + carniceria + "_" + tipoActual;
}

function filasBase() {
    return listasBase[tipoActual].map((actividad) => ({ actividad, estado: "", observacion: "" }));
}

function obtenerChecklist() {
    const datos = JSON.parse(localStorage.getItem(claveChecklist()));
    return Array.isArray(datos) ? datos : filasBase();
}

function leerFilasPantalla() {
    return Array.from(document.querySelectorAll("#listaChecklist .check-row")).map((fila) => ({
        actividad: fila.querySelector(".actividad-input").value.trim() || "Nueva actividad",
        estado: fila.querySelector("input[type='radio']:checked")?.value || "",
        observacion: fila.querySelector(".observacion-input").value.trim()
    }));
}

function guardarChecklist(silencioso = false) {
    const datos = leerFilasPantalla();
    localStorage.setItem(claveChecklist(), JSON.stringify(datos));
    datosCompartidos.guardar(claveChecklist(), datos);
    if (!silencioso) document.getElementById("mensaje").textContent = "Checklist guardado correctamente.";
}

function cargarChecklist() {
    const lista = document.getElementById("listaChecklist");
    lista.innerHTML = "";
    obtenerChecklist().forEach((item, indice) => lista.appendChild(crearFila(item, indice)));
}

function crearFila(item, indice) {
    const fila = document.createElement("div");
    fila.className = "check-row";
    const actividad = document.createElement("input");
    actividad.className = "actividad-input";
    actividad.value = item.actividad || "";
    actividad.placeholder = "Escriba una actividad";

    const crearOpcion = (valor, texto) => {
        const etiqueta = document.createElement("label");
        etiqueta.className = "opcion-estado";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "estado_" + indice;
        radio.value = valor;
        radio.checked = item.estado === valor;
        etiqueta.append(radio, document.createTextNode(texto));
        return etiqueta;
    };

    const observacion = document.createElement("input");
    observacion.className = "observacion-input";
    observacion.value = item.observacion || "";
    observacion.placeholder = "Observaciones";
    const acciones = document.createElement("div");
    acciones.className = "accion-fila";
    const eliminar = document.createElement("button");
    eliminar.type = "button";
    eliminar.textContent = "Eliminar";
    eliminar.addEventListener("click", () => eliminarFila(indice));
    acciones.appendChild(eliminar);
    fila.append(actividad, crearOpcion("cumple", "Si"), crearOpcion("no-cumple", "No"), observacion, acciones);
    return fila;
}

function agregarFila() {
    const datos = leerFilasPantalla();
    datos.push({ actividad: "", estado: "", observacion: "" });
    localStorage.setItem(claveChecklist(), JSON.stringify(datos));
    datosCompartidos.guardar(claveChecklist(), datos);
    cargarChecklist();
    document.querySelector("#listaChecklist .check-row:last-child .actividad-input").focus();
}

function eliminarFila(indice) {
    const datos = leerFilasPantalla();
    datos.splice(indice, 1);
    localStorage.setItem(claveChecklist(), JSON.stringify(datos));
    datosCompartidos.guardar(claveChecklist(), datos);
    cargarChecklist();
}

async function seleccionarTipo(tipo) {
    guardarChecklist(true);
    tipoActual = tipo;
    document.getElementById("tituloChecklist").textContent = "Checklist " + tipo;
    document.querySelectorAll(".periodo").forEach((boton) => boton.classList.toggle("activo", boton.dataset.periodo === tipo));
    document.getElementById("mensaje").textContent = "";
    await sincronizarChecklist();
}

function limpiarChecklist() {
    if (!confirm("Desea restaurar la lista inicial de este checklist?")) return;
    const datos = filasBase();
    localStorage.setItem(claveChecklist(), JSON.stringify(datos));
    datosCompartidos.guardar(claveChecklist(), datos);
    cargarChecklist();
    document.getElementById("mensaje").textContent = "Lista restaurada.";
}

function irInventario() { window.location.href = "../inventario/index.html?carniceria=" + encodeURIComponent(carniceria); }
function regresarMenu() { window.location.href = "../index.html"; }

function textoSeguro(valor) {
    return String(valor || "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function blobADataUrl(blob) {
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onload = () => resolver(lector.result);
        lector.onerror = () => rechazar(new Error("No se pudo convertir la imagen."));
        lector.readAsDataURL(blob);
    });
}

async function obtenerLogoParaDocumento() {
    if (!logoSucursal.src || logoSucursal.src.startsWith("data:")) return logoSucursal.src;
    try {
        const respuesta = await fetch(logoSucursal.src);
        if (!respuesta.ok) return logoSucursal.src;
        const blob = await respuesta.blob();
        return await blobADataUrl(blob);
    } catch {
        return logoSucursal.src;
    }
}

async function descargarFormato() {
    guardarChecklist(true);
    const filas = obtenerChecklist().map((item, indice) => `<tr><td>${indice + 1}</td><td>${textoSeguro(item.actividad)}</td><td>${item.estado === "cumple" ? "Cumple" : item.estado === "no-cumple" ? "No cumple" : "Sin responder"}</td><td>${textoSeguro(item.observacion)}</td></tr>`).join("");
    const logoDocumento = await obtenerLogoParaDocumento();
    const ventana = window.open("", "_blank", "width=900,height=800");
    if (!ventana) return;
    ventana.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Checklist</title><style>body{font-family:Arial;margin:32px;color:#1f2937}header{display:flex;gap:16px;align-items:center;border-bottom:2px solid #111827;padding-bottom:16px}img{width:72px;height:72px;object-fit:cover;border-radius:16px}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{border:1px solid #d1d5db;padding:10px;text-align:left}th{background:#111827;color:#fff}</style></head><body><header><img src="${logoDocumento}"><div><h1>Checklist ${tipoActual}</h1><p>${textoSeguro(carniceria)} - ${new Date().toLocaleString("es-MX")}</p></div></header><table><thead><tr><th>#</th><th>Actividad</th><th>Estado</th><th>Observaciones</th></tr></thead><tbody>${filas}</tbody></table></body></html>`);
    ventana.document.close(); ventana.focus(); setTimeout(() => ventana.print(), 600);
}

async function sincronizarChecklist() {
    const datosRemotos = await datosCompartidos.obtener(claveChecklist());
    if (Array.isArray(datosRemotos)) localStorage.setItem(claveChecklist(), JSON.stringify(datosRemotos));
    cargarChecklist();
}

cargarChecklist();
sincronizarChecklist();
