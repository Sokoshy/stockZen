import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { syncRequestSchema, syncErrorSchema } from "~/schemas/sync";
import { processSync } from "~/server/services/sync-service";
import { rateLimit, getClientIp } from "~/server/rate-limit";
import { logger } from "~/server/logger";
import { withTenantContext } from "~/server/db/rls";

const SYNC_RATE_LIMIT = {
  limit: 30,
  windowMs: 60000,
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      const errorResponse = syncErrorSchema.parse({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
      return NextResponse.json(errorResponse, { status: 401 });
    }

    const clientIp = getClientIp(request.headers);
    const rateLimitKey = `sync:${session.user.id}:${clientIp}`;
    const rateLimitResult = rateLimit(rateLimitKey, SYNC_RATE_LIMIT);

    if (!rateLimitResult.allowed) {
      const errorResponse = syncErrorSchema.parse({
        code: "RATE_LIMITED",
        message: "Too many sync requests. Please wait before retrying.",
      });
      return NextResponse.json(errorResponse, { status: 429 });
    }

    let userRecord = await db.query.user.findFirst({
      columns: { defaultTenantId: true },
      where: eq(user.id, session.user.id),
    });

    const tenantId = userRecord?.defaultTenantId;

    if (!tenantId) {
      const errorResponse = syncErrorSchema.parse({
        code: "FORBIDDEN",
        message: "Tenant context is required",
      });
      return NextResponse.json(errorResponse, { status: 403 });
    }

    const body = await request.json();
    const parseResult = syncRequestSchema.safeParse(body);

    if (!parseResult.success) {
      const errorResponse = syncErrorSchema.parse({
        code: "VALIDATION_ERROR",
        message: "Invalid request format",
      });
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const { operations } = parseResult.data;

    const idempotencyMismatch = operations.find(
      (op) => op.idempotencyKey !== op.operationId
    );
    if (idempotencyMismatch) {
      const errorResponse = syncErrorSchema.parse({
        code: "VALIDATION_ERROR",
        message: "Each operation must use idempotencyKey equal to operationId",
      });
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const tenantMismatch = operations.find(
      (op) => op.tenantId && op.tenantId !== tenantId
    );
    if (tenantMismatch) {
      const errorResponse = syncErrorSchema.parse({
        code: "TENANT_MISMATCH",
        message: "Operation tenant does not match authenticated tenant",
      });
      return NextResponse.json(errorResponse, { status: 403 });
    }

    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (idempotencyKey && operations.length === 1 && idempotencyKey !== operations[0]?.operationId) {
      const errorResponse = syncErrorSchema.parse({
        code: "VALIDATION_ERROR",
        message: "Idempotency-Key header must match operationId for single-operation sync requests",
      });
      return NextResponse.json(errorResponse, { status: 400 });
    }

    logger.info(
      {
        userId: session.user.id,
        tenantId,
        operationCount: operations.length,
        idempotencyKey,
      },
      "Sync request received"
    );

    const response = await withTenantContext(tenantId, async (tx) => {
      return processSync({
        db: tx,
        tenantId,
        userId: session.user.id,
        operations,
      });
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Sync endpoint error"
    );

    const errorResponse = syncErrorSchema.parse({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
