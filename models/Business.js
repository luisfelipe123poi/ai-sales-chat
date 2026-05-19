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
  lastVisit: Date // última interacción

}, { timestamps: true });

// 🔥 INDEX PARA EVITAR SLUGS DUPLICADOS
businessSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Business", businessSchema);
