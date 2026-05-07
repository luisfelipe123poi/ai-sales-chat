function detectIntent(msg) {
  msg = msg.toLowerCase();

  if (msg.includes("precio") || msg.includes("cuánto")) return "price";
  if (msg.includes("no tengo dinero") || msg.includes("caro")) return "money";
  if (msg.includes("no sé") || msg.includes("duda")) return "doubt";
  if (msg.includes("sí") || msg.includes("quiero")) return "yes";

  return "general";
}

function closerElite({ message, memory, business }) {
  const intent = detectIntent(message);
  const msg = message.toLowerCase();

  // =========================
  // 🧲 INICIO
  // =========================
  if (!memory.phase) {
    memory.phase = "diagnosis";

    return {
      reply: "Te hablo claro 👀\n\n¿quieres generar ingresos online en serio o solo estás viendo opciones?",
      memory
    };
  }

  // =========================
  // 🎯 DIAGNÓSTICO
  // =========================
  if (memory.phase === "diagnosis") {
    memory.goal = message;
    memory.phase = "pain";

    return {
      reply: "Perfecto 👀\n\n¿qué te ha impedido lograr eso hasta ahora?\n\nsé directo",
      memory
    };
  }

  // =========================
  // 💥 DOLOR
  // =========================
  if (memory.phase === "pain") {
    memory.problem = message;
    memory.phase = "solution";

    return {
      reply: "Tiene sentido 👀\n\npero si sigues así...\nen unos meses estarás igual.\n\n¿eso es lo que quieres?",
      memory
    };
  }

  // =========================
  // ⚡ SOLUCIÓN
  // =========================
  if (memory.phase === "solution") {
    memory.phase = "objection";

    return {
      reply: "Por eso existe este sistema 👇\n\nno necesitas experiencia,\nsolo seguir pasos.\n\npero no es para todo el mundo.\n\n¿te interesa de verdad?",
      memory
    };
  }

  // =========================
  // 🧱 OBJECIONES
  // =========================
  if (memory.phase === "objection") {

    if (intent === "money") {
      return {
        reply: "Te entiendo 👀\n\npero esto no es dinero...\nes prioridad.\n\nsi realmente quisieras cambiar,\nbuscarías la forma.\n\n¿sí o no?",
        memory
      };
    }

    if (intent === "doubt") {
      return {
        reply: "Normal 👀\n\nnadie está listo.\n\npero los que avanzan deciden igual.\n\n¿vas a seguir pensando o avanzar?",
        memory
      };
    }

    memory.phase = "close";

    return {
      reply: "Entonces estamos claros 👀\n\nquieres cambiar tu situación.\n\n¿vas en serio?",
      memory
    };
  }

  // =========================
  // 💰 CIERRE
  // =========================
  if (memory.phase === "close") {
    return {
      reply: `Bien 🔥\n\nempieza aquí:\n👉 ${business.productLink}\n\nte guío paso a paso.`,
      memory,
      showWhatsApp: true
    };
  }

  return {
    reply: "Responde directo 👀",
    memory
  };
}

module.exports = { closerElite };