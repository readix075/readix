// ============================================================
//  Readix Reader — serveur back-end (Node.js / Express, ESM)
//  Comptes réels (PostgreSQL/Supabase), 4 paliers, quota IA,
//  abonnements Stripe, fonctions IA premium + chatbot assistant.
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
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "12mb" }));

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
    metadata: { plan },
    success_url: `${CLIENT_URL}/?upgrade=success`,
    cancel_url: `${CLIENT_URL}/?upgrade=cancel`,
  });
  res.json({ url: session.url });
});

// ---- Fonctions IA premium ----
const AI_PROMPTS = {
  lens: "Tu es un assistant qui lit des documents. Résume le texte fourni et réponds à la question de l'utilisateur en citant les passages pertinents. Clair et concis, en français.",
  dialogue: "Mets en scène un court débat entre deux experts — un sceptique et un défenseur — sur le document fourni, pour révéler ses failles et ses points forts. En français.",
  compareai: "Compare les deux versions de texte fournies et explique ce qui change dans le SENS (pas seulement les mots). En français.",
  factcheck: "Identifie les affirmations non sourcées ou douteuses et explique pourquoi. En français.",
  negociateur: "Analyse ce contrat clause par clause : note le risque (faible/moyen/élevé), explique clairement, propose une contre-formulation plus sûre. En français.",
  conformite: "Vérifie ce document au regard du RGPD et des bonnes pratiques ; liste les points non conformes avec une recommandation. En français.",
  extract: "Extrais les données structurées (tableaux, montants, dates, entités) et renvoie un JSON propre.",
  study: "Génère un quiz de 5 questions et 8 fiches de révision (question/réponse) à partir du document. En français.",
  access: "Rédige des descriptions alternatives claires et un résumé simplifié adapté à la dyslexie. En français.",
  podcast: "Écris un script de podcast à deux voix (Hôte A / Hôte B) qui explique ce document. En français.",
  generate: "Rédige le document demandé par l'utilisateur, prêt à l'emploi, en français.",
  translate: "Traduis fidèlement le texte fourni dans la langue demandée, en conservant le sens et le ton.",
};
const AI_MIN_LEVEL = { // niveau minimum requis par fonction
  lens: 2, compareai: 2, factcheck: 2, extract: 2, study: 2, access: 2, translate: 2,
  dialogue: 3, negociateur: 3, conformite: 3, podcast: 3, generate: 3,
};

async function callAnthropic(system, userContent) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquante");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1500, system, messages: [{ role: "user", content: userContent }] }),
  });
  if (!r.ok) throw new Error("Erreur IA : " + (await r.text()));
  const data = await r.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

// Variante multi-tours (pour le chatbot) : accepte un tableau de messages {role, content}
async function callAnthropicChat(system, messages, maxTokens = 1024) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquante");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!r.ok) throw new Error("Erreur IA : " + (await r.text()));
  const data = await r.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

app.post("/api/ai/:feature", auth, async (req, res) => {
  console.log("[AI] feature=" + req.params.feature, "user=" + req.user.email, "plan=" + req.user.plan, "keyPresent=" + !!ANTHROPIC_API_KEY);
  const feature = req.params.feature;

  // ---- Cas spécial : le chatbot assistant (route dédiée, PAS de quota IA) ----
  if (feature === "chatbot") {
    const { text = "", history = [] } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Message manquant." });
    }
    try {
      // Normalise l'historique client → messages Anthropic
      const safeHistory = Array.isArray(history)
        ? history
            .filter(h => h && typeof h.content === "string" && h.content.trim())
            .slice(-12) // borne raisonnable
            .map(h => ({
              role: h.role === "assistant" ? "assistant" : "user",
              content: String(h.content).slice(0, 4000),
            }))
        : [];

      const messages = [...safeHistory, { role: "user", content: String(text).slice(0, 4000) }];
      const answer = await callAnthropicChat(CHATBOT_SYSTEM_PROMPT, messages, 1024);
      if (!answer || !answer.trim()) {
        return res.status(502).json({ error: "Réponse IA vide." });
      }
      return res.json({ answer: answer.trim() });
    } catch (e) {
      console.log("[CHATBOT] échec:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ---- Fonctions IA premium classiques (quota + palier) ----
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
    const answer = await callAnthropic(system, userContent.slice(0, 60000));
    await incUsage(req.user.email); // on compte l'opération réussie
    res.json({ answer, used: used + 1, quota });
  } catch (e) {
    console.log("[AI] échec:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- System prompt du chatbot (manuel complet Readix) ----
const CHATBOT_SYSTEM_PROMPT = `Tu es l'assistant intelligent intégré à Readix Reader, une plateforme web de traitement de PDF.
Tu réponds en français, de manière claire, structurée et bienveillante. Tu guides l'utilisateur pas à pas.
Tu ne dois JAMAIS inventer de fonctionnalité inexistante : si l'utilisateur demande quelque chose qui n'existe pas, propose l'outil le plus proche ou explique que ce n'est pas encore disponible.

=== OUTILS DISPONIBLES DANS READIX ===
Essentiels (plan Gratuit, usage limité) :
- Lecteur : ouvrir, feuilleter, zoomer, rechercher dans un PDF.
- Fusionner : combiner plusieurs PDF en un seul (vignettes réordonnables).
- Diviser / extraire : extraire des pages ou éclater en plusieurs fichiers.
- Organiser : pivoter, supprimer, réordonner les pages.
- Numéros de page : ajouter une numérotation automatique.
- Filigrane : apposer un texte en filigrane sur chaque page.
- PDF → images : exporter chaque page en PNG ou JPG.
- Images → PDF : assembler des images JPG/PNG en un PDF.
- Extraire le texte : récupérer tout le texte d'un PDF.

Signature Readix (gratuit) :
- Voice : écouter un PDF lu à voix haute.
- Compare : repérer les différences entre deux versions d'un document.
- Pulse : analyse statistique (temps de lecture, mots-clés).
- Shield : détecter les données sensibles et nettoyer les métadonnées.

IA Premium :
- Readix Lens (Pro) : résumé et questions-réponses sur un document.
- Compare IA (Pro) : comparaison sémantique de deux versions.
- Fact-check (Pro) : repérer les affirmations douteuses.
- Extract (Pro) : extraire des données structurées vers Excel/JSON.
- Study (Pro) : quiz et fiches de révision depuis un document.
- Access (Pro) : accessibilité et lecture adaptée (dyslexie).
- PDF → Word (Pro) : conversion fidèle en .docx éditable.
- Traduction (Pro) : traduire un PDF en 30+ langues.
- Dialogue (Studio) : deux IA débattent du document.
- Négociateur (Studio) : analyse les clauses risquées d'un contrat.
- Conformité (Studio) : vérification RGPD / règles internes.
- Podcast (Studio) : transformer un document en podcast à deux voix.
- Generate (Studio) : générer un document depuis une consigne.
- Signature certifiée (Studio) : signature électronique à valeur légale.
- Remplir & Signer (Standard+) : remplir les champs d'un formulaire PDF et apposer une signature, puis télécharger.

=== PLANS ET TARIFS ===
- Gratuit (0 €) : outils essentiels (usage limité) + Signatures Readix.
- Standard (7,99 €/mois) : outils essentiels illimités + Remplir & Signer.
- Pro (14,99 €/mois, le plus populaire) : + IA (Lens, Compare IA, Fact-check, Extract, Study, Access, Word, Traduction) — 50 opérations IA / mois.
- Studio (19,99 €/mois) : + IA avancée (Dialogue, Négociateur, Conformité, Podcast, Generate, Signature certifiée) — 200 opérations IA / mois.

=== ÉTAPES CLÉS POUR LES TÂCHES COURANTES ===
- Fusionner des PDF : rail de gauche → Fusionner → ajouter les PDF → glisser les vignettes pour réordonner → « Fusionner et télécharger ».
- Remplir & Signer : rail → Remplir & Signer → ouvrir le PDF → saisir directement dans les champs bleus → cliquer « Signature » pour dessiner/taper → « Enregistrer le PDF rempli ».
- Résumer avec l'IA : rail → Readix Lens → ouvrir un PDF → poser une question ou laisser vide pour un résumé → « Résumer / Répondre ».
- Créer un PDF : bouton « + Créer » en haut → Images → PDF, Page blanche (A4), ou Document IA.
- Changer de plan : menu utilisateur (avatar) → « Voir les plans & tarifs ».
- Ouvrir un PDF : zone centrale « Ouvrez un document » → glisser-déposer ou cliquer.

=== COMPORTEMENT ===
- Si l'utilisateur décrit un besoin, indique l'outil précis et les étapes numérotées.
- Si un outil nécessite un plan payant, précise lequel et le tarif.
- Reste concis (5-8 lignes max), sauf si l'utilisateur demande un tutoriel détaillé.
- Utilise des listes à puces ou numérotées pour les étapes.
`;

// ---- Sert le front-end (dossier ../public) ----
app.use(express.static(path.join(__dirname, "..", "public")));

// ---- Démarrage ----
initDb()
  .catch(e => console.error("⚠️  Init base de données échouée :", e.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Readix serveur démarré sur ${CLIENT_URL} (port ${PORT})`);
      if (!DATABASE_URL) console.log("⚠️  DATABASE_URL absente : comptes désactivés.");
      if (!ANTHROPIC_API_KEY) console.log("⚠️  ANTHROPIC_API_KEY absente : fonctions IA indisponibles.");
      if (!stripe) console.log("⚠️  Stripe non configuré : paiement désactivé.");
    });
  });
