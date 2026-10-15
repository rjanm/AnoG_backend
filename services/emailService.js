
import nodemailer from "nodemailer";

const getEmailConfig = () => {
  const emailUser = process.env.EMAIL_USER?.trim();
  const emailPassword = process.env.EMAIL_APP_PASSWORD
    ?.replace(/\s/g, "");

  if (!emailUser || !emailPassword) {
    throw new Error(
      "Missing EMAIL_USER or EMAIL_APP_PASSWORD in backend/.env"
    );
  }

  if (emailPassword.length !== 16) {
    throw new Error(
      "Invalid Gmail App Password length. Expected 16 characters after removing spaces."
    );
  }

  return {
    emailUser,
    emailPassword
  };
};

const getTransporter = () => {
  const { emailUser, emailPassword } = getEmailConfig();

  console.log("[GMAIL CONFIG]", {
    senderConfigured: Boolean(emailUser),
    passwordConfigured: Boolean(emailPassword),
    passwordLength: emailPassword.length,
    port: 587,
    encryption: "STARTTLS"
  });

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: emailUser,
      pass: emailPassword
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

export const sendEmail = async ({
  to,
  subject,
  text,
  html
}) => {
  if (!to || typeof to !== "string") {
    throw new Error("Recipient email address is required.");
  }

  const { emailUser } = getEmailConfig();
  const transporter = getTransporter();

  try {
    const result = await transporter.sendMail({
      from: {
        name: "ANO G? Event Management",
        address: emailUser
      },
      to: to.trim(),
      subject,
      text,
      html
    });

    if (!result.accepted?.length) {
      throw new Error(
        "Gmail SMTP did not accept the email."
      );
    }

    console.log("[GMAIL] Email accepted by SMTP.", {
      messageId: result.messageId,
      acceptedCount: result.accepted.length
    });

    return result;
  } catch (error) {
    console.error("[GMAIL] Email sending failed.", {
      code: error.code || "UNKNOWN",
      responseCode: error.responseCode || null,
      command: error.command || null
    });

    throw error;
  } finally {
    transporter.close();
  }
};

export const sendVerificationEmail = async (
  email,
  fullName,
  code
) => {
  const safeName = escapeHtml(fullName);
  const safeCode = escapeHtml(code);

  return sendEmail({
    to: email,
    subject: "Verify Your ANO G? Account",
    text: `Hello ${fullName},

Welcome to ANO G? Event Management System!

Your email verification code is: ${code}

This code expires in 10 minutes.

If you did not create this account, please ignore this email.

ANO G? Event Management System`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>

        <body style="margin:0;padding:0;background:#F2F5EF;font-family:Arial,Helvetica,sans-serif;">

          <div style="background:#F2F5EF;padding:35px 15px;">

            <div style="max-width:500px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E9E2;">

              <div style="background:#173B2F;padding:30px 20px;text-align:center;">

                <h1 style="color:#FFFFFF;margin:0;font-size:30px;font-weight:900;letter-spacing:2px;">
                  ANO G<span style="color:#52B788;">?</span>
                </h1>

                <p style="color:#B9D4C5;font-size:11px;letter-spacing:3px;margin:10px 0 0;">
                  EVENT MANAGEMENT SYSTEM
                </p>

              </div>

              <div style="padding:35px 28px;text-align:center;">

                <div style="width:58px;height:58px;line-height:58px;margin:0 auto 18px;background:#E8F4EB;border-radius:50%;font-size:28px;">
                  &#9993;
                </div>

                <h2 style="color:#173B2F;font-size:25px;margin:0 0 12px;">
                  Verify Your Email
                </h2>

                <p style="color:#64796B;font-size:14px;line-height:24px;margin:0;">
                  Hello <strong>${safeName}</strong>,
                  <br />
                  Welcome to ANO G?!
                  <br />
                  Enter the verification code below to activate your account.
                </p>

                <div style="background:#EEF6EF;border:1px solid #D6E8D9;border-radius:12px;padding:24px 10px;margin:28px 0;">

                  <p style="color:#64796B;font-size:11px;font-weight:bold;letter-spacing:2px;margin:0 0 14px;">
                    YOUR VERIFICATION CODE
                  </p>

                  <div style="color:#173B2F;font-size:36px;font-weight:900;letter-spacing:9px;">
                    ${safeCode}
                  </div>

                </div>

                <p style="color:#64796B;font-size:13px;line-height:22px;">
                  This code will expire in
                  <strong style="color:#173B2F;">10 minutes</strong>.
                </p>

                <p style="color:#98A49B;font-size:12px;line-height:20px;margin-top:28px;">
                  If you did not create an ANO G? account,
                  you can safely ignore this email.
                </p>

              </div>

              <div style="background:#F8FAF7;border-top:1px solid #E8EEE8;padding:20px;text-align:center;">

                <p style="color:#98A49B;font-size:11px;margin:0;">
                  ANO G? Event Management System
                </p>

                <p style="color:#A7B4AA;font-size:10px;margin:8px 0 0;">
                  Automated account verification email
                </p>

              </div>

            </div>

          </div>

        </body>
      </html>
    `
  });
};

export const sendOrganizerDecisionEmail = async (
  email,
  fullName,
  status
) => {
  if (!["approved", "rejected"].includes(status)) {
    throw new Error(
      "Invalid organizer application status."
    );
  }

  const approved = status === "approved";
  const safeName = escapeHtml(fullName);

  const decisionMessage = approved
    ? "Congratulations! Your organizer application has been approved. You can now access your organizer dashboard and begin managing events."
    : "Your organizer application was not approved at this time. Please contact the administrator if you need more information.";

  return sendEmail({
    to: email,
    subject: approved
      ? "ANO G? Organizer Application Approved"
      : "ANO G? Organizer Application Update",
    text: `Hello ${fullName},

${decisionMessage}

Thank you for being part of ANO G? Event Management System.`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>

        <body style="margin:0;padding:0;background:#F2F5EF;font-family:Arial,Helvetica,sans-serif;">

          <div style="background:#F2F5EF;padding:35px 15px;">

            <div style="max-width:500px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E9E2;">

              <div style="background:#173B2F;padding:30px;text-align:center;">

                <h1 style="color:#FFFFFF;margin:0;font-size:30px;font-weight:900;">
                  ANO G<span style="color:#52B788;">?</span>
                </h1>

                <p style="color:#B9D4C5;font-size:11px;letter-spacing:2px;">
                  EVENT MANAGEMENT SYSTEM
                </p>

              </div>

              <div style="padding:35px 28px;">

                <h2 style="color:#173B2F;font-size:24px;margin:0 0 18px;">
                  Organizer Application Update
                </h2>

                <p style="color:#64796B;font-size:14px;line-height:24px;">
                  Hello <strong>${safeName}</strong>,
                </p>

                <div style="background:#EEF6EF;border-radius:12px;padding:22px;margin:20px 0;">

                  <p style="color:#173B2F;font-size:14px;line-height:24px;margin:0;">
                    ${decisionMessage}
                  </p>

                </div>

                <p style="color:#64796B;font-size:13px;line-height:22px;">
                  Thank you for being part of ANO G? Event Management System.
                </p>

              </div>

              <div style="background:#F8FAF7;padding:20px;text-align:center;">

                <p style="color:#98A49B;font-size:11px;margin:0;">
                  ANO G? Event Management System
                </p>

              </div>

            </div>

          </div>

        </body>
      </html>
    `
  });
};
