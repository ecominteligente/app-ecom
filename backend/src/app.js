const path = require('path');
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 1. Caminho absoluto garantido: sai da pasta onde o processo iniciou (backend)
// e entra na pasta vizinha (frontend)
const frontendPath = path.join(process.cwd(), '..', 'frontend');

// 2. Serve os arquivos estáticos
app.use(express.static(frontendPath));

// 3. Rota principal
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 4. Rota catch-all
app.get("*", (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: "Rota API não encontrada" });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

module.exports = app;