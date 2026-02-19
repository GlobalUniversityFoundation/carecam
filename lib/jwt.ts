import jwt from "jsonwebtoken";

const DEFAULT_JWT_SECRET = "carecam-dev-secret-change-in-production";
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

export type AuthTokenPayload = {
  email: string;
  role?: "user" | "admin";
};

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN_SECONDS,
  });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

export function getAuthTokenMaxAgeSeconds() {
  return JWT_EXPIRES_IN_SECONDS;
}

