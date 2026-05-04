const path = require('path');
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 1. Define o caminho subindo dois níveis (de src -> backend -> raiz)
// para encontrar a pasta frontend vizinha
const frontendPath = path.resolve(__dirname, '..', '..', 'frontend');

// 2. Serve os arquivos estáticos (CSS, JS, Imagens)
app.use(express.static(frontendPath));

// 3. Rota principal: Entrega o index.html da ECOM Inteligente
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 4. Rota catch-all para manter a navegação funcional
app.get("*", (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: "Rota API não encontrada" });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

module.exports = app;