const mysql = require("mysql2");
require("dotenv").config();

// Criamos a conexão usando os dados que você configurou na Hostinger
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "u511733894_ecom",
  database: process.env.DB_NAME || "u511733894_monitoramento",
  password: process.env.DB_PASSWORD,
  port: 3306, // Porta padrão do MySQL na Hostinger
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testando a conexão para exibir a mensagem no terminal
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Erro ao conectar no MySQL:", err.message);
    return;
  }
  console.log("🚀 BANCO CONECTADO! PODE LOGAR AGORA!");
  connection.release(); // Libera a conexão após o teste
});

module.exports = pool.promise();