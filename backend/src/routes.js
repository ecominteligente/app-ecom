const express = require("express");
const router = express.Router();
const pool = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// Stripe
const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
    return require("stripe")(key);
};

// GA4
const path = require('path');

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

        res.json({
            token,
            user
        });

    } catch (err) {
        console.error(err);
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
        const agora = new Date();
        const fimTrial = new Date(user.trial_ends);

        if (user.assinado) {
            return res.json({ plano: "PRO", expirado: false });
        }

        const expirado = fimTrial < agora;

        res.json({
            plano: "TRIAL",
            expirado
        });

    } catch (err) {
        res.status(500).json({ error: "Erro status" });
    }
});


// ================= CRIAR USUÁRIO =================
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

        res.json({
            id: result.insertId
        });

    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "Email já existe" });
        }

        res.status(500).json({ error: "Erro ao cadastrar" });
    }
});


// ================= ADICIONAR SITE =================
router.post("/sites/add", async (req, res) => {
    try {
        const { user_id, name, url, ga4_property_id } = req.body;

        // usuário
        const [userRows] = await pool.query(
            "SELECT trial_ends, assinado FROM users WHERE id = ?", 
            [user_id]
        );

        const user = userRows[0];

        if (!user) {
            return res.status(404).json({ error: "Usuário não encontrado" });
        }

        if (!user.assinado && new Date(user.trial_ends) < new Date()) {
            return res.status(403).json({ error: "Trial expirado" });
        }

        // duplicado
        const [dup] = await pool.query(
            "SELECT id FROM sites WHERE user_id = ? AND url = ?", 
            [user_id, url]
        );

        if (dup.length > 0) {
            return res.status(400).json({ error: "Site já cadastrado" });
        }

        // limite 3
        if (!user.assinado) {
            const [count] = await pool.query(
                "SELECT COUNT(*) as total FROM sites WHERE user_id = ?", 
                [user_id]
            );

            if (count[0].total >= 3) {
                return res.status(403).json({ error: "Limite atingido" });
            }
        }

        // inserir
        const [result] = await pool.query(
            "INSERT INTO sites (user_id, name, url, ga4_property_id, status) VALUES (?, ?, ?, ?, 'online')",
            [user_id, name, url, ga4_property_id]
        );

        res.json({
            message: "Site criado",
            id: result.insertId
        });

    } catch (err) {
        console.error("ERRO:", err);
        res.status(500).json({ error: err.message });
    }
});


// ================= LISTAR SITES =================
router.get("/sites/user/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const [rows] = await pool.query(
            "SELECT id, name, url, status FROM sites WHERE user_id = ? ORDER BY id DESC",
            [userId]
        );

        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar sites" });
    }
});


// ================= DELETAR =================
router.delete("/sites/:id", async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query("DELETE FROM uptime_logs WHERE site_id = ?", [id]);
        await pool.query("DELETE FROM sites WHERE id = ?", [id]);

        res.json({ message: "Deletado" });

    } catch (err) {
        res.status(500).json({ error: "Erro ao deletar" });
    }
});


// ================= DETALHES =================
router.get("/sites/detalhes/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query(
            "SELECT * FROM sites WHERE id = ?", 
            [id]
        );

        res.json(rows[0]);

    } catch (err) {
        res.status(500).json({ error: "Erro detalhes" });
    }
});

// ================= UPDATE SITE =================
router.put('/sites/update/:id', async (req, res) => {
    try {
        console.log("🔥 UPDATE CHAMADO");

        const { id } = req.params;

        const {
            name,
            url,
            ga4_property_id,
            event_whatsapp,
            event_purchase,
            event_checkout,
            event_cart,
            event_lead
        } = req.body;

        await pool.query(`
            UPDATE sites SET 
                name = ?, 
                url = ?, 
                ga4_property_id = ?, 
                event_whatsapp = ?, 
                event_purchase = ?, 
                event_checkout = ?, 
                event_cart = ?, 
                event_lead = ?
            WHERE id = ?
        `, [
            name,
            url,
            ga4_property_id,
            event_whatsapp,
            event_purchase,
            event_checkout,
            event_cart,
            event_lead,
            id
        ]);

        console.log("✅ UPDATE OK");

        res.json({ success: true });

    } catch (err) {
        console.error("❌ ERRO UPDATE:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= KPIs (SAFE VERSION) =================
router.get("/kpis/:site_id", async (req, res) => {
    try {
        const { site_id } = req.params;

        // busca site (MYSQL CORRETO)
        const [rows] = await pool.query(
            "SELECT * FROM sites WHERE id = ?", 
            [site_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Site não encontrado" });
        }

        const site = rows[0];

        // 🚨 PROTEÇÃO: se não tiver GA4 configurado
        if (!site.ga4_property_id) {
            return res.json({
                nome_site: site.name,
                usuarios_ativos: 0,
                compras: 0,
                conversao: "0%",
                ctr_whatsapp: "0%",
                receita: 0,
                ticket_medio: 0,
                regioes: [],
                top_regiao: "---",
                origens: [0, 0, 0],
                top_produtos: [],
                funnel: [],
                uptime: Array(60).fill("offline")
            });
        }

        // 🚨 PROTEÇÃO: se não tiver credencial GA4
        let analyticsClientSafe = null;

        try {
            analyticsClientSafe = new BetaAnalyticsDataClient({
                keyFilename: path.join(__dirname, 'google-credentials.json')
            });
        } catch (e) {
            console.log("⚠️ GA4 não configurado");
        }

        if (!analyticsClientSafe) {
            return res.json({
                nome_site: site.name,
                usuarios_ativos: 0,
                compras: 0,
                conversao: "0%",
                ctr_whatsapp: "0%",
                receita: 0,
                ticket_medio: 0,
                regioes: [],
                top_regiao: "---",
                origens: [0, 0, 0],
                top_produtos: [],
                funnel: [],
                uptime: Array(60).fill("offline")
            });
        }

        // ================= GA4 REAL =================
        const propertyId = site.ga4_property_id;

        let ativos = 0;

        try {
            const [resAtivos] = await analyticsClientSafe.runRealtimeReport({
                property: `properties/${propertyId}`,
                metrics: [{ name: 'activeUsers' }]
            });

            ativos = parseInt(resAtivos.rows?.[0]?.metricValues?.[0]?.value) || 0;

        } catch (err) {
            console.log("⚠️ erro GA4:", err.message);
        }

        res.json({
            nome_site: site.name,
            usuarios_ativos: ativos,
            compras: 0,
            conversao: "0%",
            ctr_whatsapp: "0%",
            receita: 0,
            ticket_medio: 0,
            regioes: [],
            top_regiao: "---",
            origens: [0, 0, 0],
            top_produtos: [],
            funnel: [],
            uptime: Array(60).fill("online")
        });

    } catch (err) {
        console.error("❌ ERRO KPI:", err.message);

        res.status(200).json({
            nome_site: "Erro",
            usuarios_ativos: 0,
            receita: 0,
            ctr_whatsapp: "0%",
            uptime: Array(60).fill("offline"),
            funnel: []
        });
    }
});

module.exports = router;