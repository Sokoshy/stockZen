import { type NextRequest, NextResponse } from "next/server";

import { getSession } from "~/server/better-auth/server";
import { createTRPCContext } from "~/server/api/trpc";
import { importCSVHandler } from "~/server/services/product-import-service";
import { logger } from "~/server/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a CSV file" },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    const ctx = await createTRPCContext({ req: request } as never);

    if (!ctx.tenantId) {
      return NextResponse.json(
        { error: "No tenant context" },
        { status: 403 }
      );
    }

    const tenantId = ctx.tenantId;

    const membership = await ctx.db.query.tenantMemberships.findFirst({
      where: (tm, { and, eq }) => and(eq(tm.userId, session.user.id), eq(tm.tenantId, tenantId)),
    });

    if (!membership) {
      return NextResponse.json(
        { error: "No tenant membership found" },
        { status: 403 }
      );
    }

    if (membership.role !== "Admin" && membership.role !== "Manager") {
      return NextResponse.json(
        { error: "Forbidden: Only Admin and Manager roles can import products" },
        { status: 403 }
      );
    }

    const result = await importCSVHandler({
      file,
      ctx,
      tenantId,
      userId: session.user.id,
      role: membership.role,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, "CSV import error");
    const errorMessage = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
