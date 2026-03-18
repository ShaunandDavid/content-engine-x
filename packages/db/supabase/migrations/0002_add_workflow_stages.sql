-- Add new workflow stages to the workflow_stage enum
ALTER TYPE workflow_stage ADD VALUE IF NOT EXISTS 'trend_research';
ALTER TYPE workflow_stage ADD VALUE IF NOT EXISTS 'script_validation';
