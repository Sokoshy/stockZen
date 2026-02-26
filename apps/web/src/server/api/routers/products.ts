import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  listProductsOutputSchema,
  productInputBaseSchema,
  productInputSchema,
  productUpdateDataSchema,
  productOutputSchema,
  productWithAlertOutputSchema,
  type ProductWithAlertOutput,
} from "~/schemas/products";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  sanitizeProductInputForRole,
  serializeProductForRole,
  serializeProductsForRole,
} from "~/server/auth/product-serializer";
import { canWritePurchasePrice } from "~/server/auth/rbac-policy";
import { products, alerts, tenants } from "~/server/db/schema";
import { logger } from "~/server/logger";
import {
  updateAlertLifecycle,
  flushPendingCriticalAlertNotifications,
  classifyAlertLevel,
  resolveEffectiveThresholds,
  type CriticalAlertNotificationTask,
} from "~/server/services/alert-service";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "~/server/db/schema";

type AlertDbClient = PostgresJsDatabase<typeof schema>;

type ProductInput = z.infer<typeof productInputBaseSchema>;
type ProductUpdateData = z.infer<typeof productUpdateDataSchema>;

const operatorProductColumns = {
  id: products.id,
  tenantId: products.tenantId,
  name: products.name,
  description: products.description,
  sku: products.sku,
  category: products.category,
  unit: products.unit,
  barcode: products.barcode,
  price: products.price,
  quantity: products.quantity,
  lowStockThreshold: products.lowStockThreshold,
  customCriticalThreshold: products.customCriticalThreshold,
  customAttentionThreshold: products.customAttentionThreshold,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  deletedAt: products.deletedAt,
};

interface ProductRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  unit: string | null;
  barcode: string | null;
  price: string | number;
  quantity: number;
  lowStockThreshold: number | null;
  customCriticalThreshold: number | null;
  customAttentionThreshold: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  purchasePrice?: string | number | null;
}

async function attachAlertMetadata(
  db: AlertDbClient,
  tenantId: string,
  productList: ProductRow[],
  tenantThresholds: { defaultCriticalThreshold: number; defaultAttentionThreshold: number }
): Promise<ProductWithAlertOutput[]> {
  const productIds = productList.map((p) => p.id);

  const activeAlerts = productIds.length > 0
    ? await db.query.alerts.findMany({
        where: (a, { and: andExpr, eq: eqExpr }) =>
          andExpr(
            eqExpr(a.tenantId, tenantId),
            eqExpr(a.status, "active"),
            inArray(a.productId, productIds)
          ),
      })
    : [];

  const alertMap = new Map(activeAlerts.map((a) => [a.productId, a]));

  return productList.map((product) => {
    const activeAlert = alertMap.get(product.id);
    const thresholds = resolveEffectiveThresholds(
      {
        quantity: product.quantity,
        customCriticalThreshold: product.customCriticalThreshold,
        customAttentionThreshold: product.customAttentionThreshold,
      },
      tenantThresholds
    );
    const alertLevel = classifyAlertLevel(
      product.quantity,
      thresholds.criticalThreshold,
      thresholds.attentionThreshold
    );

    const baseProduct = {
      id: product.id,
      tenantId: product.tenantId,
      name: product.name,
      description: product.description,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      barcode: product.barcode,
      price: typeof product.price === "string" ? Number(product.price) : product.price,
      quantity: product.quantity,
      lowStockThreshold: product.lowStockThreshold,
      thresholdMode: thresholds.mode as "defaults" | "custom",
      customCriticalThreshold: product.customCriticalThreshold,
      customAttentionThreshold: product.customAttentionThreshold,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      deletedAt: product.deletedAt?.toISOString() ?? null,
      alertLevel,
      hasActiveAlert: activeAlert !== undefined,
      activeAlertUpdatedAt: activeAlert?.updatedAt.toISOString() ?? null,
    };

    if ("purchasePrice" in product && product.purchasePrice !== undefined) {
      return {
        ...baseProduct,
        purchasePrice:
          product.purchasePrice === null
            ? null
            : typeof product.purchasePrice === "string"
              ? Number(product.purchasePrice)
              : product.purchasePrice,
      };
    }

    return baseProduct;
  });
}

export const productsRouter = createTRPCRouter({
  list: protectedProcedure.output(listProductsOutputSchema).query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const tenantId = ctx.tenantId!;
    const membership = await ctx.db.query.tenantMemberships.findFirst({
      columns: { role: true },
      where: (tm, { and: andExpr, eq: eqExpr }) =>
        andExpr(eqExpr(tm.userId, userId), eqExpr(tm.tenantId, tenantId)),
    });

    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not a member of this tenant",
      });
    }

    const role = membership.role;

    const productList =
      role === "Operator"
        ? await ctx.db
            .select(operatorProductColumns)
            .from(products)
            .where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt)))
            .orderBy(desc(products.createdAt))
        : await ctx.db.query.products.findMany({
            where: (p, { and: andExpr, eq: eqExpr, isNull: isNullExpr }) =>
              andExpr(eqExpr(p.tenantId, tenantId), isNullExpr(p.deletedAt)),
            orderBy: desc(products.createdAt),
          });

    const tenant = await ctx.db.query.tenants.findFirst({
      where: (t, { eq: eqExpr }) => eqExpr(t.id, tenantId),
      columns: {
        defaultCriticalThreshold: true,
        defaultAttentionThreshold: true,
      },
    });

    const tenantThresholds = {
      defaultCriticalThreshold: tenant?.defaultCriticalThreshold ?? 50,
      defaultAttentionThreshold: tenant?.defaultAttentionThreshold ?? 100,
    };

    const productsWithAlerts = await attachAlertMetadata(
      ctx.db,
      tenantId,
      productList as ProductRow[],
      tenantThresholds
    );

    logger.debug({ userId, tenantId, role, productCount: productList.length }, "Products listed");

    return {
      products: productsWithAlerts,
      actorRole: role,
    };
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(productOutputSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId!;
      const membership = await ctx.db.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: (tm, { and: andExpr, eq: eqExpr }) =>
          andExpr(eqExpr(tm.userId, userId), eqExpr(tm.tenantId, tenantId)),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not a member of this tenant",
        });
      }

      const role = membership.role;

      const product =
        role === "Operator"
          ? (
              await ctx.db
                .select(operatorProductColumns)
                .from(products)
                .where(
                  and(
                    eq(products.id, input.id),
                    eq(products.tenantId, tenantId),
                    isNull(products.deletedAt)
                  )
                )
                .limit(1)
            )[0]
          : await ctx.db.query.products.findFirst({
              where: (p, { and: andExpr, eq: eqExpr, isNull: isNullExpr }) =>
                andExpr(
                  eqExpr(p.id, input.id),
                  eqExpr(p.tenantId, tenantId),
                  isNullExpr(p.deletedAt)
                ),
            });

      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }

      logger.debug({ userId, tenantId, role, productId: input.id }, "Product retrieved");

      return serializeProductForRole(product, role);
    }),

  create: protectedProcedure
    .input(productInputSchema)
    .output(productOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId!;
      const membership = await ctx.db.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: (tm, { and: andExpr, eq: eqExpr }) =>
          andExpr(eqExpr(tm.userId, userId), eqExpr(tm.tenantId, tenantId)),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not a member of this tenant",
        });
      }

      const role = membership.role;

      if (!canWritePurchasePrice(role) && Object.prototype.hasOwnProperty.call(input, "purchasePrice")) {
        logger.warn(
          {
            event: "audit.products.purchase_price.write_blocked",
            userId,
            tenantId,
            role,
            operation: "create",
          },
          "Blocked purchasePrice write attempt"
        );
      }

      const sanitizedInput = sanitizeProductInputForRole(input, role);
      const fullInput = sanitizedInput as ProductInput;

      const thresholdMode = fullInput.thresholdMode ?? "defaults";
      const customCriticalThreshold = thresholdMode === "custom" ? fullInput.customCriticalThreshold ?? null : null;
      const customAttentionThreshold = thresholdMode === "custom" ? fullInput.customAttentionThreshold ?? null : null;

      const pendingCriticalNotifications: CriticalAlertNotificationTask[] = [];

      const product = await ctx.db.transaction(async (tx) => {
        const [createdProduct] = await tx
          .insert(products)
          .values({
            name: fullInput.name,
            price: fullInput.price.toString(),
            tenantId,
            description: fullInput.description ?? null,
            sku: fullInput.sku ?? null,
            category: fullInput.category ?? null,
            unit: fullInput.unit ?? null,
            barcode: fullInput.barcode ?? null,
            quantity: fullInput.quantity ?? 0,
            lowStockThreshold: fullInput.lowStockThreshold ?? null,
            purchasePrice: fullInput.purchasePrice?.toString() ?? null,
            customCriticalThreshold,
            customAttentionThreshold,
          })
          .returning();

        if (!createdProduct) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create product",
          });
        }

        await updateAlertLifecycle({
          db: tx,
          tenantId,
          productId: createdProduct.id,
          currentStock: createdProduct.quantity,
          pendingCriticalNotifications,
        });

        return createdProduct;
      });

      if (!product) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create product",
        });
      }

      if (pendingCriticalNotifications.length > 0) {
        await flushPendingCriticalAlertNotifications(ctx.db, pendingCriticalNotifications);
      }

      logger.info({ userId, tenantId, role, productId: product.id }, "Product created");

      return serializeProductForRole(product, role);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: productUpdateDataSchema,
      })
    )
    .output(productOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId!;
      const membership = await ctx.db.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: (tm, { and: andExpr, eq: eqExpr }) =>
          andExpr(eqExpr(tm.userId, userId), eqExpr(tm.tenantId, tenantId)),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not a member of this tenant",
        });
      }

      const role = membership.role;

      if (!canWritePurchasePrice(role) && Object.prototype.hasOwnProperty.call(input.data, "purchasePrice")) {
        logger.warn(
          {
            event: "audit.products.purchase_price.write_blocked",
            userId,
            tenantId,
            role,
            operation: "update",
            productId: input.id,
          },
          "Blocked purchasePrice write attempt"
        );
      }

      const existingProduct = await ctx.db.query.products.findFirst({
        where: (p, { and: andExpr, eq: eqExpr }) =>
          andExpr(eqExpr(p.id, input.id), eqExpr(p.tenantId, tenantId)),
      });

      if (!existingProduct) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }

      const sanitizedData = sanitizeProductInputForRole(input.data, role);
      const fullData = sanitizedData as ProductUpdateData;

      const updateData: Partial<typeof products.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (fullData.name !== undefined) updateData.name = fullData.name;
      if (fullData.description !== undefined) updateData.description = fullData.description;
      if (fullData.sku !== undefined) updateData.sku = fullData.sku;
      if (fullData.category !== undefined) updateData.category = fullData.category;
      if (fullData.unit !== undefined) updateData.unit = fullData.unit;
      if (fullData.barcode !== undefined) updateData.barcode = fullData.barcode;
      if (fullData.price !== undefined) updateData.price = fullData.price.toString();
      if (fullData.quantity !== undefined) updateData.quantity = fullData.quantity;
      if (fullData.lowStockThreshold !== undefined) {
        updateData.lowStockThreshold = fullData.lowStockThreshold;
      }
      if (fullData.purchasePrice !== undefined) {
        updateData.purchasePrice =
          fullData.purchasePrice === null ? null : fullData.purchasePrice.toString();
      }

      if (fullData.thresholdMode !== undefined) {
        if (fullData.thresholdMode === "defaults") {
          updateData.customCriticalThreshold = null;
          updateData.customAttentionThreshold = null;
        } else if (fullData.thresholdMode === "custom") {
          updateData.customCriticalThreshold = fullData.customCriticalThreshold ?? null;
          updateData.customAttentionThreshold = fullData.customAttentionThreshold ?? null;
        }
      }

      const [updatedProduct] = await ctx.db
        .update(products)
        .set(updateData)
        .where(and(eq(products.id, input.id), eq(products.tenantId, tenantId)))
        .returning();

      if (!updatedProduct) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update product",
        });
      }

      if (fullData.thresholdMode !== undefined) {
        await updateAlertLifecycle({
          db: ctx.db,
          tenantId,
          productId: input.id,
          currentStock: updatedProduct.quantity,
        });
      }

      logger.info({ userId, tenantId, role, productId: input.id }, "Product updated");

      return serializeProductForRole(updatedProduct, role);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tenantId = ctx.tenantId!;
      const membership = await ctx.db.query.tenantMemberships.findFirst({
        columns: { role: true },
        where: (tm, { and: andExpr, eq: eqExpr }) =>
          andExpr(eqExpr(tm.userId, userId), eqExpr(tm.tenantId, tenantId)),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not a member of this tenant",
        });
      }

      const role = membership.role;

      const existingProduct = await ctx.db.query.products.findFirst({
        where: (p, { and: andExpr, eq: eqExpr, isNull: isNullExpr }) =>
          andExpr(
            eqExpr(p.id, input.id),
            eqExpr(p.tenantId, tenantId),
            isNullExpr(p.deletedAt)
          ),
      });

      if (!existingProduct) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Product not found",
        });
      }

      await ctx.db
        .update(products)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, input.id), eq(products.tenantId, tenantId)));

      logger.info({ userId, tenantId, role, productId: input.id }, "Product deleted");

      return { success: true, id: input.id };
    }),
});
