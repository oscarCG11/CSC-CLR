/* Script para la página de bajas de inventario. */
const usuarioActual = appAuth.obtenerUsuarioActual();
if (!usuarioActual) {
    window.location.href = "../login.html";
}
const parametros = new URLSearchParams(window.location.search);
/* Obtiene la carnicería seleccionada y la imagen asociada. */
const carniceria = parametros.get("carniceria") || localStorage.getItem("carniceriaSeleccionada") || "Carniceria 1";
/* Obtiene la imagen de la carnicería desde el almacenamiento local o usa una predeterminada. */
const imagen = localStorage.getItem("sucursalImagen_" + carniceria) || localStorage.getItem("sucursalImagen") || "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80";
/* Actualiza el tema visual de la página según la carnicería seleccionada. */
document.getElementById("nombreCarniceria").textContent = carniceria;
/* Aplica el tema visual correspondiente a la carnicería seleccionada. */
document.getElementById("logoSucursal").src = /^(https?:|data:|\/)/.test(imagen) ? imagen : "../" + imagen;
/* Funciones para manejar las bajas de inventario. */   
function clave() { return "bajas_inventario_" + carniceria; }
/* Obtiene las bajas de inventario desde el almacenamiento local. */
function obtener() { try { const datos = JSON.parse(localStorage.getItem(clave())); return Array.isArray(datos) ? datos : []; } catch { return []; } }
/* Agrega una nueva baja de inventario al almacenamiento local. */
function celda(fila, valor) { const td = document.createElement("td"); td.textContent = valor || "-"; fila.appendChild(td); }
/* Carga las bajas de inventario y las muestra en la tabla. */
function cargar() { const bajas = obtener(); const tabla = document.getElementById("tablaBajas"); tabla.innerHTML = ""; bajas.forEach((equipo) => { const fila = document.createElement("tr"); const td = document.createElement("td"); if (equipo.imagen) { const foto = document.createElement("img"); foto.src = equipo.imagen; foto.alt = "Imagen de " + equipo.nombre; td.appendChild(foto); } else td.textContent = "Sin imagen"; fila.appendChild(td); [equipo.nombre,equipo.marca,equipo.serie,equipo.cantidad || 1,equipo.ubicacion,equipo.cargo,equipo.motivoBaja,equipo.fechaBaja].forEach((valor) => celda(fila, valor)); tabla.appendChild(fila); }); document.getElementById("totalBajas").textContent = "Total: " + bajas.length; }
/* Sincroniza las bajas de inventario con el servidor y actualiza el almacenamiento local. */
async function sincronizar() { const remotas = await datosCompartidos.obtener(clave()); if (Array.isArray(remotas)) localStorage.setItem(clave(), JSON.stringify(remotas)); cargar(); }
/* Función para escapar caracteres especiales en HTML. */
function seguro(valor) { return String(valor || "-").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
/* Función para descargar las bajas de inventario en un formato imprimible. */
function descargarBajas() { const filas = obtener().map((e) => `<tr><td>${seguro(e.nombre)}</td><td>${seguro(e.marca)}</td><td>${seguro(e.serie)}</td><td>${seguro(e.cantidad || 1)}</td><td>${seguro(e.ubicacion)}</td><td>${seguro(e.cargo)}</td><td>${seguro(e.motivoBaja)}</td><td>${seguro(e.fechaBaja)}</td></tr>`).join("") || "<tr><td colspan=\"8\">No hay equipos dados de baja.</td></tr>"; const v = window.open("","_blank","width=1100,height=800"); if (!v) return; v.document.write(`<!doctype html><html><head><meta charset="UTF-8"><style>body{font-family:Arial;margin:32px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#222;color:white}</style></head><body><h1>Bajas de equipos</h1><p>${seguro(carniceria)} | ${new Date().toLocaleString("es-MX")}</p><table><thead><tr><th>Equipo</th><th>Marca</th><th>Serie</th><th>Cantidad</th><th>Ubicacion</th><th>Cargo</th><th>Motivo</th><th>Fecha</th></tr></thead><tbody>${filas}</tbody></table></body></html>`); v.document.close(); v.focus(); setTimeout(() => v.print(),600); }
/* Función para navegar a la página de inventario. */
function irInventario() { window.location.href = "../inventario/index.html?carniceria=" + encodeURIComponent(carniceria); }
/* Función para navegar a la página de checklist. */
function regresarMenu() { window.location.href = "../index.html"; }
/* Inicializa la página cargando y sincronizando las bajas de inventario. */
cargar(); sincronizar();
