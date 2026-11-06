(() => {
  const currency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  const list = document.getElementById("product-list");
  const emptyState = document.getElementById("empty-state");
  const emptyTitle = document.getElementById("empty-title");
  const emptyMessage = document.getElementById("empty-message");
  const search = document.getElementById("search");
  const adminDialog = document.getElementById("admin-dialog");
  const productDialog = document.getElementById("product-dialog");
  const adminForm = document.getElementById("admin-form");
  const productForm = document.getElementById("product-form");
  const pairForm = document.getElementById("pair-form");
  const connectionStatus = document.getElementById("connection-status");
  let products = [];
  let updatedAt = null;
  let isAdmin = false;
  let isPaired = false;
  let editingId = null;
  let selectedId = null;
  let productStream = null;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "No se pudo completar la solicitud.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function setStatus(message) {
    connectionStatus.textContent = message;
  }

  function formatUpdatedAt(value) {
    if (!value) return "Consulta nuestros precios vigentes";
    return `Precios actualizados: ${new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value))}`;
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase("es-MX");
    const visible = products.filter(product =>
      product.name.toLocaleLowerCase("es-MX").includes(query)
    );
    list.replaceChildren();

    visible.forEach(product => {
      const row = document.createElement("div");
      row.className = "product-row";
      row.classList.toggle("selected", product.id === selectedId);
      row.addEventListener("click", () => {
        selectedId = selectedId === product.id ? null : product.id;
        render();
      });

      const name = document.createElement("button");
      name.className = "product-name";
      name.type = "button";
      name.setAttribute("aria-pressed", product.id === selectedId);
      name.setAttribute("aria-label", `Seleccionar ${product.name}`);
      name.textContent = product.name;
      const tablePrice = document.createElement("span");
      tablePrice.className = "price";
      tablePrice.textContent = currency.format(product.tablePrice);
      const boxPrice = document.createElement("span");
      boxPrice.className = "price";
      boxPrice.textContent = currency.format(product.boxPrice);
      row.append(name, tablePrice, boxPrice);

      if (isAdmin) {
        const actions = document.createElement("div");
        actions.className = "actions";
        const edit = document.createElement("button");
        edit.className = "icon-button";
        edit.type = "button";
        edit.setAttribute("aria-label", `Editar ${product.name}`);
        edit.textContent = "✎";
        edit.addEventListener("click", event => {
          event.stopPropagation();
          openProductForm(product);
        });
        const remove = document.createElement("button");
        remove.className = "icon-button";
        remove.type = "button";
        remove.setAttribute("aria-label", `Eliminar ${product.name}`);
        remove.textContent = "×";
        remove.addEventListener("click", async event => {
          event.stopPropagation();
          if (!window.confirm(`¿Eliminar "${product.name}" de la lista?`)) return;
          const nextProducts = products.filter(item => item.id !== product.id);
          await saveProducts(nextProducts);
          if (selectedId === product.id) selectedId = null;
        });
        actions.append(edit, remove);
        row.append(actions);
      }
      list.append(row);
    });

    const showPairing = !isAdmin && !isPaired;
    emptyState.hidden = visible.length > 0;
    pairForm.hidden = !showPairing;
    if (showPairing) {
      emptyTitle.textContent = "Tableta pendiente de autorización";
      emptyMessage.textContent = "Solicita al administrador un código para vincular esta tableta al negocio.";
    } else if (products.length === 0) {
      emptyTitle.textContent = isAdmin ? "Agrega el primer producto" : "Precios próximamente";
      emptyMessage.textContent = isAdmin
        ? "Usa “Agregar” para publicar el primer precio."
        : "Todavía no hay productos publicados.";
    } else {
      emptyTitle.textContent = "No encontramos ese producto";
      emptyMessage.textContent = "Prueba con otro nombre.";
    }

    document.getElementById("admin-tools").hidden = !isAdmin;
    document.getElementById("actions-heading").hidden = !isAdmin;
    document.getElementById("admin-note").hidden = !isAdmin;
    document.getElementById("admin-panel").hidden = !isAdmin;
    const adminToggle = document.getElementById("admin-toggle");
    adminToggle.classList.toggle("active", isAdmin);
    adminToggle.textContent = isAdmin ? "Cerrar sesión admin" : "Administrar";
    document.getElementById("updated-at").textContent = formatUpdatedAt(updatedAt);
  }

  function stopProductStream() {
    if (productStream) {
      productStream.close();
      productStream = null;
    }
  }

  function startProductStream() {
    stopProductStream();
    if (!isAdmin && !isPaired) return;
    const endpoint = isAdmin ? "/api/admin/products/stream" : "/api/products/stream";
    productStream = new EventSource(endpoint, { withCredentials: true });
    productStream.onmessage = event => {
      try {
        const result = JSON.parse(event.data);
        products = result.products;
        updatedAt = result.updatedAt;
        setStatus("");
        render();
      } catch (error) {
        console.error("No se pudo procesar la actualización de precios.", error);
        setStatus("No se pudo actualizar la lista. Recarga la página.");
      }
    };
    productStream.addEventListener("error", event => {
      if (event.data) {
        try {
          const result = JSON.parse(event.data);
          setStatus(result.error || "Se perdió la conexión en vivo.");
        } catch {
          setStatus("Se perdió la conexión en vivo.");
        }
      }
    });
    productStream.addEventListener("revoked", () => {
      if (isAdmin) return;
      stopProductStream();
      isPaired = false;
      products = [];
      updatedAt = null;
      render();
      setStatus("El acceso de esta tableta fue revocado.");
      api("/api/device/unpair", {
        method: "POST",
        headers: { "X-App-Request": "1" }
      }).catch(error => {
        console.error("No se pudo borrar la autorización local revocada.", error);
      });
    });
    productStream.onerror = () => {
      if (productStream && productStream.readyState === EventSource.CLOSED) {
        setStatus("Se perdió la conexión en vivo. Recarga la página para reconectar.");
      }
      if (isAdmin) {
        api("/api/admin/session").catch(error => {
          if (error.status !== 401) return;
          stopProductStream();
          isAdmin = false;
          products = [];
          updatedAt = null;
          render();
          loadProducts();
        });
      }
    };
  }

  async function loadProducts() {
    try {
      const endpoint = isAdmin ? "/api/admin/products" : "/api/products";
      const result = await api(endpoint);
      products = result.products;
      updatedAt = result.updatedAt;
      isPaired = !isAdmin;
      setStatus("");
      if (isAdmin && products.length === 0) await importLegacyProductsIfNeeded();
      render();
      startProductStream();
    } catch (error) {
      if (!isAdmin && error.status === 401) {
        isPaired = false;
        products = [];
        updatedAt = null;
        stopProductStream();
        setStatus("");
        render();
        return;
      }
      setStatus(error.message);
    }
  }

  async function saveProducts(nextProducts) {
    setStatus("");
    try {
      await api("/api/admin/products", {
        method: "PUT",
        headers: { "X-App-Request": "1" },
        body: JSON.stringify({ products: nextProducts })
      });
      products = nextProducts;
      render();
      return true;
    } catch (error) {
      setStatus(error.message);
      return false;
    }
  }

  async function importLegacyProductsIfNeeded() {
    const productsKey = "lista-precios-products-v1";
    const pinKey = "lista-precios-admin-pin-v1";
    const stored = localStorage.getItem(productsKey);
    if (!stored) {
      localStorage.removeItem(pinKey);
      return;
    }

    let legacyProducts;
    try {
      legacyProducts = JSON.parse(stored);
    } catch (error) {
      console.error("La lista guardada en esta tableta no tiene un formato válido.", error);
      setStatus("No se pudo leer la lista anterior de esta tableta.");
      return;
    }
    if (!Array.isArray(legacyProducts)) {
      setStatus("La lista anterior de esta tableta no tiene un formato válido.");
      return;
    }

    const validProducts = legacyProducts.filter(product =>
      product &&
      typeof product.id === "string" &&
      typeof product.name === "string" &&
      product.name.trim() &&
      Number.isFinite(product.tablePrice) &&
      product.tablePrice >= 0 &&
      Number.isFinite(product.boxPrice) &&
      product.boxPrice >= 0
    );
    if (validProducts.length === 0) {
      localStorage.removeItem(productsKey);
      localStorage.removeItem(pinKey);
      return;
    }
    if (!window.confirm(`Se encontraron ${validProducts.length} productos anteriores en esta tableta. ¿Importarlos a Firebase?`)) {
      return;
    }
    if (await saveProducts(validProducts)) {
      localStorage.removeItem(productsKey);
      localStorage.removeItem(pinKey);
    }
  }

  function openProductForm(product) {
    editingId = product ? product.id : null;
    productForm.reset();
    document.getElementById("form-error").textContent = "";
    document.getElementById("form-title").textContent = product ? "Editar producto" : "Agregar producto";
    if (product) {
      document.getElementById("product-name").value = product.name;
      document.getElementById("table-price").value = product.tablePrice;
      document.getElementById("box-price").value = product.boxPrice;
    }
    productDialog.showModal();
    document.getElementById("product-name").focus();
  }

  async function loadDevices() {
    const container = document.getElementById("device-list");
    container.replaceChildren();
    try {
      const result = await api("/api/admin/devices");
      if (result.devices.length === 0) {
        const message = document.createElement("p");
        message.textContent = "Todavía no hay tabletas autorizadas.";
        container.append(message);
      }
      result.devices.forEach(device => {
        const item = document.createElement("div");
        item.className = "device-item";
        const name = document.createElement("span");
        name.textContent = device.name || "Tableta del negocio";
        const revoke = document.createElement("button");
        revoke.className = "icon-button";
        revoke.type = "button";
        revoke.textContent = "×";
        revoke.setAttribute("aria-label", `Revocar ${name.textContent}`);
        revoke.addEventListener("click", async () => {
          if (!window.confirm(`¿Revocar el acceso de "${name.textContent}"?`)) return;
          try {
            await api(`/api/admin/devices/${encodeURIComponent(device.id)}`, {
              method: "DELETE",
              headers: { "X-App-Request": "1" }
            });
            await loadDevices();
          } catch (error) {
            setStatus(error.message);
          }
        });
        item.append(name, revoke);
        container.append(item);
      });
      container.hidden = false;
    } catch (error) {
      setStatus(error.message);
    }
  }

  document.getElementById("admin-toggle").addEventListener("click", async () => {
    if (!isAdmin) {
      adminForm.reset();
      document.getElementById("admin-error").textContent = "";
      adminDialog.showModal();
      document.getElementById("admin-password").focus();
      return;
    }
    try {
      await api("/api/admin/logout", {
        method: "POST",
        headers: { "X-App-Request": "1" }
      });
      isAdmin = false;
      products = [];
      updatedAt = null;
      document.getElementById("pairing-code-result").hidden = true;
      document.getElementById("device-list").hidden = true;
      await loadProducts();
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.getElementById("cancel-admin").addEventListener("click", () => adminDialog.close());
  adminForm.addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.getElementById("admin-error");
    error.textContent = "";
    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "X-App-Request": "1" },
        body: JSON.stringify({ password: document.getElementById("admin-password").value })
      });
      isAdmin = true;
      adminDialog.close();
      await loadProducts();
      await loadDevices();
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });

  document.getElementById("add-product").addEventListener("click", () => openProductForm(null));
  document.getElementById("cancel-form").addEventListener("click", () => productDialog.close());
  search.addEventListener("input", render);

  productForm.addEventListener("submit", async event => {
    event.preventDefault();
    const formError = document.getElementById("form-error");
    const name = document.getElementById("product-name").value.trim();
    const tablePrice = Number(document.getElementById("table-price").value);
    const boxPrice = Number(document.getElementById("box-price").value);
    if (!name || !Number.isFinite(tablePrice) || tablePrice < 0 ||
      !Number.isFinite(boxPrice) || boxPrice < 0) {
      formError.textContent = "Escribe un nombre y precios válidos.";
      return;
    }

    const nextProducts = editingId
      ? products.map(product => product.id === editingId
        ? { ...product, name, tablePrice, boxPrice }
        : product)
      : [...products, { id: crypto.randomUUID(), name, tablePrice, boxPrice }];
    if (await saveProducts(nextProducts)) productDialog.close();
  });

  document.getElementById("generate-pairing").addEventListener("click", async () => {
    setStatus("");
    try {
      const result = await api("/api/admin/pairing-codes", {
        method: "POST",
        headers: { "X-App-Request": "1" },
        body: JSON.stringify({})
      });
      document.getElementById("pairing-code-text").textContent = result.code;
      document.getElementById("pairing-code-result").hidden = false;
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.getElementById("toggle-devices").addEventListener("click", async () => {
    const deviceList = document.getElementById("device-list");
    if (deviceList.hidden) await loadDevices();
    else deviceList.hidden = true;
  });

  pairForm.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("");
    const code = document.getElementById("pair-code").value.replace(/\s+/g, "").toUpperCase();
    try {
      await api("/api/device/pair", {
        method: "POST",
        headers: { "X-App-Request": "1" },
        body: JSON.stringify({
          code,
          name: document.getElementById("device-name").value
        })
      });
      pairForm.reset();
      isPaired = true;
      await loadProducts();
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.getElementById("pair-code").addEventListener("input", event => {
    event.target.value = event.target.value.replace(/[^a-f0-9]/gi, "").toUpperCase().slice(0, 12);
  });

  async function initialize() {
    try {
      await api("/api/admin/session");
      isAdmin = true;
      await loadProducts();
      await loadDevices();
    } catch {
      isAdmin = false;
      await loadProducts();
    }
  }

  render();
  initialize();
})();
