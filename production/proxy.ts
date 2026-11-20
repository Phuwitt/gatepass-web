import { NextRequest, NextResponse } from "next/server";

const mobileRoutes: Record<string, "GET" | "POST"> = {
  "/api/mobile/login": "POST",
  "/api/mobile/refresh": "POST",
  "/api/mobile/logout": "POST",
  "/api/employee/workspace": "GET",
  "/api/employee/qr": "POST",
  "/api/employee/leave": "POST",
  "/api/employee/adjustment": "POST",
  "/api/employee/revoke-credential": "POST",
};

export function proxy(request: NextRequest) {
  if (process.env.MOBILE_API_ONLY !== "1") return NextResponse.next();

  const path = request.nextUrl.pathname;
  if (!Object.hasOwn(mobileRoutes, path) || mobileRoutes[path] !== request.method) {
    return NextResponse.json({ error: "ไม่พบเส้นทาง" }, { status: 404 });
  }
  if (path.startsWith("/api/employee/") && !request.headers.has("authorization")) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }
  return NextResponse.next();
}
