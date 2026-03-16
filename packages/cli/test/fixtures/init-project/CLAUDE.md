# Architecture

- All data mutations must go through server actions, never client-side fetches
- Use Drizzle ORM for all database interactions with typed schemas
- No raw SQL queries — always use the Drizzle query builder

# Code Style

- Prefer early returns over nested conditions
- Use named exports, no default exports
- 4-space indentation everywhere

# Conventions

- Validate all external input with Zod schemas at the boundary
- Use CVA (class-variance-authority) for component variant styling

# Decisions

- Chose Drizzle over Prisma for better SQL control and lighter runtime
- Using Supabase for auth because of built-in RLS and edge function support
