-- Migration: Add soft-delete support to products table
-- Story: 2.2 - Edit/Delete Products + Product List Filters (Offline-First)

ALTER TABLE products ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NULL;
