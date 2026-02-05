const fs = require("fs");
const path = require("path");
const express = require("express");
const { google } = require("googleapis");
const cors = require('cors');
const app = express();
app.use(express.json());
const PORT = 3000;


app.use(cors({
  origin: '*', // Allow all origins, or specify your frontend URL like 'http://localhost:3000'
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ===== CONFIG =====
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

// ===== LOAD CREDENTIALS =====
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_id, client_secret, redirect_uris } =
  credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// ===== LOAD TOKEN IF EXISTS =====
if (fs.existsSync(TOKEN_PATH)) {
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
}

// ===== AUTH URL (ONE TIME) =====
app.get("/auth", (req, res) => {
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.send(`<a href="${url}">Authorize Gmail</a>`);
});

// ===== OAUTH CALLBACK =====
app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  res.send("✅ Gmail connected. You can now send emails.");
});

// ===== SEND MAIL API =====
app.post("/send-mail", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    
    let message;
    
    if (html) {
      // Send HTML email
      message = [
        `To: ${to}`,
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        `Subject: ${subject}`,
        "",
        html,
      ].join("\n");
    } else {
      // Send plain text email
      message = [
        `To: ${to}`,
        "Content-Type: text/plain; charset=utf-8",
        "MIME-Version: 1.0",
        `Subject: ${subject}`,
        "",
        text,
      ].join("\n");
    }

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    res.json({ success: true, message: "📧 Email sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Gmail mail server running on http://localhost:${PORT}`)
);
