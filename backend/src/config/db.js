import pkg from 'pg';
const { Pool } = pkg;

export const db = new Pool({
  connectionString: process.env.POSTGRES_URL
});
