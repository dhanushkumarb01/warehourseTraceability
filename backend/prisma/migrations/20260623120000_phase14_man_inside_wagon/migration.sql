-- Phase 11 (platform phase 14) — AI Surveillance: Man Inside Wagon alert
-- Purely additive: one new value on the existing SurveillanceAlertType enum.
-- The reusable SurveillanceAlert model and per-camera aiConfig already support
-- this use case — only the alert-type label is new.

ALTER TYPE "SurveillanceAlertType" ADD VALUE IF NOT EXISTS 'MAN_INSIDE_WAGON';
