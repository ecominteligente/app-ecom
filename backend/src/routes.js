const express = require("express");
const router = express.Router();
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

// =========================
// STRIPE
// =========================
const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
    return require("stripe")(key);
};

// =========================
// GA4
// =========================
const analyticsClient = new BetaAnalyticsDataClient({
    keyFilename: path.join(__dirname, "./google-credentials.json"),
});


// =========================
// LOGIN
// =========================
router.post("/login", async (req, res) => {
    try {
        const { email, senha } = req.body;

        const [rows] = await pool.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

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


// =========================
// STATUS PLANO
// =========================
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

        res.json({
            plano: "TRIAL",
            expirado
        });

    } catch (err) {
        res.status(500).json({ error: "Erro status" });
    }
});


// =========================
// REGISTER
// =========================
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
        res.status(500).json({ error: "Erro ao cadastrar" });
    }
});


// =========================
// ADD SITE
// =========================
router.post("/sites/add", async (req, res) => {
    try {
        const { user_id, name, url, ga4_property_id } = req.body;

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

        const [dup] = await pool.query(
            "SELECT id FROM sites WHERE user_id = ? AND url = ?",
            [user_id, url]
        );

        if (dup.length > 0) {
            return res.status(400).json({ error: "Site já cadastrado" });
        }

        if (!user.assinado) {
            const [count] = await pool.query(
                "SELECT COUNT(*) as total FROM sites WHERE user_id = ?",
                [user_id]
            );

            if (count[0].total >= 3) {
                return res.status(403).json({ error: "Limite de 3 sites atingido" });
            }
        }

        const [result] = await pool.query(
            "INSERT INTO sites (user_id, name, url, ga4_property_id, status) VALUES (?, ?, ?, ?, 'online')",
            [user_id, name, url, ga4_property_id]
        );

        res.json({
            message: "Site criado",
            id: result.insertId
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// =========================
// LIST SITES
// =========================
router.get("/sites/user/:userId", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, name, url, status FROM sites WHERE user_id = ? ORDER BY id DESC",
            [req.params.userId]
        );

        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar sites" });
    }
});


// =========================
// DELETE SITE
// =========================
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


// =========================
// DETALHES SITE
// =========================
router.get("/sites/detalhes/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM sites WHERE id = ?",
            [req.params.id]
        );

        res.json(rows[0] || {});

    } catch (err) {
        res.status(500).json({ error: "Erro detalhes" });
    }
});


// =========================
// UPDATE SITE (CORRIGIDO)
// =========================
router.put('/sites/update/:id', async (req, res) => {
    try {
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

        await pool.query(
            `UPDATE sites SET 
                name = ?, 
                url = ?, 
                ga4_property_id = ?, 
                event_whatsapp = ?, 
                event_purchase = ?, 
                event_checkout = ?, 
                event_cart = ?, 
                event_lead = ?
            WHERE id = ?`,
            [
                name,
                url,
                ga4_property_id,
                event_whatsapp,
                event_purchase,
                event_checkout,
                event_cart,
                event_lead,
                id
            ]
        );

        res.json({ message: "Site atualizado com sucesso" });

    } catch (err) {
        console.error("UPDATE ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});


// =========================
// KPI GA4
// =========================
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
        let viewItem = 0;
        let addToCart = 0;
        let viewCart = 0;
        let compras = 0;
        let receita = 0;

        // REALTIME
        try {
            const [r] = await analyticsClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                metrics: [{ name: "activeUsers" }]
            });

            ativos = parseInt(r.rows?.[0]?.metricValues?.[0]?.value) || 0;
        } catch {}

        // EVENTS
        try {
            const [r] = await analyticsClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
                dimensions: [{ name: "eventName" }],
                metrics: [
                    { name: "eventCount" },
                    { name: "purchaseRevenue" }
                ]
            });

            if (r.rows) {
                r.rows.forEach(row => {
                    const name = row.dimensionValues[0].value.toLowerCase();
                    const count = parseInt(row.metricValues[0].value || 0);
                    const revenue = parseFloat(row.metricValues[1].value || 0);

                    if (name === "page_view") visitasTotais += count;
                    if (name === "view_item") viewItem += count;
                    if (name === "add_to_cart") addToCart += count;
                    if (name === "view_cart") viewCart += count;

                    if (name.includes("whatsapp")) zap += count;

                    if (name === "purchase") {
                        compras += count;
                        receita += revenue;
                    }
                });
            }

        } catch {}

        const ctr = visitasTotais
            ? ((zap / visitasTotais) * 100).toFixed(2)
            : "0.00";

        res.json({
            nome_site: site.name,
            usuarios_ativos: ativos,
            visitas_totais: visitasTotais,
            compras,
            receita,
            ctr_whatsapp: ctr + "%",
            funnel: [
                { nome: "page_view", qtd: visitasTotais },
                { nome: "view_item", qtd: viewItem },
                { nome: "add_to_cart", qtd: addToCart },
                { nome: "view_cart", qtd: viewCart },
                { nome: "whatsapp", qtd: zap }
            ],
            uptime: Array(60).fill("online")
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            nome_site: "Erro",
            usuarios_ativos: 0,
            ctr_whatsapp: "0%",
            uptime: Array(60).fill("offline")
        });
    }
});

module.exports = router;