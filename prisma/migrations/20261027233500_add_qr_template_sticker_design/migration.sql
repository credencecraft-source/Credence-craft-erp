ALTER TABLE "merchandising_order_qr_templates"
    ADD COLUMN "qr_field_key" VARCHAR(50) NOT NULL DEFAULT 'orderNo',
    ADD COLUMN "display_fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN "display_values" JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN "display_field_styles" JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN "sticker_width_mm" DECIMAL(7, 2) NOT NULL DEFAULT 50,
    ADD COLUMN "sticker_length_mm" DECIMAL(7, 2) NOT NULL DEFAULT 30;

UPDATE "merchandising_order_qr_templates"
SET
    "qr_field_key" = COALESCE(NULLIF("field_keys" ->> 0, ''), 'orderNo'),
    "display_fields" = CASE
        WHEN jsonb_typeof("field_keys") = 'array' THEN "field_keys"
        ELSE '[]'::jsonb
    END;

ALTER TABLE "merchandising_order_qr_print_requests"
    ADD COLUMN "qr_field_key" VARCHAR(50) NOT NULL DEFAULT 'orderNo',
    ADD COLUMN "display_fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN "display_values" JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN "display_field_styles" JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN "sticker_width_mm" DECIMAL(7, 2) NOT NULL DEFAULT 50,
    ADD COLUMN "sticker_length_mm" DECIMAL(7, 2) NOT NULL DEFAULT 30;

UPDATE "merchandising_order_qr_print_requests"
SET
    "qr_field_key" = COALESCE(NULLIF("field_keys" ->> 0, ''), 'orderNo'),
    "display_fields" = CASE
        WHEN jsonb_typeof("field_keys") = 'array' THEN "field_keys"
        ELSE '[]'::jsonb
    END;
