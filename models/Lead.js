const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema({

  // =========================
  // 🏢 RELACIÓN NEGOCIO
  // =========================
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true
  },

  // =========================
  // 👤 DATOS DEL LEAD
  // =========================
  name: {
    type: String,
    default: null,
    trim: true
  },

  email: {
    type: String,
    default: null,
    lowercase: true,
    trim: true
  },

  phone: {
    type: String,
    default: null,
    trim: true
  },

  // =========================
  // 🔥 ESTADO DEL EMBUDO (AIDA)
  // =========================
  stage: {
    type: String,
    enum: [
      "attention",
      "interest",
      "desire",
      "action"
    ],
    default: "attention",
    index: true
  },

  // =========================
  // 📊 CALIDAD DEL LEAD
  // =========================
  status: {
    type: String,
    enum: [
      "cold",
      "warm",
      "hot",
      "client"
    ],
    default: "cold",
    index: true
  },

  // =========================
  // ✅ VENTA CERRADA
  // =========================
  sold: {
    type: Boolean,
    default: false,
    index: true
  },

  // =========================
  // 🧠 TRACKING AVANZADO
  // =========================
  source: {
    type: String,
    default: "chat"
  },

  notes: {
    type: String,
    default: null
  }

},{
  timestamps:true
});

// =========================
// ⚡ INDEX COMPUESTO (ESCALA)
// =========================
leadSchema.index({
  businessId:1,
  createdAt:-1
});

module.exports = mongoose.model("Lead", leadSchema);
