const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead",
    required: true
  },

  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true
  },

  // =========================
  // 🧠 ESTADO DEL BOT (NUEVO)
  // =========================
  step: {
    type: Number,
    default: 0
  },

  // =========================
  // 🎯 INTENCIÓN DETECTADA
  // =========================
  intent: {
    type: String,
    default: null
  },

  // =========================
  // 💰 OBJECIÓN DEL USUARIO
  // =========================
  objection: {
    type: String,
    default: null
  },

  // =========================
  // 🔥 NICHO (ESCALABLE)
  // =========================
  niche: {
    type: String,
    default: "afiliados"
  },

  // =========================
  // 🧩 CONTEXTO EXTRA (MEMORIA)
  // =========================
  context: {
    type: Object,
    default: {}
  }

}, { timestamps: true });

module.exports = mongoose.model("Conversation", conversationSchema);