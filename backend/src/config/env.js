import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url) });
// Backward-compatible local path. Both locations are ignored by Git.
dotenv.config({ path: new URL("../.env", import.meta.url) });
