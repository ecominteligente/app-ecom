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
app.use(express.static(frontendPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

module.exports = app;