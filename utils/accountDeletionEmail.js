
import { sendEmail } from "../services/emailService.js";

const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

const formatDate = value => {
  const date = new Date(value || Date.now());

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid account deletion date.");
  }

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "long",
    timeStyle: "short"
  });
};

export const sendAccountDeletionEmail = async ({
  email,
  name,
  reason,
  deletedAt
}) => {
  const recipientEmail = String(email || "").trim();
  const recipientName =
    String(name || "User").trim() || "User";
  const deletionReason =
    String(reason || "Not specified").trim();

  if (!recipientEmail) {
    throw new Error(
      "Recipient email address is required."
    );
  }

  const date = formatDate(deletedAt);

  const text = [
    `Hello ${recipientName},`,
    "",
    "We are writing to inform you that your ANO G? account has been deleted by an administrator.",
    "",
    `Date: ${date}`,
    "",
    "Reason for account deletion:",
    deletionReason,
    "",
    "You will no longer be able to access your account.",
    "",
    "If you believe this action was made in error, please contact ANO G? support.",
    "",
    "ANO G? Administration"
  ].join("\n");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>

      <body style="margin:0;padding:0;background:#F2F5EF;font-family:Arial,Helvetica,sans-serif;">
        <div style="background:#F2F5EF;padding:32px 16px;">

          <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E1E9DF;">

            <div style="background:#173B2F;padding:30px;text-align:center;">

              <h1 style="margin:0;color:#FFFFFF;font-size:30px;font-weight:900;letter-spacing:2px;">
                ANO G<span style="color:#52B788;">?</span>
              </h1>

              <p style="margin:10px 0 0;color:#B9D4C5;font-size:11px;letter-spacing:3px;">
                EVENT MANAGEMENT SYSTEM
              </p>

            </div>

            <div style="padding:32px 28px;color:#173B2F;">

              <div style="width:58px;height:58px;line-height:58px;margin:0 auto 20px;background:#FFF1F0;border-radius:50%;font-size:27px;text-align:center;">
                &#9888;
              </div>

              <h2 style="margin:0 0 22px;font-size:24px;text-align:center;">
                Account Deletion Notice
              </h2>

              <p style="font-size:14px;line-height:24px;">
                Hello <strong>${escapeHtml(recipientName)}</strong>,
              </p>

              <p style="font-size:14px;line-height:24px;">
                We are writing to inform you that your
                <strong>ANO G?</strong> account has been deleted
                by an administrator.
              </p>

              <div style="margin:25px 0;padding:20px;background:#F2F5EF;border-radius:12px;">

                <p style="margin:0 0 10px;color:#64796B;font-size:12px;font-weight:bold;">
                  DELETION DATE
                </p>

                <p style="margin:0;color:#173B2F;font-size:14px;font-weight:bold;">
                  ${escapeHtml(date)}
                </p>

              </div>

              <p style="margin:24px 0 12px;font-size:14px;font-weight:bold;">
                Reason for Account Deletion
              </p>

              <div style="background:#F8FAF7;border-left:4px solid #C45151;padding:18px;border-radius:8px;">

                <p style="margin:0;font-size:14px;line-height:24px;white-space:pre-wrap;overflow-wrap:anywhere;">
                  ${escapeHtml(deletionReason)}
                </p>

              </div>

              <p style="margin:24px 0 0;font-size:14px;line-height:24px;">
                You will no longer be able to access your account.
              </p>

              <p style="margin:18px 0 0;font-size:14px;line-height:24px;">
                If you believe this action was made in error,
                please contact ANO G? support.
              </p>

              <div style="margin-top:30px;padding-top:20px;border-top:1px solid #E4EAE3;">

                <p style="margin:0;font-size:14px;font-weight:bold;">
                  ANO G? Administration
                </p>

                <p style="margin:6px 0 0;color:#7A8D80;font-size:12px;">
                  Event Management System
                </p>

              </div>

            </div>

            <div style="background:#F8FAF7;padding:20px;text-align:center;">

              <p style="margin:0;color:#98A49B;font-size:11px;line-height:18px;">
                This is an automated account notification
                from ANO G? Event Management System.
              </p>

            </div>

          </div>

        </div>
      </body>
    </html>
  `;

  try {
    console.log(
      "[ACCOUNT DELETION EMAIL] Sending notification..."
    );

    const result = await sendEmail({
      to: recipientEmail,
      subject: "ANO G? - Account Deletion Notice",
      text,
      html
    });

    console.log(
      "[ACCOUNT DELETION EMAIL] SMTP accepted message:",
      result.messageId
    );

    return result;
  } catch (error) {
    console.error(
      "[ACCOUNT DELETION EMAIL] Failed:",
      {
        code: error.code || "UNKNOWN",
        responseCode: error.responseCode || null,
        message: error.message
      }
    );

    throw error;
  }
};
