// Where Mythic keeps its data: MYTHIC_DATA_DIR, else ./data beside the app.
// The database and uploaded pictures live there; back up that one folder.
import path from 'node:path';

export function dataDir() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.MYTHIC_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data'));
}

export const dbPath = () => process.env.MYTHIC_DB_PATH ? path.resolve(/*turbopackIgnore: true*/ process.env.MYTHIC_DB_PATH) : path.join(/*turbopackIgnore: true*/ dataDir(), 'mythic.db');
