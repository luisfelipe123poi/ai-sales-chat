const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema({
  name: String,
  slug: String,
  logo: String,
  logoUrl: String, // 🔥 NUEVO: Alineado con el payload del backend para evitar pérdidas de propiedad
  primaryColor: String,
  welcomeMessage: String,
  whatsappNumber: String,
  productInfo: String,
  productLink: String,
  waMessage: String,
  aiInstructions: { type: String, default: "Eres un vendedor amable y persuasivo." }, // 🔥 NUEVO: prompt para la IA

  // 🛍️ NUEVO: CATÁLOGO DE PRODUCTOS (VITRINA PREMIUM)
  // Guarda el inventario estructurado sin depender del Canvas de Drawflow
  products: [
    {
      name: { type: String, default: "Producto sin nombre" },
      price: { type: String, default: "$0" },
      imageUrl: { type: String, default: "" },
      description: { type: String, default: "" },
      category: { type: String, default: "General" },
      isTopSeller: { type: Boolean, default: false }
    }
  ],

  // 🔥 NUEVO (VENTAS AVANZADAS)
  testimonials: [
    {
      type: { type: String, enum: ["text", "image", "video"], default: "text" },
      content: String
    }
  ],
  bonuses: [String],
  price: String,

  // 🔥 NUEVO
  userId: String,
  isTemplate: { type: Boolean, default: false },
  templateName: String,

  // 🔥 EXTRA (NO ROMPE NADA - SOLO AGREGA)
  logoSize: Number,
  visits: { type: Number, default: 0 },
  lastVisit: Date,

  // 🗺️ EXTENSIÓN PARA MAPA CONCEPTUAL (RELAJADO PARA EVITAR CAÍDAS)
  nodes: [{
    id: { type: String, required: false }, // 🛡️ FIX: required a false para que no explote si se envía vacío o parcial
    type: {
      type: String,
      default: "message"
    },
    content: { type: String, default: "" },
    inputType: {
      type: String,
      enum: ["text", "phone", "name", "none"],
      default: "none"
    },
    options: [String]
  }],

  connections: [{
    id: { type: String, required: false },          // 🛡️ FIX: required a false
    sourceNodeId: { type: String, required: false }, // 🛡️ FIX: required a false
    targetNodeId: { type: String, required: false }, // 🛡️ FIX: required a false
    conditionValue: { type: String, default: "" }
  }],

  // 🔥 COMPATIBILIDAD EXTRA PARA EDITOR VISUAL
  flow: {
    nodes: {
      type: Array,
      default: []
    },
    edges: {
      type: Array,
      default: []
    }
  }

}, { timestamps: true });

// 🔥 INDEX PARA EVITAR SLUGS DUPLICADOS
businessSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Business", businessSchema);
