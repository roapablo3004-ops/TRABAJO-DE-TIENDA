const KEY = "inventario_tienda_v1";
const KEY_VENTAS = "inventario_ventas_v1";
const KEY_ALERTAS = "inventario_alertas_escasez_v1";
const KEY_HISTORIAL = "inventario_historial_v1";
const LIMITE_ESCASEZ = 5;
const DIAS_HISTORIAL = 10;
const WHATSAPP_JEFE = "527121580712";

let productos = JSON.parse(localStorage.getItem(KEY)) || [
  { id: 1, nombre: "Refresco", categoria: "Bebidas", precio: 18, cantidad: 20, minimo: 5 },
  { id: 2, nombre: "Galletas", categoria: "Alimentos", precio: 15, cantidad: 4, minimo: 5 },
  { id: 3, nombre: "Agua", categoria: "Bebidas", precio: 12, cantidad: 30, minimo: 8 }
];

let ventas = migrarVentas(JSON.parse(localStorage.getItem(KEY_VENTAS)) || []);
let historial = JSON.parse(localStorage.getItem(KEY_HISTORIAL)) || [];
let alertasEscasez = JSON.parse(localStorage.getItem(KEY_ALERTAS)) || {};
let productoActivo = null;
let carrito = [];
let avisarWhatsappEscasez = false;

const $ = id => document.getElementById(id);
const dinero = n => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const LINEA = "━━━━━━━━━━━━━━━━━━━━";

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function horaActual() {
  return new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fechaLimiteHistorial() {
  const d = new Date();
  d.setDate(d.getDate() - (DIAS_HISTORIAL - 1));
  return d.toISOString().slice(0, 10);
}

function podarHistorial() {
  const limite = fechaLimiteHistorial();
  ventas = ventas.filter(v => v.fecha >= limite);
}

function urlWhatsApp(mensaje) {
  return `https://wa.me/${WHATSAPP_JEFE}?text=${encodeURIComponent(mensaje)}`;
}

function abrirWhatsApp(mensaje) {
  window.open(urlWhatsApp(mensaje), "_blank");
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearFecha(iso) {
  const [y, m, d] = iso.split("-");
  return capitalizar(new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  }));
}

function resumenDia(fecha) {
  const delDia = ventas.filter(v => v.fecha === fecha);
  const activas = delDia.filter(v => !v.reembolsada);
  const reembolsos = delDia.filter(v => v.reembolsada);
  const total = activas.reduce((a, v) => a + v.total, 0);
  const totalReembolsos = reembolsos.reduce((a, v) => a + v.total, 0);
  return { delDia, activas, reembolsos, total, totalReembolsos };
}

function mensajeEscasez(p) {
  const uds = p.cantidad === 1 ? "unidad" : "unidades";
  const urgente = p.cantidad <= 2 ? "URGENTE — reponer ya" : "Reponer lo antes posible";
  return [
    LINEA,
    "⚠️  *ALERTA DE ESCASEZ*",
    "🏪  Inventario ICCEP",
    LINEA,
    "",
    `📅  ${formatearFecha(hoy())}`,
    `⏰  ${horaActual()}`,
    "",
    "📦  *Producto*",
    `     ${p.nombre}`,
    "",
    "🏷️  *Categoría*",
    `     ${p.categoria}`,
    "",
    "📉  *Existencias*",
    `     *${p.cantidad} ${uds}*  (mínimo recomendado: 5)`,
    "",
    `🚨  *${urgente}*`,
    "",
    LINEA,
    "_Aviso automático del sistema de inventario._"
  ].join("\n");
}

function mensajeCierreDia(fecha = hoy()) {
  const { delDia, activas, reembolsos, total, totalReembolsos } = resumenDia(fecha);
  const lineas = [
    LINEA,
    "🏪  *INVENTARIO ICCEP*",
    "📋  *Cierre de caja*",
    LINEA,
    "",
    `📅  ${formatearFecha(fecha)}`,
    `⏰  Enviado a las ${horaActual()}`,
    "",
    "──────── *RESUMEN* ────────",
    `🧾  Tickets del día:  *${delDia.length}*`,
    `✅  Ventas activas:   *${activas.length}*`,
    `↩️  Reembolsos:       *${reembolsos.length}*  (${dinero(totalReembolsos)})`,
    `💰  *TOTAL NETO:      ${dinero(total)}*`,
    "─────────────────────────",
    ""
  ];

  if (!delDia.length) {
    lineas.push("📭  No se registraron ventas este día.");
    lineas.push("");
    lineas.push(LINEA);
    lineas.push("_Reporte enviado al jefe desde Inventario ICCEP._");
    return lineas.join("\n");
  }

  lineas.push("──────── *DETALLE* ────────");
  delDia.forEach((v, i) => {
    const num = String(i + 1).padStart(2, "0");
    const estado = v.reembolsada ? "  ↩️ *REEMBOLSADA*" : "";
    lineas.push("");
    lineas.push(`*Ticket ${num}*   ${v.hora}${estado}`);
    (v.items || []).forEach(it => {
      lineas.push(`   • ${it.cantidad} × ${it.nombre}`);
      lineas.push(`     ${it.categoria}  ·  ${dinero(it.precio)} c/u`);
      lineas.push(`     Subtotal: *${dinero(it.subtotal)}*`);
    });
    lineas.push(`   💵 Total ticket: *${dinero(v.total)}*`);
  });

  lineas.push("");
  lineas.push("─────────────────────────");
  lineas.push(`💰  *CIERRE NETO:  ${dinero(total)}*`);
  lineas.push(LINEA);
  lineas.push("_Reporte enviado al jefe desde Inventario ICCEP._");
  return lineas.join("\n");
}

function enviarCierreAlJefe(fecha = hoy()) {
  abrirWhatsApp(mensajeCierreDia(fecha));
  toast("WhatsApp listo: revise el reporte y pulse Enviar");
}

function migrarVentas(lista) {
  return lista.map(v => {
    if (v.items && Array.isArray(v.items)) {
      return { reembolsada: false, ...v };
    }
    return {
      id: v.id,
      fecha: v.fecha,
      hora: v.hora,
      total: v.total,
      reembolsada: !!v.reembolsada,
      items: [{
        productoId: v.productoId,
        nombre: v.nombre,
        categoria: v.categoria || "General",
        cantidad: v.cantidad,
        precio: v.cantidad ? v.total / v.cantidad : 0,
        subtotal: v.total
      }]
    };
  });
}

function guardar() {
  localStorage.setItem(KEY, JSON.stringify(productos));
  actualizar();
}

function guardarVentas() {
  podarHistorial();
  localStorage.setItem(KEY_VENTAS, JSON.stringify(ventas));
}

function persistirHistorial() {
  const limite = fechaLimiteHistorial();
  historial = historial.filter(h => h.fecha >= limite);
  localStorage.setItem(KEY_HISTORIAL, JSON.stringify(historial));
}

function guardarEnHistorial() {
  const delDia = ventas.filter(v => v.fecha === hoy());
  if (!delDia.length) {
    toast("No hay ventas de hoy para guardar", "error");
    return;
  }

  const snapshot = {
    fecha: hoy(),
    horaGuardado: horaActual(),
    ventas: JSON.parse(JSON.stringify(delDia))
  };

  historial = historial.filter(h => h.fecha !== hoy());
  historial.push(snapshot);
  persistirHistorial();
  actualizarHistorial();
  toast(`Ventas guardadas en el historial: ${delDia.length} tickets`);
  const seccion = $("seccionHistorial");
  if (seccion) seccion.scrollIntoView({ behavior: "smooth" });
}

function toast(msg, tipo = "success", duracion = 3200, extraHtml = "") {
  const icons = { success: "✅", warning: "⚠️", error: "❌", escasez: "📦" };
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.innerHTML = `<span>${icons[tipo] || "ℹ️"}</span><span class="toast-msg">${msg}</span>${extraHtml}`;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), duracion);
}

function guardarAlertas() {
  localStorage.setItem(KEY_ALERTAS, JSON.stringify(alertasEscasez));
}

function limpiarAlertasProducto(id) {
  Object.keys(alertasEscasez).forEach(clave => {
    if (clave.startsWith(`${id}_`)) delete alertasEscasez[clave];
  });
  guardarAlertas();
}

function verificarEscasez() {
  productos.forEach(p => {
    if (p.cantidad >= LIMITE_ESCASEZ) {
      limpiarAlertasProducto(p.id);
      return;
    }

    if (p.cantidad >= 1 && p.cantidad < LIMITE_ESCASEZ) {
      const clave = `${p.id}_${p.cantidad}`;
      if (!alertasEscasez[clave]) {
        const mensaje = `Escasez: ${p.nombre} — quedan ${p.cantidad}`;
        const boton = `<a class="btn-wa" href="${urlWhatsApp(mensajeEscasez(p))}" target="_blank" rel="noopener">Enviar a WhatsApp</a>`;
        toast(mensaje, "escasez", 10000, boton);
        if (avisarWhatsappEscasez) {
          abrirWhatsApp(mensajeEscasez(p));
        }
        alertasEscasez[clave] = true;
        guardarAlertas();
      }
    }
  });
  avisarWhatsappEscasez = false;
}

function estadoProducto(p) {
  if (p.cantidad <= 0) return { clase: "out", texto: "Agotado" };
  if (p.cantidad <= p.minimo) return { clase: "low", texto: "Stock bajo" };
  return { clase: "ok", texto: "Disponible" };
}

function ventasActivas() {
  return ventas.filter(v => !v.reembolsada);
}

function ventasDelDia() {
  return ventasActivas()
    .filter(v => v.fecha === hoy())
    .reduce((a, v) => a + v.total, 0);
}

function tituloVenta(v) {
  if (!v.items || !v.items.length) return "Venta";
  if (v.items.length === 1) return v.items[0].nombre;
  return `${v.items[0].nombre} + ${v.items.length - 1} más`;
}

function actualizarVentasUI() {
  $("ventasDia").textContent = dinero(ventasDelDia());

  const hoyVentas = ventas.filter(v => v.fecha === hoy()).reverse();
  const lista = $("listaVentas");

  if (!hoyVentas.length) {
    lista.innerHTML = '<p class="empty-state">Aún no hay ventas registradas hoy</p>';
    return;
  }

  lista.innerHTML = hoyVentas.map(v => {
    const detalle = (v.items || []).map(i => `${i.cantidad}x ${esc(i.nombre)}`).join(" · ");
    const reembolsada = !!v.reembolsada;
    return `
    <div class="venta-item ${reembolsada ? "reembolsada" : ""}">
      <div class="info">
        <strong>${esc(tituloVenta(v))}</strong>
        <span>${detalle} · ${v.hora}${reembolsada ? " · Reembolsada" : ""}</span>
      </div>
      <div class="venta-acciones">
        <div class="monto">${dinero(v.total)}</div>
        ${reembolsada
          ? `<span class="badge out">Reembolso</span>`
          : `<button class="btn refund" onclick="reembolsar(${v.id})">Reembolso</button>`}
      </div>
    </div>`;
  }).join("");
}

function resumenDeLista(lista) {
  const activas = lista.filter(v => !v.reembolsada);
  const reembolsos = lista.filter(v => v.reembolsada);
  const total = activas.reduce((a, v) => a + v.total, 0);
  const totalReembolsos = reembolsos.reduce((a, v) => a + v.total, 0);
  return { activas, reembolsos, total, totalReembolsos };
}

function actualizarHistorial() {
  const caja = $("listaHistorial");
  if (!caja) return;

  const dias = [...historial].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!dias.length) {
    caja.innerHTML = '<p class="empty-state">Aún no hay historial. Pulse “Guardar en historial” para archivar las ventas del día.</p>';
    return;
  }

  caja.innerHTML = dias.map(dia => {
    const delDia = dia.ventas || [];
    const { total, reembolsos, totalReembolsos } = resumenDeLista(delDia);
    const tickets = delDia.map(v => {
      const items = (v.items || []).map(i => `${i.cantidad}x ${esc(i.nombre)}`).join(", ");
      return `<div class="historial-ticket">
        <span>${v.hora} · ${items}${v.reembolsada ? " · Reembolsada" : ""}</span>
        <strong>${dinero(v.total)}</strong>
      </div>`;
    }).join("");

    return `<article class="historial-dia">
      <div class="historial-dia-head">
        <div>
          <strong>${esc(formatearFecha(dia.fecha))}</strong>
          <span>Guardado a las ${dia.horaGuardado} · ${delDia.length} tickets · Neto ${dinero(total)}${reembolsos.length ? ` · ${reembolsos.length} reembolsos (${dinero(totalReembolsos)})` : ""}</span>
        </div>
        <button type="button" class="btn sell" onclick="enviarCierreAlJefe('${dia.fecha}')">Enviar este día</button>
      </div>
      ${tickets}
    </article>`;
  }).join("");
}

function actualizar() {
  const filtro = $("buscar").value.toLowerCase().trim();
  const lista = productos.filter(p =>
    p.nombre.toLowerCase().includes(filtro) ||
    p.categoria.toLowerCase().includes(filtro)
  );

  $("totalProductos").textContent = productos.length;
  $("totalUnidades").textContent = productos.reduce((a, p) => a + p.cantidad, 0);
  $("stockBajo").textContent = productos.filter(p => p.cantidad <= p.minimo).length;

  $("tablaProductos").innerHTML = lista.map(p => {
    const est = estadoProducto(p);
    const sinStock = p.cantidad <= 0;
    const inicial = esc(p.nombre.charAt(0).toUpperCase());
    return `
    <tr>
      <td>
        <div class="product-cell">
          <div class="product-avatar">${inicial}</div>
          <div>
            <div class="product-name">${esc(p.nombre)}</div>
          </div>
        </div>
      </td>
      <td><span class="cat-tag">${esc(p.categoria)}</span></td>
      <td><strong>${dinero(p.precio)}</strong></td>
      <td><span class="stock-num">${p.cantidad}</span></td>
      <td><span class="badge ${est.clase}">${est.texto}</span></td>
      <td>
        <div class="actions">
          <button class="btn sell" onclick="abrirVender(${p.id})" ${sinStock ? "disabled" : ""}>Vender</button>
          <button class="btn restar" onclick="abrirRestar(${p.id})" ${sinStock ? "disabled" : ""}>Restar</button>
          <button class="btn edit" onclick="editar(${p.id})">Editar</button>
          <button class="btn danger" onclick="eliminar(${p.id})">Eliminar</button>
        </div>
      </td>
    </tr>`;
  }).join("");

  $("sinProductos").classList.toggle("hidden", lista.length > 0);
  actualizarVentasUI();
  actualizarHistorial();
  verificarEscasez();
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function abrirModal(id) {
  $(id).classList.add("active");
}

function cerrarModal(id) {
  $(id).classList.remove("active");
  productoActivo = null;
  if (id === "modalVender") {
    carrito = [];
    $("pickerProducto").classList.add("hidden");
  }
}

function stockDisponible(productoId) {
  const p = productos.find(x => x.id === productoId);
  if (!p) return 0;
  const enCarrito = carrito.find(l => l.productoId === productoId);
  const usado = enCarrito ? enCarrito.cantidad : 0;
  return p.cantidad - usado;
}

function totalCarrito() {
  return carrito.reduce((a, l) => a + l.cantidad * l.precio, 0);
}

function renderCarrito() {
  const caja = $("carritoVenta");
  if (!carrito.length) {
    caja.innerHTML = '<p class="empty-state">Agregue productos al ticket</p>';
    $("modalVenderTotal").textContent = dinero(0);
    return;
  }

  caja.innerHTML = carrito.map((l, i) => `
    <div class="ticket-line">
      <div>
        <strong>${esc(l.nombre)}</strong>
        <span>${esc(l.categoria)} · ${dinero(l.precio)} c/u</span>
      </div>
      <input type="number" min="1" max="${l.stockMax}" value="${l.cantidad}" onchange="cambiarCantidadLinea(${i}, this.value)">
      <div>
        <div class="line-total">${dinero(l.cantidad * l.precio)}</div>
        <button type="button" class="btn-remove-line" onclick="quitarLinea(${i})" title="Quitar">&times;</button>
      </div>
    </div>`).join("");

  $("modalVenderTotal").textContent = dinero(totalCarrito());
}

function cambiarCantidadLinea(indice, valor) {
  const linea = carrito[indice];
  if (!linea) return;
  let cant = Number(valor);
  if (!cant || cant < 1) cant = 1;
  if (cant > linea.stockMax) {
    cant = linea.stockMax;
    toast(`Solo hay ${linea.stockMax} unidades de ${linea.nombre}`, "error");
  }
  linea.cantidad = cant;
  renderCarrito();
}

function quitarLinea(indice) {
  carrito.splice(indice, 1);
  renderCarrito();
}

function abrirVender(id) {
  const p = productos.find(x => x.id === id);
  if (!p || p.cantidad <= 0) return;

  carrito = [{
    productoId: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    precio: p.precio,
    cantidad: 1,
    stockMax: p.cantidad
  }];

  $("pickerProducto").classList.add("hidden");
  renderCarrito();
  abrirModal("modalVender");
}

function llenarPicker() {
  const select = $("productoExtra");
  const disponibles = productos.filter(p => stockDisponible(p.id) > 0);
  if (!disponibles.length) {
    select.innerHTML = '<option value="">No hay más productos con stock</option>';
    return;
  }
  select.innerHTML = disponibles.map(p =>
    `<option value="${p.id}">${esc(p.nombre)} — ${esc(p.categoria)} (${stockDisponible(p.id)} uds)</option>`
  ).join("");
  $("cantidadExtra").value = 1;
}

function anadirProductoAlTicket() {
  const id = Number($("productoExtra").value);
  const cant = Number($("cantidadExtra").value);
  const p = productos.find(x => x.id === id);
  if (!p) {
    toast("Seleccione un producto", "error");
    return;
  }
  const disponible = stockDisponible(p.id);
  if (!cant || cant < 1) {
    toast("Ingresa una cantidad válida", "error");
    return;
  }
  if (cant > disponible) {
    toast(`Solo quedan ${disponible} unidades de ${p.nombre}`, "error");
    return;
  }

  const existente = carrito.find(l => l.productoId === p.id);
  if (existente) {
    existente.cantidad += cant;
  } else {
    carrito.push({
      productoId: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      precio: p.precio,
      cantidad: cant,
      stockMax: p.cantidad
    });
  }

  $("pickerProducto").classList.add("hidden");
  renderCarrito();
  toast(`${p.nombre} agregado al ticket`);
}

function confirmarVenta() {
  if (!carrito.length) {
    toast("Agregue al menos un producto", "error");
    return;
  }

  for (const linea of carrito) {
    const p = productos.find(x => x.id === linea.productoId);
    if (!p || linea.cantidad > p.cantidad) {
      toast(`Stock insuficiente de ${linea.nombre}`, "error");
      return;
    }
  }

  const items = carrito.map(l => ({
    productoId: l.productoId,
    nombre: l.nombre,
    categoria: l.categoria,
    cantidad: l.cantidad,
    precio: l.precio,
    subtotal: l.cantidad * l.precio
  }));

  items.forEach(item => {
    const p = productos.find(x => x.id === item.productoId);
    p.cantidad -= item.cantidad;
  });

  const total = items.reduce((a, i) => a + i.subtotal, 0);
  ventas.push({
    id: Date.now(),
    fecha: hoy(),
    hora: horaActual(),
    total,
    reembolsada: false,
    items
  });

  avisarWhatsappEscasez = true;
  guardarVentas();
  guardar();
  cerrarModal("modalVender");
  toast(`Venta registrada: ${items.length} producto${items.length > 1 ? "s" : ""} — ${dinero(total)}`);
}

function devolverStock(item) {
  let p = productos.find(x => x.id === item.productoId);
  if (p) {
    p.cantidad += item.cantidad;
    return;
  }
  p = productos.find(x =>
    x.nombre.toLowerCase() === String(item.nombre).toLowerCase() &&
    x.categoria.toLowerCase() === String(item.categoria || "").toLowerCase()
  );
  if (p) {
    p.cantidad += item.cantidad;
    return;
  }
  productos.push({
    id: item.productoId || Date.now(),
    nombre: item.nombre,
    categoria: item.categoria || "General",
    precio: item.precio || 0,
    cantidad: item.cantidad,
    minimo: 5
  });
}

function reembolsar(id) {
  const venta = ventas.find(v => v.id === id);
  if (!venta || venta.reembolsada) return;

  const ok = confirm(`¿Hacer reembolso de ${dinero(venta.total)}?\nEl dinero se restará de las ventas y los productos volverán a su categoría.`);
  if (!ok) return;

  (venta.items || []).forEach(devolverStock);
  venta.reembolsada = true;
  venta.horaReembolso = horaActual();

  guardarVentas();
  guardar();
  toast(`Reembolso aplicado: ${dinero(venta.total)}. Productos devueltos al inventario.`, "warning", 4500);
}

function abrirRestar(id) {
  const p = productos.find(x => x.id === id);
  if (!p || p.cantidad <= 0) return;

  productoActivo = p;
  $("modalRestarNombre").textContent = p.nombre;
  $("modalRestarInfo").textContent = `${p.categoria} · Disponible: ${p.cantidad} unidades`;
  $("cantidadRestar").max = p.cantidad;
  $("cantidadRestar").value = 1;
  abrirModal("modalRestar");
}

function confirmarResta() {
  if (!productoActivo) return;
  const cant = Number($("cantidadRestar").value);

  if (!cant || cant <= 0) {
    toast("Ingresa una cantidad válida", "error");
    return;
  }
  if (cant > productoActivo.cantidad) {
    toast(`Solo hay ${productoActivo.cantidad} unidades disponibles`, "error");
    return;
  }

  productoActivo.cantidad -= cant;
  avisarWhatsappEscasez = true;
  guardar();
  cerrarModal("modalRestar");
  toast(`Se restaron ${cant} unidades de "${productoActivo.nombre}"`, "warning");
}

function restarProducto(id) {
  abrirRestar(id);
}

function guardarProducto(continuar) {
  const id = Number($("productoId").value);
  const producto = {
    id: id || Date.now(),
    nombre: $("nombre").value.trim(),
    categoria: $("categoria").value.trim(),
    precio: Number($("precio").value),
    cantidad: Number($("cantidad").value),
    minimo: Number($("minimo").value)
  };

  if (!producto.nombre || !producto.categoria) {
    toast("Complete nombre y categoría", "error");
    return false;
  }

  if (id) {
    const i = productos.findIndex(p => p.id === id);
    productos[i] = producto;
    toast("Producto actualizado correctamente");
  } else {
    productos.push(producto);
    toast("Producto agregado al inventario");
  }
  guardar();
  limpiar();
  if (continuar) {
    $("nombre").focus();
    toast("Listo: capture otro producto distinto", "success");
  }
  return true;
}

$("productoForm").addEventListener("submit", e => {
  e.preventDefault();
  guardarProducto(false);
});

$("btnOtroProducto").addEventListener("click", () => {
  const form = $("productoForm");
  if (!form.reportValidity()) return;
  guardarProducto(true);
});

function editar(id) {
  const p = productos.find(x => x.id === id);
  $("productoId").value = p.id;
  $("nombre").value = p.nombre;
  $("categoria").value = p.categoria;
  $("precio").value = p.precio;
  $("cantidad").value = p.cantidad;
  $("minimo").value = p.minimo;
  $("tituloFormulario").textContent = "Editar producto";
  $("cancelar").classList.remove("hidden");
  document.getElementById("seccionFormulario").scrollIntoView({ behavior: "smooth" });
}

function eliminar(id) {
  const p = productos.find(x => x.id === id);
  if (confirm(`¿Eliminar "${p.nombre}" del inventario?`)) {
    limpiarAlertasProducto(id);
    productos = productos.filter(x => x.id !== id);
    guardar();
    toast("Producto eliminado", "warning");
  }
}

function limpiar() {
  $("productoForm").reset();
  $("productoId").value = "";
  $("minimo").value = 5;
  $("tituloFormulario").textContent = "Agregar producto";
  $("cancelar").classList.add("hidden");
}

$("cancelar").addEventListener("click", limpiar);
$("buscar").addEventListener("input", actualizar);

$("confirmarVender").addEventListener("click", confirmarVenta);
$("confirmarRestar").addEventListener("click", confirmarResta);
$("cancelarVender").addEventListener("click", () => cerrarModal("modalVender"));
$("cancelarRestar").addEventListener("click", () => cerrarModal("modalRestar"));
$("cerrarVender").addEventListener("click", () => cerrarModal("modalVender"));
$("cerrarRestar").addEventListener("click", () => cerrarModal("modalRestar"));

$("btnAgregarOtroVenta").addEventListener("click", () => {
  llenarPicker();
  $("pickerProducto").classList.remove("hidden");
});
$("cancelarPicker").addEventListener("click", () => $("pickerProducto").classList.add("hidden"));
$("anadirProductoVenta").addEventListener("click", anadirProductoAlTicket);

$("modalVender").addEventListener("click", e => { if (e.target === $("modalVender")) cerrarModal("modalVender"); });
$("modalRestar").addEventListener("click", e => { if (e.target === $("modalRestar")) cerrarModal("modalRestar"); });

$("limpiarVentas").addEventListener("click", () => {
  if (confirm("¿Limpiar solo las ventas de hoy? El historial de los otros días se conserva.")) {
    const fecha = hoy();
    ventas = ventas.filter(v => v.fecha !== fecha);
    guardarVentas();
    actualizar();
    toast("Ventas de hoy limpiadas. El historial de 10 días se mantiene.", "warning");
  }
});

$("btnWhatsappJefe").addEventListener("click", () => enviarCierreAlJefe());
$("btnEnviarHistorialJefe").addEventListener("click", () => enviarCierreAlJefe());
$("btnGuardarHistorial").addEventListener("click", guardarEnHistorial);
$("btnGuardarHistorial2").addEventListener("click", guardarEnHistorial);

$("fechaHoy").textContent = new Date().toLocaleDateString("es-MX", {
  weekday: "long", year: "numeric", month: "long", day: "numeric"
});

guardarVentas();
actualizar();
