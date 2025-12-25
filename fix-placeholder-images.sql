-- Update all products with placeholder images to NULL
-- This will allow the frontend to show the SVG placeholder instead

UPDATE "Product" 
SET image = NULL 
WHERE image LIKE '%via.placeholder.com%' 
   OR image LIKE '%placeholder%';

-- Verify the update
SELECT id, title, image FROM "Product" WHERE image IS NULL;
