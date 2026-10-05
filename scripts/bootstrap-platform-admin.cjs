const { randomBytes, randomUUID, scryptSync } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.PLATFORM_ADMIN_NAME?.trim() || "Platform Administrator";

  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set PLATFORM_ADMIN_EMAIL to a valid email address.");
  }
  if (fullName.length > 255) {
    throw new Error("PLATFORM_ADMIN_NAME must be 255 characters or fewer.");
  }
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET must be configured before creating a production platform administrator.");
  }

  await prisma.$transaction(async (transaction) => {
    if (await transaction.platformAdmin.count() !== 0) {
      throw new Error("Platform administrator bootstrap is allowed only when no administrators exist.");
    }

    const salt = randomBytes(16).toString("hex");
    const oneTimeRandomCredential = randomBytes(32).toString("base64url");
    const passwordHash = scryptSync(oneTimeRandomCredential, salt, 64).toString("hex");
    await transaction.platformAdmin.create({
      data: {
        admin_id: randomUUID(),
        full_name: fullName,
        email,
        password_hash: `${salt}:${passwordHash}`,
        role: "SUPER_ADMIN",
      },
    });
  }, { isolationLevel: "Serializable" });
}

main()
  .catch((error) => {
    const message = error instanceof Error && [
      "Set PLATFORM_ADMIN_EMAIL to a valid email address.",
      "PLATFORM_ADMIN_NAME must be 255 characters or fewer.",
      "AUTH_SECRET must be configured before creating a production platform administrator.",
      "Platform administrator bootstrap is allowed only when no administrators exist.",
    ].includes(error.message)
      ? error.message
      : "Platform administrator bootstrap failed. Verify database connectivity and setup prerequisites.";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
