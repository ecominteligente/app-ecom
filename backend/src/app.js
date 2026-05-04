const path = require('path');
const express = require("express");

const app = express();

const frontendPath = path.join(__dirname, '..', '..', 'frontend');

// só serve estático
app.use(express.static(frontendPath));

// rota simples
app.get("/", (req, res) => {
  res.send("OK FUNCIONANDO");
});

module.exports = app;