const formulario = document.getElementById("formularioDocumento");
const lista = document.getElementById("listaDocumentos");
const mensaje = document.getElementById("mensaje");
const limitePdf = 25 * 1024 * 1024;

function mostrarMensaje(texto, error = false) {
    mensaje.textContent = texto;
    mensaje.classList.toggle("error", error);
}

function leerArchivo(archivo) {
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onload = () => resolver(lector.result);
        lector.onerror = () => rechazar(new Error("No se pudo leer el archivo"));
        lector.readAsDataURL(archivo);
    });
}

function formatoTamano(bytes) {
    return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fechaLegible(fecha) {
    return new Date(fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function mostrarDocumentos(documentos) {
    lista.innerHTML = "";
    if (!documentos.length) {
        lista.innerHTML = '<p class="vacio">Todavía no hay documentos PDF guardados.</p>';
        return;
    }
    documentos.forEach((documento) => {
        const articulo = document.createElement("article");
        articulo.className = "documento-item";
        articulo.innerHTML = `<div class="icono-pdf">PDF</div><div class="datos-documento"><h3></h3><p class="meta"></p><p class="descripcion"></p></div><div class="acciones-documento"><a class="btn-abrir" target="_blank" rel="noopener" href="/api/documentos/${encodeURIComponent(documento.id)}">Abrir</a><a class="btn-descargar" download target="_blank" href="/api/documentos/${encodeURIComponent(documento.id)}">Descargar</a></div>`;
        articulo.querySelector("h3").textContent = documento.nombre;
        articulo.querySelector(".meta").textContent = `${documento.sucursal} | ${fechaLegible(documento.fecha)} | ${formatoTamano(documento.tamano)}`;
        articulo.querySelector(".descripcion").textContent = documento.descripcion || "Sin descripción";
        lista.appendChild(articulo);
    });
}

async function cargarDocumentos() {
    try {
        const respuesta = await fetch("/api/documentos");
        if (!respuesta.ok) throw new Error("No se pudo consultar el historial");
        mostrarDocumentos((await respuesta.json()).documentos || []);
    } catch {
        lista.innerHTML = '<p class="vacio error">No se pudo conectar con el servidor.</p>';
    }
}

formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const archivo = document.getElementById("archivoPdf").files[0];
    if (!archivo || archivo.size > limitePdf || (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf"))) {
        mostrarMensaje("Seleccione un PDF de hasta 25 MB.", true);
        return;
    }
    const boton = formulario.querySelector("button[type='submit']");
    boton.disabled = true;
    mostrarMensaje("Guardando documento...");
    try {
        const respuesta = await fetch("/api/documentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: archivo.name, contenido: await leerArchivo(archivo), sucursal: document.getElementById("sucursal").value, descripcion: document.getElementById("descripcion").value.trim() }) });
        const resultado = await respuesta.json();
        if (!respuesta.ok) throw new Error(resultado.error || "No se pudo guardar");
        formulario.reset();
        mostrarMensaje("PDF guardado correctamente.");
        await cargarDocumentos();
    } catch (error) {
        mostrarMensaje(error.message, true);
    } finally {
        boton.disabled = false;
    }
});

function regresarMenu() { window.location.href = "../index.html"; }
cargarDocumentos();
