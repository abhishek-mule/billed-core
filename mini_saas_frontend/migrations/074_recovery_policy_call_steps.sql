-- 074_recovery_policy_call_steps.sql
-- Adds a Phone Call step to the seeded system policies so the workflow engine
-- can escalate from WhatsApp reminders to a call (per Sprint 2 design).
-- Idempotent: only inserts if the step does not already exist.

BEGIN;

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel)
SELECT 'step_std_call', 'sys_standard', 5, 'DUE_DATE', 10, 'call', NULL, 'phone'
WHERE NOT EXISTS (SELECT 1 FROM recovery_policy_steps WHERE id = 'step_std_call');

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel)
SELECT 'step_agg_call', 'sys_aggressive', 6, 'DUE_DATE', 4, 'call', NULL, 'phone'
WHERE NOT EXISTS (SELECT 1 FROM recovery_policy_steps WHERE id = 'step_agg_call');

INSERT INTO recovery_policy_steps (id, policy_id, sequence, trigger_type, offset_days, action_type, template_name, channel)
SELECT 'step_vip_call', 'sys_vip', 4, 'DUE_DATE', 8, 'call', NULL, 'phone'
WHERE NOT EXISTS (SELECT 1 FROM recovery_policy_steps WHERE id = 'step_vip_call');

COMMIT;
