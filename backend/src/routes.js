const express = require("express");
const router = express.Router();
const pool = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const path = require('path');

// Stripe
const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
    return require("stripe")(key);
};

// GA4 (CORRETO)
const analyticsClient = new BetaAnalyticsDataClient({
    keyFilename: path.join(__dirname, '../../backend/google-credentials.json')
});


// ================= LOGIN =================
router.post("/login", async (req, res) => {
    try {
        const { email, senha } = req.body;

        const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "E-mail ou senha incorretos." });
        }

        const user = rows[0];
        const senhaValida = await bcrypt.compare(senha, user.password);

        if (!senhaValida) {
            return res.status(401).json({ error: "E-mail ou senha incorretos." });
        }

        const token = jwt.sign(
            { id: user.id, nome: user.name },
            process.env.JWT_SECRET || "CHAVE_PADRAO",
            { expiresIn: "24h" }
        );

        res.json({ token, user });

    } catch (err) {
        res.status(500).json({ error: "Erro no login" });
    }
});


// ================= STATUS =================
router.get("/user/status/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query(
            "SELECT trial_ends, assinado FROM users WHERE id = ?", 
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Usuário não encontrado" });
        }

        const user = rows[0];

        if (user.assinado) {
            return res.json({ plano: "PRO", expirado: false });
        }

        const expirado = new Date(user.trial_ends) < new Date();

        res.json({ plano: "TRIAL", expirado });

    } catch {
        res.status(500).json({ error: "Erro status" });
    }
});


// ================= REGISTER =================
router.post("/auth/register", async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        const hash = await bcrypt.hash(senha, 10);

        const trial = new Date();
        trial.setDate(trial.getDate() + 7);

        const [result] = await pool.query(
            "INSERT INTO users (name, email, password, trial_ends) VALUES (?, ?, ?, ?)",
            [nome, email, hash, trial]
        );

        res.json({ id: result.insertId });

    } catch (err) {
        res.status(500).json({ error: "Erro ao cadastrar" });
    }
});


// ================= ADD SITE =================
router.post("/sites/add", async (req, res) => {
    try {
        const { user_id, name, url, ga4_property_id } = req.body;

        const [userRows] = await pool.query(
            "SELECT trial_ends, assinado FROM users WHERE id = ?", 
            [user_id]
        );

        const user = userRows[0];

        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

        if (!user.assinado && new Date(user.trial_ends) < new Date()) {
            return res.status(403).json({ error: "Trial expirado" });
        }

        const [dup] = await pool.query(
            "SELECT id FROM sites WHERE user_id = ? AND url = ?", 
            [user_id, url]
        );

        if (dup.length > 0) {
            return res.status(400).json({ error: "Site já cadastrado" });
        }

        const [result] = await pool.query(
            "INSERT INTO sites (user_id, name, url, ga4_property_id, status) VALUES (?, ?, ?, ?, 'online')",
            [user_id, name, url, ga4_property_id]
        );

        res.json({ id: result.insertId });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ================= LIST SITES =================
router.get("/sites/user/:userId", async (req, res) => {
    const [rows] = await pool.query(
        "SELECT id, name, url, status FROM sites WHERE user_id = ? ORDER BY id DESC",
        [req.params.userId]
    );

    res.json(rows);
});


// ================= KPI (FINAL FUNCIONANDO) =================
router.get("/kpis/:site_id", async (req, res) => {
    try {
        const { site_id } = req.params;

        const [rows] = await pool.query(
            "SELECT * FROM sites WHERE id = ?", 
            [site_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Site não encontrado" });
        }

        const site = rows[0];
        const propertyId = site.ga4_property_id;

        let ativos = 0;
        let visitasTotais = 0;
        let zap = 0;

        // 🔥 REALTIME
        try {
            const [resAtivos] = await analyticsClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                metrics: [{ name: 'activeUsers' }]
            });

            ativos = parseInt(resAtivos.rows?.[0]?.metricValues?.[0]?.value) || 0;

        } catch (err) {
            console.log("Realtime erro:", err.message);
        }

        // 🔥 EVENTOS
        try {
            const [resEventos] = await analyticsClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'eventName' }],
                metrics: [{ name: 'eventCount' }]
            });

            if (resEventos.rows) {
                resEventos.rows.forEach(row => {
                    const eventName = row.dimensionValues[0].value.toLowerCase();
                    const count = parseInt(row.metricValues[0].value || 0);

                    if (eventName === 'page_view') visitasTotais += count;

                    if (eventName.includes('whatsapp')) zap += count;
                });
            }

        } catch (err) {
            console.log("Eventos erro:", err.message);
        }

        const conversao = visitasTotais > 0 
            ? ((zap / visitasTotais) * 100).toFixed(2) + "%" 
            : "0%";

        res.json({
            nome_site: site.name,
            usuarios_ativos: ativos,
            compras: zap,
            conversao,
            ctr_whatsapp: conversao,

            funnel: [
                { nome: "page_view", qtd: visitasTotais },
                { nome: "whatsapp", qtd: zap }
            ],

            uptime: Array(60).fill("online")
        });

    } catch (err) {
        res.status(200).json({
            nome_site: "Erro",
            usuarios_ativos: 0,
            compras: 0,
            conversao: "0%",
            funnel: [],
            uptime: Array(60).fill("offline")
        });
    }
});

module.exports = router;