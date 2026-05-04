const path = require('path');
// Ajuste fundamental: indica que o .env está uma pasta acima da 'src'
require("dotenv").config();

const cron = require("node-cron");
const axios = require("axios");
const pool = require("./db"); // Continua puxando da mesma pasta 'src'
const app = require("./app"); // Continua puxando da mesma pasta 'src'

const port = process.env.PORT || 3000;

// 2. FUNÇÃO DO VIGILANTE (Ajustada para MySQL)
async function rodarVigilante() {
  console.log("🕒 [SISTEMA] Iniciando verificação automática...");
  try {
    // No MySQL, o resultado vem direto no primeiro item do array [rows]
    const [rows] = await pool.query("SELECT * FROM sites");

    for (let site of rows) {
      let status = "offline";
      try {
        const response = await axios.get(site.url, { timeout: 5000 });
        if (response.status === 200) status = "online";
      } catch (err) {
        status = "offline";
      }

      // ATUALIZA STATUS ATUAL (MySQL usa ? e NOW() funciona igual)
      await pool.query(
        "UPDATE sites SET status = ?, last_checked = NOW() WHERE id = ?",
        [status, site.id]
      );

      // GRAVA HISTÓRICO
      await pool.query(
        "INSERT INTO uptime_logs (site_id, status) VALUES (?, ?)",
        [site.id, status]
      );
    }
    console.log("✅ [SISTEMA] Verificação concluída e histórico gravado!");
  } catch (err) {
    console.error("❌ [ERRO] Falha no vigilante:", err.message);
  }
}

// 3. AGENDAMENTO
cron.schedule('* * * * *', () => {
    rodarVigilante();
});

// 4. EXECUÇÃO IMEDIATA
rodarVigilante();

// 5. INICIALIZAÇÃO DO SERVIDOR
app.listen(port, () => {
  console.log(`🚀 Sucesso! Servidor unificado rodando na porta ${port}`);
  console.log(`🔗 Monitoramento Ativo para Ecom Inteligente`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
      console.log(`❌ Erro: A porta ${port} já está em uso.`);
  } else {
      console.error("❌ Erro fatal ao iniciar:", err.message);
  }
});