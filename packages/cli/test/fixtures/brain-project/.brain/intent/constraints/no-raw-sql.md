---
id: constraint-no-raw-sql
type: constraint
scope: global
status: active
author: mohamed
createdAt: "2026-03-16"
---

All database operations go through Drizzle ORM. No raw SQL in application code.
If a query is too complex for Drizzle, it belongs in a Postgres function called via Drizzle.
