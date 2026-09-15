const usuarioActual = appAuth.obtenerUsuarioActual();
if (!usuarioActual) {
    window.location.href = "login.html";
}

/** *
 * Genera la clave para almacenar la imagen de una sucursal.
 * @param {string} nombre - El nombre de la sucursal.
 * @returns {string} La clave para almacenar la imagen.
 */
function claveImagenSucursal(nombre) {
    return "sucursalImagen_" + nombre;
}

function mostrarUsuarioActivo() {
    const usuario = appAuth.usuarioActual();
    const etiqueta = document.getElementById("usuarioActivo");
    if (!usuario) return;
    if (etiqueta) etiqueta.textContent = "Hola, " + usuario.nombre;
    const logout = document.getElementById("cerrarSesion");
    if (logout) logout.addEventListener("click", () => {
        appAuth.cerrarSesion();
    });
}

/** *
 * Selecciona una carnicería y navega a la página de checklist.
 * @param {string} nombre - El nombre de la carnicería.
 * @param {string} imagenPredeterminada - La imagen predeterminada para la carnicería.
 */
function seleccionarCarniceria(nombre, imagenPredeterminada = "") {
    const imagen = localStorage.getItem(claveImagenSucursal(nombre)) || imagenPredeterminada;
    localStorage.setItem("carniceriaSeleccionada", nombre);
    localStorage.setItem("sucursalImagen", imagen);
    window.location.href = "checklist/index.html?carniceria=" + encodeURIComponent(nombre);
}

/** *
 * Aplica las imágenes de las sucursales a sus respectivas tarjetas.
 */
function aplicarImagenesSucursal() {
    document.querySelectorAll(".tarjeta-sucursal").forEach((tarjeta) => {
        const nombre = tarjeta.dataset.sucursal;
        const imagen = localStorage.getItem(claveImagenSucursal(nombre)) || tarjeta.dataset.imagen;
        let vistaPrevia = tarjeta.querySelector(".imagen-sucursal");

        if (!vistaPrevia) {
            vistaPrevia = document.createElement("img");
            vistaPrevia.className = "imagen-sucursal";
            vistaPrevia.alt = "Imagen de " + nombre;
            tarjeta.prepend(vistaPrevia);

        }
        vistaPrevia.src = imagen;
    });
}
/**
 * Navega a la sección especificada.
 * @param {string} seccion - El nombre de la sección a la que navegar.
 */
function irASeccion(seccion) {
    const sucursal = localStorage.getItem("carniceriaSeleccionada") || "Super carnes selectas el colorado";
    if (seccion === "documentos") {
        window.location.href = "documentos/index.html";
        return;
    }
    const pagina = seccion === "inventario" ? "inventario/index.html" : seccion === "bajas" ? "bajas/index.html" : "checklist/index.html";
    window.location.href = pagina + "?carniceria=" + encodeURIComponent(sucursal);
}

aplicarImagenesSucursal();
mostrarUsuarioActivo();
