/* Script para la gestión de inventario */
const usuarioActual = appAuth.obtenerUsuarioActual();
if (!usuarioActual) {
    window.location.href = "../login.html";
}
const parametros = new URLSearchParams(window.location.search);
/* Obtiene el nombre de la carnicería desde los parámetros de la URL o desde el almacenamiento local */
const carniceria = parametros.get("carniceria") || localStorage.getItem("carniceriaSeleccionada") || "Carniceria 1";
/* Guarda el nombre de la carnicería seleccionada en el almacenamiento local */
const imagenPredeterminada = "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80";
/* Define el orden de las ubicaciones y cargos para la clasificación del inventario */
const ordenUbicacion = { Caja: 1, Oficina: 2, Almacen: 3 };
/* Define el orden de los cargos para la clasificación del inventario */
const ordenCargo = { Cajero: 1, Encargado: 2, Oficinista: 3 };
/* Función para generar la clave de almacenamiento del inventario de la carnicería */
document.getElementById("nombreCarniceria").textContent = carniceria;
/* Obtiene la imagen de la sucursal desde el almacenamiento local o utiliza la imagen predeterminada */
const imagenSucursal = localStorage.getItem("sucursalImagen_" + carniceria) || localStorage.getItem("sucursalImagen") || imagenPredeterminada;
/* Aplica la imagen de la sucursal al logo en la página */
document.getElementById("logoSucursal").src = /^(https?:|data:|\/)/.test(imagenSucursal) ? imagenSucursal : "../" + imagenSucursal;
/* Aplica un tema de color basado en el nombre de la carnicería */
document.body.classList.add(carniceria.toLowerCase().includes("colorado") ? "tema-colorado" : "tema-reyes");
/* Función para generar la clave de almacenamiento del inventario de la carnicería */
function claveInventario() { return "inventario_" + carniceria; }
/* Función para generar la clave de almacenamiento del historial de bajas de la carnicería */
function claveBajas() { return "bajas_inventario_" + carniceria; }
/* Función para leer datos del almacenamiento local y devolverlos como un arreglo */
function leerDatos(clave) {
    try {
        const datos = JSON.parse(localStorage.getItem(clave));
        return Array.isArray(datos) ? datos : [];
    } catch { return []; }
}
/* Función para obtener el inventario de la carnicería desde el almacenamiento local */
function obtenerInventario() { return leerDatos(claveInventario()); }
/* Función para obtener el historial de bajas de la carnicería desde el almacenamiento local */
function obtenerBajas() { return leerDatos(claveBajas()); }
/* Función para guardar el inventario de la carnicería en el almacenamiento local y en el servidor */
function guardarInventario(datos) {
    localStorage.setItem(claveInventario(), JSON.stringify(datos));
    datosCompartidos.guardar(claveInventario(), datos);
}
/* Función para guardar el historial de bajas de la carnicería en el almacenamiento local y en el servidor */
function guardarBajas(datos) {
    localStorage.setItem(claveBajas(), JSON.stringify(datos));
    datosCompartidos.guardar(claveBajas(), datos);
}
/* Función para leer una imagen desde un archivo y devolverla como una URL de datos */
function leerImagen(archivo) {
    return new Promise((resolver) => {
        if (!archivo) return resolver("");
        const lector = new FileReader();
        lector.onload = () => resolver(lector.result);
        lector.readAsDataURL(archivo);
    });
}
/* Función para agregar un nuevo equipo al inventario */
async function agregarEquipo() {
    /* Obtiene los valores del formulario y valida que sean correctos */
    const nombre = document.getElementById("equipo").value.trim();
    const cantidad = Number.parseInt(document.getElementById("cantidad").value, 10);
    if (!nombre || !cantidad || cantidad < 1) {
        alert("Indique el equipo y una cantidad valida.");
        return;
    }
    /* Obtiene el archivo de imagen seleccionado y verifica que sea un archivo de imagen válido */
    const archivo = document.getElementById("imagenEquipo").files[0];
    if (archivo && !archivo.type.startsWith("image/")) {
        alert("Seleccione un archivo de imagen valido.");
        return;
    }
    /* Crea un objeto de equipo con los datos del formulario y la imagen leída */
    const equipo = {
        nombre, cantidad, imagen: await leerImagen(archivo),
        marca: document.getElementById("marca").value.trim(),
        serie: document.getElementById("serie").value.trim(),
        ubicacion: document.getElementById("ubicacion").value,
        cargo: document.getElementById("cargo").value,
        estado: document.getElementById("estado").value,
        responsable: document.getElementById("responsable").value.trim(),
        observaciones: document.getElementById("observaciones").value.trim(),
        fechaRegistro: new Date().toISOString()
    };
    /* Agrega el equipo al inventario, guarda los cambios y actualiza la interfaz */
    const inventario = obtenerInventario();
    inventario.push(equipo);
    guardarInventario(inventario);
    limpiarFormulario();
    cargarInventario();
    document.getElementById("mensaje").textContent = "Equipo agregado correctamente.";
}
/* Función para ordenar los equipos del inventario según ubicación, cargo y nombre */
function ordenarEquipos(equipos) {
    return equipos.map((equipo, indice) => ({ equipo, indice })).sort((a, b) =>
        (ordenUbicacion[a.equipo.ubicacion] || 99) - (ordenUbicacion[b.equipo.ubicacion] || 99) ||
        (ordenCargo[a.equipo.cargo] || 99) - (ordenCargo[b.equipo.cargo] || 99) ||
        String(a.equipo.nombre).localeCompare(String(b.equipo.nombre), "es")
    );
}
/* Función para crear una celda de tabla con un valor y una clase opcional */
function crearCelda(fila, valor, clase = "") {
    const celda = document.createElement("td");
    celda.textContent = valor || "-";
    celda.className = clase;
    fila.appendChild(celda);
}
/* Función para crear una celda de tabla con una imagen o un texto predeterminado */
function crearImagen(fila, imagen, descripcion) {
    const celda = document.createElement("td");
    if (imagen) {
        const foto = document.createElement("img");
        foto.className = "foto-equipo";
        foto.src = imagen;
        foto.alt = "Imagen de " + descripcion;
        celda.appendChild(foto);
    } else celda.textContent = "Sin imagen";
    fila.appendChild(celda);
}
/* Función para cargar el inventario en la tabla de la interfaz */
function cargarInventario() {
    const inventario = obtenerInventario();
    const tabla = document.getElementById("tablaInventario");
    tabla.innerHTML = "";
    ordenarEquipos(inventario).forEach(({ equipo, indice }) => {
        const fila = document.createElement("tr");
        crearImagen(fila, equipo.imagen, equipo.nombre);
        crearCelda(fila, equipo.nombre);
        crearCelda(fila, equipo.marca);
        crearCelda(fila, equipo.serie);
        crearCelda(fila, equipo.cantidad || 1);
        crearCelda(fila, equipo.ubicacion);
        crearCelda(fila, equipo.cargo);
        crearCelda(fila, equipo.estado, "estado-" + String(equipo.estado || "").toLowerCase());
        crearCelda(fila, equipo.responsable);
        crearCelda(fila, equipo.observaciones);
        const acciones = document.createElement("td");
        acciones.className = "acciones-tabla";
        const baja = document.createElement("button");
        baja.className = "btn-baja";
        baja.textContent = "Dar de baja";
        baja.addEventListener("click", () => darDeBaja(indice));
        acciones.appendChild(baja);
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
    const unidades = inventario.reduce((total, equipo) => total + (Number(equipo.cantidad) || 1), 0);
    document.getElementById("totalEquipos").textContent = "Registros: " + inventario.length + " | Unidades: " + unidades;
    cargarBajas();
}
/* Función para iniciar el proceso de dar de baja un equipo */
function darDeBaja(indice) {
    const equipo = obtenerInventario()[indice];
    if (!equipo) return;
    document.getElementById("indiceBaja").value = indice;
    document.getElementById("equipoBaja").textContent = "Equipo: " + equipo.nombre;
    document.getElementById("motivoBaja").value = "";
    document.getElementById("imagenBaja").value = "";
    document.getElementById("dialogoBaja").showModal();
}
/* Función para cerrar el diálogo de dar de baja un equipo */
function cerrarBaja() {
    document.getElementById("dialogoBaja").close();
}
/* Función para confirmar la baja de un equipo, actualizar el inventario y el historial de bajas */
async function confirmarBaja(evento) {
    evento.preventDefault();
    const indice = Number(document.getElementById("indiceBaja").value);
    const motivo = document.getElementById("motivoBaja").value.trim();
    if (!motivo) return;
    const inventario = obtenerInventario();
    const [equipo] = inventario.splice(indice, 1);
    if (!equipo) return cerrarBaja();
    const archivo = document.getElementById("imagenBaja").files[0];
    if (archivo && !archivo.type.startsWith("image/")) {
        alert("Seleccione un archivo de imagen valido.");
        return;
    }
    /* Lee la imagen de la baja si se proporcionó un archivo, o utiliza la imagen del equipo */
    const imagenBaja = archivo ? await leerImagen(archivo) : equipo.imagen;
    const bajas = obtenerBajas();
    bajas.unshift({ ...equipo, imagen: imagenBaja, motivoBaja: motivo, fechaBaja: new Date().toLocaleString("es-MX") });
    guardarInventario(inventario);
    guardarBajas(bajas);
    cerrarBaja();
    cargarInventario();
    document.getElementById("mensaje").textContent = "Equipo dado de baja y guardado en el historial.";
}
/* Función para cargar el historial de bajas en la tabla de la interfaz */
function cargarBajas() {
    const tabla = document.getElementById("tablaBajas");
    tabla.innerHTML = "";
    obtenerBajas().forEach((equipo) => {
        const fila = document.createElement("tr");
        crearImagen(fila, equipo.imagen, equipo.nombre);
        crearCelda(fila, equipo.nombre);
        crearCelda(fila, equipo.cantidad || 1);
        crearCelda(fila, equipo.ubicacion);
        crearCelda(fila, equipo.cargo);
        crearCelda(fila, equipo.motivoBaja);
        crearCelda(fila, equipo.fechaBaja);
        tabla.appendChild(fila);
    });
}
/* Función para limpiar el formulario de registro de equipos */
function limpiarFormulario() {
    ["equipo", "marca", "serie", "responsable", "observaciones"].forEach((id) => document.getElementById(id).value = "");
    document.getElementById("cantidad").value = 1;
    document.getElementById("ubicacion").value = "Caja";
    document.getElementById("cargo").value = "Cajero";
    document.getElementById("estado").value = "Bueno";
    document.getElementById("imagenEquipo").value = "";
}
/* Función para regresar al menú principal del sistema */
function regresarMenu() { window.location.href = "../index.html"; }
function textoSeguro(valor) { return String(valor || "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
/* Función para descargar el inventario como un documento HTML imprimible */
function descargarInventario() {
    const filas = ordenarEquipos(obtenerInventario()).map(({ equipo }) => `<tr><td>${textoSeguro(equipo.nombre)}</td><td>${textoSeguro(equipo.marca)}</td><td>${textoSeguro(equipo.serie)}</td><td>${textoSeguro(equipo.cantidad || 1)}</td><td>${textoSeguro(equipo.ubicacion)}</td><td>${textoSeguro(equipo.cargo)}</td><td>${textoSeguro(equipo.estado)}</td><td>${textoSeguro(equipo.responsable)}</td><td>${textoSeguro(equipo.observaciones)}</td></tr>`).join("") || "<tr><td colspan=\"9\">No hay equipos registrados.</td></tr>";
    const documento = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Inventario</title><style>body{font-family:Arial;margin:32px;color:#1f2937}h1{margin:0 0 8px;border-bottom:2px solid #111827;padding-bottom:14px}p{margin:6px 0}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:11px}th,td{border:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}th{background:#111827;color:#fff}</style></head><body><h1>Inventario Tecnologico</h1><p><strong>Sucursal:</strong> ${textoSeguro(carniceria)}</p><p><strong>Fecha:</strong> ${new Date().toLocaleString("es-MX")}</p><table><thead><tr><th>Equipo</th><th>Marca / Modelo</th><th>Serie</th><th>Cantidad</th><th>Ubicacion</th><th>Cargo</th><th>Estado</th><th>Responsable</th><th>Observaciones</th></tr></thead><tbody>${filas}</tbody></table></body></html>`;
    const ventana = window.open("", "_blank", "width=1200,height=800");
    if (!ventana) return;
    ventana.document.write(documento);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => ventana.print(), 600);
}
/* Función para sincronizar el inventario y las bajas con el servidor */
async function sincronizarInventario() {
    const [inventarioRemoto, bajasRemotas] = await Promise.all([
        datosCompartidos.obtener(claveInventario()),
        datosCompartidos.obtener(claveBajas())
    ]);
    if (Array.isArray(inventarioRemoto)) localStorage.setItem(claveInventario(), JSON.stringify(inventarioRemoto));
    if (Array.isArray(bajasRemotas)) localStorage.setItem(claveBajas(), JSON.stringify(bajasRemotas));
    cargarInventario();
}
/* Inicializa la página cargando el inventario y sincronizando con el servidor */
cargarInventario();
sincronizarInventario();
