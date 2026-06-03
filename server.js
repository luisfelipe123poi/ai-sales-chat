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

  // 🔥 Blindaje inicial contra nulos
  if (!lead.notes || typeof lead.notes !== "object" || lead.notes === null) {
    lead.notes = {};
  }

  if (!message) message = "";

  // 🚨 CONTINGENCIA: Si el negocio no tiene nodos configurados
  if (!business.nodes || business.nodes.length === 0) {
    return {
      reply: business.welcomeMessage || "¡Hola! Bienvenido.",
      options: [],
      showInput: false,
      inputType: "none"
    };
  }

  // ==========================================
  // ⚡ MOTOR DINÁMICO REPARADO (CLIPSY)
  // ==========================================
  let currentNode = null;

  // 1. Determinar el nodo actual o el inicio del grafo
  if (!lead.stage || lead.stage === "" || message.toLowerCase() === "start" || message.toLowerCase() === "hola") {
    
    // Buscamos el nodo de inicio de forma flexible
    currentNode = business.nodes.find(n => 
      String(n.id || n._id) === "start" || 
      (n.data && String(n.data.customId) === "start") ||
      String(n.id || n._id) === "node_start"
    );

    // Si no encuentra un nodo explícito "start", tomamos el primero del canvas
    if (!currentNode && business.nodes.length > 0) {
      currentNode = business.nodes[0];
    }
    
    lead.stage = currentNode ? String(currentNode.id || currentNode._id) : "";
  } else {
    // Búsqueda tolerante del nodo actual convirtiendo a String
    currentNode = business.nodes.find(n => String(n.id || n._id) === String(lead.stage));
    if (!currentNode) {
      currentNode = business.nodes[0];
      lead.stage = currentNode ? String(currentNode.id || currentNode._id) : "";
    }
  }

  if (!currentNode) {
    return {
      reply: business.welcomeMessage || "¡Hola! Escribe 'hola' para iniciar.",
      options: [],
      showInput: false,
      inputType: "none"
    };
  }

  // 2. Procesar transiciones cuando el cliente responde o pulsa un botón
  if (lead.stage && message.toLowerCase() !== "start" && message.toLowerCase() !== "hola") {
    
    const connections = business.connections || [];

    console.log("================================");
    console.log("MENSAJE:", message);
    console.log("LEAD STAGE:", lead.stage);
    console.log("CURRENT NODE:", currentNode);
    console.log("CONNECTIONS:", connections);
    console.log("================================");

    // 🔥 FIX CRÍTICO: Comparamos limpiando el prefijo "node_" si existe en cualquiera de los dos lados
    const connection = connections.find(c => {
      const cleanSourceId = String(c.sourceNodeId).replace("node_", "");
      const cleanCurrentId = String(currentNode.id || currentNode._id).replace("node_", "");
      
      return cleanSourceId === cleanCurrentId && 
             c.conditionValue && 
             c.conditionValue.toLowerCase().trim() === message.toLowerCase().trim();
    });

    if (connection) {
      const nextNode = business.nodes.find(n => {
        connections.forEach(c => {

          const cleanSourceId =
            String(c.sourceNodeId).replace("node_", "");

          const cleanCurrentId =
            String(currentNode.id || currentNode._id)
              .replace("node_", "");

          console.log({
            sourceNodeId: c.sourceNodeId,
            currentNodeId: currentNode.id || currentNode._id,
            cleanSourceId,
            cleanCurrentId,
            conditionValue: c.conditionValue,
            message
          });

        });
        const cleanTargetId = String(connection.targetNodeId).replace("node_", "");
        const cleanNodeId = String(n.id || n._id).replace("node_", "");
        return cleanTargetId === cleanNodeId;
      });

      if (nextNode) {
        currentNode = nextNode;
        lead.stage = String(nextNode.id || nextNode._id);
      }
    } else {
      // Si el nodo actual requería entrada de texto libre (Name, Phone, etc)
      if (currentNode.inputType && currentNode.inputType !== 'none') {
        if (currentNode.inputType === "name") lead.name = message;
        if (currentNode.inputType === "phone") lead.phone = message;

        // Buscamos la conexión lineal de salida limpiando los prefijos "node_"
        const linearConnection = connections.find(c => {
          const cleanSourceId = String(c.sourceNodeId).replace("node_", "");
          const cleanCurrentId = String(currentNode.id || currentNode._id).replace("node_", "");
          return cleanSourceId === cleanCurrentId;
        });

        if (linearConnection) {
          const nextNode = business.nodes.find(n => {
            const cleanTargetId = String(linearConnection.targetNodeId).replace("node_", "");
            const cleanNodeId = String(n.id || n._id).replace("node_", "");
            return cleanTargetId === cleanNodeId;
          });

          if (nextNode) {
            currentNode = nextNode;
            lead.stage = String(nextNode.id || nextNode._id);
          }
        }
      } else {
        // Fallback si el texto enviado no coincide con ningún botón
        const currentOptions = connections
          .filter(c => {
            const cleanSourceId = String(c.sourceNodeId).replace("node_", "");
            const cleanCurrentId = String(currentNode.id || currentNode._id).replace("node_", "");
            return cleanSourceId === cleanCurrentId && c.conditionValue && c.conditionValue !== '';
          })
          .map(c => ({ label: c.conditionValue, value: c.conditionValue }));

        return {
          reply: "Por favor, selecciona una de las opciones válidas del menú para poder ayudarte.",
          options: currentOptions,
          showInput: currentNode.inputType !== 'none',
          inputType: currentNode.inputType || "none"
        };
      }
    }
  }

  // Reemplazar la variable del nombre del lead de forma dinámica si ya existe en memoria
  let dynamicReply = currentNode.content || "";
  if (lead.name) {
    dynamicReply = dynamicReply.replace(/{name}/g, lead.name).replace(/\${lead.name}/g, lead.name);
  }

  // 🔥 FIX CRÍTICO: Recolectar opciones de salida limpiando el prefijo "node_"
  const safeConnections = business.connections || [];
  const nextOptions = safeConnections
    .filter(c => {
      const cleanSourceId = String(c.sourceNodeId).replace("node_", "");
      const cleanCurrentId = String(currentNode.id || currentNode._id).replace("node_", "");
      
      return cleanSourceId === cleanCurrentId && 
             c.conditionValue && 
             c.conditionValue !== '';
    })
    .map(c => ({
      label: c.conditionValue,
      value: c.conditionValue
    }));

  // Trigger finalizador de WhatsApp
  if (currentNode.type === 'whatsapp_trigger') {
    return {
      reply: dynamicReply,
      options: [],
      showInput: false,
      showWhatsApp: true,
      whatsappNumber: business.whatsappNumber
    };
  }

  return {
    reply: dynamicReply,
    options: nextOptions,
    showInput: currentNode.inputType !== 'none',
    inputType: currentNode.inputType || "none"
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
      testimonials: testimonialsRaw,

      // 🔥 AGREGAR ESTO
      nodes = [],
      connections = [],
      flow = {}

    } = req.body;

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

    if (testimonialsRaw && Array.isArray(testimonialsRaw)) {
      if (
        testimonialsRaw.length > 0 &&
        typeof testimonialsRaw[0] === "object"
      ) {
        processedTestimonials = testimonialsRaw;
      } else {
        processedTestimonials = testimonialsRaw
          .map(line => line.trim())
          .filter(line => line !== "")
          .map(content => {
            let type = "text";

            if (content.match(/\.(mp4|mov|webm|mkv|youtube|youtu)/i)) {
              type = "video";
            } else if (
              content.match(/\.(jpg|jpeg|png|gif|webp|imgur|cloudinary)/i)
            ) {
              type = "image";
            }

            return {
              type,
              content
            };
          });
      }
    }

    const business = await Business.create({
      name,
      slug: cleanSlug,
      logo,
      primaryColor,
      welcomeMessage,
      productInfo,
      productLink,
      whatsappNumber,
      userId: req.user.id,
      waMessage,
      testimonials: processedTestimonials,

      // 🔥 ESTO ES LO QUE FALTABA
      nodes,
      connections,
      flow
    });

    console.log("🔥 NODES GUARDADOS:", business.nodes?.length || 0);
    console.log("🔥 CONNECTIONS GUARDADAS:", business.connections?.length || 0);
    console.log(
      "🔥 FLOW GUARDADO:",
      Object.keys(business.flow || {}).length
    );

    const protocol =
      req.headers["x-forwarded-proto"] || req.protocol;

    const host = req.get("host");

    res.json({
      message: "Negocio creado",
      url: `${protocol}://${host}/${cleanSlug}`,
      business
    });

  } catch (error) {
    console.error("BUSINESS ERROR:", error);
    res.status(500).json({
      error: "Error al crear negocio"
    });
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
      isTemplate: false,

      nodes: template.nodes || [],
      connections: template.connections || []
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
// 🏢 GET BUSINESS BY ID (EDITAR NEGOCIO)
// =========================
app.get("/business-edit/:id", auth, async (req, res) => {
  try {

    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({
        error: "Negocio no encontrado"
      });
    }

    if (business.userId !== req.user.id) {
      return res.status(403).json({
        error: "No autorizado"
      });
    }

    res.json(business);

  } catch (error) {

    console.error("GET BUSINESS BY ID ERROR:", error);

    res.status(500).json({
      error: "Error obteniendo negocio"
    });
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
      : await Lead.create({
          businessId,
          stage: "attention"
        });

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

    // =========================
    // START NODE
    // =========================
    if (message === "start") {
      const startNode =
        business.nodes?.find(
          n =>
            n.type === "start" ||
            n.id === "start"
        );

      if (startNode) {
        await Message.create({
          conversationId: conversation._id,
          role: "assistant",
          content: startNode.content || ""
        });

        return res.json({
          reply: startNode.content || "",
          options: (startNode.options || []).map(opt => ({
            label: opt,
            value: opt
          })),
          leadId: lead._id,
          conversationId: conversation._id,
          showWhatsApp: false,
          whatsappNumber: business.whatsappNumber,
          showInput:
            startNode.inputType &&
            startNode.inputType !== "none",
          inputType:
            startNode.inputType || "text",
          testimonials: business.testimonials
        });
      }
    }

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

    // 🔥 AQUI LLAMAS TU BOT
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
      {
        ...req.body,

        nodes: req.body.nodes || business.nodes || [],
        connections: req.body.connections || business.connections || []
      },
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
  
