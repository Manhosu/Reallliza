import { NextResponse } from "next/server";
import { AuthError } from "./auth";

export function jsonResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.status }
    );
  }

  if (error instanceof Error) {
    console.error(`API Error: ${error.message}`);
    return NextResponse.json(
      { message: error.message },
      { status: 500 }
    );
  }

  console.error("Unknown API error:", error);
  return NextResponse.json(
    { message: "Internal server error" },
    { status: 500 }
  );
}

export function paginatedResponse(
  data: unknown[],
  meta: { total: number; page: number; limit: number; total_pages: number }
) {
  return NextResponse.json({ data, meta });
}
