# Mocked AI golden-set report

**45/45 passed (100%).** Fixtures: tests/fixtures/ai-golden.ts.
Command: `npx vitest run tests/unit/ai-parser.test.ts`.

These synthetic Malay/English cases cover local parsing, local financial
questions and hand-authored provider responses for optional category suggestions.
The fixtures exercise provider selection, scoped permission checks, strict
output validation and fallback. Live category accuracy remains unverified.

| Coverage | Cases |
| --- | ---: |
| Single/multiple purchases, income and exact money formats | 12 |
| Relative/explicit dates including month boundary and leap day | 5 |
| Missing/ambiguous money, date, category, type mismatch and category typo | 9 |
| Five enumerated financial query operations | 5 |
| Prompt injection, malformed/oversized/extra-field output, fabricated values, unknown intents/operations and invalid caps | 14 |
| Total | 45 |

Assertions check proposal amounts/dates/category types, required clarification
fields, validated query shapes, and safe fallback. Invalid AI output may still
yield a deterministic clarification/proposal from the original message; it
cannot authorize a financial write. No invalid model payload is stored directly.

Additional unit tests cover timeout/abort cleanup, absent credentials,
permission/quota failure, minimal payload, guarded configuration, provider HTTP
status errors, partial/tool/blocked output, streamed size bounds and redaction.
Database integration tests cover consent authorization, shared rate windows,
scoped exact aggregates, callbacks, unlink races and idempotent multi-row saves.
Browser tests verify the real consent action and persistence on desktop/mobile.
