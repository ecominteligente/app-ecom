const path = require('path');
const express = require("express");

const app = express();

// caminho correto da pasta frontend
const frontendPath = path.join(__dirname, '..', '..', 'frontend');

// servir arquivos estáticos (css, js, imagens)
app.use(express.static(frontendPath));

// rota principal → abre o site
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// fallback (SPA / rotas inexistentes)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

module.exports = app;