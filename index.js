const fs = require("fs");
const path = require("path");
const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const PORT = 3000;

// ===== CONFIG =====
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");
const DEFAULT_FROM = '"Starlink Jewels 💍" <marketing.starlinkjewels@gmail.com>';

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
  try {
    const { code } = req.query;
    const { tokens } = await oAuth2Client.getToken(code);

    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    res.send("✅ Gmail connected. You can now send emails.");
  } catch (err) {
    res.status(500).send("OAuth failed");
  }
});

// ===== SEND MAIL API (HTML + FULLY DYNAMIC) =====
app.post("/send-mail", async (req, res) => {
  try {
    const {
      from,
      to,
      cc,
      bcc,
      subject,
      html,
      text
    } = req.body;

    // ===== VALIDATION =====
    if (!to || !subject || !html) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Required fields: to, subject, html"
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const normalizeEmails = (value) => {
      if (!value) return null;
      const list = Array.isArray(value)
        ? value
        : value.split(",").map(e => e.trim());

      for (const email of list) {
        const match = email.match(/<([^>]+)>/) || [null, email];
        if (!emailRegex.test(match[1])) {
          throw new Error(`Invalid email address: ${email}`);
        }
      }
      return list.join(", ");
    };

    const toEmails = normalizeEmails(to);
    const ccEmails = cc ? normalizeEmails(cc) : null;
    const bccEmails = bcc ? normalizeEmails(bcc) : null;

    // ===== BUILD MIME MESSAGE =====
    const boundary = "boundary_" + Date.now();

    let mimeParts = [
      `From: ${from || DEFAULT_FROM}`,
      `To: ${toEmails}`,
      ccEmails ? `Cc: ${ccEmails}` : null,
      bccEmails ? `Bcc: ${bccEmails}` : null,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary=${boundary}`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      text || "This email contains HTML content.",
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      html,
      "",
      `--${boundary}--`
    ].filter(Boolean).join("\n");

    const encodedMessage = Buffer.from(mimeParts)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    res.status(200).json({
      success: true,
      message: "📧 Email sent successfully",
      messageId: result.data.id
    });

  } catch (err) {
    console.error("SEND MAIL ERROR:", err);
    res.status(500).json({
      success: false,
      error: "SEND_FAILED",
      message: err.message
    });
  }
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Gmail API Mailer" });
});

app.listen(PORT, () =>
  console.log(`🚀 Gmail mail server running on http://localhost:${PORT}`)
);
