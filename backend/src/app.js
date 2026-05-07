const path = require('path');
const express = require("express");

const app = express();

// 🔥 IMPORTANTE
app.use(express.json());

// 🔥 ATIVA SUAS ROTAS
const routes = require("./routes");
app.use("/api", routes);

// 🔥 Otimização de Performance
const frontendPath = path.join(__dirname, "frontend");

// Servir arquivos estáticos com cache e extensões automáticas
app.use(express.static(frontendPath, { 
  extensions: ['html', 'htm'],
  maxAge: '1d' // Adiciona cache de 1 dia para arquivos que não mudam sempre (CSS/Imagens)
}));

// Fallback para a Home (Index) - Otimizado
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"), (err) => {
    if (err) {
      res.status(404).send("Página não encontrada");
    }
  });
});

module.exports = app;