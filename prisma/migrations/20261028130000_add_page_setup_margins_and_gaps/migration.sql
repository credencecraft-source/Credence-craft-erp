ALTER TABLE "design_development_page_setup_templates"
ADD COLUMN "margin_top_mm" DECIMAL(7,2) NOT NULL DEFAULT 5,
ADD COLUMN "margin_bottom_mm" DECIMAL(7,2) NOT NULL DEFAULT 5,
ADD COLUMN "margin_left_mm" DECIMAL(7,2) NOT NULL DEFAULT 5,
ADD COLUMN "margin_right_mm" DECIMAL(7,2) NOT NULL DEFAULT 5,
ADD COLUMN "horizontal_gap_mm" DECIMAL(7,2) NOT NULL DEFAULT 2,
ADD COLUMN "vertical_gap_mm" DECIMAL(7,2) NOT NULL DEFAULT 2;
