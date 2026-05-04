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
        
        // Ajustado: Troca de $1 por ? e uso de desestruturação [rows] para MySQL
        const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

        // Ajustado: No MySQL acessamos diretamente o tamanho do array de linhas
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
            // Mantenha assim: ele tentará ler do .env primeiro. Se não achar, usa o texto fixo.
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


// --- 2.1 ROTA DE STATUS DO PLANO/TRIAL (USADA PELO FRONTEND) ---
router.get("/user/status/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        // Ajustado para MySQL: Usando [rows] e o marcador '?'
        const [rows] = await pool.query("SELECT trial_ends, assinado FROM users WHERE id = ?", [id]);

        // Ajustado para MySQL: Verificando rows.length diretamente
        if (rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado." });

        const user = rows[0];
        const agora = new Date();
        const fimTrial = new Date(user.trial_ends);
        
        if (user.assinado === true || user.assinado === 1) { // Ajuste preventivo para boolean no MySQL
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
        console.error("Erro ao verificar status:", err.message);
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

        // Ajustado: Trocamos os $ pelo ? e removemos o RETURNING (que não existe no MySQL)
        const [result] = await pool.query(
            "INSERT INTO users (name, email, password, trial_ends) VALUES (?, ?, ?, ?)",
            [nome, email, senhaCripto, trialEnds]
        );

        // Ajustado: No MySQL, usamos result.insertId para saber o ID do usuário que acabou de ser criado
        res.status(201).json({ 
            message: "Usuário criado!", 
            user: { 
                id: result.insertId, 
                name: nome, 
                email: email 
            } 
        });
    } catch (err) {
        console.error("Erro ao cadastrar:", err.message);
        res.status(500).json({ error: "Erro ao cadastrar: " + err.message });
    }
});

// --- 5. ROTA PARA CADASTRAR NOVO SITE (COM 3 TRAVAS) ---
router.post("/sites/add", async (req, res) => {
    try {
        const { user_id, name, url, ga4_property_id } = req.body;

        // 🛡️ TRAVA 1: Verificação de Trial Expirado
        const userCheck = await pool.query("SELECT trial_ends, assinado FROM users WHERE id = $1", [user_id]);
        const user = userCheck.rows[0];
        if (!user.assinado && new Date(user.trial_ends) < new Date()) {
            return res.status(403).json({ error: "Seu período de teste expirou. Faça upgrade para continuar!" });
        }

        // 🛡️ TRAVA 2: Evitar Duplicidade
        const checkDuplicado = await pool.query("SELECT id FROM sites WHERE user_id = $1 AND url = $2", [user_id, url]);
        if (checkDuplicado.rows.length > 0) {
            return res.status(400).json({ error: "Você já cadastrou este site!" });
        }

        // 🛡️ TRAVA 3: Limite de 3 Sites (Se não for PRO)
        if (!user.assinado) {
            const contagem = await pool.query("SELECT count(*) FROM sites WHERE user_id = $1", [user_id]);
            if (parseInt(contagem.rows[0].count) >= 3) {
                return res.status(403).json({ error: "Limite de 3 sites atingido no Plano Free!" });
            }
        }

        const resultado = await pool.query(
            "INSERT INTO sites (user_id, name, url, ga4_property_id, status) VALUES ($1, $2, $3, $4, 'online') RETURNING id",
            [user_id, name, url, ga4_property_id]
        );

        const novoSiteId = resultado.rows[0].id;
        await pool.query("INSERT INTO uptime_logs (site_id, status) VALUES ($1, 'online')", [novoSiteId]);

        res.status(201).json({ message: "Site configurado!", site: { id: novoSiteId } });
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar site: " + err.message });
    }
});

// --- 5.1 BUSCAR SITES DO USUÁRIO ---
router.get("/sites/user/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const sites = await pool.query(
            "SELECT id, name, url, status FROM sites WHERE user_id = $1 ORDER BY id DESC", 
            [userId]
        );
        res.json(sites.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar sites." });
    }
});


// ==========================
// 🚀 SEÇÃO 6 - KPIs (GA4)
// ==========================
router.get("/kpis/:site_id", async (req, res) => {
    try {
        const { site_id } = req.params;
        const { inicio, fim } = req.query;

        const siteResult = await pool.query("SELECT * FROM sites WHERE id = $1", [site_id]);
        if (siteResult.rows.length === 0) {
            return res.status(404).json({ error: "Site não encontrado" });
        }

        const site = siteResult.rows[0];
        const propertyId = site.ga4_property_id;

        // 🔢 Variáveis principais
        let ativos = 0;
        let zap = 0;
        let visitasTotais = 0;
        let viewItem = 0;
        let addToCart = 0;
        let viewCart = 0;

        let receita = 0;
        let compras = 0;
        let bounceRate = 0;

        let regioesMap = {};
        let origensMap = { Ads: 0, Org: 0, Soc: 0 };
        let produtosMap = {};

        try {
            // ==========================
            // 🔥 1. REALTIME (USUÁRIOS ATIVOS)
            // ==========================
            const [resAtivos] = await analyticsClient.runRealtimeReport({
                property: `properties/${propertyId}`,
                metrics: [{ name: 'activeUsers' }]
            });

            ativos = parseInt(resAtivos.rows?.[0]?.metricValues?.[0]?.value) || 0;

 // ==========================
// 🔥 2. EVENTOS (FUNIL + RECEITA)
// ==========================
const [resEventos] = await analyticsClient.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: inicio || '7daysAgo', endDate: fim || 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [
        { name: 'eventCount' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' } // ✅ CORRETO
    ]
});

if (resEventos.rows) {
    resEventos.rows.forEach(row => {
        const eventName = row.dimensionValues[0].value;

        const count = parseInt(row.metricValues[0]?.value || 0);
        const revenue = parseFloat(row.metricValues[1]?.value || 0);
        const transactions = parseInt(row.metricValues[2]?.value || 0);

        // --- FUNIL DE PERFORMANCE ---
        if (eventName === 'page_view') visitasTotais += count;
        if (eventName === 'view_item') viewItem += count;
        if (eventName === 'add_to_cart') addToCart += count;
        if (eventName === 'view_cart') viewCart += count;

        // --- LÓGICA WHATSAPP ---
        const eventZap = (site.event_whatsapp || '').toLowerCase().trim();
        const nome = (eventName || '').toLowerCase().trim();

        if (
            (eventZap && nome === eventZap) ||
            (!eventZap && nome.includes('whatsapp'))
        ) {
            zap += count;
        }

        // --- 💰 VENDAS E RECEITA (CORRIGIDO) ---
        if (eventName === 'purchase') {
    receita += revenue;
    zap += count;      // 👈 ADICIONE ESTA LINHA (para o funil e o card 'Total Vendas' lerem)
    compras += count;  // (Mantenha esta se já estiver usando)
}
    });
}

            // ==========================
            // 🔥 3. GEO + ORIGEM
            // ==========================
            const [resGeo] = await analyticsClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: inicio || '7daysAgo', endDate: fim || 'today' }],
                dimensions: [
                    { name: 'region' },
                    { name: 'sessionMedium' }
                ],
                metrics: [{ name: 'sessions' }]
            });

            if (resGeo.rows) {
                resGeo.rows.forEach(row => {
                    const region = row.dimensionValues[0].value;
                    const medium = row.dimensionValues[1].value.toLowerCase();
                    const count = parseInt(row.metricValues[0].value || 0);

                    if (region && region !== '(not set)') {
                        regioesMap[region] = (regioesMap[region] || 0) + count;
                    }

                    if (medium.includes('cpc') || medium.includes('paid')) {
                        origensMap['Ads'] += count;
                    } else if (medium.includes('organic')) {
                        origensMap['Org'] += count;
                    } else if (medium.includes('social')) {
                        origensMap['Soc'] += count;
                    }
                });
            }

            // ==========================
            // 🔥 4. PRODUTOS (E-COMMERCE)
            // ==========================
            const [resProdutos] = await analyticsClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate: inicio || '7daysAgo', endDate: fim || 'today' }],
                dimensions: [{ name: 'itemName' }],
                metrics: [
                    { name: 'itemsPurchased' },
                    { name: 'itemRevenue' }
                ]
            });

            if (resProdutos.rows) {
                resProdutos.rows.forEach(row => {
                    const nome = row.dimensionValues[0].value;
                    const vendas = parseInt(row.metricValues[0].value || 0);
                    const receitaItem = parseFloat(row.metricValues[1].value || 0);

                    if (nome && nome !== '(not set)') {
                        produtosMap[nome] = {
                            nome,
                            vendas,
                            receita: receitaItem
                        };
                    }
                });
            }

        } catch (gaError) {
            console.error("⚠️ Erro GA4:", gaError.message);
        }

        // ==========================
        // 📊 PROCESSAMENTO FINAL
        // ==========================
        const regioesFinal = Object.entries(regioesMap)
            .map(([estado, valor]) => ({ estado, valor }))
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 5);

        const produtosFinal = Object.values(produtosMap)
            .sort((a, b) => b.vendas - a.vendas)
            .slice(0, 5);

        const topRegiao = regioesFinal[0]?.estado || "---";

        // 🔥 KPI PRINCIPAL (SEU PRODUTO)
        const ctrWhatsapp = visitasTotais > 0 
            ? ((zap / visitasTotais) * 100).toFixed(2) 
            : "0.00";

        const ticketMedio = compras > 0 ? (receita / compras) : 0;

        // ==========================
        // 📦 RESPOSTA FINAL
        // ==========================
        res.json({
            nome_site: site.name,

            usuarios_ativos: ativos,
            compras: zap, // WhatsApp
            conversao: ctrWhatsapp + "%",

            // 🔥 PRINCIPAL
            ctr_whatsapp: ctrWhatsapp + "%",

            receita,
            ticket_medio: ticketMedio,

            // fallback (caso ainda use no front)
            taxa_rejeicao: "0%",

            regioes: regioesFinal,
            top_regiao: topRegiao,

            origens: [
                origensMap['Ads'],
                origensMap['Org'],
                origensMap['Soc']
            ],

            top_produtos: produtosFinal,

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

// --- 7. DELETAR SITE ---
router.delete("/sites/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM uptime_logs WHERE site_id = $1", [id]);
        await pool.query("DELETE FROM sites WHERE id = $1", [id]);
        res.json({ message: "Site removido com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao deletar site." });
    }
});

// --- 8. BUSCAR DETALHES PARA EDIÇÃO ---
router.get("/sites/detalhes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM sites WHERE id = $1", [id]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: "Site não encontrado." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar detalhes." });
    }
});

// --- 9. EDITAR SITE EXISTENTE (Sintaxe correta para PostgreSQL) ---
router.put('/sites/update/:id', async (req, res) => {
    const { id } = req.params;
    
    // Pegamos os dados e garantimos que se vierem undefined, virem null ou string vazia
    const { 
        name, url, ga4_property_id, 
        event_whatsapp, event_purchase, 
        event_checkout, event_cart, event_lead 
    } = req.body;

    try {
        const query = `
            UPDATE sites SET 
                name = $1, 
                url = $2, 
                ga4_property_id = $3, 
                event_whatsapp = $4, 
                event_purchase = $5, 
                event_checkout = $6, 
                event_cart = $7, 
                event_lead = $8 
            WHERE id = $9
        `;

        const values = [
            name || null, 
            url || null, 
            ga4_property_id || null, 
            event_whatsapp || '', 
            event_purchase || '', 
            event_checkout || '', 
            event_cart || '', 
            event_lead || '', 
            id
        ];

        const [result] = await pool.query(
    "INSERT INTO users (name, email, password, trial_ends) VALUES (?, ?, ?, ?)",
    [nome, email, senhaCripto, trialEnds]
);

res.status(201).json({ 
    message: "Usuário criado!", 
    user: { 
        id: result.insertId, // No MySQL usamos insertId
        name: nome, 
        email: email 
    } 
});

    } catch (err) {
        // Logamos apenas a MENSAGEM do erro no console para não travar o log
        console.error("❌ Erro no banco:", err.message); 
        
        // NUNCA envie o objeto 'err' direto no .json()
        return res.status(500).json({ 
            error: "Erro ao atualizar site no banco de dados.",
            details: err.message // Envie apenas a string da mensagem
        });
    }
});

module.exports = router;