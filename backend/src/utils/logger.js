import winston from "winston";
import "winston-daily-rotate-file";
import { config } from "../config/env.js";

// Configurable rather than hardcoded to "logs" relative to the working
// directory. On this machine the repository lives inside a OneDrive-synced
// folder, and a rotating file written on every request means the sync client
// wakes up mid-benchmark and injects latency that has nothing to do with the
// code under test.
const logDir = config.LOG_DIR;

const dailyRotate = (filename) =>
  new winston.transports.DailyRotateFile({
    dirname: logDir,
    filename: filename + "-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxFiles: "14d"
  });

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    dailyRotate("app"),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

export const errorLogger = winston.createLogger({
  level: "error",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    dailyRotate("error"),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

export const requestLogger = winston.createLogger({
  level: "http",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [dailyRotate("request")]
});
