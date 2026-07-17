const mongoose = require("mongoose");

// 1. Definición del sub-esquema de productos
const productSchema = new mongoose.Schema({
  id: String,
  name: String,
  nombre: String,
  price: String,
  precio: String,
  category: String,
  categoria: String,
  description: String,
  descripcion: String,
  image: String,
  imagen: String,
  imageUrl: String,
  // 🎯 Campos añadidos para la lógica de IA y Vitrina
  tallas: String,
  availableSizes: String,
  tallasAgotadas: String,
  outOfStockSizes: String,
  colores: String,
  colors: String,
  envio: String,
  shipping: String
}, { _id: false });

// 2. Esquema principal
const businessSchema = new mongoose.Schema({
  name: String,
  slug: String,
  logo: String,
  primaryColor: String,
  welcomeMessage: String,
  whatsappNumber: String,
  productInfo: String,
  productLink: String,
  waMessage: String,

  // 🔥 NUEVO (VENTAS AVANZADAS)
  products: [productSchema], // 📦 AQUÍ ESTÁ EL CAMPO QUE FALTABA
  
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

  // 🔥 EXTRA
  logoSize: Number,
  visits: { type: Number, default: 0 },
  lastVisit: Date,

  // 🗺️ EXTENSIÓN PARA MAPA CONCEPTUAL
  nodes: [{
    id: { type: String, required: true },
    type: { type: String, default: "message" },
    content: { type: String, default: "" },
    inputType: {
      type: String,
      enum: ["text", "phone", "name", "none"],
      default: "none"
    },
    options: [String],
    // 🔥 Asegurar que los productos del flujo también tengan la metadata
    data: { type: mongoose.Schema.Types.Mixed } 
  }],

  connections: [{
    id: { type: String, required: true },
    sourceNodeId: { type: String, required: true },
    targetNodeId: { type: String, required: true },
    conditionValue: { type: String, default: "" }
  }],

  // 🔥 COMPATIBILIDAD EXTRA PARA EDITOR VISUAL
  flow: {
    nodes: { type: Array, default: [] },
    edges: { type: Array, default: [] }
  }

}, { timestamps: true });

// 🔥 INDEX PARA EVITAR SLUGS DUPLICADOS
businessSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Business", businessSchema);
