
import "dotenv/config";
import { sendVerificationEmail } from "./services/emailService.js";

const testEmail = async () => {
  try {
    const recipient = process.env.TEST_EMAIL;

    if (!recipient) {
      throw new Error("TEST_EMAIL is missing from .env");
    }

    const result = await sendVerificationEmail(
      recipient,
      "Test User",
      "123456"
    );

    console.log("Gmail SMTP accepted the test email.");
    console.log("Message ID:", result.messageId);
  } catch (error) {
    console.error("EMAIL TEST FAILED");
    console.error("Error:", error.message);
    console.error("Code:", error.code);
    console.error("Response:", error.response);
    process.exitCode = 1;
  }
};

testEmail();
