// Starter Pterodactyl command module (Baileys-style selfbot).
// Drop into the server's commands/ dir; nodemon hot-reloads it automatically.
// REAL dispatcher signature: run(sock, m, args, reply, chat)  — chat is the jid for sock.sendMessage.

module.exports = {
  name: "example",            // required, shown in menu
  aliases: ["ex", "contoh"],  // optional
  category: "utility",        // utility | ai | media | tools | owner
  owner: false,               // ONLY a .menu hint — dispatcher does NOT enforce it; self-guard inside run()
  cooldown: 5000,             // ms; falls back to config.DEFAULT_COOLDOWN
  description: "What this command does",

  async run(sock, m, args, reply, chat) {
    try {
      // m.body, m.sender, m.key.remoteJid, m.chat, m.fromMe available.
      // To self-guard owner-only commands (dispatcher does NOT check mod.owner):
      // const senderNumber = (m.sender || "").split("@")[0];
      // const isOwner = m.fromMe || (require("../config").RCE_NUMBERS || []).includes(senderNumber);
      // if (!isOwner) return reply("❌ Perintah ini hanya untuk owner.");

      if (!args.length) return reply("apsh");
      await sock.sendPresenceUpdate("composing", m.key.remoteJid);
      await reply("hello from example");
    } catch (e) {
      console.error("example error:", e);
      reply("❌ error");
    }
  },
};
