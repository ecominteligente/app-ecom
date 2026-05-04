const path = require('path');
const express = require("express");

const app = express();

const frontendPath = path.join(__dirname, '..', '..', 'frontend');

// serve tudo (inclui index.html automaticamente)
app.use(express.static(frontendPath));

module.exports = app;