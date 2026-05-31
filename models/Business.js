const mongoose = require("mongoose");

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
  testimonials: [
    {
      type: { type: String, enum: ["text", "image", "video"], default: "text" },
      content: String
    }
  ], // textos, links o imágenes (puedes guardar URLs)
  bonuses: [String], // lista de bonos
  price: String, // ejemplo: "46 USD"

  // 🔥 NUEVO
  userId: String,
  isTemplate: { type: Boolean, default: false },
  templateName: String,

  // 🔥 EXTRA (NO ROMPE NADA - SOLO AGREGA)
  logoSize: Number, // para controlar peso del base64
  visits: { type: Number, default: 0 }, // analytics simple
  lastVisit: Date, // última interacción

  // 🗺️ EXTENSIÓN PARA MAPA CONCEPTUAL (AÑADIDO SIN ALTERAR LO ANTERIOR)
  nodes: [{
    id: { type: String, required: true },          // ID único del nodo generado por el canvas (ej: "node_1")
    type: { 
      type: String, 
      enum: ['message', 'input', 'whatsapp_trigger'], 
      default: 'message' 
    },
    content: { type: String, default: '' },        // El mensaje que dirá el bot en este punto
    inputType: { 
      type: String, 
      enum: ['text', 'phone', 'name', 'none'], 
      default: 'none' 
    }
  }],
  
  connections: [{
    id: { type: String, required: true },          // ID único de la conexión/cable
    sourceNodeId: { type: String, required: true }, // ID del nodo desde donde sale el cable
    targetNodeId: { type: String, required: true }, // ID del nodo a donde llega el cable
    conditionValue: { type: String, default: '' }   // El texto del botón/respuesta que activa esta ruta
  }]

}, { timestamps: true });

// 🔥 INDEX PARA EVITAR SLUGS DUPLICADOS
businessSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Business", businessSchema);
