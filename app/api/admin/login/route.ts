import { NextResponse } from "next/server";
import { getAuthTokenMaxAgeSeconds, signAuthToken } from "@/lib/jwt";

type AdminLoginBody = {
  email?: string;
  password?: string;
};

const ADMIN_EMAIL = "admin@carecam.co";
const ADMIN_PASSWORD = "1234";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AdminLoginBody;
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { message: "Invalid admin credentials." },
        { status: 401 },
      );
    }

    const token = signAuthToken({
      email: ADMIN_EMAIL,
      role: "admin",
    });

    const response = NextResponse.json(
      { message: "Successful admin sign in.", redirectTo: "/admin/dashboard" },
      { status: 200 },
    );

    response.cookies.set({
      name: "carecam_admin_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: getAuthTokenMaxAgeSeconds(),
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong during admin sign in.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

