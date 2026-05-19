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

  // ==========================================
  // 🔥 DOBLE BLINDAJE
  // ==========================================

  if (
    !lead.notes ||
    typeof lead.notes !== "object" ||
    lead.notes === null
  ) {
    lead.notes = {};
  }

  if (!message) message = "";

  // ==========================================
  // 🔥 CATEGORÍAS LOCALES
  // ==========================================

  const localCategories = [

    {
      name: "Faciales",
      icon: "💆",

      description:
`Tratamientos diseñados para ayudarte a verte más fresca, luminosa y radiante ✨`,

      services: [

        {
          name: "Hollywood Peel",
          icon: "✨",

          description:
`Un tratamiento facial premium que ayuda a iluminar la piel, mejorar textura y dar un efecto glow increíble ✨`,

          benefits: [

            "Piel más luminosa",
            "Efecto glow inmediato",
            "Ayuda con manchas y poros"
          ],

          testimonials: [

            "😍 Mi piel quedó divina",
            "✨ Me sentí muchísimo más segura",
            "💖 Lo volvería a hacer mil veces"
          ],

          clients: "520"
        },

        {
          name: "Limpieza Facial",
          icon: "🫧",

          description:
`Ideal para limpiar profundamente la piel y devolverle frescura y suavidad ✨`,

          benefits: [

            "Elimina impurezas",
            "Ayuda con puntos negros",
            "Piel más suave"
          ],

          testimonials: [

            "💖 Sentí mi piel súper limpia",
            "✨ Me encantó el resultado"
          ],

          clients: "430"
        }
      ]
    },

    {
      name: "Pestañas",
      icon: "👁️",

      description:
`Realza tu mirada y siéntete todavía más hermosa ✨`,

      services: [

        {
          name: "Pestañas Premium",
          icon: "✨",

          description:
`Diseño de pestañas elegante y natural para una mirada más impactante 💖`,

          benefits: [

            "Mirada más intensa",
            "Acabado natural",
            "Mayor volumen"
          ],

          testimonials: [

            "😍 Me veo divina",
            "💖 Súper naturales"
          ],

          clients: "610"
        }
      ]
    },

    {
      name: "Corporales",
      icon: "🌸",

      description:
`Tratamientos corporales pensados para ayudarte a sentirte más segura y hermosa ✨`,

      services: [

        {
          name: "Moldeo Corporal",
          icon: "🔥",

          description:
`Ayuda a moldear zonas específicas y mejorar la apariencia corporal ✨`,

          benefits: [

            "Mejora visual",
            "Resultados progresivos",
            "Mayor seguridad"
          ],

          testimonials: [

            "💖 Me sentí más segura",
            "🔥 Noté cambios muy rápido"
          ],

          clients: "370"
        }
      ]
    }
  ];

  // ==========================================
  // 🔥 TESTIMONIOS
  // ==========================================

  const formatTestimonials = () => {

    if (
      !business.testimonials ||
      !business.testimonials.length
    ) return "";

    return business.testimonials.map(t => {

      if (typeof t === "string") {
        return t.trim();
      }

      if (t.type === "text") {

        if (
          t.content.trim().startsWith("http")
        ) {
          return t.content.trim();
        }

        return `💬 ${t.content}`;
      }

      if (t.type === "image") {
        return t.content.trim();
      }

      if (t.type === "video") {
        return t.content.trim();
      }

      return "";

    }).join("\n\n");
  };

  // ==========================================
  // 🔥 WAIT GLOBAL
  // ==========================================

  if (message === "wait") {

    reply =
`Pensarlo demasiado no cambia nada hermosa 💖

A veces el mayor cambio empieza simplemente tomando una decisión ✨

¿Vas a seguir postergándote o vas a darte el gusto de sentirte todavía más hermosa hoy?`;

    options = [

      {
        label: "🔥 Quiero mi cambio",
        value: "push_close"
      },

      {
        label: "🤔 Tengo dudas",
        value: "objection_doubt"
      }
    ];

    return {
      reply,
      options,
      showInput: false
    };
  }

  // ==========================================
  // 🔥 DUDAS
  // ==========================================

  if (
    message === "objection_doubt" ||
    message === "objection_doubt_alt1" ||
    message === "objection_doubt_alt2"
  ) {

    reply =
`Es completamente normal tener dudas hermosa 💖

Muchas chicas llegaron igual que tú…

con miedo,
inseguridad
o pensando demasiado.

Pero mira lo felices que terminaron después de decidir darse ese regalo ✨

${formatTestimonials() || "🔥 Muchísimas chicas ya vivieron su transformación."}

✨ A veces el cambio que necesitas empieza con una sola decisión.`;

    options = [

      {
        label: "💖 Quiero intentarlo",
        value: "push_close"
      },

      {
        label: "😕 Prefiero esperar",
        value: "wait"
      }
    ];

    return {
      reply,
      options,
      showInput: false
    };
  }

  // ==========================================
  // 🔥 START
  // ==========================================

  if (message === "start") {

    lead.stage = "ask_name";

    return {

      reply:
`Hola hermosa 💖

Bienvenida a ${business.name || "nuestro centro"} ✨

Qué alegría tenerte aquí 🌸

¿Cómo te gustaría que te llamemos? 💖`,

      options: [],

      showInput: true,

      inputType: "name"
    };
  }

  // ==========================================
  // 🔥 CAPTURAR NOMBRE
  // ==========================================

  if (lead.stage === "ask_name") {

    lead.name = message;

    lead.stage = "main";

    return {

      reply:
`${lead.name} 💖

Qué lindo tenerte aquí ✨

¿Qué te gustaría hacer hoy? 🌸`,

      options: [

        {
          label: "💅 Cotizar servicio",
          value: "cotizar"
        },

        {
          label: "📅 Agendar cita",
          value: "agendar"
        },

        {
          label: "🔥 Ver promociones",
          value: "promo"
        },

        {
          label: "✨ Ver tratamientos",
          value: "go_categories"
        },

        {
          label: "📍 Ver ubicación",
          value: "ubicacion"
        }
      ],

      showInput: false
    };
  }

  // ==========================================
  // 🔥 MAIN
  // ==========================================

  if (lead.stage === "main") {

    if (
      message === "cotizar" ||
      message === "agendar"
    ) {

      lead.stage = "capture_phone";

      return {

        reply:
`Perfecto ${lead.name} 💖

¿A qué número de WhatsApp te podemos enviar promociones VIP y prioridad de agenda? ✨`,

        options: [],

        showInput: true,

        inputType: "phone"
      };
    }

    if (message === "promo") {

      return {

        reply:
`🔥 PROMOCIONES ESPECIALES ✨

🔥 Beneficios especiales activos
🔥 Agenda VIP prioritaria
🔥 Cupos limitados hoy

💖 Queremos ayudarte a sentirte más hermosa y segura ✨`,

        options: [

          {
            label: "💆 Ver tratamientos",
            value: "go_categories"
          }
        ],

        showInput: false
      };
    }

    if (message === "ubicacion") {

      return {

        reply:
`📍 Estamos ubicadas en una zona cómoda y segura ✨

👇 Aquí puedes ver nuestra ubicación:`,

        options: [

          {
            label: "📍 Ver ubicación",
            type: "url",
            url:
              business.productLink ||
              "https://maps.google.com"
          }
        ],

        showInput: false
      };
    }

    if (
      message === "go_categories"
    ) {

      lead.stage = "categories";

      return {

        reply:
`Perfecto hermosa 💖

¿Qué categoría te gustaría ver primero? ✨`,

        options:

          localCategories.map((cat, index) => {

            return {

              label:
                `${cat.icon} ${cat.name}`,

              value:
                `category_${index}`
            };
          }),

        showInput: false
      };
    }
  }

  // ==========================================
  // 🔥 CAPTURAR PHONE
  // ==========================================

  if (lead.stage === "capture_phone") {

    if (!/\d{7,}/.test(message)) {

      return {

        reply:
`${lead.name || "Hermosa"} 💖

Necesito un número válido ✨`,

        options: [],

        showInput: true,

        inputType: "phone"
      };
    }

    lead.phone = message;

    lead.stage = "categories";

    return {

      reply:
`Perfecto hermosa 💖

Tu acceso VIP quedó activado ✨

¿Qué categoría te gustaría ver primero? 💖`,

      options:

        localCategories.map((cat, index) => {

          return {

            label:
              `${cat.icon} ${cat.name}`,

            value:
              `category_${index}`
          };
        }),

      showInput: false
    };
  }

  // ==========================================
  // 🔥 CATEGORÍAS
  // ==========================================

  if (
    message.startsWith("category_")
  ) {

    const index =
      Number(
        message.replace(
          "category_",
          ""
        )
      );

    const category =
      localCategories[index];

    if (!category) {

      return {

        reply:
`No encontramos esa categoría hermosa 💖`,

        options: [],

        showInput: false
      };
    }

    lead.selectedCategory = index;

    lead.stage = "services";

    let services =
      category.services.map((service, i) => {

        return {

          label:
            `${service.icon} ${service.name}`,

          value:
            `service_${index}_${i}`
        };
      });

    return {

      reply:
`${category.name} ✨

${category.description}

⚠️ Hoy algunos tratamientos tienen beneficios especiales activos.`,

      options: services,

      showInput: false
    };
  }

  // ==========================================
  // 🔥 SERVICIOS
  // ==========================================

  if (
    message.startsWith("service_")
  ) {

    const parts =
      message.split("_");

    const categoryIndex =
      Number(parts[1]);

    const serviceIndex =
      Number(parts[2]);

    const category =
      localCategories[categoryIndex];

    if (!category) {

      return {

        reply:
`No encontramos la categoría 💖`,

        options: [],

        showInput: false
      };
    }

    const service =
      category.services[serviceIndex];

    if (!service) {

      return {

        reply:
`No encontramos el tratamiento 💖`,

        options: [],

        showInput: false
      };
    }

    lead.selectedService =
      service.name;

    lead.stage = "pre_close";

    let benefits =
      service.benefits
        .map(b => `• ${b}`)
        .join("\n");

    let testimonials =
`\n\n🔥 Mira algunos resultados reales:\n\n` +
      service.testimonials.join("\n");

    return {

      reply:
`${service.icon} ${service.name} ✨

${service.description}

${benefits}

💖 Muchas chicas aman este procedimiento ✨

🔥 Más de ${
  service.clients
} chicas felices.${testimonials}

✨ ¿Te gustaría agendar tu valoración?`,

      options: [

        {
          label: "📅 Sí, quiero agendar",
          value: "push_close"
        },

        {
          label: "🔥 Quiero mi beneficio",
          value: "push_close"
        },

        {
          label: "🤔 Tengo dudas",
          value: "objection_doubt"
        }
      ],

      showInput: false
    };
  }

  // ==========================================
  // 🔥 PUSH CLOSE
  // ==========================================

  if (message === "push_close") {

    lead.stage = "capture_whatsapp";

    return {

      reply:
`Perfecto hermosa 💖

Tu beneficio VIP puede quedar reservado hoy mismo ✨

Déjame tu WhatsApp y te enviaremos toda la información ahora mismo ✨`,

      options: [],

      showInput: true,

      inputType: "phone"
    };
  }

  // ==========================================
  // 🔥 CAPTURE FINAL
  // ==========================================

  if (
    lead.stage === "capture_whatsapp"
  ) {

    if (!/\d{7,}/.test(message)) {

      return {

        reply:
`${lead.name || "Hermosa"} 💖

Necesito un número válido ✨`,

        options: [],

        showInput: true,

        inputType: "phone"
      };
    }

    lead.phone = message;

    lead.stage = "done";

    return {

      reply:
`🔥 Perfecto hermosa 💖

Tu beneficio VIP quedó reservado exitosamente ✨

En unos minutos una asesora especializada te escribirá personalmente 🌸`,

      options: [],

      showInput: false,

      showWhatsApp: true,

      whatsappNumber:
        business.whatsappNumber
    };
  }

  // ==========================================
  // 🔥 FALLBACK
  // ==========================================

  return {

    reply:
`Estoy aquí para ayudarte hermosa 💖`,

    options: [

      {
        label: "💆 Ver tratamientos",
        value: "go_categories"
      },

      {
        label: "🔥 Ver promociones",
        value: "promo"
      },

      {
        label: "📅 Quiero agendar",
        value: "agendar"
      }
    ],

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
  
