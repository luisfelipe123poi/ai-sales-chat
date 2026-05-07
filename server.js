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
app.use(cors({
  origin: ["https://prestigecloser.com", "https://www.prestigecloser.com"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("/*", cors());

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

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://prestigecloser.com");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  next();
});
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

  if (!lead.notes || typeof lead.notes !== "object" || lead.notes === null) {
    lead.notes = {};
  }

  if (!message) message = "";

  const getGenderWord = () => {
    return "";
  };

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

  if (
    message === "objection_doubt" || 
    message === "objection_doubt_alt1" || 
    message === "objection_doubt_alt2" ||
    message === "action_doubt"
  ) {

    if (lead.user_goal === "money") {
      reply = `La duda es el enemigo número uno de tu cuenta bancaria, ${lead.name}. 

Mientras lo piensas, otros ya están aplicando el sistema y cobrando sus primeras comisiones.`;

    } else {
      reply = `La duda no desaparece pensando… desaparece actuando.`;
    }

    options = [
      { label: "🔥 Avanzar", value: "push_close" },
      { label: "😕 Esperar", value: "wait" }
    ];

    return { reply, options, showInput: false };
  }

  if (message === "start") {

    reply = `Hola 💖

¿cómo te llamas?`;

    return {
      reply,
      options: [],
      showInput: true
    };
  }

  return {
    reply,
    options,
    showInput: false
  };
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
    res.status(500).json({ error: "Error en registro" });
  }
});

// =========================
// 🔐 LOGIN
// =========================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Usuario no existe" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({ token });

  } catch {
    res.status(500).json({ error: "Error en login" });
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
// 🌐 ROUTES
// =========================
app.use(express.static("public"));

app.get("/crm/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "crm.html"));
});

app.get("/chat/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

app.get("/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});
