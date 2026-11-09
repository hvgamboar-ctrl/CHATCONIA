// config.js: lo único que hay que completar para dejar el chat listo.
window.BLOQE_CONFIG = {
  // Número de WhatsApp de Renato: con código de país, solo dígitos (sin +).
  // Ejemplo: "51999888777". Mientras esté vacío, los botones de WhatsApp no aparecen.
  RENATO_WHATSAPP: "",

  // Adelanto que aparece en el mensaje de reserva (confirmar con BLOQE).
  ADELANTO_SOLES: 20,

  // Datos de Supabase (Settings > API). Si quedan vacíos, el chat funciona en
  // modo demostración con datos de ejemplo y no guarda nada en Supabase.
  SUPABASE_URL: "https://blzebleyxpwsocnkvhwl.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_vPX3DoI4IkG2qoKOoU79qw_zN6n4d9L",

  // Nombre de la Edge Function que responde con IA. Déjalo vacío ("") para
  // apagar la IA: el chat vuelve a funcionar solo con palabras clave, igual
  // que antes. La clave de la IA vive en la función, nunca aquí.
  IA_FUNCION: "chat-ia",
};
