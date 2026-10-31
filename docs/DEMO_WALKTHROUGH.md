# Jury walkthrough (synthetic data only)

1. Open the PWA on Chrome (desktop or Android). Banner must remain visible: not for clinical use.
2. `hw@demo.local` / `Demo@123` → Register or open the seeded G. Madugula patient.
3. Grant examination + imaging consent in Telugu.
4. Save screening, capture a photo, show quality result, tap **Analyse photo with AI** (Ollama Cloud) and show the health-worker next steps and the English/Telugu patient message.
5. Switch to `mo@demo.local`. The review page shows the AI's clinician summary; sign the review independently of AI. Create referral (print EN/TE slip).
6. `spec@demo.local` creates a Google Meet link (Create a Meet link), then either schedules the consult for an exact date/day or taps **Start now**. The health worker is notified and joins from the notification.
7. Order biopsy and mark clinician-reviewed.
8. `nav@demo.local` logs contact and closes the task.
9. `admin@demo.local` shows dashboard counts only.

Offline: airplane mode on the health-worker device, save a patient, reconnect, Offline sync → Sync now.
