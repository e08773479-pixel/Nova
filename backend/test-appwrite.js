"use strict";

require("dotenv").config();

const database = require("./database");

(async () => {
  try {
    console.log("🔄 NOVA: Testing Appwrite connection...");

    const result = await database.initialize();

    console.log("✅ Appwrite connected successfully!");
    console.log(result);

    const health = await database.healthCheck();

    console.log("🏥 Database health:");
    console.log(health);

    process.exit(0);

  } catch (error) {

    console.error("❌ Appwrite connection failed!");

    console.error(
      "Code:",
      error.code || "UNKNOWN"
    );

    console.error(
      "Message:",
      error.message
    );

    process.exit(1);
  }
})();
