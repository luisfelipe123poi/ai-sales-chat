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

  // 🔥 doble blindaje real
  if (!lead.notes || typeof lead.notes !== "object" || lead.notes === null) {
    lead.notes = {};
  }

  if (!message) message = "";

  const getGenderWord = () => {
    return "";
  };

// 🔥 PARSEADOR UNIVERSAL TESTIMONIOS (CORREGIDO PARA MEDIA Y LINKS DRIVE)
  const formatTestimonials = () => {
    if (!business.testimonials || !business.testimonials.length) return "";

    return business.testimonials.map(t => {

      // compatibilidad vieja (strings)
      if (typeof t === "string") return t.trim(); 

      // nuevo formato
      if (t.type === "text") {
        // Si el texto es un link (como los de Drive), lo enviamos limpio sin el emoji
        // para que el frontend lo detecte como media/link automáticamente
        if (t.content.trim().startsWith("http")) {
          return t.content.trim();
        }
        return `💬 ${t.content}`;
      }
      
      if (t.type === "image") return t.content.trim(); // Enviamos solo la URL para que el frontend la renderice
      if (t.type === "video") return t.content.trim(); // Enviamos solo la URL para que el frontend la renderice

      return "";
    }).join("\n\n");
  };

  // ==========================================
  // 🔥 FILTRO GLOBAL "WAIT" (FIX PRIORITARIO)
  // ==========================================
  if (message === "wait") {
    
    let waitAction = lead.user_goal === "money" ? "la oportunidad de generar ingresos" : (lead.user_goal === "hobby" ? "la oportunidad de empezar algo para ti" : "esta oportunidad de aprender");
    let waitText = lead.user_goal === "money" ? "tu estabilidad" : (lead.user_goal === "hobby" ? "tu momento de relax" : "tu aprendizaje");

    reply = `Pensarlo no cambia nada. Decidir sí. 

¿Vas a dejar pasar ${waitAction} hoy o vas a seguir postergando ${waitText}?`;

    options = [
      { label: "🔥 Entrar ahora", value: "push_close" },
      { label: "🤔 Dudar", value: "objection_doubt" }
    ];

    return { reply, options, showInput: false };
  }

  // ==========================================
  // 🔥 FILTRO GLOBAL "DUDAR" (PREVIENE CRASH)
  // ==========================================
  if (
    message === "objection_doubt" || 
    message === "objection_doubt_alt1" || 
    message === "objection_doubt_alt2" ||
    message === "action_doubt"
  ) {

    // MEJORA FLUJO DINERO EN DUDA
    if (lead.user_goal === "money") {
      reply = `La duda es el enemigo número uno de tu cuenta bancaria, ${lead.name}. 

Mientras lo piensas, otros ya están aplicando el sistema y cobrando sus primeras comisiones. El miedo no paga facturas, las decisiones sí.

Mira a los que dejaron la duda atrás:

${formatTestimonials() || "Nuestros alumnos ya están facturando."}

¿Vas a ver cómo otros lo logran o vas a ser tú el siguiente?`;
    } else {
      reply = `La duda no desaparece pensando… desaparece actuando.

Muchas personas tenían miedo al fracaso, pero mira cómo lograron avanzar aplicando el sistema:

${formatTestimonials() || "Nuestros alumnos ya están viendo resultados."}

¿Avanzas o te quedas donde estás?`;
    }

    options = [
      { label: "🔥 Avanzar", value: "push_close" },
      { label: "😕 Esperar", value: "wait" }
    ];

    return { reply, options, showInput: false };
  }

  // =========================
  // 🔥 START (PEDIR NOMBRE)
  // =========================
  if (message === "start") {

    reply = `Hola 💖

antes de empezar…

¿cómo te llamas?`;

    options = [];

    lead.stage = "ask_name";

    return {
      reply,
      options,
      showInput: true,
      inputType: "name"
    };
  }

  // =========================
  // 🔥 CAPTURAR NOMBRE
  // =========================
  else if (lead.stage === "ask_name") {

    lead.name = message;

    reply = `Mucho gusto ${lead.name} 💖

me alegra verte aquí ✨

quiero entender mejor algo 👇

¿qué te gustaría lograr realmente con esto?`;

    options = [
      { label: "💰 Ganar dinero", value: "money" },
      { label: "🎨 Hacerlo por hobby", value: "hobby" },
      { label: "🧠 Aprender algo nuevo", value: "learn" }
    ];

    lead.stage = "interest";

    return {
      reply,
      options,
      showInput: false
    };
  }

  // =========================
  // 🔥 FLUJOS SEPARADOS
  // =========================
  else if (lead.stage === "interest") {

    const testimonialsText = formatTestimonials()
      ? "\n\n🔥 Mira lo que dicen otros:\n\n" + formatTestimonials()
      : "";

    if (message === "money") {
      lead.user_goal = "money"; // Guardamos la meta
      reply = `Brutal ${lead.name} 💰

Elegiste el camino de los resultados. La mayoría de alumnos empiezan aquí con hambre de libertad financiera.

Este sistema no es para "probar", es para ejecutar y facturar cada semana. Aquí no vendemos humo, vendemos un método que funciona si tú funcionas ✨.${testimonialsText}

dime 👇

¿ya intentaste vender algo antes?`;

      options = [
        { label: "Sí", value: "money_sold_before" },
        { label: "No", value: "money_first_time" }
      ];

      lead.stage = "money_flow";

      return { reply, options, showInput: false };
    }

    if (message === "hobby") {
      lead.user_goal = "hobby"; // Guardamos la meta
      let hobbyText = business.type === "creativo"
        ? "crear cosas con tus manos, relajarte y desconectarte del estrés"
        : "aprender algo nuevo, estimular tu mente y disfrutar el proceso";

      reply = `Me encanta eso ${lead.name} 💖

porque cuando lo haces por hobby…

lo haces por ti.

sin presión,
sin estrés,
solo disfrutando ✨

muchas personas usan esto para:

${hobbyText}${testimonialsText}

¿te gustaría vivir eso?`;

      options = [
        { label: "😍 Sí, me encantaría", value: "hobby_yes" },
        { label: "🤔 No estoy seguro", value: "hobby_doubt" }
      ];

      lead.stage = "hobby_flow";

      return { reply, options, showInput: false };
    }

    if (message === "learn") {
      lead.user_goal = "learn"; // Guardamos la meta
      reply = `Excelente decisión ${lead.name} 🧠

aprender algo nuevo cambia completamente tu forma de pensar.

muchas personas empiezan sin saber nada…

y en pocas semanas ya entienden cosas que antes parecían imposibles.

no necesitas experiencia.

solo empezar.${testimonialsText}

dime 👇

¿te gustaría aprender desde cero paso a paso?`;

      options = [
        { label: "💖 Sí, desde cero", value: "learn_yes" },
        { label: "🤔 Tengo dudas", value: "learn_doubt" }
      ];

      lead.stage = "learn_flow";

      return { reply, options, showInput: false };
    }
  }

  // =========================
  // 💰 CONTINUACIÓN DINERO (RE-DISEÑADO MORTAL)
  // =========================
  else if (lead.stage === "money_flow") {

    if (message === "money_sold_before") {
      reply = `Perfecto ${lead.name} 💰

¡Eso es una ventaja enorme! Si ya tienes experiencia, este sistema es la pieza del rompecabezas que te faltaba para profesionalizar y escalar tus ganancias. 

Vas a dejar de "intentar" y vas a empezar a facturar con una estructura probada.

Imagina este escenario 👇 en solo 30 días ya viendo cómo entran tus propios resultados por aplicar el método.

🔥 Mira la facturación de los que ya están dentro:
${formatTestimonials() || "Nuestros alumnos ya están escalando sus ventas."}

¿Estás listo para dejar de jugar y empezar a construir tu libertad hoy mismo?`;

      options = [
        { label: "🚀 ¡SÍ, QUIERO FACTURAR!", value: "push_close" },
        { label: "🤔 Tengo algunas dudas", value: "action_doubt" }
      ];

      lead.stage = "pre_action";
      return { reply, options, showInput: false };
    }

    if (message === "money_first_time") {
      reply = `Excelente ${lead.name} 💰

Que sea tu primera vez es lo mejor que te puede pasar. No tienes vicios de otros métodos que no sirven. Vas a aprender el sistema correcto desde cero.

Aquí no necesitas ser un experto en ventas... necesitas decisión y seguir el paso a paso.

Imagina esto 👇 en 30 días, mirando atrás y agradeciendo el haber empezado hoy.

🔥 Mira lo que logran personas que empezaron exactamente como tú:
${formatTestimonials() || "Alumnos desde cero ya están cobrando sus primeras ganancias."}

¿Estás listo para que este sea el inicio de tus propios resultados?`;

      options = [
        { label: "🚀 ¡SÍ, QUIERO EMPEZAR!", value: "push_close" },
        { label: "🤔 Tengo algunas dudas", value: "action_doubt" }
      ];

      lead.stage = "pre_action";
      return { reply, options, showInput: false };
    }
  }

  // =========================
  // 🎨 CONTINUACIÓN HOBBY
  // =========================
  else if (lead.stage === "hobby_flow") {

    if (message === "hobby_yes") {

      reply = `Es una sensación increíble 💖

muchas personas empiezan así…

y terminan enamoradas del proceso 😍

🔥 mira esto:
${formatTestimonials() || ""}

¿te gustaría aprender paso a paso aunque empieces desde cero?`;

      options = [
        { label: "💖 Sí", value: "hobby_start" },
        { label: "🤔 Tengo dudas", value: "hobby_doubt" }
      ];

      return { reply, options, showInput: false };
    }

    if (message === "hobby_doubt") {

      reply = `Es normal dudar 💖

pero aquí no necesitas experiencia…

solo ganas de probar.

🔥 otros ya empezaron:
${formatTestimonials() || ""}

¿quieres intentarlo?`;

      options = [
        { label: "💖 Sí", value: "hobby_start" },
        { label: "😕 Prefiero esperar", value: "wait" }
      ];

      return { reply, options, showInput: false };
    }

    if (message === "hobby_start") {

      reply = `Perfecto 💖

imagina tu primera creación terminada…

y la satisfacción de haberlo logrado ✨

¿quieres empezar hoy?`;

      options = [
        { label: "🔥 Sí", value: "push_close" },
        { label: "🤔 Aún no", value: "wait" }
      ];

      lead.stage = "pre_action";

      return { reply, options, showInput: false };
    }
  }

  // =========================
  // 🧠 CONTINUACIÓN APRENDER
  // =========================
  else if (lead.stage === "learn_flow") {

    if (message === "learn_yes") {

      reply = `Perfecto ${lead.name} 🧠

vas a avanzar más rápido de lo que crees.

cuando tienes una guía paso a paso…

todo se vuelve mucho más fácil.

🔥 mira resultados reales:
${formatTestimonials() || ""}

¿quieres empezar hoy mismo?`;

      options = [
        { label: "🔥 Sí", value: "push_close" },
        { label: "🤔 Aún no", value: "wait" }
      ];

      lead.stage = "pre_action";

      return { reply, options, showInput: false };
    }

    if (message === "learn_doubt") {

      reply = `Es normal tener dudas.

pero no necesitas saberlo todo para empezar.

solo dar el primer paso.

🔥 otros ya lo hicieron:
${formatTestimonials() || ""}

¿quieres intentarlo?`;

      options = [
        { label: "💖 Sí", value: "push_close" },
        { label: "😕 Prefiero esperar", value: "wait" }
      ];

      lead.stage = "pre_action";

      return { reply, options, showInput: false };
    }
  }

  // =========================
  // 🔥 FASE DE TRANSICIÓN A OBJECIONES
  // =========================
  else if (lead.stage === "pre_action" && message === "action_doubt") {

    reply = `Te entiendo perfectamente. Es normal querer estar seguro antes de dar un gran paso.

¿Qué es lo que te hace dudar ahora mismo?`;

    options = [
      { label: "💸 El dinero", value: "objection_money" },
      { label: "⏳ El tiempo", value: "objection_time" },
      { label: "🤔 Cómo funciona", value: "objection_doubt" }
    ];

    return { reply, options, showInput: false };
  }

  // =========================
  // 🔥 OBJECIONES (CON COSTO DE OPORTUNIDAD)
  // =========================
  else if (message === "objection_money") {
    
    let moneyAction = lead.user_goal === "money" 
      ? "invertirlo en tu libertad y ver cómo se multiplica"
      : (lead.user_goal === "hobby" ? "dedicarlo a tu bienestar y algo que te apasiona" : "invertirlo en un conocimiento que te servirá para siempre");

    if (lead.user_goal === "money") {
      reply = `Te entiendo, ${lead.name}. Pero piénsalo así:

Si hoy no tienes ${business.price || "46 USD"} para invertir en tu futuro, esa es exactamente la razón por la que NECESITAS entrar.

Ese monto es lo que gastas en una cena que olvidas mañana. Aquí lo estás poniendo a trabajar para ti. 

¿Vas a seguir gastando o vas a ${moneyAction}?`;
    } else {
      reply = `Te entiendo perfectamente ${lead.name}.

Pero mira, el acceso cuesta ${business.price || "46 USD"}. 

Eso es lo que te gastas en una cena o un par de salidas un fin de semana. La diferencia es que esto te va a dar resultados reales si aplicas lo que te enseñamos.

¿Prefieres gastarlo o ${moneyAction}?`;
    }

    options = [
      { label: "🔥 Invertir hoy", value: "push_close" },
      { label: "🤔 Aún dudo", value: "objection_doubt_alt1" }
    ];

    return { reply, options, showInput: false };
  }

  else if (message === "objection_time") {

    reply = `No es tiempo…

es prioridad.

¿quieres intentarlo ahora que el sistema está listo para ti?`;

    options = [
      { label: "💖 Sí", value: "push_close" },
      { label: "🤔 No sé", value: "objection_doubt_alt2" }
    ];

    return { reply, options, showInput: false };
  }

  // ==========================================
  // 🔥 CIERRE & MICRO-VALIDACIÓN (ACTUALIZADO)
  // ==========================================
  if (message === "push_close") {

    let closeText = "";
    if (lead.user_goal === "money") {
      closeText = "lograr esa estabilidad y libertad económica que te mereces";
    } else if (lead.user_goal === "hobby") {
      closeText = "disfrutar de este hobby y desconectarte del mundo haciendo lo que te gusta";
    } else {
      closeText = "dominar esta nueva habilidad y aprender paso a paso";
    }

    reply = `Bien.

Imagina esto 👇 ya dentro, avanzando, viendo cómo los resultados empiezan a llegar.

¿Te hace sentido que para ${closeText} necesitas una herramienta profesional como esta?`;

    options = [
      { label: "😍 Sí, totalmente", value: "emotion_happy" },
      { label: "🤩 Sí, es lo que necesito", value: "emotion_motivated" },
      { label: "💖 Sí, vamos con todo", value: "emotion_proud" }
    ];

    // FIX: Actualizamos el stage para que el bot escuche los "emotion_"
    lead.stage = "awaiting_emotion"; 

    return { reply, options, showInput: false };
  }

  // ==========================================
  // 🔥 MENSAJES DE DESEO (HYPE) (ACTUALIZADO)
  // ==========================================
  else if (lead.stage === "awaiting_emotion" && (message || "").startsWith("emotion_")) {

    let hypeText = "";
    if (lead.user_goal === "money") {
      hypeText = "Despertar y ver notificaciones de ingresos en tu celular, sentir la paz de tener un sistema trabajando para ti y decir: 'Valió la pena tomar la decisión'.";
    } else if (lead.user_goal === "hobby") {
      hypeText = "Ese momento de paz donde estás creando algo con tus propias manos y te sientes feliz con el resultado.";
    } else {
      hypeText = "Sentir la satisfacción de que ahora sabes algo que antes parecía imposible y ver tu progreso real.";
    }

    reply = `¡Exacto! Esa visión es la que vamos a construir juntos ✨

Esto ya no es una posibilidad, es el plan de acción para tu nueva realidad. ${hypeText}

No vas a estar solo, Laura y todo el equipo te llevaremos de la mano.

¿Estás listo para dar el paso que va a marcar un antes y un después en tu vida?`;

    options = [
      { label: "🚀 ¡SÍ, ESTOY LISTO!", value: "confirm_hype" },
      { label: "🤔 Cuéntame un poco más", value: "more_hype" }
    ];

    lead.stage = "hype_desire";

    return {
      reply,
      options,
      showInput: false
    };
  }

  else if (lead.stage === "hype_desire") {

    if (message === "confirm_hype" || message === "more_hype") {

      let finalBenefit = "";
      if (lead.user_goal === "money") {
        finalBenefit = "empezar a construir tu libertad económica hoy mismo ✨";
      } else if (lead.user_goal === "hobby") {
        finalBenefit = "empezar a disfrutar de tu nuevo hobby hoy mismo ✨";
      } else {
        finalBenefit = "convertirte en un experto en este tema paso a paso ✨";
      }

      reply = `Brutal 🔥

Entonces no perdamos ni un segundo más. Mi compañera Laura ya tiene todo preparado para darte la bienvenida oficial. 

Vas a recibir el acceso inmediato, los bonos exclusivos de acción rápida y el acompañamiento VIP.

¿Tienes WhatsApp a la mano? Te enviaré un REGALO ESPECIAL si tomas acción en este momento. 

⚠️ ATENCIÓN: Solo quedan 3 cupos con el bono de regalo y solo es válido por las próximas 2 horas. 

Dime tu número para asegurar tu lugar y ${finalBenefit}`;

      lead.stage = "capture_whatsapp";

      return {
        reply,
        options: [],
        showInput: true,
        inputType: "phone"
      };
    }
  }

  // =========================
  // 🔥 FIX CRÍTICO WHATSAPP & RETARGETING
  // =========================
  else if (lead.stage === "capture_whatsapp") {

    if (/\d{7,}/.test(message)) {

      lead.phone = message;

      lead.stage = "action";

      reply = `Listo.

${business.productInfo}

💰 ${business.price || "46 USD"}

👉 ${business.productLink}

🔥 ENVÍA TU COMPROBANTE AHORA MISMO POR WHATSAPP

mi compañera Laura activará tu acceso inmediato

🎁 además recibirás un SUPER BONO exclusivo

⚠️ IMPORTANTE:
Solo quedan 3 cupos para el bono de hoy. Si no envías el comprobante en las próximas 2 horas… pierdes el regalo especial.`;

      return {
        reply,
        options: [],
        showInput: false,
        showWhatsApp: true,
        whatsappNumber: business.whatsappNumber
      };
    }

    // Mensaje de rescate si el input no es válido
    return {
      reply: `${lead.name || "Hola"}, ¿tuviste algún problema con el número? No quiero que pierdas tu cupo y el bono de regalo. Necesito tu número para enviarte los accesos ahora mismo.`,
      options: [],
      showInput: true,
      inputType: "phone",
      showWhatsApp: false
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

app.use((req, res, next) => {
  if (req.headers.host.includes("onrender.com")) {
    return res.redirect(301, `https://prestigecloser.com${req.url}`);
  }
  next();
});

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

    const exists = await Business.findOne({ slug });
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
      slug,
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
      url: `${protocol}://${host}/chat/${slug}`,
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
      url: `${protocol}://${host}/chat/${newBusiness.slug}`
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



// =========================
// 🚀 SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});

// =========================
// 🌐 PÁGINAS
// =========================

// =========================
// 🌐 PÁGINAS
// =========================

app.use(express.static("public"));

// CRM
app.get("/crm/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "crm.html"));
});

// CHAT
app.get("/chat/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// 🔥 IMPORTANTE: esto SIEMPRE de último
app.get("/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});




