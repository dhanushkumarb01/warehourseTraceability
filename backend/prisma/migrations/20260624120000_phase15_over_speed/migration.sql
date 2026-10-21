-- Phase 12 (platform phase 15) — AI Surveillance: Over Speed Detection
-- Purely additive: one new value on the existing SurveillanceAlertType enum.
-- The reusable SurveillanceAlert model and per-camera aiConfig already support
-- this use case — only the alert-type label is new.

ALTER TYPE "SurveillanceAlertType" ADD VALUE IF NOT EXISTS 'OVER_SPEED';
