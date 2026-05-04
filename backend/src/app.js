const path = require('path');
require("dotenv").config();

const express = require("express");
const cors = require("cors");

// const routes = require("./routes"); // desativado por enquanto

const app = express();

app.use(cors());
app.use(express.json());

// 1. Define o caminho absoluto para a pasta frontend (um nível acima de backend)
const frontendPath = path.join(__dirname, '..', 'frontend');

// 2. Serve os arquivos estáticos (CSS, JS, Imagens, etc.)
app.use(express.static(frontendPath));

// 3. Rota principal: Entrega o index.html da ECOM Inteligente
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 4. Rota de redundância: Se o usuário digitar algo inexistente, volta para a Landing Page
// Útil se você planeja transformar em uma SPA no futuro
app.get("*", (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: "Rota API não encontrada" });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// app.use("/api", routes); // desativado por enquanto

module.exports = app;