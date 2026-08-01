import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";

dotenv.config();

const SDK_API_KEY = process.env.SDK_API_KEY!;

export function sdkApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const apiKey = req.header("sdk-api-key");

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: "SDK API key is required",
    });
  }

  if (apiKey !== SDK_API_KEY) {
    return res.status(403).json({
      success: false,
      message: "Invalid SDK API key",
    });
  }

  next();
}