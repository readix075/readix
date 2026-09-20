// ============================================================
//  Readix Reader — serveur back-end (Node.js / Express, ESM)
//  Comptes réels (PostgreSQL/Supabase), 4 paliers, quota IA,
//  abonnements Stripe, fonctions IA premium.
//  Node 18+ requis. Voir README.md.
// ============================================================
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

dotenv.config();
const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-a-changer";
const CLIENT_URL = process.env.CLIENT_URL || `http://localhost:${PORT}`;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const DATABASE_URL = process.env.DATABASE_URL;

// ---- Paliers d'abonnement ----
const PLAN_LEVEL = { free: 0, standard: 1, pro: 2, studio: 3 };
const AI_QUOTA = { free: 0, standard: 0, pro: 50, studio: 200 }; // opérations IA / mois
const FREE_OP_LIMIT = 15; // opérations incluses sur un compte gratuit avant l'invitation à passer à un plan payant (compteur caché, géré en arrière-plan)
const levelOf = (plan) => PLAN_LEVEL[plan] ?? 0;
const ym = () => new Date().toISOString().slice(0, 7); // "2026-09"

// ---- Base de données PostgreSQL (Supabase) ----
let pool = null;
if (DATABASE_URL) {
  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
}
async function initDb() {
  if (!pool) { console.log("⚠️  DATABASE_URL absente : les comptes sont désactivés."); return; }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      email      TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      pass_hash  TEXT NOT NULL,
      plan       TEXT NOT NULL DEFAULT 'free',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage (
      email    TEXT NOT NULL,
      ym       TEXT NOT NULL,
      ai_count INTEGER NOT NULL DEFAULT 0,
      op_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (email, ym)
    );`);
  await pool.query(`ALTER TABLE usage ADD COLUMN IF NOT EXISTS op_count INTEGER NOT NULL DEFAULT 0;`);
  console.log("✅ Base de données prête (tables users, usage).");
}
async function getUser(email) {
  const r = await pool.query("SELECT email, name, pass_hash, plan FROM users WHERE email=$1", [email]);
  return r.rows[0] || null;
}
async function createUser(email, name, passHash) {
  await pool.query("INSERT INTO users(email,name,pass_hash,plan) VALUES($1,$2,$3,'free')", [email, name, passHash]);
}
async function setPlan(email, plan) {
  await pool.query("UPDATE users SET plan=$2 WHERE email=$1", [email, plan]);
}
async function getUsage(email) {
  const r = await pool.query("SELECT ai_count FROM usage WHERE email=$1 AND ym=$2", [email, ym()]);
  return r.rows[0] ? r.rows[0].ai_count : 0;
}
async function incUsage(email) {
  await pool.query(
    `INSERT INTO usage(email,ym,ai_count) VALUES($1,$2,1)
     ON CONFLICT (email,ym) DO UPDATE SET ai_count = usage.ai_count + 1`,
    [email, ym()]
  );
}
async function getOps(email) {
  const r = await pool.query("SELECT op_count FROM usage WHERE email=$1 AND ym=$2", [email, ym()]);
  return r.rows[0] ? r.rows[0].op_count : 0;
}
async function incOps(email) {
  await pool.query(
    `INSERT INTO usage(email,ym,op_count) VALUES($1,$2,1)
     ON CONFLICT (email,ym) DO UPDATE SET op_count = usage.op_count + 1`,
    [email, ym()]
  );
}
function dbReady(res) {
  if (!pool) { res.status(503).json({ error: "Base de données non configurée" }); return false; }
  return true;
}

// ---- Stripe (optionnel) ----
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const Stripe = (await import("stripe")).default;
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

const app = express();
app.use(cors({ origin: true, credentials: false }));

// Le webhook Stripe a besoin du corps BRUT : déclaré AVANT express.json().
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send("Stripe non configuré");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook invalide : ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const email = s.client_reference_id || s.customer_email;
    const plan = (s.metadata && s.metadata.plan) || "pro";
    if (email && pool) { try { await setPlan(email, plan); } catch (e) { console.error(e); } }
  } else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const email = sub.metadata && sub.metadata.readix_email;
    const plan = sub.status === "active" || sub.status === "trialing" ? ((sub.metadata && sub.metadata.plan) || "pro") : "free";
    if (email && pool) { try { await setPlan(email, plan); } catch (e) { console.error(e); } }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "12mb" }));

// Diagnostic public: permet de distinguer un ancien déploiement Render d'une erreur IA.
// N'expose AUCUN secret : uniquement la présence (true/false) des variables de configuration.
app.get("/api/health", (req, res) => res.json({
  ok: true,
  service: "readix",
  version: "19.1",
  actionEngine: true,
  copilotAction: true,
  config: {
    database: !!DATABASE_URL,
    aiKey: !!ANTHROPIC_API_KEY,
    aiModel: ANTHROPIC_MODEL,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    clientUrl: CLIENT_URL
  },
  timestamp: new Date().toISOString()
}));


// ---- Auth ----
function sign(user) { return jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "30d" }); }
async function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) { console.log("[AUTH] requête sans jeton :", req.method, req.path); return res.status(401).json({ error: "Non authentifié" }); }
  if (!dbReady(res)) return;
  try {
    const { email } = jwt.verify(token, JWT_SECRET);
    const u = await getUser(email);
    if (!u) return res.status(401).json({ error: "Compte introuvable" });
    req.user = { email: u.email, name: u.name, plan: u.plan };
    next();
  } catch { return res.status(401).json({ error: "Session expirée" }); }
}
function requireLevel(min) {
  return (req, res, next) => {
    if (levelOf(req.user.plan) < min) return res.status(402).json({ error: "Plan supérieur requis" });
    next();
  };
}

// ---- Comptes ----
app.post("/api/signup", async (req, res) => {
  if (!dbReady(res)) return;
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Champs manquants" });
  const key = email.toLowerCase();
  try {
    if (await getUser(key)) return res.status(409).json({ error: "Ce compte existe déjà" });
    await createUser(key, name, await bcrypt.hash(password, 10));
    const user = { email: key, name, plan: "free" };
    res.json({ token: sign(user), user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/login", async (req, res) => {
  if (!dbReady(res)) return;
  const { email, password } = req.body || {};
  const key = (email || "").toLowerCase();
  try {
    const u = await getUser(key);
    if (!u || !(await bcrypt.compare(password || "", u.pass_hash)))
      return res.status(401).json({ error: "Identifiants incorrects" });
    const user = { email: key, name: u.name, plan: u.plan };
    res.json({ token: sign(user), user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

// Quota IA de l'utilisateur (pour l'affichage du compteur côté site)
app.get("/api/usage", auth, async (req, res) => {
  try {
    const used = await getUsage(req.user.email);
    res.json({ plan: req.user.plan, used, quota: AI_QUOTA[req.user.plan] ?? 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Compteur d'opérations gratuites — GÉRÉ EN ARRIÈRE-PLAN, jamais affiché à l'utilisateur.
// Sert uniquement à savoir quand rediriger vers un plan payant.
app.get("/api/op", auth, async (req, res) => {
  try {
    const lvl = levelOf(req.user.plan);
    if (lvl >= 1) return res.json({ used: 0, limit: null, over: false });
    const used = await getOps(req.user.email);
    res.json({ used, limit: FREE_OP_LIMIT, over: used >= FREE_OP_LIMIT });
  } catch (e) { res.json({ used: 0, limit: FREE_OP_LIMIT, over: false }); }
});
app.post("/api/op", auth, async (req, res) => {
  try {
    const lvl = levelOf(req.user.plan);
    if (lvl >= 1) return res.json({ used: 0, over: false }); // payant : illimité
    const used = await getOps(req.user.email);
    if (used >= FREE_OP_LIMIT) return res.json({ used, over: true });
    await incOps(req.user.email);
    res.json({ used: used + 1, over: (used + 1) >= FREE_OP_LIMIT });
  } catch (e) { res.json({ used: 0, over: false }); }
});

// ---- Abonnement Stripe ----
app.post("/api/billing/checkout", auth, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe non configuré (voir .env)" });
  const plan = (req.body && req.body.plan) || "pro";
  const period = (req.body && req.body.period) === "year" ? "YEAR" : "MONTH";
  const priceId = process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${period}`] || process.env.STRIPE_PRICE_ID;
  if (!priceId) return res.status(500).json({ error: "Aucun prix Stripe configuré pour ce plan" });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: req.user.email,
    customer_email: req.user.email,
    metadata: { plan, readix_email: req.user.email },
    subscription_data: { metadata: { plan, readix_email: req.user.email } },
    success_url: `${CLIENT_URL}/?upgrade=success`,
    cancel_url: `${CLIENT_URL}/?upgrade=cancel`,
  });
  res.json({ url: session.url });
});

// ---- Fonctions IA premium ----
const AI_PROMPTS = {
  workspace: `Tu es Readix AI Workspace, un assistant d'intelligence documentaire. Analyse le document fourni. Réponds en français, de façon structurée et factuelle. Pour chaque information importante, indique la page sous la forme [Page N], en te basant sur les marqueurs --- Page N --- présents dans le texte. Si l'information n'est pas dans le document, dis-le clairement. Si une question est posée, réponds d'abord directement puis donne les éléments du document qui justifient la réponse. Ne fabrique aucune citation.`,
  smartsearch: `Tu es le moteur de recherche sémantique de Readix. La demande de l'utilisateur est une recherche dans un PDF. Identifie les passages réellement pertinents même si les mots employés diffèrent. Retourne une liste courte des résultats les plus pertinents avec [Page N], un titre court et un extrait fidèle du document. Si aucun passage pertinent n'est trouvé, indique-le. Ne fabrique aucune citation.`,
  extractdata: `Tu es le moteur d'extraction structurée de Readix. Transforme le document en données exploitables. Retourne UNIQUEMENT un JSON valide, sans markdown ni commentaire. Adapte les champs au contenu : dates, montants, devises, personnes, organisations, références, numéros, adresses, échéances, tableaux, etc. Chaque élément important doit comporter une source de page sous la clé page quand elle est identifiable. Si aucune donnée d'une catégorie n'existe, ne l'invente pas.`,
  compareai: `Tu es le moteur de comparaison intelligente de Readix. Compare DOCUMENT A et DOCUMENT B, pas seulement les mots mais aussi le contenu et le sens. Présente les ajouts, suppressions et modifications significatives. Pour chaque différence, indique la source avec [Page N] lorsqu'elle est identifiable. Distingue les changements certains des interprétations. Réponds en français.`,
  copilot: `Tu es Readix Copilot, l'assistant contextuel de Readix Reader. Tu connais le document fourni et aides l'utilisateur à comprendre son contenu et à utiliser les outils Readix. Réponds en français. Pour les informations provenant du document, utilise [Page N]. Tu peux expliquer comment réaliser une action dans Readix (fusionner, diviser, signer, organiser, caviarder, etc.), mais n'affirme pas avoir exécuté une opération que le serveur ne t'a pas réellement demandé d'exécuter. Si la demande concerne le document, privilégie le document ouvert comme source.`,
};
const AI_MIN_LEVEL = { workspace:2, smartsearch:2, extractdata:2, compareai:2, copilot:2 };

async function anthropicMessage(payload) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquante");
  const requestedModel = payload.model || ANTHROPIC_MODEL;
  const models = [requestedModel];
  // Si Render conserve un ancien nom de modèle dans l'environnement, retente automatiquement avec le modèle par défaut actuel.
  if (requestedModel !== "claude-sonnet-5") models.push("claude-sonnet-5");
  let last = "";
  for (const model of models) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"content-type":"application/json","x-api-key":ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({...payload,model})
    });
    const body = await r.text();
    if (r.ok) {
      try { return JSON.parse(body); } catch { throw new Error("Réponse JSON invalide reçue d’Anthropic."); }
    }
    last = `Anthropic ${r.status} avec le modèle ${model}: ${body.slice(0,1200)}`;
    if (r.status !== 404) break;
  }
  throw new Error(last || "Service IA indisponible");
}

async function callAnthropic(system, userContent) {
  const data = await anthropicMessage({model:ANTHROPIC_MODEL,max_tokens:2000,system,messages:[{role:"user",content:userContent}]});
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

app.get("/api/ai/status", auth, async (req, res) => {
  try {
    const quota = AI_QUOTA[req.user.plan] ?? 0;
    const used = await getUsage(req.user.email);
    if (!ANTHROPIC_API_KEY) return res.status(503).json({ ok:false, error:"La clé IA du serveur n’est pas configurée (ANTHROPIC_API_KEY)." });
    if (levelOf(req.user.plan) < 2) return res.status(402).json({ ok:false, error:"Un abonnement Pro ou Studio est requis pour les modules IA avancés." });
    if (used >= quota) return res.status(429).json({ ok:false, error:`Quota IA mensuel atteint (${quota}).` });
    res.json({ ok:true, plan:req.user.plan, used, quota, model:ANTHROPIC_MODEL });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.post("/api/ai/chatbot", auth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: "Assistant IA non configuré" });
  const message = String((req.body && req.body.message) || "").trim();
  const history = Array.isArray(req.body && req.body.history) ? req.body.history.slice(-10) : [];
  const documentContext = String((req.body && req.body.documentContext) || "").slice(0, 40000);
  if (!message) return res.status(400).json({ error: "Message vide" });
  const manual = `Tu es l'Assistant Readix Reader, un GUIDE D'UTILISATION intégré à l'interface. Ta mission est uniquement d'expliquer comment utiliser Readix et d'orienter l'utilisateur vers les bons outils et les bonnes étapes.
Règles : réponds en français sauf demande contraire; sois concret, court et structuré; n'invente jamais un outil ou une fonction qui n'existe pas; si une fonction dépend d'un compte, d'un plan, de Stripe ou d'une clé IA, indique-le clairement.
Tu ne dois pas générer de contenu de document, de texte à insérer, de PDF, de fichier, de signature, de contrat, de code ou de résultat créatif. Tu ne dois pas exécuter une opération à la place de l'utilisateur. Tu expliques seulement quoi cliquer, dans quel ordre, et pourquoi.
Outils disponibles : Lecteur, Modifier, Remplir & Signer, Organiser, Fusionner, Diviser/Extraire, Caviarder, Comparer, Extraire le texte, OCR, Protection, Métadonnées, et les fonctions IA premium.
Remplir & Signer permet de déplacer/redimensionner une signature puis de la désélectionner en cliquant dans le document.
Les opérations PDF locales sont réalisées dans le navigateur. Les comptes, abonnements et fonctions IA utilisent le serveur Readix.
Plans : Gratuit, Standard, Pro, Studio. Les quotas IA premium dépendent du plan.
Quand l'utilisateur demande comment faire une action, donne les étapes exactes dans l'interface et signale les prérequis. Si la demande concerne une fonction IA avancée, indique quel module choisir et explique son rôle sans produire le résultat à sa place.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 900, system: manual, messages: [...history.filter(x=>x && (x.role==='user'||x.role==='assistant')).map(x=>({role:x.role,content:String(x.content||'').slice(0,4000)})), { role:'user', content:(documentContext ? 'CONTEXTE DU DOCUMENT OUVERT:\n'+documentContext+'\n\nDEMANDE UTILISATEUR:\n' : '')+message.slice(0,6000) }] }),
    });
    if (!r.ok) throw new Error("Erreur IA : " + (await r.text()));
    const data = await r.json();
    const answer = (data.content || []).filter(b=>b.type==='text').map(b=>b.text).join("\n");
    res.json({ answer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/copilot", auth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: "Readix Copilot n’est pas configuré sur le serveur." });
  const message = String((req.body && req.body.message) || "").trim();
  const history = Array.isArray(req.body && req.body.history) ? req.body.history.slice(-16) : [];
  const documentContext = String((req.body && req.body.documentContext) || "").slice(0, 50000);
  const attachments = Array.isArray(req.body && req.body.attachments) ? req.body.attachments.slice(0, 5) : [];
  const page = Number(req.body && req.body.page) || 1;
  const documentName = String((req.body && req.body.documentName) || "").slice(0, 180);
  if (!message) return res.status(400).json({ error: "Message vide" });
  const cleanAttachment = (a) => ({
    name: String((a && a.name) || "Document.pdf").slice(0, 180),
    type: String((a && a.type) || "pdf").slice(0, 20),
    page: Number((a && a.page) || 0) || 0,
    text: String((a && a.text) || "").slice(0, 45000)
  });
  const currentAttachments = attachments.map(cleanAttachment).filter(a => a.text);
  const historyForModel = history.filter(x => x && (x.role === "user" || x.role === "assistant")).map(x => {
    let content = String(x.content || "").slice(0, 6000);
    const atts = Array.isArray(x.attachments) ? x.attachments.slice(0, 4).map(cleanAttachment).filter(a => a.text) : [];
    if (atts.length) content += "\n\nPIÈCES JOINTES DE CE MESSAGE :\n" + atts.map(a => `--- ${a.name}${a.page ? ` — page ${a.page}` : ""} ---\n${a.text}`).join("\n\n");
    return { role: x.role, content: content.slice(0, 30000) };
  });

  const need = AI_MIN_LEVEL.copilot ?? 2;
  if (levelOf(req.user.plan) < need) return res.status(402).json({ error: "Readix Copilot est disponible avec le plan Pro ou supérieur." });
  const quota = AI_QUOTA[req.user.plan] ?? 0;
  const used = await getUsage(req.user.email);
  if (used >= quota) return res.status(429).json({ error: `Quota IA mensuel atteint (${quota}). Il se réinitialise le mois prochain.` });

  const system = `Tu es Readix Copilot, l’assistant intelligent intégré à Readix Reader.

MISSION : être le guide intelligent de Readix. Tu aides l’utilisateur à comprendre son document et à utiliser l’application. Tu fonctionnes comme un assistant conversationnel moderne, dans le cadre spécifique de Readix et des PDF.

RÈGLES FONDAMENTALES :
- Réponds en français sauf demande contraire.
- Réponds de façon naturelle, claire, structurée et concise.
- Tu peux expliquer le contenu du document fourni dans le contexte.
- Pour toute information tirée du document, cite les pages avec [Page N] lorsque la page est identifiable.
- Tu connais les outils Readix : Lecteur, Modifier, Remplir & Signer, Organiser, Fusionner, Diviser/Extraire, Caviarder, Comparer, Extraire le texte, OCR, Protection, Métadonnées, Compresser et les modules IA avancés.
- Quand l’utilisateur veut accomplir une opération dans Readix, explique-lui exactement quel outil utiliser et les étapes à suivre.
- Tu peux proposer un bouton ou une action à effectuer ensuite dans l’interface, mais tu ne dois jamais prétendre avoir exécuté une opération si elle n’a pas réellement été exécutée par Readix.
- Tu ne modifies, ne signes, ne fusionnes, ne supprimes et ne télécharges jamais un fichier de toi-même.
- Tu ne fabriques jamais une information absente du document.
- Si le document ne permet pas de répondre, dis-le clairement.
- Si l’utilisateur demande une fonctionnalité qui n’existe pas dans Readix, ne l’invente pas.
- Tu peux garder le fil de la conversation et comprendre des formulations comme « ce document », « cette page », « l’autre version » ou « cette information » en utilisant le contexte fourni.
- Le document ouvert, la page actuelle et les éléments ajoutés via le bouton + sont des contextes. Ils ne doivent pas être confondus avec une demande de modification du fichier.

CONTEXTE D’INTERFACE :
Document : ${documentName || "aucun nom communiqué"}
Page actuelle : ${page}

${documentContext ? "CONTEXTE FOURNI PAR READIX :\n" + documentContext : "Aucun contenu de document supplémentaire n’a été ajouté à cette demande."}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1800,
        system,
        messages: [
          ...historyForModel,
          { role: "user", content: ((currentAttachments.length ? "PIÈCES JOINTES À CETTE QUESTION :\n" + currentAttachments.map(a => `--- ${a.name}${a.page ? ` — page ${a.page}` : ""} ---\n${a.text}`).join("\n\n") + "\n\n" : "") + message).slice(0, 60000) }
        ]
      })
    });
    if (!r.ok) throw new Error("Erreur IA : " + (await r.text()));
    const data = await r.json();
    const answer = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    await incUsage(req.user.email);
    res.json({ answer, used: used + 1, quota });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function handleCopilotAction(req, res) {
  console.log("[COPILOT ACTION]", req.method, req.path, "user=", req.user?.email, "plan=", req.user?.plan);
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error:"Readix Copilot n’est pas configuré sur le serveur (ANTHROPIC_API_KEY manquante)." });
  const message = String((req.body && req.body.message) || "").trim();
  const history = Array.isArray(req.body && req.body.history) ? req.body.history.slice(-12) : [];
  const documentContext = String((req.body && req.body.documentContext) || "").slice(0, 45000);
  const attachments = Array.isArray(req.body && req.body.attachments) ? req.body.attachments.slice(0, 5) : [];
  const page = Number(req.body && req.body.page) || 1;
  const documentName = String((req.body && req.body.documentName) || "").slice(0, 180);
  if (!message) return res.status(400).json({ error:"Message vide" });
  const quota = AI_QUOTA[req.user.plan] ?? 0;
  const used = await getUsage(req.user.email);
  if (levelOf(req.user.plan) < (AI_MIN_LEVEL.copilot ?? 2)) return res.status(402).json({ error:"Readix Copilot est disponible avec le plan Pro ou supérieur." });
  if (used >= quota) return res.status(429).json({ error:`Quota IA mensuel atteint (${quota}).` });
  const clean = a => ({name:String(a?.name||"Document.pdf").slice(0,160),page:Number(a?.page||0)||0,text:String(a?.text||"").slice(0,35000)});
  const atts=attachments.map(clean).filter(a=>a.text);
  const hist=history.filter(x=>x&&(x.role==='user'||x.role==='assistant')).map(x=>({role:x.role,content:String(x.content||"").slice(0,8000)}));
  const actionSystem = `Tu es le moteur d’actions de Readix Copilot. Tu dois comprendre la demande puis décider si Readix doit simplement répondre ou réellement exécuter une action. Réponds UNIQUEMENT avec un JSON valide, sans markdown.

Schéma exact : {"answer":"texte court à afficher à l’utilisateur","actions":[{"type":"...","title":"...","...":...}]}

Actions autorisées :
- create_pdf : {type,title,content} crée un vrai PDF local à partir du contenu fourni.
- create_docx : {type,title,content,open:true} crée un vrai DOCX local.
- create_docstudio : {type,title,content} ouvre un nouveau document dans Document Studio avec le contenu.
- open_tool : {type,tool} ouvre un outil Readix existant (view, editpdf, fillsign, organize, merge, split, redact, compare, text, shield, meta, compress, aiadvanced, docstudio).
- delete_pages : {type,pages:[1,2],requiresConfirmation:true} supprime les pages indiquées du PDF courant.
- extract_pages : {type,pages:[1,2]} crée un nouveau PDF avec les pages indiquées du PDF courant.
- rotate_pages : {type,pages:[1,2],degrees:90} fait pivoter les pages du PDF courant.
- search_document : {type,query} demande une recherche documentaire.
- extract_data : {type,query} demande une extraction structurée à partir du contexte fourni.
- summarize : {type} demande un résumé du contexte fourni.

Règles :
1. N’invente jamais qu’une action a été exécutée : le client l’exécutera après ta réponse.
2. Pour une demande de création de fichier, utilise create_pdf/create_docx/create_docstudio.
3. Pour « génère-moi un PDF de ce récapitulatif », crée directement create_pdf avec un contenu complet, structuré et fidèle au contexte disponible. IMPORTANT : le fichier n'est PAS téléchargé automatiquement ; Readix affiche un bouton « Télécharger » que l'utilisateur clique lui-même. Ne dis donc JAMAIS que le fichier a été téléchargé ou enregistré ; formule plutôt « j'ai préparé le document, cliquez sur Télécharger quand vous voulez ».
4. Pour « mets cela dans Word », utilise create_docstudio ou create_docx selon la demande; si l’utilisateur veut modifier ensuite, préfère create_docstudio.
5. Les actions delete_pages sont destructives : mets requiresConfirmation:true.
6. Si le contexte documentaire est insuffisant, ne fabrique pas le contenu; réponds avec actions:[] et explique ce qui manque.
7. Plusieurs actions peuvent être renvoyées dans l’ordre.
8. Réponds en français.
9. Pour une simple question documentaire, actions:[] et answer contient la réponse.

Contexte d’interface : document=${documentName||"aucun"}, page=${page}.
${documentContext?"DOCUMENT OUVERT :\n"+documentContext:""}
${atts.length?"PIÈCES JOINTES :\n"+atts.map(a=>`--- ${a.name}${a.page?` — page ${a.page}`:""} ---\n${a.text}`).join("\n\n"):""}`;
  try {
    let data;
    try {
      data=await anthropicMessage({model:ANTHROPIC_MODEL,max_tokens:3000,system:actionSystem,messages:[...hist,{role:"user",content:message.slice(0,10000)}]});
    } catch(e) {
      console.error("[COPILOT ACTION]", e.message);
      return res.status(502).json({error:e.message});
    }
    const raw=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join("\n").trim();
    let parsed; try { parsed=JSON.parse(raw.replace(/^```json\s*/i,'').replace(/\s*```$/,'')); } catch(e) { parsed={answer:raw,actions:[]}; }
    if(!parsed||typeof parsed!=='object') parsed={answer:raw,actions:[]};
    if(!Array.isArray(parsed.actions)) parsed.actions=[];
    await incUsage(req.user.email);
    res.json({answer:String(parsed.answer||""),actions:parsed.actions.slice(0,5),used:used+1,quota,engine:"19.1"});
  } catch(e) { console.error("[COPILOT ACTION]", e); res.status(500).json({error:e.message}); }
}

// Route principale + alias : évite qu'un reverse proxy/ancien déploiement bloque le nouveau moteur.
app.post("/api/copilot/action", auth, handleCopilotAction);
app.post("/api/copilot/action/", auth, handleCopilotAction);
app.post("/api/copilot/actions", auth, handleCopilotAction);

app.post("/api/ai/:feature", auth, async (req, res) => {
  console.log("[AI] feature=" + req.params.feature, "user=" + req.user.email, "plan=" + req.user.plan, "keyPresent=" + !!ANTHROPIC_API_KEY);
  const feature = req.params.feature;
  const system = AI_PROMPTS[feature];
  if (!system) return res.status(501).json({ error: `« ${feature} » nécessite un service dédié (voir README).` });

  // 1) niveau d'abonnement suffisant ?
  const need = AI_MIN_LEVEL[feature] ?? 2;
  if (levelOf(req.user.plan) < need) return res.status(402).json({ error: "Plan supérieur requis pour cette fonction" });

  // 2) quota mensuel non dépassé ?
  const quota = AI_QUOTA[req.user.plan] ?? 0;
  const used = await getUsage(req.user.email);
  if (used >= quota) return res.status(429).json({ error: `Quota IA mensuel atteint (${quota}). Il se réinitialise le mois prochain.` });

  try {
    const { text = "", question = "", target = "" } = req.body || {};
    let userContent = text;
    if (question) userContent += `\n\nQuestion : ${question}`;
    if (target) userContent += `\n\nLangue cible : ${target}`;
    console.log("[AI] reçu: textLen=" + text.length + (question ? " (question)" : ""));
    const answer = await callAnthropic(system, userContent.slice(0, 60000));
    console.log("[AI] réponse: len=" + (answer ? answer.length : 0));
    await incUsage(req.user.email); // on compte l'opération réussie
    res.json({ answer, used: used + 1, quota });
  } catch (e) {
    console.log("[AI] échec:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Sert le front-end (dossier ../public) ----
app.use(express.static(path.join(__dirname, "..", "public")));

// ---- Démarrage ----
initDb()
  .catch(e => console.error("⚠️  Init base de données échouée :", e.message))
  .finally(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Readix serveur démarré sur ${CLIENT_URL} (port ${PORT})`);
      if (!DATABASE_URL) console.log("⚠️  DATABASE_URL absente : comptes désactivés.");
      if (!ANTHROPIC_API_KEY) console.log("⚠️  ANTHROPIC_API_KEY absente : fonctions IA indisponibles.");
      if (!stripe) console.log("⚠️  Stripe non configuré : paiement désactivé.");
    });
  });
