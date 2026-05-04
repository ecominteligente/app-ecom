// src/app.js
const path = require('path');
// Ajuste para o .env na pasta pai
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json());

// 🚀 ESSENCIAL: Faz o Express enxergar seus arquivos HTML na public_html
app.use(express.static(path.join(__dirname, "../public")));

// Prefixo /api para todas as rotas (conforme configuramos nos HTMLs)
app.use("/api", routes);

module.exports = app;