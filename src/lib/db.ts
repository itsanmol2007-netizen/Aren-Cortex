// ── BARREL FILE ─────────────────────────────────────────────────────────────
// db.ts now just re-exports from the split files in ./db/
// This keeps every existing `import ... from "./lib/db"` working unchanged.

export * from "./db/reference";
export * from "./db/patients";
export * from "./db/intelligence";
export * from "./db/prescriptions";
export * from "./db/carePlans";
export * from "./db/clinic";
export * from "./db/profileCache";
export * from "./db/subscriptions";
