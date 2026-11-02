-- Trigram search on title and description (pg_trgm).
-- Not in schema.prisma, so delete any future DROP INDEX lines for these.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Video_title_trgm_idx"
    ON "Video" USING GIN (title gin_trgm_ops);

CREATE INDEX "Video_description_trgm_idx"
    ON "Video" USING GIN (description gin_trgm_ops);
