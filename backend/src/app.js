const path = require('path');
const express = require("express");

const app = express();

// 🔥 IMPORTANTE
app.use(express.json());

// 🔥 ATIVA SUAS ROTAS
const routes = require("./routes");
app.use("/api", routes);

// frontend
const frontendPath = "/home/u511733894/domains/ecominteligente.com.br/nodejs/frontend";

// AJUSTE AQUI: Adicionamos a opção de extensões automáticas
app.use(express.static(frontendPath, { 
  extensions: ['html', 'htm'] 
}));

// Rota curinga (Asterisco) - Só entra se o arquivo físico não for encontrado acima
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

module.exports = app;