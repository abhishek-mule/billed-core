import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from './db/client';
import * as schema from './schema';

export const db = drizzle(getPool(), { schema });
