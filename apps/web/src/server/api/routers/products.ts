import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  listProductsOutputSchema,
  productInputSchema,
  productOutputSchema,
} from "~/schemas/products";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  sanitizeProductInputForRole,
  serializeProductForRole,
  serializeProductsForRole,
} from "~/server/auth/product-serializer";
import { canWritePurchasePrice } from "~/server/auth/rbac-policy";
import { products } from "~/server/db/schema";
import { logger } from "~/server/logger";

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
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  deletedAt: products.deletedAt,
};

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

    logger.debug({ userId, tenantId, role, productCount: productList.length }, "Products listed");

    return {
      products: serializeProductsForRole(productList, role),
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
      const fullInput = sanitizedInput as typeof input;

      const [product] = await ctx.db
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
        })
        .returning();

      if (!product) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create product",
        });
      }

      logger.info({ userId, tenantId, role, productId: product.id }, "Product created");

      return serializeProductForRole(product, role);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: productInputSchema.partial(),
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
      const fullData = sanitizedData as typeof input.data;

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
