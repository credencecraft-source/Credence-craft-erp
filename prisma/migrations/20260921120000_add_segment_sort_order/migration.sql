ALTER TABLE "segments"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

WITH ranked_segments AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "is_active" DESC, "name" ASC) AS rank
  FROM "segments"
)
UPDATE "segments" AS segment
SET "sort_order" = ranked_segments.rank
FROM ranked_segments
WHERE segment."id" = ranked_segments."id";

CREATE INDEX "segments_sort_order_idx"
ON "segments"("sort_order");