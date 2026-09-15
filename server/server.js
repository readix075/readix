// ============================================================
//  Readix Reader — serveur back-end (Node.js / Express, ESM)
//  Gère : comptes réels, abonnements Stripe, fonctions IA premium.
//  Node 18+ requis (fetch global). Voir README.md pour le démarrage.
// ============================================================
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-a-changer";
const CLIENT_URL = process.env.CLIENT_URL || `http://localhost:${PORT}`;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// ---- Stripe (optionnel : chargé seulement si la clé est présente) ----
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const Stripe = (await import("stripe")).default;
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

// ---- Mini base de données sur fichier (à remplacer par Postgres/Supabase en prod) ----
const DB_PATH = path.join(__dirname, "data", "db.json");
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
  catch { return { users: {} }; }
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

const app = express();
app.use(cors({ origin: true, credentials: false }));

// Le webhook Stripe a besoin du corps BRUT : on le déclare AVANT express.json().
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send("Stripe non configuré");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook invalide : ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const email = event.data.object.client_reference_id || event.data.object.customer_email;
    const db = loadDB();
    if (email && db.users[email]) { db.users[email].plan = "pro"; saveDB(db); }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "12mb" }));

// ---- Auth : middleware ----
function sign(user) { return jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "30d" }); }
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Non authentifié" });
  try {
    const { email } = jwt.verify(token, JWT_SECRET);
    const db = loadDB();
    const u = db.users[email];
    if (!u) return res.status(401).json({ error: "Compte introuvable" });
    req.user = { email, name: u.name, plan: u.plan };
    next();
  } catch { return res.status(401).json({ error: "Session expirée" }); }
}
function requirePremium(req, res, next) {
  if (req.user.plan !== "pro") return res.status(402).json({ error: "Fonction réservée à Premium" });
  next();
}

// ---- Comptes ----
app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Champs manquants" });
  const db = loadDB();
  const key = email.toLowerCase();
  if (db.users[key]) return res.status(409).json({ error: "Ce compte existe déjà" });
  db.users[key] = { name, passHash: await bcrypt.hash(password, 10), plan: "free" };
  saveDB(db);
  const user = { email: key, name, plan: "free" };
  res.json({ token: sign(user), user });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  const db = loadDB();
  const key = (email || "").toLowerCase();
  const u = db.users[key];
  if (!u || !(await bcrypt.compare(password || "", u.passHash)))
    return res.status(401).json({ error: "Identifiants incorrects" });
  const user = { email: key, name: u.name, plan: u.plan };
  res.json({ token: sign(user), user });
});

app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

// ---- Abonnement Stripe ----
app.post("/api/billing/checkout", auth, async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRICE_ID)
    return res.status(500).json({ error: "Stripe non configuré (voir .env)" });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: req.user.email,
    customer_email: req.user.email,
    success_url: `${CLIENT_URL}/?upgrade=success`,
    cancel_url: `${CLIENT_URL}/?upgrade=cancel`,
  });
  res.json({ url: session.url });
});

// ---- Fonctions IA premium ----
// Prompts système par fonction (le back-end appelle un modèle d'IA).
const AI_PROMPTS = {
  lens: "Tu es un assistant qui lit des documents. Résume le texte fourni et réponds à la question de l'utilisateur en citant les passages pertinents. Sois clair et concis, en français.",
  dialogue: "Mets en scène un court débat entre deux experts — un sceptique et un défenseur — à propos du document fourni, pour révéler ses failles et ses points forts. En français.",
  compareai: "Compare les deux versions de texte fournies et explique ce qui change dans le SENS (pas seulement les mots). Liste les changements importants en français.",
  factcheck: "Identifie dans le texte les affirmations non sourcées, douteuses ou à vérifier, et explique pourquoi. En français.",
  negociateur: "Analyse ce contrat clause par clause : note le risque (faible/moyen/élevé), explique en langage clair, et propose une contre-formulation plus sûre. En français.",
  conformite: "Vérifie ce document au regard du RGPD et des bonnes pratiques, et liste les points non conformes avec une recommandation. En français.",
  extract: "Extrais les données structurées du texte (tableaux, montants, dates, entités) et renvoie un JSON propre.",
  study: "À partir de ce document, génère un quiz de 5 questions et 8 fiches de révision (question/réponse). En français.",
  access: "Rédige des descriptions alternatives claires pour les éléments visuels décrits et propose un résumé simplifié adapté à la dyslexie. En français.",
  podcast: "Écris un script de podcast à deux voix (Hôte A et Hôte B) qui explique ce document de façon vivante. En français.",
  generate: "Rédige le document demandé par l'utilisateur, prêt à l'emploi, en français.",
  translate: "Traduis fidèlement le texte fourni dans la langue demandée en conservant le sens et le ton.",
};

async function callAnthropic(system, userContent) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquante");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!r.ok) throw new Error("Erreur IA : " + (await r.text()));
  const data = await r.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

app.post("/api/ai/:feature", auth, requirePremium, async (req, res) => {
  const feature = req.params.feature;
  const system = AI_PROMPTS[feature];
  if (!system) {
    // Word / signature certifiée : nécessitent d'autres services (LibreOffice, prestataire eIDAS).
    return res.status(501).json({ error: `« ${feature} » nécessite un service dédié (voir README).` });
  }
  try {
    const { text = "", question = "", target = "" } = req.body || {};
    let userContent = text;
    if (question) userContent += `\n\nQuestion : ${question}`;
    if (target) userContent += `\n\nLangue cible : ${target}`;
    const answer = await callAnthropic(system, userContent.slice(0, 60000));
    res.json({ answer });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Sert le front-end (dossier ../public) en développement ----
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`Readix serveur démarré sur ${CLIENT_URL}`);
  if (!ANTHROPIC_API_KEY) console.log("⚠️  ANTHROPIC_API_KEY absente : les fonctions IA renverront une erreur.");
  if (!stripe) console.log("⚠️  Stripe non configuré : le paiement est désactivé.");
});
