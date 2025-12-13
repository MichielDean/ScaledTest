-- +goose Up
-- +goose StatementBegin
-- Migration: Make test_image_id nullable for direct image reference support
-- When using --image flag with direct image reference, there's no test_image record

-- Drop the existing foreign key constraint first
ALTER TABLE public.test_jobs DROP CONSTRAINT IF EXISTS test_jobs_test_image_id_fkey;

-- Make the column nullable
ALTER TABLE public.test_jobs ALTER COLUMN test_image_id DROP NOT NULL;

-- Re-add the foreign key with ON DELETE SET NULL for existing images
ALTER TABLE public.test_jobs 
    ADD CONSTRAINT test_jobs_test_image_id_fkey 
    FOREIGN KEY (test_image_id) REFERENCES public.test_images(id) ON DELETE SET NULL;

-- Add a column for direct image reference
ALTER TABLE public.test_jobs ADD COLUMN IF NOT EXISTS direct_image_ref TEXT;

COMMENT ON COLUMN public.test_jobs.test_image_id IS 'Reference to registered test image (null for direct image reference)';
COMMENT ON COLUMN public.test_jobs.direct_image_ref IS 'Direct image reference when not using registered images (e.g., localhost:5001/my-tests:dev)';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE public.test_jobs DROP COLUMN IF EXISTS direct_image_ref;
ALTER TABLE public.test_jobs DROP CONSTRAINT IF EXISTS test_jobs_test_image_id_fkey;
ALTER TABLE public.test_jobs ALTER COLUMN test_image_id SET NOT NULL;
ALTER TABLE public.test_jobs 
    ADD CONSTRAINT test_jobs_test_image_id_fkey 
    FOREIGN KEY (test_image_id) REFERENCES public.test_images(id) ON DELETE CASCADE;
-- +goose StatementEnd
