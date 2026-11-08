// logica.js: búsqueda de respuestas sin IA. Sin dependencias; se usa en el
// navegador (window.ChatLogica) y en pruebas con Node (module.exports).
(function (raiz) {
  // Pasa a minúsculas, quita tildes y signos, y deja las palabras separadas
  // por un solo espacio.
  function normalizar(texto) {
    return String(texto)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Cuántas palabras clave de la pregunta aparecen en el mensaje. Una palabra
  // clave coincide si el mensaje tiene una palabra que EMPIEZA igual
  // ("demora" sirve para "demoran").
  function puntuar(mensaje, faq) {
    var base = " " + normalizar(mensaje);
    var puntos = 0;
    (faq.palabras_clave || []).forEach(function (clave) {
      var k = normalizar(clave);
      if (k && base.indexOf(" " + k) !== -1) puntos++;
    });
    return puntos;
  }

  // Devolución y reclamo prevalecen sobre el resto (primero la devolución).
  // Para lo demás gana la pregunta con más coincidencias; si hay empate se
  // devuelven hasta 3 para que el cliente elija.
  var PRIORIDAD = { devolucion: 2, reclamo: 1 };

  function elegirFaqs(mensaje, faqs) {
    var candidatas = faqs
      .map(function (f) { return { f: f, puntos: puntuar(mensaje, f) }; })
      .filter(function (c) { return c.puntos > 0; });
    if (candidatas.length === 0) return [];
    var prio = function (c) { return PRIORIDAD[c.f.tipo] || 0; };
    var mayor = Math.max.apply(null, candidatas.map(prio));
    if (mayor > 0) {
      var ganadoras = candidatas.filter(function (c) { return prio(c) === mayor; });
      ganadoras.sort(function (a, b) { return b.puntos - a.puntos; });
      return [ganadoras[0].f];
    }
    var mejor = Math.max.apply(null, candidatas.map(function (c) { return c.puntos; }));
    return candidatas
      .filter(function (c) { return c.puntos === mejor; })
      .sort(function (a, b) { return a.f.orden - b.f.orden; })
      .slice(0, 3)
      .map(function (c) { return c.f; });
  }

  // Rellena {lista} y {cierre}. Si no hay fecha de cierre, quita la frase que
  // la menciona.
  function rellenar(plantilla, datos) {
    var t = plantilla;
    if (!datos.cierre) t = t.replace(/\s*[^.!?]*\{cierre\}[^.!?]*[.!?]?/g, "");
    return t.split("{lista}").join(datos.lista).split("{cierre}").join(datos.cierre || "");
  }

  function formatoPrecio(n) {
    if (n === null || n === undefined || n === "") return "";
    var v = Number(n);
    return " (S/ " + v.toLocaleString("es-PE", { maximumFractionDigits: 2 }) + ")";
  }

  function listaProductos(productos) {
    return productos.map(function (p) { return p.nombre + formatoPrecio(p.precio); }).join(", ");
  }

  function listaPromociones(promos) {
    return promos
      .map(function (p) { return p.condiciones ? p.descripcion + " (" + p.condiciones + ")" : p.descripcion; })
      .join("; ");
  }

  // Fecha de cierre más próxima, escrita como "20 de noviembre".
  function proximoCierre(productos) {
    var fechas = productos
      .map(function (p) { return p.fecha_cierre; })
      .filter(function (f) { return !!f; })
      .sort();
    if (fechas.length === 0) return "";
    var d = new Date(String(fechas[0]).slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-PE", { day: "numeric", month: "long" });
  }

  // Enlace de WhatsApp con el mensaje escrito; vacío si el número no está
  // configurado (solo dígitos, con código de país).
  function enlaceWhatsApp(numero, mensaje) {
    if (!/^\d{8,15}$/.test(String(numero || ""))) return "";
    return "https://wa.me/" + numero + "?text=" + encodeURIComponent(mensaje);
  }

  var api = {
    normalizar: normalizar, puntuar: puntuar, elegirFaqs: elegirFaqs,
    rellenar: rellenar, formatoPrecio: formatoPrecio, listaProductos: listaProductos,
    listaPromociones: listaPromociones, proximoCierre: proximoCierre,
    enlaceWhatsApp: enlaceWhatsApp,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.ChatLogica = api;
})(typeof window !== "undefined" ? window : this);
