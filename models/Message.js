const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation"
  },
  role: String,
  content: String
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);