ALTER TABLE "design_development_page_setup_templates"
ADD COLUMN "sticker_width_mm" DECIMAL(7,2) NOT NULL DEFAULT 50,
ADD COLUMN "sticker_length_mm" DECIMAL(7,2) NOT NULL DEFAULT 30;
