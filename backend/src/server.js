const path = require('path');
require("dotenv").config();

const cron = require("node-cron");
const axios = require("axios");

// 🔧 Proteção do banco
let pool;
try {
  pool = require("./db");
} catch (e) {
  console.error("❌ Erro ao conectar banco:", e.message);
}

// Importa a configuração que acabamos de ajustar acima
const app = require("./app");

const port = process.env.PORT || 3000;

// ✅ A rota de teste "/" foi removida daqui para não atropelar o frontend.

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

// 5. INICIALIZAÇÃO DO SERVIDOR
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
}).on('error', (err) => {
  console.error("❌ Erro ao iniciar:", err.message);
});