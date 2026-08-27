---
name: krs-jadwal-matcher
description: Match a student's KRS (Kartu Rencana Studi) course list against a university's master jadwal kuliah to produce the student's complete personal weekly schedule, including sessions the KRS table doesn't show explicitly (e.g. Praktikum sessions bundled into a course's total SKS). Use this whenever the user shares a KRS screenshot/table alongside (or referencing) a master jadwal document, asks to "sesuaikan jadwal KRS", "cocokkan KRS ke jadwal", build a personal class schedule from KRS + jadwal fakultas/prodi, or check their KRS for schedule conflicts (bentrok jadwal).
---

# KRS-Jadwal Matcher

Matches a student's course list (KRS) against a master schedule (jadwal kuliah per hari, per kelas paralel) to build the student's actual full weekly timetable — and catches SKS the KRS table hides.

## Why this is needed

KRS tables from campus systems (e.g. UIR SIAKAD-style exports) list one row per matkul with a single jam/hari/ruangan — even when the course's total SKS is split across a **Teori** session and a separate **Praktikum** session in different rooms/times. The KRS row shows only one of them (usually Teori) but the SKS column reflects the combined total. Naively reading the KRS table alone silently drops real class sessions from the student's schedule.

## Inputs required

1. **KRS list**: kode MK, matkul name, SKS, kelas (paralel letter, e.g. A/B/C/E), dosen. Can come as a table, image, or text.
2. **Master jadwal**: full schedule document/text listing every session for every hari, with format roughly: `Hari HH:MM - HH:MM Teori/Praktikum - N SKS KODE_MK - MATKUL KELAS RUANGAN DOSEN`.

If either is missing, ask for it — don't guess a schedule.

## Matching procedure

For each course in the KRS:

1. **Match key**: kode MK + kelas (paralel letter) — this is the reliable join key. Dosen name can help disambiguate if kode MK alone is ambiguous, but kelas letter is primary since sections can share a dosen.
2. **Find every matching row** in the master jadwal for that kode MK + kelas — not just the first hit. A course can legitimately have 2+ rows (Teori row + Praktikum row) across different hari.
3. **Check SKS math**: sum the SKS of matched rows. It should equal the SKS listed in the KRS for that course.
   - If it matches → done for this course.
   - If matched rows sum to *less* than KRS SKS → a session (usually Praktikum) is missing from what you found. Search again for that kode MK + kelas specifically filtering for the session type (Teori vs Praktikum) not yet found. Report it if truly absent from the master jadwal — don't fabricate a session.
   - If a course's SKS in the KRS already matches a single Teori-only row's SKS (no split), one row is correct and expected — not every course has a practicum.
4. Do this for every course before assembling the output — don't stop at the first course.

## Conflict check

Once all sessions are collected, sort by hari then jam and check for overlapping time windows on the same hari. Flag any overlap explicitly (don't just silently note "no conflicts" without having checked — show the reasoning, e.g. gap between consecutive sessions, especially tight back-to-back gaps like 5-10 minutes).

## Output format

Group by hari (Senin → Jumat, or whatever days have sessions). Within each hari, sort by jam ascending. For each session show: jam range, matkul, jenis (Teori/Praktikum), SKS, ruangan, dosen.

End with:
- Total SKS sum, cross-checked against the KRS total.
- Any courses where a session type was missing from the master jadwal (call these out — don't hide the gap).
- Any time conflicts found, or an explicit confirmation that gaps were checked and none overlap.

Keep the response as a clean table/list per hari — this is a reference schedule the student will actually use, not a narrative.