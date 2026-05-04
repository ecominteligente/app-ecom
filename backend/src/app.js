const path = require('path');
const express = require("express");

const app = express();

// 🔥 caminho absoluto (HOSTINGER)
const frontendPath = "/home/u511733894/domains/ecominteligente.com.br/nodejs/frontend";

// servir arquivos
app.use(express.static(frontendPath));

// rota principal
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

module.exports = app;