const path = require('path');
require("dotenv").config();

const cron = require("node-cron");
const axios = require("axios");

// 🔧 Proteção do banco (não deixa o app cair)
let pool;
try {
  pool = require("./db");
} catch (e) {
  console.error("❌ Erro ao conectar banco:", e.message);
}

const app = require("./app");

const port = process.env.PORT || 3000;

// ✅ Rota de teste (garante que o servidor responde)
app.get("/", (req, res) => {
  res.send("Servidor rodando");
});

// 2. FUNÇÃO DO VIGILANTE
async function rodarVigilante() {
  console.log("🕒 [SISTEMA] Iniciando verificação automática...");
  
  if (!pool) {
    console.log("⚠️ Banco não conectado. Pulando execução.");
    return;
  }

  try {
    const [rows] = await pool.query("SELECT * FROM sites");

    for (let site of rows) {
      let status = "offline";

      try {
        const response = await axios.get(site.url, { timeout: 5000 });
        if (response.status === 200) status = "online";
      } catch (err) {
        status = "offline";
      }

      await pool.query(
        "UPDATE sites SET status = ?, last_checked = NOW() WHERE id = ?",
        [status, site.id]
      );

      await pool.query(
        "INSERT INTO uptime_logs (site_id, status) VALUES (?, ?)",
        [site.id, status]
      );
    }

    console.log("✅ [SISTEMA] Verificação concluída!");
  } catch (err) {
    console.error("❌ [ERRO] Vigilante:", err.message);
  }
}

// 🔴 DESATIVADO TEMPORARIAMENTE (para não derrubar o servidor)
// cron.schedule('* * * * *', () => {
//   rodarVigilante();
// });

// rodarVigilante();

// 5. INICIALIZAÇÃO DO SERVIDOR
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
}).on('error', (err) => {
  console.error("❌ Erro ao iniciar:", err.message);
});