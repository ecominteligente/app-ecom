const express = require("express");
const router = express.Router();
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

// ✅ Função que garante a leitura da chave do Stripe vinda do .env
const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
    return require("stripe")(key);
};

const analyticsClient = new BetaAnalyticsDataClient({
    keyFilename: './google-credentials.json',
});

// --- 2. ROTA DE LOGIN (JWT) ---
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
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email,
                assinado: user.assinado,
                trial_ends: user.trial_ends 
            }
        });
    } catch (err) {
        console.error("Erro no login:", err.message);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

// --- 2.1 ROTA DE STATUS DO PLANO/TRIAL ---
router.get("/user/status/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query("SELECT trial_ends, assinado FROM users WHERE id = ?", [id]);

        if (rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado." });

        const user = rows[0];
        const agora = new Date();
        const fimTrial = new Date(user.trial_ends);
        
        if (user.assinado === true || user.assinado === 1) {
            return res.json({ expirado: false, dias_restantes: 999, plano: "PRO" });
        }

        const diffInMs = fimTrial - agora;
        const dias_restantes = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
        const expirado = diffInMs <= 0;

        res.json({
            expirado: expirado,
            dias_restantes: Math.max(0, dias_restantes),
            plano: "TRIAL"
        });
    } catch (err) {
        res.status(500).json({ error: "Erro ao verificar status." });
    }
});

// --- 3. ROTA DE CHECKOUT (STRIPE) ---
router.post("/create-checkout-session", async (req, res) => {
    const { priceId, userId } = req.body;
    try {
        const stripe = getStripe(); 
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: 'https://ecominteligente.com.br/app-configurar-site.html?success=true',
            cancel_url: 'https://ecominteligente.com.br/app-demo-live.html',
            metadata: { userId: String(userId) }
        });
        res.json({ id: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- 4. ROTA PARA CADASTRAR NOVO USUÁRIO ---
router.post("/auth/register", async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const salt = await bcrypt.genSalt(10);
        const senhaCripto = await bcrypt.hash(senha, salt);
        
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + 7);

        const [result] = await pool.query(
            "INSERT INTO users (name, email, password, trial_ends) VALUES (?, ?, ?, ?)",
            [nome, email, senhaCripto, trialEnds]
        );

        res.status(201).json({ 
            message: "Usuário criado!", 
            user: { id: result.insertId, name: nome, email: email } 
        });
    } catch (err) {
        res.status(500).json({ error: "Erro ao cadastrar: " + err.message });
    }
});

// --- 5. ROTA PARA CADASTRAR NOVO SITE (COM 3 TRAVAS) ---
router.post("/sites/add", async (req, res) => {
    try {
        const { user_id, name, url, ga4_property_id } = req.body;

        const [userRows] = await pool.query("SELECT trial_ends, assinado FROM users WHERE id = ?", [user_id]);
        const user = userRows[0];
        
        if (!user.assinado && new Date(user.trial_ends) < new Date()) {
            return res.status(403).json({ error: "Seu período de teste expirou. Faça upgrade para continuar!" });
        }

        const [duplicado] = await pool.query("SELECT id FROM sites WHERE user_id = ? AND url = ?", [user_id, url]);
        if (duplicado.length > 0) return res.status(400).json({ error: "Você já cadastrou este site!" });

        if (!user.assinado) {
            const [contagem] = await pool.query("SELECT count(*) as total FROM sites WHERE user_id = ?", [user_id]);
            if (contagem[0].total >= 3) return res.status(403).json({ error: "Limite de 3 sites atingido no Plano Free!" });
        }

        const [result] = await pool.query(
            "INSERT INTO sites (user_id, name, url, ga4_property_id, status) VALUES (?, ?, ?, ?, 'online')",
            [user_id, name, url, ga4_property_id]
        );

        const novoSiteId = result.insertId;
        await pool.query("INSERT INTO uptime_logs (site_id, status) VALUES (?, 'online')", [novoSiteId]);

        res.status(201).json({ message: "Site configurado!", site: { id: novoSiteId } });
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar site: " + err.message });
    }
});

// --- 5.1 BUSCAR SITES DO USUÁRIO ---
router.get("/sites/user/:userId", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, name, url, status FROM sites WHERE user_id = ? ORDER BY id DESC", [req.params.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar sites." });
    }
});

// --- 6. KPIs (GA4) ---
router.get("/kpis/:site_id", async (req, res) => {
    try {
        const { site_id } = req.params;
        const { inicio, fim } = req.query;

        const [siteRows] = await pool.query("SELECT * FROM sites WHERE id = ?", [site_id]);
        if (siteRows.length === 0) return res.status(404).json({ error: "Site não encontrado" });

        const site = siteRows[0];
        const propertyId = site.ga4_property_id;

        let ativos = 0, zap = 0, visitasTotais = 0, viewItem = 0, addToCart = 0, viewCart = 0, receita = 0, compras = 0;
        let regioesMap = {}, origensMap = { Ads: 0, Org: 0, Soc: 0 }, produtosMap = {};

        try {
            const [resAtivos] = await analyticsClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                metrics: [{ name: 'activeUsers' }]
            });
            ativos = parseInt(resAtivos.rows?.[0]?.metricValues?.[0]?.value) || 0;

            const [resEventos] = await analyticsClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: inicio || '7daysAgo', endDate: fim || 'today' }],
                dimensions: [{ name: 'eventName' }],
                metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }]
            });

            if (resEventos.rows) {
                resEventos.rows.forEach(row => {
                    const eventName = row.dimensionValues[0].value;
                    const count = parseInt(row.metricValues[0]?.value || 0);
                    const rev = parseFloat(row.metricValues[1]?.value || 0);

                    if (eventName === 'page_view') visitasTotais += count;
                    if (eventName === 'view_item') viewItem += count;
                    if (eventName === 'add_to_cart') addToCart += count;
                    if (eventName === 'view_cart') viewCart += count;

                    const eventZap = (site.event_whatsapp || '').toLowerCase().trim();
                    if ((eventZap && eventName.toLowerCase() === eventZap) || (!eventZap && eventName.toLowerCase().includes('whatsapp'))) {
                        zap += count;
                    }

                    if (eventName === 'purchase') {
                        receita += rev;
                        compras += count;
                    }
                });
            }

            // GEO + ORIGENS
            const [resGeo] = await analyticsClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: inicio || '7daysAgo', endDate: fim || 'today' }],
                dimensions: [{ name: 'region' }, { name: 'sessionMedium' }],
                metrics: [{ name: 'sessions' }]
            });

            if (resGeo.rows) {
                resGeo.rows.forEach(row => {
                    const region = row.dimensionValues[0].value;
                    const medium = row.dimensionValues[1].value.toLowerCase();
                    const count = parseInt(row.metricValues[0].value || 0);
                    if (region && region !== '(not set)') regioesMap[region] = (regioesMap[region] || 0) + count;
                    if (medium.includes('cpc') || medium.includes('paid')) origensMap['Ads'] += count;
                    else if (medium.includes('organic')) origensMap['Org'] += count;
                    else if (medium.includes('social')) origensMap['Soc'] += count;
                });
            }
        } catch (gaError) { console.error("GA4 Error:", gaError.message); }

        const regioesFinal = Object.entries(regioesMap).map(([estado, valor]) => ({ estado, valor })).sort((a,b) => b.valor - a.valor).slice(0, 5);
        const ctrWhatsapp = visitasTotais > 0 ? ((zap / visitasTotais) * 100).toFixed(2) : "0.00";

        res.json({
            nome_site: site.name,
            usuarios_ativos: ativos,
            compras: zap,
            conversao: ctrWhatsapp + "%",
            ctr_whatsapp: ctrWhatsapp + "%",
            receita,
            ticket_medio: compras > 0 ? (receita / compras) : 0,
            regioes: regioesFinal,
            top_regiao: regioesFinal[0]?.estado || "---",
            origens: [origensMap['Ads'], origensMap['Org'], origensMap['Soc']],
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
        res.status(200).json({ nome_site: "Erro", usuarios_ativos: 0, receita: 0, uptime: Array(60).fill("offline") });
    }
});

// --- 7. DELETAR SITE ---
router.delete("/sites/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM uptime_logs WHERE site_id = ?", [id]);
        await pool.query("DELETE FROM sites WHERE id = ?", [id]);
        res.json({ message: "Site removido com sucesso!" });
    } catch (err) { res.status(500).json({ error: "Erro ao deletar." }); }
});

// --- 8. BUSCAR DETALHES ---
router.get("/sites/detalhes/:id", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM sites WHERE id = ?", [req.params.id]);
        if (rows.length > 0) res.json(rows[0]);
        else res.status(404).json({ error: "Site não encontrado." });
    } catch (err) { res.status(500).json({ error: "Erro ao buscar detalhes." }); }
});

// --- 9. EDITAR SITE (Sintaxe MySQL) ---
router.put('/sites/update/:id', async (req, res) => {
    const { id } = req.params;
    const { name, url, ga4_property_id, event_whatsapp, event_purchase, event_checkout, event_cart, event_lead } = req.body;

    try {
        const query = `UPDATE sites SET name=?, url=?, ga4_property_id=?, event_whatsapp=?, event_purchase=?, event_checkout=?, event_cart=?, event_lead=? WHERE id=?`;
        await pool.query(query, [name||null, url||null, ga4_property_id||null, event_whatsapp||'', event_purchase||'', event_checkout||'', event_cart||'', event_lead||'', id]);
        res.json({ message: "Site atualizado!" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar no banco.", details: err.message });
    }
});

module.exports = router;