# Band conversion tables

Raw score out of 40 → IELTS band, plus the rounding rules for the overall band.

> **Status: UNVERIFIED.** Every table below is assembled from commonly-published
> conversions, not from an official Cambridge source. **They must be checked against
> genuine Cambridge IELTS practice material before launch.** A wrong table means every
> band this product reports is wrong, which is the fastest possible way to lose a
> student's trust.
>
> Rows marked *indicative* are an extrapolation below the range the published tables
> normally cover. Treat them with extra suspicion.

The tables live in the `band_tables` database table, not in code, so a correction is a
data change and not a deploy. `app/services/scoring/band_data.py` holds the seed values
and `seed_band_tables(db)` loads them idempotently (`make seed`, or
`uv run python -m app.cli seed-bands`). If the table is empty, the engine falls back to
the seed data so a fresh environment still scores correctly.

## Listening (both Academic and General Training)

| Raw score | Band | | Raw score | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 18–22 | 5.5 |
| 37–38 | 8.5 | | 16–17 | 5.0 |
| 35–36 | 8.0 | | 13–15 | 4.5 |
| 32–34 | 7.5 | | 11–12 | 4.0 |
| 30–31 | 7.0 | | 8–10 | 3.5 *(indicative)* |
| 26–29 | 6.5 | | 6–7 | 3.0 *(indicative)* |
| 23–25 | 6.0 | | 4–5 | 2.5 *(indicative)* |
| | | | 0–3 | ≤2.0 *(indicative)* |

## Academic Reading

| Raw score | Band | | Raw score | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 19–22 | 5.5 |
| 37–38 | 8.5 | | 15–18 | 5.0 |
| 35–36 | 8.0 | | 13–14 | 4.5 |
| 33–34 | 7.5 | | 10–12 | 4.0 |
| 30–32 | 7.0 | | 8–9 | 3.5 |
| 27–29 | 6.5 | | 6–7 | 3.0 |
| 23–26 | 6.0 | | 0–5 | ≤2.5 *(indicative)* |

## General Training Reading

Notably harsher: the same band needs more correct answers than in Academic.

| Raw score | Band | | Raw score | Band |
|---|---|---|---|---|
| 40 | 9.0 | | 23–26 | 5.0 |
| 39 | 8.5 | | 19–22 | 4.5 |
| 37–38 | 8.0 | | 15–18 | 4.0 |
| 36 | 7.5 | | 12–14 | 3.5 *(indicative)* |
| 34–35 | 7.0 | | 9–11 | 3.0 *(indicative)* |
| 32–33 | 6.5 | | 6–8 | 2.5 *(indicative)* |
| 30–31 | 6.0 | | 0–5 | ≤2.0 *(indicative)* |
| 27–29 | 5.5 | | | |

## Writing and Speaking

No raw-score conversion exists: examiners (here, the AI grader) award band scores
directly against the four public band descriptors. A request for a band table for these
skills returns 404 rather than inventing one.

## Overall band

Average the four skill bands, then round:

| Fractional part of the average | Result |
|---|---|
| `.25` | round **up** to the next half band |
| `.75` | round **up** to the next whole band |
| anything else | round to the nearest half band, ties up |

Worked examples:

| L | R | W | S | Average | Overall |
|---|---|---|---|---|---|
| 6.5 | 6.5 | 5.0 | 7.0 | 6.25 | **6.5** |
| 4.0 | 3.5 | 4.0 | 4.0 | 3.875 | **4.0** |
| 6.5 | 6.5 | 5.5 | 6.0 | 6.125 | **6.0** |
| 7.0 | 7.5 | 6.5 | 7.0 | 7.0 | **7.0** |

## Verification checklist

- [ ] Check the Listening table against at least two official Cambridge IELTS books
- [ ] Check the Academic Reading table the same way
- [ ] Check the General Training Reading table the same way
- [ ] Replace every row marked *indicative* with a sourced value, or remove the row and
      report the band as "below 4.0" rather than guessing a number
- [ ] Record the source (book, edition, page) next to each table here
