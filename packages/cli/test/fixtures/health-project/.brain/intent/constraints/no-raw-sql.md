---
id: constraint-no-raw-sql
type: constraint
scope: global
status: active
author: mohamed
createdAt: "2026-03-16"
pattern: "(call_expression function: (member_expression object: (identifier) @obj property: (property_identifier) @prop) (#eq? @obj \"db\") (#eq? @prop \"execute\"))"
---

All database operations go through Drizzle ORM. No raw SQL via db.execute() in application code.
