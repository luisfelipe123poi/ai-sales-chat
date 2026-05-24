require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// =========================
// 🧱 APP INIT
// =========================
const app = express();

// =========================
// 📦 MODELOS
// =========================
const Lead = require("./models/Lead");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");
const Business = require("./models/Business");

// 🔥 NUEVO MODELO USER
const mongooseUser = require("mongoose");

const userSchema = new mongooseUser.Schema({
  email: { type: String, unique: true }, 
  password: String
}, { timestamps: true });

const User = mongooseUser.model("User", userSchema);

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");

// Configuración de R2
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

// =========================
// 🧱 MIDDLEWARES
// =========================
app.use(cors());

// 🔥 FIX 413 ERROR
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use(express.static("public"));

// =========================
// 🔌 CONEXIÓN A MONGODB
// =========================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => console.log("❌ Error MongoDB:", err));

// =========================
// 🔐 AUTH MIDDLEWARE
// =========================
function auth(req, res, next) {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ error: "No autorizado" });

  try {

    const realToken = token.startsWith("Bearer ")
      ? token.split(" ")[1]
      : token;

    const decoded = jwt.verify(realToken, process.env.JWT_SECRET);

    req.user = decoded;
    next();

  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

function closerBot(message, business, lead) {

  let reply = "";
  let options = [];

  if (!lead) lead = {};

  // 🔥 blindaje
  if (!lead.notes || typeof lead.notes !== "object" || lead.notes === null) {
    lead.notes = {};
  }

  if (!message) message = "";

  // ==========================================
  // 🔥 TESTIMONIOS
  // ==========================================
  const formatTestimonials = () => {
    if (!business.testimonials || !business.testimonials.length) return "";

    return business.testimonials.map(t => {

      if (typeof t === "string") return t.trim();

      if (t.type === "text") {
        if (t.content.trim().startsWith("http")) {
          return t.content.trim();
        }
        return `💬 ${t.content}`;
      }

      if (t.type === "image") return t.content.trim();
      if (t.type === "video") return t.content.trim();

      return "";

    }).join("\n\n");
  };

  // ==========================================
  // 🔥 WAIT GLOBAL
  // ==========================================
  if (message === "wait") {

    reply = `Entiendo 💖

pero déjame decirte algo...

muchas personas aplazan empezar con la resina epóxica durante meses...

y cuando finalmente comienzan...

se arrepienten de no haber empezado antes 😔

Porque descubren que podían:

✨ crear piezas hermosas
✨ relajarse haciendo algo creativo
✨ vender sus creaciones
✨ generar ingresos desde casa

La pregunta es...

¿vas a seguir postergándolo o vas a darte la oportunidad hoy?`;

    options = [
      { label: "🔥 Quiero empezar", value: "push_close" },
      { label: "🤔 Tengo dudas", value: "objection_doubt" }
    ];

    return { reply, options, showInput: false };
  }

  // ==========================================
  // 🔥 DUDAS GLOBAL
  // ==========================================
  if (
    message === "objection_doubt" ||
    message === "objection_doubt_alt1" ||
    message === "objection_doubt_alt2" ||
    message === "action_doubt"
  ) {

    reply = `Es completamente normal tener dudas 💖

La mayoría de alumnas también las tenían antes de empezar...

pero mira lo que pasó cuando decidieron actuar ✨

${formatTestimonials() || "Nuestras alumnas ya están creando piezas increíbles y muchas ya venden sus creaciones."}

La verdadera pregunta es:

¿qué pasa si esto sí funciona para ti y hoy decides no intentarlo?`;

    options = [
      { label: "🔥 Quiero avanzar", value: "push_close" },
      { label: "😕 Prefiero esperar", value: "wait" }
    ];

    return { reply, options, showInput: false };
  }

  // ==========================================
  // 🔥 START
  // ==========================================
  if (message === "start") {

    reply = `Hola hermosa 💖

bienvenida ✨

antes de empezar...

¿cómo te llamas?`;

    lead.stage = "ask_name";

    return {
      reply,
      options: [],
      showInput: true,
      inputType: "name"
    };
  }

  // ==========================================
  // 🔥 CAPTURA NOMBRE
  // ==========================================
  else if (lead.stage === "ask_name") {

    lead.name = message;

    reply = `Mucho gusto ${lead.name} 💖

quiero conocerte un poquito mejor 👇

¿qué es lo que más te gustaría lograr aprendiendo resina epóxica?`;

    options = [
      { label: "💰 Ganar dinero", value: "money" },
      { label: "🎨 Hobby y relajación", value: "hobby" },
      { label: "🧠 Aprender algo nuevo", value: "learn" }
    ];

    lead.stage = "interest";

    return {
      reply,
      options,
      showInput: false
    };
  }

  // ==========================================
  // 🔥 INTERESES
  // ==========================================
  else if (lead.stage === "interest") {

    const testimonialsText = formatTestimonials()
      ? "\n\n🔥 Mira resultados reales:\n\n" + formatTestimonials()
      : "";

    // ==========================================
    // 💰 DINERO
    // ==========================================
    if (message === "money") {

      lead.user_goal = "money";

      reply = `Brutal ${lead.name} 💰

La resina epóxica se ha convertido en una de las manualidades más rentables actualmente ✨

muchas alumnas empiezan desde cero...

y terminan vendiendo:

✨ tablas decorativas
✨ joyería
✨ mesas
✨ llaveros
✨ vasos personalizados
✨ bandejas elegantes

Incluso desde casa 💖

No necesitas experiencia previa.

Solo aprender el paso a paso correcto.${testimonialsText}

dime algo 👇

¿ya has intentado vender algo antes?`;

      options = [
        { label: "Sí", value: "money_sold_before" },
        { label: "No", value: "money_first_time" }
      ];

      lead.stage = "money_flow";

      return {
        reply,
        options,
        showInput: false
      };
    }

    // ==========================================
    // 🎨 HOBBY
    // ==========================================
    if (message === "hobby") {

      lead.user_goal = "hobby";

      reply = `Me encanta eso ${lead.name} 💖

La resina epóxica es terapéutica ✨

muchas personas empiezan solo para relajarse...

y terminan enamoradas del proceso 😍

Imagínate creando piezas hermosas con tus propias manos mientras desconectas del estrés del día a día.${testimonialsText}

¿te gustaría vivir eso?`;

      options = [
        { label: "😍 Sí, me encantaría", value: "hobby_yes" },
        { label: "🤔 No estoy segura", value: "hobby_doubt" }
      ];

      lead.stage = "hobby_flow";

      return {
        reply,
        options,
        showInput: false
      };
    }

    // ==========================================
    // 🧠 APRENDER
    // ==========================================
    if (message === "learn") {

      lead.user_goal = "learn";

      reply = `Excelente decisión ${lead.name} 🧠

La resina epóxica parece difícil...

hasta que alguien te enseña correctamente ✨

En este curso aprenderás paso a paso:

✨ materiales
✨ mezclas correctas
✨ técnicas profesionales
✨ acabados brillantes
✨ moldes
✨ pigmentos
✨ errores que debes evitar

Aunque empieces completamente desde cero.${testimonialsText}

¿te gustaría aprender así?`;

      options = [
        { label: "💖 Sí, desde cero", value: "learn_yes" },
        { label: "🤔 Tengo dudas", value: "learn_doubt" }
      ];

      lead.stage = "learn_flow";

      return {
        reply,
        options,
        showInput: false
      };
    }
  }

  // ==========================================
  // 💰 FLUJO DINERO
  // ==========================================
  else if (lead.stage === "money_flow") {

    if (message === "money_sold_before") {

      reply = `Perfecto ${lead.name} 💰

Entonces ya sabes lo poderoso que es tener una habilidad rentable ✨

La diferencia aquí...

es que la resina epóxica tiene muchísimo mercado porque las personas aman los productos personalizados y artesanales 😍

🔥 Mira lo que ya están logrando nuestras alumnas:
${formatTestimonials() || "Nuestras alumnas ya están vendiendo sus creaciones."}

¿te imaginas generar ingresos haciendo algo creativo que además disfrutas?`;

      options = [
        { label: "🚀 Sí, quiero eso", value: "push_close" },
        { label: "🤔 Tengo dudas", value: "action_doubt" }
      ];

      lead.stage = "pre_action";

      return {
        reply,
        options,
        showInput: false
      };
    }

    if (message === "money_first_time") {

      reply = `Y eso es perfecto ${lead.name} 💖

porque aprenderás correctamente desde el inicio ✨

No necesitas experiencia en ventas.

Muchas alumnas comenzaron literalmente desde cero...

y hoy ya venden sus primeras creaciones por Instagram, WhatsApp y Facebook 😍

🔥 Mira esto:
${formatTestimonials() || "Alumnas desde cero ya están obteniendo resultados."}

¿te gustaría que este sea el comienzo de algo grande para ti?`;

      options = [
        { label: "🚀 Sí, quiero empezar", value: "push_close" },
        { label: "🤔 Tengo dudas", value: "action_doubt" }
      ];

      lead.stage = "pre_action";

      return {
        reply,
        options,
        showInput: false
      };
    }
  }

  // ==========================================
  // 🎨 HOBBY FLOW
  // ==========================================
  else if (lead.stage === "hobby_flow") {

    if (message === "hobby_yes") {

      reply = `Es una sensación hermosa 💖

crear algo con tus propias manos...

ver el resultado terminado...

y decir:

"wow... yo hice esto" ✨

🔥 mira algunas experiencias:
${formatTestimonials() || ""}

¿te gustaría aprender paso a paso aunque nunca hayas usado resina antes?`;

      options = [
        { label: "💖 Sí", value: "hobby_start" },
        { label: "🤔 Tengo dudas", value: "hobby_doubt" }
      ];

      return {
        reply,
        options,
        showInput: false
      };
    }

    if (message === "hobby_doubt") {

      reply = `Es normal sentir dudas 💖

pero recuerda algo...

nadie nace sabiendo.

Todas empezaron desde cero ✨

🔥 Mira esto:
${formatTestimonials() || ""}

¿te gustaría intentarlo?`;

      options = [
        { label: "💖 Sí, quiero", value: "hobby_start" },
        { label: "😕 Prefiero esperar", value: "wait" }
      ];

      return {
        reply,
        options,
        showInput: false
      };
    }

    if (message === "hobby_start") {

      reply = `Perfecto 💖

imagina tu primera pieza terminada...

brillante...
elegante...
hecha por ti ✨

¿quieres empezar hoy?`;

      options = [
        { label: "🔥 Sí, quiero entrar", value: "push_close" },
        { label: "🤔 Aún no", value: "wait" }
      ];

      lead.stage = "pre_action";

      return {
        reply,
        options,
        showInput: false
      };
    }
  }

  // ==========================================
  // 🧠 LEARN FLOW
  // ==========================================
  else if (lead.stage === "learn_flow") {

    if (message === "learn_yes") {

      reply = `Perfecto ${lead.name} 🧠

vas a sorprenderte de lo rápido que puedes aprender cuando alguien te guía correctamente ✨

No necesitas experiencia previa.

Solo seguir el paso a paso.

🔥 Mira resultados reales:
${formatTestimonials() || ""}

¿quieres empezar hoy mismo?`;

      options = [
        { label: "🔥 Sí, quiero entrar", value: "push_close" },
        { label: "🤔 Tengo dudas", value: "wait" }
      ];

      lead.stage = "pre_action";

      return {
        reply,
        options,
        showInput: false
      };
    }

    if (message === "learn_doubt") {

      reply = `Las dudas son normales 💖

pero recuerda...

el único error real sería no darte la oportunidad de aprender algo que puede cambiar tu vida ✨

🔥 otras alumnas ya comenzaron:
${formatTestimonials() || ""}

¿quieres intentarlo?`;

      options = [
        { label: "💖 Sí, quiero", value: "push_close" },
        { label: "😕 Prefiero esperar", value: "wait" }
      ];

      lead.stage = "pre_action";

      return {
        reply,
        options,
        showInput: false
      };
    }
  }

  // ==========================================
  // 🔥 OBJECIONES
  // ==========================================
  else if (message === "objection_money") {

    reply = `Te entiendo perfectamente ${lead.name} 💖

pero piensa esto...

el acceso cuesta ${business.price || "47 USD"}.

Eso es menos de lo que muchas personas gastan en salidas o compras impulsivas.

La diferencia es que esto puede darte:

✨ una nueva habilidad
✨ ingresos
✨ creatividad
✨ una posible fuente de negocio

¿prefieres gastarlo o invertirlo en ti?`;

    options = [
      { label: "🔥 Invertir en mí", value: "push_close" },
      { label: "🤔 Aún tengo dudas", value: "objection_doubt_alt1" }
    ];

    return {
      reply,
      options,
      showInput: false
    };
  }

  else if (message === "objection_time") {

    reply = `No necesitas tener "mucho tiempo" 💖

muchas alumnas empiezan dedicando solo unos minutos al día ✨

lo importante no es cuánto tiempo tienes...

sino empezar.`;

    options = [
      { label: "💖 Quiero empezar", value: "push_close" },
      { label: "🤔 Tengo dudas", value: "objection_doubt_alt2" }
    ];

    return {
      reply,
      options,
      showInput: false
    };
  }

  // ==========================================
  // 🔥 PUSH CLOSE
  // ==========================================
  if (message === "push_close") {

    reply = `Imagínate dentro del curso ✨

aprendiendo paso a paso...

creando piezas increíbles...

y viendo cómo cada vez te salen mejor 😍

¿sientes que esto podría ser algo muy bonito para ti?`;

    options = [
      { label: "😍 Sí, totalmente", value: "emotion_happy" },
      { label: "🤩 Sí, lo necesito", value: "emotion_motivated" },
      { label: "💖 Sí, vamos con todo", value: "emotion_proud" }
    ];

    lead.stage = "awaiting_emotion";

    return {
      reply,
      options,
      showInput: false
    };
  }

  // ==========================================
  // 🔥 EMOCIÓN
  // ==========================================
  else if (
    lead.stage === "awaiting_emotion" &&
    (message || "").startsWith("emotion_")
  ) {

    reply = `Esooo 💖✨

y créeme...

vas a sentir muchísimo orgullo cuando veas tus primeras creaciones terminadas 😍

Además tendrás acompañamiento, guía paso a paso y acceso inmediato al contenido.

¿estás lista para empezar esta nueva etapa?`;

    options = [
      { label: "🚀 Sí, estoy lista", value: "confirm_hype" },
      { label: "🤔 Quiero saber más", value: "more_hype" }
    ];

    lead.stage = "hype_desire";

    return {
      reply,
      options,
      showInput: false
    };
  }

  // ==========================================
  // 🔥 CIERRE FINAL
  // ==========================================
  else if (lead.stage === "hype_desire") {

    if (message === "confirm_hype" || message === "more_hype") {

      reply = `Perfecto 💖

mi compañera Laura ya tiene todo preparado para darte acceso inmediato ✨

🎁 además hoy recibirás BONOS especiales exclusivos por acción rápida.

⚠️ IMPORTANTE:
Los bonos solo estarán disponibles por tiempo limitado.

Déjame tu WhatsApp y te enviaré toda la información ahora mismo 👇`;

      lead.stage = "capture_whatsapp";

      return {
        reply,
        options: [],
        showInput: true,
        inputType: "phone"
      };
    }
  }

  // ==========================================
  // 🔥 CAPTURA WHATSAPP
  // ==========================================
  else if (lead.stage === "capture_whatsapp") {

    if (/\d{7,}/.test(message)) {

      lead.phone = message;

      lead.stage = "action";

      reply = `Perfecto 💖

${business.productInfo}

💰 ${business.price || "47 USD"}

👉 ${business.productLink}

🔥 ENVÍA TU COMPROBANTE POR WHATSAPP

y activaremos tu acceso inmediato ✨

🎁 además recibirás los BONOS exclusivos de hoy.`;

      return {
        reply,
        options: [],
        showInput: false,
        showWhatsApp: true,
        whatsappNumber: business.whatsappNumber
      };
    }

    return {
      reply: `Necesito tu número para enviarte toda la información y asegurar tu cupo 💖`,
      options: [],
      showInput: true,
      inputType: "phone"
    };
  }

  return {
    reply,
    options,
    showInput: false
  };
}
// =========================
// 🧠 CLOSER BOT (AIDA)
// =========================
function fakeAIResponse(message, business, lead) {
  const msg = message.toLowerCase();

  if (lead.stage === "attention") {
    lead.stage = "interest";
    return `👋 Hola! Bienvenido a ${business.name}.
${business.welcomeMessage}

Cuéntame… ¿qué te gustaría lograr exactamente?`;
  }

  if (lead.stage === "interest") {
    if (
      msg.includes("precio") ||
      msg.includes("info") ||
      msg.includes("información")
    ) {
      lead.stage = "desire";
      return `Perfecto 👀

${business.productInfo}

Esto está diseñado para personas que quieren resultados reales.

¿Te gustaría que te explique cómo empezar paso a paso?`;
    }

    return `Entiendo 👍 cuéntame un poco más sobre tu situación.`;
  }

  if (lead.stage === "desire") {
    if (msg.includes("si") || msg.includes("quiero") || msg.includes("claro")) {
      lead.stage = "action";
      return `🔥 Genial.

Para enviarte la información completa y acceso,
necesito unos datos rápidos 👇

👉 Tu nombre
👉 Tu email
👉 Tu WhatsApp`;
    }

    return `Esto puede ayudarte mucho 👀 ¿quieres que te muestre cómo funciona exactamente?`;
  }

  if (lead.stage === "action") {
    return `Perfecto ${lead.name || ""} 🙌

Ya estás listo para empezar.

👉 Aquí puedes acceder directamente:
${business.productLink}

Si necesitas ayuda, también puedo guiarte 👀`;
  }

  return "Cuéntame más 👀";
}

// =========================
// 🟢 HOME
// =========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================
// 🔐 REGISTER
// =========================
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "Usuario ya existe" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hash
    });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ error: "Error en registro" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Usuario no existe" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (error) {
    // ESTO TE DIRÁ EL ERROR REAL EN LA CONSOLA DEL NAVEGADOR
    res.status(500).json({ error: error.message }); 
  }
});
// =========================
// 🏢 CREAR NEGOCIO (CORREGIDO)
// =========================
app.post("/business", auth, async (req, res) => {
  try {
    const {
      name,
      slug,
      logo,
      primaryColor,
      welcomeMessage,
      productInfo,
      productLink,
      whatsappNumber,
      waMessage,
      testimonials: testimonialsRaw // Capturamos "testimonials" del front
    } = req.body;

    // 🔥 FIX CRÍTICO: LIMPIAR SLUG
    let cleanSlug = (slug || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const exists = await Business.findOne({ slug: cleanSlug });
    if (exists) {
      return res.json({ error: "Slug ya existe" });
    }

    let processedTestimonials = [];

    // Verificamos si llegaron testimonios
    if (testimonialsRaw && Array.isArray(testimonialsRaw)) {
      // Si el frontend ya mandó los objetos listos {type, content}
      if (typeof testimonialsRaw[0] === 'object') {
        processedTestimonials = testimonialsRaw;
      } 
      // Si mandó solo texto (por si acaso), lo procesamos
      else {
        processedTestimonials = testimonialsRaw
          .map(line => line.trim())
          .filter(line => line !== "")
          .map(content => {
            let type = "text";
            if (content.match(/\.(mp4|mov|webm|mkv|youtube|youtu)/i)) type = "video";
            else if (content.match(/\.(jpg|jpeg|png|gif|webp|imgur|cloudinary)/i)) type = "image";
            return { type, content };
          });
      }
    }

    const business = await Business.create({
      name,
      slug: cleanSlug, // 🔥 USAMOS EL SLUG LIMPIO
      logo,
      primaryColor,
      welcomeMessage,
      productInfo,
      productLink,
      whatsappNumber,
      userId: req.user.id,
      waMessage,
      testimonials: processedTestimonials // Guardamos el array procesado
    });

    console.log("🔥 TESTIMONIOS GUARDADOS:", business.testimonials);

    // 🔥 NUEVO: detectar dominio automáticamente
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host");

    res.json({
      message: "Negocio creado",
      url: `${protocol}://${host}/${cleanSlug}`,
      business
    });

  } catch (error) {
    console.error("BUSINESS ERROR:", error);
    res.status(500).json({ error: "Error al crear negocio" });
  }
});

// =========================
// 📦 CLONAR TEMPLATE
// =========================
app.post("/clone-template/:id", auth, async (req, res) => {
  try {
    const template = await Business.findById(req.params.id);

    if (!template) {
      return res.status(404).json({ error: "Template no encontrado" });
    }

    const newBusiness = await Business.create({
      name: template.name + " (copia)",
      slug: template.slug + "-" + Date.now(),
      logo: template.logo,
      primaryColor: template.primaryColor,
      welcomeMessage: template.welcomeMessage,
      productInfo: template.productInfo,
      productLink: template.productLink,
      whatsappNumber: template.whatsappNumber,
      userId: req.user.id,
      isTemplate: false
    });

    res.json({
      message: "Template clonado",
      business: newBusiness,
      url: `https://ai-sales-chat.onrender.com/${newBusiness.slug}`
    });

  } catch (error) {
    console.error("CLONE TEMPLATE ERROR:", error);
    res.status(500).json({ error: "Error clonando template" });
  }
});

// =========================
// 🏢 OBTENER NEGOCIO
// =========================
app.get("/business/:slug", async (req, res) => {
  try {
    const business = await Business.findOne({ slug: req.params.slug });

    if (!business) {
      return res.status(404).json({ error: "Negocio no encontrado" });
    }

    // 🔥 FIX: normalizar testimonios SI vienen mal guardados
    let testimonialsFixed = [];

    if (business.testimonials && business.testimonials.length) {

      testimonialsFixed = business.testimonials.map(t => {

        // si ya viene bien (objeto)
        if (typeof t === "object" && t !== null) return t;

        // si viene como string (caso viejo o bug)
        if (typeof t === "string") {

          if (t.includes("youtube") || t.includes("video")) {
            return { type: "video", content: t };
          }

          if (t.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
            return { type: "image", content: t };
          }

          return { type: "text", content: t };
        }

        return t;
      });

    }

    // 🔥 sobrescribe SOLO en respuesta (NO en DB)
    const businessSafe = {
      ...business.toObject(),
      testimonials: testimonialsFixed
    };

    res.json(businessSafe);

  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

// =========================
// 🏢 MIS NEGOCIOS
// =========================
app.get("/my-businesses", auth, async (req, res) => {
  try {
    const businesses = await Business.find({ userId: req.user.id })
      .sort({ createdAt: -1 });

    res.json(businesses);
  } catch (error) {
    console.error("MY BUSINESSES ERROR:", error);
    res.status(500).json({ error: "Error obteniendo negocios" });
  }
});

// =========================
// 💬 CHAT
// =========================
app.post("/chat", async (req, res) => {
  const { message, leadId, conversationId, businessId } = req.body;

  try {
    if (!businessId) {
      return res.status(400).json({ error: "businessId requerido" });
    }

    const business = await Business.findById(businessId);

    console.log("🔥 BUSINESS:", business);
    console.log("🔥 TESTIMONIOS EN BD:", business?.testimonials);

    if (!business) {
      return res.status(404).json({ error: "Negocio no existe" });
    }

    let lead = leadId
      ? await Lead.findById(leadId)
      : await Lead.create({ businessId, stage: "attention" });

    if (!lead.stage) {
      lead.stage = "attention";
    }

    if (!lead.notes) {
      lead.notes = {};
    }

    let conversation = conversationId
      ? await Conversation.findById(conversationId)
      : await Conversation.create({
          leadId: lead._id,
          businessId
        });

    await Message.create({
      conversationId: conversation._id,
      role: "user",
      content: message
    });

    if (lead.stage === "action") {
      if (!lead.name && message.length < 30 && !message.includes("@")) {
        lead.name = message;
      }

      if (!lead.email && message.includes("@")) {
        lead.email = message;
      }

      if (!lead.phone && /\d{7,}/.test(message)) {
        lead.phone = message;
      }
    }

    // 🔥 AQUI LLAMAS TU BOT (NUEVO)
    const result = closerBot(message, business, lead);

    console.log("🔥 RESULT BOT:", result);

    const reply = result.reply;
    const options = result.options || [];
    const showInput = result.showInput ?? false;
    const inputType = result.inputType ?? "text";

    await Message.create({
      conversationId: conversation._id,
      role: "assistant",
      content: reply
    });

    await Lead.findByIdAndUpdate(lead._id, {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      stage: lead.stage
    });

    const showWhatsApp =
      lead.stage === "action" &&
      lead.name &&
      (lead.phone || lead.email);

    res.json({
      reply,
      options,
      leadId: lead._id,
      conversationId: conversation._id,
      showWhatsApp,
      whatsappNumber: business.whatsappNumber,

      showInput,
      inputType,

      // 🔥 DEBUG EXTRA (NO ROMPE NADA)
      testimonials: business.testimonials
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);
    res.status(500).json({ error: "Error en chat" });
  }
});
// =========================
// 📊 ANALYTICS
// =========================
app.get("/analytics/:businessId", auth, async (req, res) => {
  try {
    const businessId = req.params.businessId;

    const totalLeads = await Lead.countDocuments({ businessId });

    const attention = await Lead.countDocuments({ businessId, stage: "attention" });
    const interest = await Lead.countDocuments({ businessId, stage: "interest" });
    const desire = await Lead.countDocuments({ businessId, stage: "desire" });
    const action = await Lead.countDocuments({ businessId, stage: "action" });

    const totalMessages = await Message.countDocuments({
      conversationId: {
        $in: await Conversation.find({ businessId }).distinct("_id")
      }
    });

    res.json({
      totalLeads,
      stages: {
        attention,
        interest,
        desire,
        action
      },
      totalMessages
    });

  } catch (error) {
    res.status(500).json({ error: "Error analytics" });
  }
});

// =========================
// ✏️ UPDATE BUSINESS
// =========================
app.put("/business/:id", auth, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({ error: "No existe" });
    }

    if (business.userId !== req.user.id) {
      return res.status(403).json({ error: "No autorizado" });
    }

    if (req.body.slug) {
      const slugExists = await Business.findOne({
        slug: req.body.slug,
        _id: { $ne: req.params.id }
      });

      if (slugExists) {
        return res.json({ error: "Slug ya existe" });
      }
    }

    // 🔥 FIX TESTIMONIOS (IGUAL QUE CREATE)
    if (req.body.testimonials) {
      req.body.testimonials = (req.body.testimonials || []).map(t => {

        if (typeof t === "string") {

          // detectar video
          if (t.includes("youtube") || t.includes("video") || t.includes("drive")) {
            return { type: "video", content: t };
          }

          // detectar imagen
          if (t.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
            return { type: "image", content: t };
          }

          // texto
          return { type: "text", content: t };
        }

        return t;
      });
    }

    const updated = await Business.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ business: updated });

  } catch (error) {
    console.error("UPDATE BUSINESS ERROR:", error);
    res.status(500).json({ error: "Error actualizando" });
  }
});

// =========================
// 🗑️ DELETE BUSINESS
// =========================
app.delete("/business/:id", auth, async (req, res) => {
  try {

    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({ error: "No existe" });
    }

    if (business.userId !== req.user.id) {
      return res.status(403).json({ error: "No autorizado" });
    }

    // 🔥 DEBUG EXTRA (NO ROMPE NADA)
    console.log("ELIMINANDO NEGOCIO:", business._id);
    console.log("TESTIMONIOS DEL NEGOCIO:", business.testimonials);

    await Business.findByIdAndDelete(req.params.id);

    res.json({ message: "Eliminado" });

  } catch (error) {
    console.error("DELETE BUSINESS ERROR:", error);
    res.status(500).json({ error: "Error eliminando" });
  }
});

// =========================
// 📊 LEADS
// =========================
app.get("/leads/:businessId", auth, async (req, res) => {
  try {
    const leads = await Lead.find({ businessId: req.params.businessId })
      .sort({ createdAt: -1 });

    res.json(leads);

  } catch (error) {
    res.status(500).json({ error: "Error leads" });
  }
});

// =========================
// 💬 CONVERSACIÓN
// =========================
app.get("/conversation/:leadId", async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      leadId: req.params.leadId
    });

    if (!conversation) return res.json([]);

    const messages = await Message.find({
      conversationId: conversation._id
    }).sort({ createdAt: 1 });

    res.json(messages);

  } catch (error) {
    res.status(500).json({ error: "Error conversación" });
  }
});

// =========================
// 🧠 CLOUSER ENGINE (NO IA)
// =========================
app.post("/ai-closer", auth, async (req, res) => {
  try {

    const {
      message,
      productInfo,
      welcomeMessage,
      productLink,
      testimonials = []
    } = req.body;

    const msg = message.toLowerCase();

    // =========================
    // 🧠 ETAPA DETECCIÓN AIDA
    // =========================

    let stage = "attention";

    if (msg.includes("precio") || msg.includes("cuesta") || msg.includes("valor")) {
      stage = "desire";
    }

    if (msg.includes("no tengo") || msg.includes("despues") || msg.includes("luego")) {
      stage = "objection";
    }

    if (msg.includes("como") || msg.includes("que es") || msg.includes("info")) {
      stage = "interest";
    }

    if (msg.includes("quiero") || msg.includes("comprar") || msg.includes("link")) {
      stage = "action";
    }

    // =========================
    // 🧠 MOTOR RESPUESTAS
    // =========================

    let response = "";

    // 🔥 ATENCIÓN
    if (stage === "attention") {
      response = `${welcomeMessage}\n\n🔥 Mira esto:\n${productInfo}`;
    }

    // 🤔 INTERÉS
    if (stage === "interest") {
      response = `Te explico rápido 👇\n\n${productInfo}\n\n💡 Esto está funcionando porque mucha gente ya lo está usando y generando ingresos reales.`;
    }

    // 🔥 DESEO
    if (stage === "desire") {
      response = `Esto es lo que te cambia el juego 👇\n\n💥 ${productInfo}\n\n📊 Resultados de otros usuarios:\n${testimonials.slice(0,3).join("\n")}`;
    }

    // 💰 ACCIÓN
    if (stage === "action") {
      response = `Perfecto 🔥 aquí tienes acceso directo:\n\n👉 ${productLink}\n\n⚡ Te recomiendo entrar ahora antes de que cambien condiciones.`;
    }

    // 🚨 OBJECIONES
    if (stage === "objection") {
      response = `Te entiendo 👇\n\n💡 Muchos empiezan así...\n\nPero esto no es gasto, es una oportunidad de generar ingresos.\n\n👉 ${productLink}`;
    }

    res.json({
      stage,
      response
    });

  } catch (error) {
    res.status(500).json({ error: "Error en closer engine" });
  }
});

// Endpoint para subir testimonio
app.post("/upload-testimonial", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const fileName = `${Date.now()}-${file.originalname}`;
    
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    // La URL pública que da Cloudflare (debes configurar tu dominio o el dev domain de R2)
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    res.json({ url: publicUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al subir a R2" });
  }
});



// =========================================
// 🗑️ DELETE LEAD
// =========================================

app.delete("/lead/:id", auth, async(req,res)=>{

  try{

    await Lead.findByIdAndDelete(req.params.id);

    res.json({
      success:true
    });

  }catch(err){

    console.error(err);

    res.status(500).json({
      error:"Error eliminando lead"
    });
  }
});

// =========================
// ✅ MARCAR LEAD COMO VENDIDO
// =========================

app.put("/lead/status/:id", auth, async (req,res)=>{

  try{

    console.log("BODY:", req.body);

    const lead = await Lead.findById(req.params.id);

    if(!lead){

      return res.status(404).json({
        error:"Lead no encontrado"
      });
    }

    // 🔥 FIX CRÍTICO
    lead.sold = Boolean(req.body.sold);

    await lead.save();

    res.json({
      success:true,
      lead
    });

  }catch(error){

    console.error("UPDATE LEAD STATUS ERROR:", error);

    res.status(500).json({
      error:error.message
    });
  }
});

// =========================
// 🚀 SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

// =========================
// 📦 STATIC FILES
// =========================
app.use(express.static(path.join(__dirname, "public")));

// =========================
// 🌐 DASHBOARD
// =========================
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// =========================
// 🌐 CRM
// =========================
app.get("/crm/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "crm.html"));
});

// =========================
// 🌐 CHAT
// =========================
app.get("/chat/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// =========================
// 🔥 LANDING DINÁMICA
// =========================
app.get("/:slug", async (req, res, next) => {

  const slug = req.params.slug;

  const protectedRoutes = [
    "dashboard",
    "crm",
    "chat",
    "login",
    "register",
    "business",
    "conversation",
    "analytics",
    "my-businesses",
    "upload-testimonial",
    "ai-closer"
  ];

  // 🔥 NO TOCAR RUTAS DEL SISTEMA
  if (protectedRoutes.includes(slug)) {
    return next();
  }

  // 🚨 FIX CRÍTICO: evitar que API caiga aquí
  // (esto evita que /business/:id o rutas similares entren como landing)
  if (
    slug.includes("business") ||
    slug.includes("api") ||
    slug.includes("upload") ||
    slug.includes("conversation") ||
    slug.includes("analytics")
  ) {
    return next();
  }

  try {

    console.log("🔥 SLUG LANDING:", slug);

    const business = await Business.findOne({ slug });

    console.log("🔥 BUSINESS ENCONTRADO:", business);

    if (!business) {
      return res.status(404).send("Negocio no encontrado");
    }

    // 🔥 SERVIR CHAT.HTML
    return res.sendFile(
      path.join(__dirname, "public", "chat.html")
    );

  } catch (err) {

    console.error("❌ FALLBACK ERROR:", err);

    return res.status(500).send("Error servidor");
  }
});
// =========================
// 🚀 START
// =========================
app.listen(PORT, () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});
  
