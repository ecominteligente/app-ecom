const express = require("express");
const router = express.Router();
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// Stripe
const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
    return require("stripe")(key);
};

// GA4
const analyticsClient = new BetaAnalyticsDataClient({
    keyFilename: './google-credentials.json',
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
            process.env.JWT_SECRET || "MINHA_CHAVE_SUPER_SECRETA",
            { expiresIn: "24h" }
        );

        return res.json({
            message: "Login realizado com sucesso!",
            token: token,
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
                return res.status(403).json({ error: "Limite atingido" });
            }
        }

        const [result] = await pool.query(
            "INSERT INTO sites (user_id, name, url, ga4_property_id, status) VALUES (?, ?, ?, ?, 'online')",
            [user_id, name, url, ga4_property_id]
        );

        await pool.query(
            "INSERT INTO uptime_logs (site_id, status) VALUES (?, 'online')",
            [result.insertId]
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
    const { id } = req.params;

    const { 
        name, url, ga4_property_id, 
        event_whatsapp, event_purchase, 
        event_checkout, event_cart, event_lead 
    } = req.body;

    try {
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
                name || null,
                url || null,
                ga4_property_id || null,
                event_whatsapp || '',
                event_purchase || '',
                event_checkout || '',
                event_cart || '',
                event_lead || '',
                id
            ]
        );

        res.json({ message: "Site atualizado!" });

    } catch (err) {
        console.error("❌ Erro:", err.message);
        res.status(500).json({ error: err.message });
    }
});


// ================= DELETE =================
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


// ================= KPI =================
router.get("/kpis/:site_id", async (req, res) => {
    try {
        const { site_id } = req.params;

        const [rows] = await pool.query("SELECT * FROM sites WHERE id = ?", [site_id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Site não encontrado" });
        }

        const site = rows[0];

        res.json({
            nome_site: site.name,
            usuarios_ativos: 0,
            receita: 0,
            ticket_medio: 0,
            ctr_whatsapp: "0%",
            top_produtos: [],
            uptime: Array(60).fill("online"),
            funnel: []
        });

    } catch (err) {
        res.status(200).json({
            nome_site: "Erro",
            usuarios_ativos: 0,
            receita: 0,
            ticket_medio: 0,
            ctr_whatsapp: "0%",
            top_produtos: [],
            uptime: Array(60).fill("offline"),
            funnel: []
        });
    }
});

module.exports = router;