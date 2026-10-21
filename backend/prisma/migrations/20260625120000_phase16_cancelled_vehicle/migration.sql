-- Phase 13 (platform phase 16) — AI Surveillance: Cancelled Vehicle Alert
-- Purely additive: one new value on the existing SurveillanceAlertType enum.
-- The reusable SurveillanceAlert model, aiConfig, and the existing Dispatch
-- (WMS) data already support this use case — only the alert-type label is new.

ALTER TYPE "SurveillanceAlertType" ADD VALUE IF NOT EXISTS 'CANCELLED_VEHICLE';
