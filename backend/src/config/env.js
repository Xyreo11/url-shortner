import dotenv from "dotenv";
dotenv.config();

export const config = {
  APP_NAME: process.env.APP_NAME || "shortify",

  // App
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL || "http://localhost:3000",

  // Postgres
  POSTGRES_URL: process.env.POSTGRES_URL,
  POSTGRES_USER: process.env.POSTGRES_USER,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
  POSTGRES_DB: process.env.POSTGRES_DB,

  // Redis
  REDIS_URL: process.env.REDIS_URL
};
