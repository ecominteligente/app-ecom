const path = require('path');
require("dotenv").config();

const cron = require("node-cron");
const axios = require("axios");

let pool;
try {
  pool = require("./db");
} catch (e) {
  console.error("❌ Erro ao conectar banco:", e.message);
}

const app = require("./app");
const port = process.env.PORT || 3000;

// A rota app.get("/") foi removida para dar prioridade ao index.html do app.js

// 5. INICIALIZAÇÃO DO SERVIDOR
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
}).on('error', (err) => {
  console.error("❌ Erro ao iniciar:", err.message);
});