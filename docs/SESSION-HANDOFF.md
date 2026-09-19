# SESSION HANDOFF

**Date:** 2026-09-19
**CRITICAL STATUS: OFFLINE ARCHITECTURE IS BROKEN.**

## 1. The Offline Reality (System Failures)
The current implementation of the offline resilience layer completely fails in practice. The architecture is heavily flawed and heavily dependent on live server calls. 
**Do not trust the recent offline-sync code.** 

When the device loses internet connection, the app completely breaks:
- **Patient Creation Fails:** You cannot create a patient when offline. The recent modules intended to queue this locally do not function.
- **Patient Records Inaccessible:** The Patient Page breaks. The goal to backup 3 months of past patient data locally is either unbuilt or fundamentally not working.
- **Overview Page Breaks:** The Overview page requires constant server calls and completely fails to render offline. This should be running locally.
- **Total System Paralysis:** Turning off Wi-Fi paralyses the app. You cannot move a cursor or view basic data without it crashing or showing blank states.

*For full context and exact feedback, read: `docs/offline-architecture-failure-dump.md`*

## 2. Front Desk Offline Lock (Attempted)
- We attempted to disable the "Add Patient" action in `PatientLauncher.tsx` for the Front Desk when offline, to prevent duplicate creations. 
- However, as noted above, patient creation is fundamentally broken offline anyway.

## 3. Future Work / Handover
- **DO NOT touch the codebase logic currently.**
- The next step is a complete re-evaluation of the local-first architecture. The application should be able to render the Overview Page, Patient Page, and create patients *entirely locally* without relying on constant Supabase calls.
- **Mobile Prescription Preview:** Still pending. (Requires visual redesign with high-contrast cards, vertical stacking, and icons for low-literacy users).
