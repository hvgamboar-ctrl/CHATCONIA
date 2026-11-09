// chat.js: chat flotante de preguntas frecuentes (sin IA).
// Usa logica.js para buscar la respuesta y, según config.js, lee los datos de
// Supabase o usa los datos de ejemplo de datos-demo.js.
(function () {
  var L = window.ChatLogica;
  var CFG = Object.assign(
    { RENATO_WHATSAPP: "", ADELANTO_SOLES: 20, SUPABASE_URL: "", SUPABASE_ANON_KEY: "", IA_FUNCION: "" },
    window.BLOQE_CONFIG || {}
  );
  var DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  // La IA solo entra con Supabase configurado y una función puesta en config.
  var IA = !DEMO && !!CFG.IA_FUNCION;

  var TEXTOS = {
    nombre: "Asistente BLOQE",
    globo: "¿Te ayudo?",
    inicial:
      "Hola, soy el asistente virtual de BLOQE. Elige una pregunta o escribe tu consulta, " +
      "y te ayudo con plazos, pagos, productos, promociones y reservas.",
    sinRespuesta:
      "No encontré una respuesta a eso. Puedes elegir una de las preguntas de abajo o hablar directamente con Renato.",
    iaPensando: "Déjame revisarlo…",
    varias: "No estoy seguro de qué necesitas. ¿Te refieres a alguna de estas?",
    casoRegistrado: "Listo, registré tu caso. El equipo de BLOQE lo revisará y se comunicará contigo.",
    casoError: "No pude registrar tu caso en este momento. Escríbenos por WhatsApp y lo vemos ahí.",
    errorDatos:
      "No pude consultar la información en este momento. Inténtalo de nuevo en unos minutos o escríbele a Renato.",
  };

  // ---------- Datos: Supabase (REST) o demostración ----------
  var sessionId = (function () {
    try {
      var g = sessionStorage.getItem("bloqe_chat_session");
      if (g) return g;
      var n = crypto.randomUUID();
      sessionStorage.setItem("bloqe_chat_session", n);
      return n;
    } catch (e) {
      return "sesion-" + Math.random().toString(36).slice(2, 12);
    }
  })();

  function cabeceras() {
    var h = { apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    // Las claves nuevas de Supabase (sb_publishable_...) no son un JWT.
    if (!/^sb_/.test(CFG.SUPABASE_ANON_KEY)) h.Authorization = "Bearer " + CFG.SUPABASE_ANON_KEY;
    return h;
  }
  function rest(ruta, opciones) {
    var base = CFG.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/";
    return fetch(base + ruta, Object.assign({ headers: cabeceras() }, opciones || {})).then(function (r) {
      if (!r.ok) throw new Error("Supabase " + r.status);
      return r.status === 204 ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }

  var datos = DEMO
    ? {
        faqs: function () { return Promise.resolve(window.BLOQE_DEMO.faqs); },
        productos: function () { return Promise.resolve(window.BLOQE_DEMO.productos); },
        promociones: function () { return Promise.resolve(window.BLOQE_DEMO.promociones); },
        registrar: function (r) {
          try {
            var lista = JSON.parse(localStorage.getItem("bloqe_demo_registros") || "[]");
            lista.push(Object.assign({ fecha: new Date().toISOString() }, r));
            localStorage.setItem("bloqe_demo_registros", JSON.stringify(lista));
          } catch (e) { /* sin almacenamiento: no pasa nada */ }
          console.info("[demo] registro:", r);
          return Promise.resolve(true);
        },
        ia: function () { return Promise.resolve(null); },
      }
    : {
        faqs: function () {
          return rest(
            "faqs?select=id,tipo,pregunta,palabras_clave,respuesta,respuesta_sin_datos,en_menu,orden" +
              "&activa=eq.true&order=orden.asc"
          );
        },
        productos: function () {
          return rest("v_productos_abiertos?select=nombre,precio,fecha_cierre");
        },
        promociones: function () {
          return rest("v_promociones_vigentes?select=descripcion,condiciones");
        },
        registrar: function (r) {
          return rest("rpc/registrar_conversacion", {
            method: "POST",
            body: JSON.stringify({
              p_session: sessionId, p_tipo: r.tipo, p_pregunta: String(r.pregunta).slice(0, 500),
              p_respuesta: r.respuesta || null, p_nombre: r.nombre || null, p_celular: r.celular || null,
            }),
          }).then(function () { return true; }, function () { return false; });
        },
        // Llama a la Edge Function. Es el único camino con IA, y la clave de
        // la IA no pasa por aquí: vive en la función.
        ia: function (mensaje, historial) {
          var base = CFG.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + CFG.IA_FUNCION;
          return fetch(base, {
            method: "POST",
            // Solo apikey: la clave publishable no es un JWT y no va como Bearer.
            headers: { apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              sesion_id: sessionId,
              mensaje: String(mensaje).slice(0, 500),
              historial: historial || [],
            }),
          }).then(function (r) {
            return r.text().then(function (t) {
              var d = null;
              try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
              // 502/503/límite vienen con respaldo:true y los trata el llamador.
              if (!r.ok && !(d && (d.respaldo || d.respuesta))) throw new Error("IA " + r.status);
              return d;
            });
          });
        },
      };

  // ---------- Interfaz ----------
  function el(tag, props, hijos) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "class") e.className = props[k];
      else if (k === "text") e.textContent = props[k];
      else e.setAttribute(k, props[k]);
    });
    (hijos || []).forEach(function (h) { e.appendChild(h); });
    return e;
  }
  var ICONO =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var raiz = el("div", { id: "bq-chat" });
  var globo = el("div", { class: "bq-globo", text: TEXTOS.globo });
  var lanzador = el("button", { type: "button", class: "bq-lanzador", "aria-label": "Abrir chat de ayuda" });
  lanzador.innerHTML = ICONO;
  var cerrar = el("button", { type: "button", class: "bq-cerrar", "aria-label": "Cerrar chat", text: "×" });
  var cab = el("header", { class: "bq-cab" }, [el("strong", { text: TEXTOS.nombre }), cerrar]);
  var lista = el("div", { class: "bq-lista", "aria-live": "polite" });
  var menu = el("div", { class: "bq-menu", "aria-label": "Preguntas frecuentes" });
  var entrada = el("input", { type: "text", maxlength: "500", placeholder: "Escribe tu consulta…", "aria-label": "Escribe tu consulta" });
  var enviar = el("button", { type: "submit", class: "bq-enviar", text: "Enviar" });
  var barra = el("form", { class: "bq-barra" }, [entrada, enviar]);
  var inNombre = el("input", { type: "text", maxlength: "80", placeholder: "Tu nombre", "aria-label": "Tu nombre" });
  var inCelular = el("input", { type: "tel", inputmode: "tel", maxlength: "16", placeholder: "Tu celular", "aria-label": "Tu celular" });
  var errorForm = el("small", { class: "bq-error" });
  var okForm = el("button", { type: "submit", class: "bq-enviar", text: "Enviar" });
  var noForm = el("button", { type: "button", class: "bq-secundario", text: "Cancelar" });
  var form = el("form", { class: "bq-form", hidden: "" }, [
    inNombre, inCelular,
    el("small", { class: "bq-nota", text: "Usaremos estos datos solo para atender tu caso." }),
    errorForm, el("div", { class: "bq-fila" }, [okForm, noForm]),
  ]);
  var aviso = DEMO
    ? el("div", { class: "bq-demo", text: "Modo demostración: los casos no se guardan en Supabase." })
    : null;
  var panel = el("section", { class: "bq-panel", "aria-label": TEXTOS.nombre, hidden: "" },
    [cab, lista, menu, barra, form].concat(aviso ? [aviso] : []));
  raiz.appendChild(globo); raiz.appendChild(lanzador); raiz.appendChild(panel);

  var faqs = [], pendiente = null, ocupado = false, cargado = false, indicador = null;
  // Últimos turnos, para que la IA entienda un "y cuánto cuesta?" suelto.
  var historial = [];
  function recordar(rol, texto) {
    historial.push({ rol: rol, texto: String(texto).slice(0, 500) });
    if (historial.length > 12) historial = historial.slice(-12);
  }

  function bajar() { lista.scrollTop = lista.scrollHeight; }
  function bloquear(v) {
    ocupado = v;
    enviar.disabled = v;
    Array.prototype.forEach.call(raiz.querySelectorAll(".bq-chip, .bq-opcion"), function (b) { b.disabled = v; });
    if (v && !indicador) { indicador = el("div", { class: "bq-bot", text: "…" }); lista.appendChild(indicador); bajar(); }
    if (!v && indicador) { indicador.remove(); indicador = null; }
  }

  function clienteDice(t) {
    recordar("cliente", t);
    lista.insertBefore(el("div", { class: "bq-fila-msg bq-der" }, [el("div", { class: "bq-cliente", text: t })]), indicador);
    bajar();
  }
  function botDice(t, extra) {
    extra = extra || {};
    recordar("bot", t);
    var bloque = el("div", { class: "bq-fila-msg bq-izq" }, [el("div", { class: "bq-bot", text: t })]);
    (extra.botones || []).forEach(function (b) {
      var btn = el("button", { type: "button", class: "bq-opcion", text: b.etiqueta });
      btn.addEventListener("click", function () { if (!ocupado) b.alPulsar(); });
      bloque.appendChild(btn);
    });
    var url = extra.wa
      ? L.enlaceWhatsApp(CFG.RENATO_WHATSAPP, extra.wa.mensaje)
      : extra.conWhatsApp ? L.enlaceWhatsApp(CFG.RENATO_WHATSAPP, "Hola! Tengo una consulta sobre BLOQE.") : "";
    if (url) {
      bloque.appendChild(el("a", { class: "bq-wa", href: url, target: "_blank", rel: "noopener noreferrer",
        text: (extra.wa && extra.wa.etiqueta) || "Hablar con Renato por WhatsApp" }));
    }
    lista.insertBefore(bloque, indicador);
    bajar();
  }

  function mostrarForm(v) {
    form.hidden = !v; barra.hidden = v; menu.hidden = v;
    if (v) inNombre.focus();
  }

  function registrar(tipo, pregunta, respuesta, contacto) {
    return datos.registrar({
      tipo: tipo, pregunta: pregunta, respuesta: respuesta,
      nombre: contacto && contacto.nombre, celular: contacto && contacto.celular,
    }).catch(function () { return false; });
  }

  function responderFaq(faq, escrito) {
    var pregunta = escrito || faq.pregunta;
    bloquear(true);
    var fin = function () { bloquear(false); };
    var fallo = function () { botDice(TEXTOS.errorDatos, { conWhatsApp: true }); fin(); };

    if (faq.tipo === "texto") {
      botDice(faq.respuesta || ""); registrar("consulta", pregunta, faq.respuesta || ""); return fin();
    }
    if (faq.tipo === "productos" || faq.tipo === "reservar") {
      return datos.productos().then(function (ps) {
        if (!ps.length) {
          var r0 = faq.respuesta_sin_datos || "Por ahora no hay bloques abiertos.";
          botDice(r0); registrar("consulta", pregunta, r0); return fin();
        }
        if (faq.tipo === "productos") {
          var r = L.rellenar(faq.respuesta || "{lista}", { lista: L.listaProductos(ps), cierre: L.proximoCierre(ps) });
          botDice(r); registrar("consulta", pregunta, r);
        } else {
          botDice(faq.respuesta || "¿Cuál producto quieres reservar?", {
            botones: ps.slice(0, 10).map(function (p) {
              return { etiqueta: p.nombre + L.formatoPrecio(p.precio), alPulsar: function () { reservar(p.nombre); } };
            }),
          });
        }
        fin();
      }, fallo);
    }
    if (faq.tipo === "promociones") {
      return datos.promociones().then(function (pr) {
        var r = pr.length
          ? L.rellenar(faq.respuesta || "{lista}", { lista: L.listaPromociones(pr) })
          : faq.respuesta_sin_datos || "Por ahora no tenemos promociones vigentes.";
        botDice(r); registrar("consulta", pregunta, r); fin();
      }, fallo);
    }
    if (faq.tipo === "reclamo" || faq.tipo === "devolucion") {
      botDice(faq.respuesta || "Déjame tu nombre y celular para registrar tu caso.");
      pendiente = { tipo: faq.tipo, pregunta: pregunta }; mostrarForm(true); return fin();
    }
    if (faq.tipo === "persona") {
      var rp = faq.respuesta || "Claro, te llevo a WhatsApp.";
      botDice(rp, { wa: { mensaje: "Hola! Quisiera hablar con una persona de BLOQE.", etiqueta: "Hablar con Renato por WhatsApp" } });
      registrar("persona", pregunta, rp); return fin();
    }
    fin();
  }

  function reservar(producto) {
    clienteDice("Quiero reservar: " + producto);
    var r = "Perfecto. Toca el botón para enviar tu reserva por WhatsApp.";
    botDice(r, { wa: {
      mensaje: "Hola! Quiero reservar: " + producto + ". Mi adelanto es S/ " + CFG.ADELANTO_SOLES + ".",
      etiqueta: "Reservar por WhatsApp" } });
    registrar("reserva", "Reserva: " + producto, r);
  }

  function pulsarPregunta(faq) {
    if (ocupado || pendiente) return;
    clienteDice(faq.pregunta); responderFaq(faq);
  }

  // Camino de siempre, sin IA: es también el respaldo cuando la IA falla o
  // cuando se agotó el presupuesto de la sesión.
  function respaldoFaq(t, c) {
    if (c.length === 0) {
      botDice(TEXTOS.sinRespuesta, { wa: { mensaje: "Hola! Tengo una consulta: " + t.slice(0, 200), etiqueta: "Hablar con Renato por WhatsApp" } });
      registrar("sin_respuesta", t, null);
    } else {
      botDice(TEXTOS.varias, { botones: c.map(function (f) {
        return { etiqueta: f.pregunta, alPulsar: function () { clienteDice(f.pregunta); responderFaq(f, t); } };
      }) });
    }
  }

  // Mensajes de WhatsApp según por qué derivó la IA.
  function waPorMotivo(motivo, t) {
    if (motivo === "reservar") {
      return { mensaje: "Hola! Quiero reservar un producto. Mi adelanto es S/ " + CFG.ADELANTO_SOLES + ".", etiqueta: "Reservar por WhatsApp" };
    }
    if (motivo === "hablar_con_renato") {
      return { mensaje: "Hola! Quisiera hablar con una persona de BLOQE.", etiqueta: "Hablar con Renato por WhatsApp" };
    }
    return { mensaje: "Hola! Tengo una consulta: " + String(t).slice(0, 200), etiqueta: "Hablar con Renato por WhatsApp" };
  }

  function responderIA(t, c) {
    bloquear(true);
    // La función agrega el mensaje actual por su cuenta; aquí va lo anterior.
    var previos = historial.slice(0, -1).slice(-6);
    datos.ia(t, previos).then(function (d) {
      bloquear(false);
      // Sin respuesta útil, o la función pidió respaldo: camino de siempre.
      if (!d || !d.respuesta) return respaldoFaq(t, c);
      if (d.respaldo && d.fuente !== "limite") return respaldoFaq(t, c);

      console.info("[ia]", d.modelo || "", d.tipo || "", d.tokens || "");

      if (d.formulario === "reclamo" || d.formulario === "devolucion") {
        // El nombre y el celular los recoge este formulario y se guardan por
        // registrar_conversacion, sin pasar por la IA.
        botDice(d.respuesta);
        pendiente = { tipo: d.formulario, pregunta: t };
        mostrarForm(true);
        return;
      }
      if (d.whatsapp) return botDice(d.respuesta, { wa: waPorMotivo(d.whatsapp, t) });
      botDice(d.respuesta);
    }, function () {
      bloquear(false);
      respaldoFaq(t, c);
    });
  }

  barra.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = entrada.value.trim();
    if (!t || ocupado || pendiente) return;
    entrada.value = "";
    clienteDice(t);
    var c = L.elegirFaqs(t, faqs);

    // Una sola coincidencia: respuesta determinística y gratis, como antes.
    if (c.length === 1) return responderFaq(c[0], t);

    // Sin coincidencia o ambigua: justo donde la IA aporta.
    if (IA) return responderIA(t, c);
    respaldoFaq(t, c);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!pendiente || ocupado) return;
    var n = inNombre.value.trim(), c = inCelular.value.replace(/\D/g, "");
    if (n.length < 2 || c.length < 9 || c.length > 15) {
      errorForm.textContent = "Revisa tu nombre y tu celular (9 dígitos)."; return;
    }
    errorForm.textContent = "";
    bloquear(true);
    var p = pendiente;
    registrar(p.tipo, p.pregunta, null, { nombre: n, celular: c }).then(function (ok) {
      pendiente = null; inNombre.value = ""; inCelular.value = ""; mostrarForm(false);
      if (ok) {
        botDice(TEXTOS.casoRegistrado, p.tipo === "devolucion"
          ? { wa: { mensaje: "Hola! Soy " + n + ". Quiero hacer una devolución.", etiqueta: "Hablar con Renato por WhatsApp" } }
          : {});
      } else {
        botDice(TEXTOS.casoError, { wa: { mensaje: "Hola! Soy " + n + ". Tuve un problema con mi pedido: " + p.pregunta.slice(0, 200), etiqueta: "Escribir por WhatsApp" } });
      }
      bloquear(false);
    });
  });
  noForm.addEventListener("click", function () { pendiente = null; errorForm.textContent = ""; mostrarForm(false); });

  function abrir() {
    panel.hidden = false; lanzador.hidden = true; globo.hidden = true;
    if (!lista.children.length) botDice(TEXTOS.inicial);
    if (!cargado) {
      cargado = true; bloquear(true);
      datos.faqs().then(function (f) {
        faqs = f;
        f.filter(function (x) { return x.en_menu; }).forEach(function (x) {
          var chip = el("button", { type: "button", class: "bq-chip", text: x.pregunta });
          chip.addEventListener("click", function () { pulsarPregunta(x); });
          menu.appendChild(chip);
        });
      }).catch(function () { botDice(TEXTOS.errorDatos, { conWhatsApp: true }); }).then(function () { bloquear(false); });
    }
    entrada.focus();
  }
  lanzador.addEventListener("click", abrir);
  cerrar.addEventListener("click", function () { panel.hidden = true; lanzador.hidden = false; });

  globo.hidden = true;
  setTimeout(function () { if (panel.hidden) globo.hidden = false; }, 4000);
  document.body.appendChild(raiz);
})();
