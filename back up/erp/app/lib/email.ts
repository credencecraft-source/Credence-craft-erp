import nodemailer from "nodemailer";

export async function sendOtpEmail(email: string, otp: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return {
      sent: false,
      reason: "SMTP credentials are not configured.",
      otp,
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to: email,
    subject: "Your ERP workspace OTP",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 12px;">Your OTP code</h2>
        <p>Hello,</p>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 20px 0; color: #17372a;">${otp}</div>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  });

  return { sent: true, otp };
}
