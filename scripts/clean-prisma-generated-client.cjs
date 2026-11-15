const fs = require("fs");
const path = require("path");

function cleanupStalePrismaTempFiles(rootDir = process.cwd()) {
  const clientDir = path.join(rootDir, "node_modules", ".prisma", "client");

  if (!fs.existsSync(clientDir)) {
    return { removed: 0, clientDir };
  }

  const files = fs.readdirSync(clientDir);
  const staleFiles = files.filter((fileName) => {
    return (
      fileName.startsWith("query_engine-windows.dll.node.tmp") ||
      fileName === "query_engine-windows.dll.node.tmp" ||
      /\.tmp\d*$/.test(fileName)
    );
  });

  for (const fileName of staleFiles) {
    fs.rmSync(path.join(clientDir, fileName), { force: true, recursive: true });
  }

  return { removed: staleFiles.length, clientDir };
}

if (require.main === module) {
  const result = cleanupStalePrismaTempFiles();
  console.log(`Removed ${result.removed} stale Prisma temp files from ${result.clientDir}.`);
}

module.exports = { cleanupStalePrismaTempFiles };
