const path = require('path');
require("dotenv").config();

const express = require("express");
const cors = require("cors");

// const routes = require("./routes"); // desativado por enquanto

const app = express();

app.use(cors());
app.use(express.json());

// rota de teste
app.get("/", (req, res) => {
  res.send("APP OK");
});

// app.use("/api", routes); // desativado por enquanto

module.exports = app;