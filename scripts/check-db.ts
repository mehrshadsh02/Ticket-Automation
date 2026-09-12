import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("./storage/test-database.sqlite3");

console.log("\nTABLES:");
console.table(
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all(),
);

console.log("\nCENTERS:");
console.table(
  db
    .prepare("SELECT id, name, admin_name, enabled FROM centers ORDER BY id")
    .all(),
);

console.log("\nTICKETS:");
console.table(
  db
    .prepare("SELECT * FROM tickets ORDER BY id")
    .all(),
);

console.log("\nTICKET DETAILS:");
console.table(
  db
    .prepare("SELECT * FROM ticket_details ORDER BY id")
    .all(),
);

db.close();