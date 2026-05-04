const path = require('path');
const express = require("express");

const app = express();

const frontendPath = path.join(__dirname, '..', '..', 'frontend');

// servir arquivos estáticos
app.use(express.static(frontendPath));

// 🔥 rota principal (ESSENCIAL)
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// 🔥 fallback (qualquer rota abre o index)
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

module.exports = app;