# Chatbot de preguntas frecuentes de BLOQE (página de prueba)

Página estática con el chat de preguntas frecuentes, sin IA. Funciona sola en
**modo demostración** (con datos de ejemplo) y se conecta a Supabase cuando se
completan dos datos en `config.js`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página de prueba. |
| `chat.js` y `chat.css` | El chat flotante y sus estilos. |
| `logica.js` | La búsqueda de respuestas por palabras clave. |
| `datos-demo.js` | Preguntas y productos de ejemplo (solo para la demostración). |
| `config.js` | **Lo único que hay que completar** (WhatsApp y Supabase). |
| `chat_faq.sql` | Tablas, vistas, función de registro y preguntas iniciales para Supabase. |
| `datos_prueba.sql` | Productos, bloques y promociones de ejemplo, solo para un proyecto de prueba. |

## Publicarla con GitHub Pages

1. En GitHub, crea un repositorio nuevo (por ejemplo, `bloqe-chatbot`), público.
2. Entra al repositorio, elige **Add file → Upload files** y arrastra los archivos
   de esta carpeta (no la carpeta, sino su contenido: `index.html` debe quedar en
   la raíz del repositorio). Confirma con **Commit changes**.
3. Ve a **Settings → Pages**. En *Build and deployment*, elige **Deploy from a
   branch**, rama `main` y carpeta `/ (root)`. Guarda.
4. En uno o dos minutos la página queda en
   `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.

## Completar `config.js`

- `RENATO_WHATSAPP`: el número de Renato con código de país y solo dígitos
  (por ejemplo, `51999888777`). Mientras esté vacío, los botones de WhatsApp no
  aparecen.
- `ADELANTO_SOLES`: el adelanto del mensaje de reserva (confirmar con BLOQE).

## Probarla con Supabase (proyecto de prueba)

Conviene probar primero en un proyecto de Supabase **nuevo y vacío**, para no
tocar los datos reales de BLOQE.

1. En supabase.com crea un proyecto nuevo.
2. Abre el *SQL Editor* y corre, en este orden y cada uno completo:
   1. `datos_prueba.sql` (crea productos, bloques y promociones de ejemplo; se
      detiene sin cambiar nada si ya existen las tablas `productos` o `bloques`).
   2. `chat_faq.sql` (crea las tablas del chat, las vistas, la función de registro
      y las preguntas iniciales).
3. En **Settings → API** (o **Project Settings → API Keys**) copia la **Project URL**
   y la clave pública (`anon` o `publishable`).
4. Pégalas en `SUPABASE_URL` y `SUPABASE_ANON_KEY` de `config.js`, y completa
   `RENATO_WHATSAPP`. Sube los cambios a GitHub.
5. Abre la página: debe desaparecer el aviso de "modo demostración". Prueba una
   consulta, una reserva y un reclamo, y revisa en **Table Editor →
   `chat_conversaciones`** que las filas aparezcan.

Qué debes ver: 8 preguntas como botones, dos productos con precio y la fecha de
cierre más próxima, una sola promoción (las otras dos de ejemplo están vencida y
apagada a propósito) y el bloque cerrado fuera de la lista.

## Conectarla al Supabase real de BLOQE

El archivo `chat_faq.sql` asume `productos` (`nombre`, `precio`, `bloque_id`) y
`bloques` (`id`, `estado`, `fecha_cierre`). Antes de correrlo en el proyecto real,
ejecuta esta consulta y ajusta la vista `v_productos_abiertos` a los nombres reales:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

**No corras `datos_prueba.sql` en el proyecto real.**

La clave pública puede estar en el repositorio: solo da acceso a lo que permiten
las reglas de seguridad (RLS) del SQL. **Nunca** pongas la clave `service_role`.
