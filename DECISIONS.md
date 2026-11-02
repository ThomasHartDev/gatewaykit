# Decisions

## How I prioritized

The non-negotiables came first, so I built those one small-ish PR at a time and tested each one before moving on. Health check first since it has to work no matter what, then config loading since everything else reads it, then route matching, method filtering, and finally proxying to the upstream with timeouts.

That covers all the core requirements. I stopped there and spent the rest of the time testing and writing this up instead of half building a sixth feature.

## Architecture

`/health` sits outside the normal flow. The server handles it before routing even happens, so no config can override it. Every other request goes through the same steps. The router finds the route with the longest matching prefix (on whole path segments, so `/api/users` doesn't match `/api/usersX`). Then the route's guards run, and right now that's just the method check. Then the proxy forwards it with `node:http` and streams the response back.

Anything that can be figured out ahead of time happens once at startup. Durations get turned into milliseconds, defaults get filled in, and each route's guards get built. The request path doesn't do any parsing.

Adding a feature like auth or rate limiting is just another guard. The server and the proxy don't change.

## Trade-offs

- TypeScript on Node 24 since it's what I know best, and Node runs `.ts` directly so there's no build step. A gateway is mostly waiting on sockets which Node handles well. The downside is it's one thread, so anything CPU heavy in the request path would slow everything down.
- `node:http` instead of `fetch` for calling the upstream. `fetch` decompresses responses but keeps the `content-encoding` header, which is wrong for a proxy.
- The config validation is custom since the brief only allows a YAML parser, so no Zod. It lists every problem at once so you can fix a bad config in one go.
- Request bodies get buffered (up to 1 MB) and responses get streamed. Buffering makes the size limit easy and would make retries possible later. Streaming keeps big responses out of memory.
- The timeout covers how long until the upstream starts responding, not the whole transfer.
- Routes are matched with a simple loop. A trie would be faster with hundreds of routes but configs have a handful.

## Partially built

- `upstream.targets` gets validated but a route with multiple targets just uses the first one. No load balancing yet.
- Everything else in the config loads fine and prints a warning that it isn't supported yet, so any valid config still starts.

## What I'd build next

1. Rate limiting. It's the main thing protecting upstreams and it's just another guard. I'd key it on the socket address instead of `X-Forwarded-For` so nobody can get around it with a fake header.
2. API key auth, also a guard.
3. Retries with backoff, but only for methods that are safe to repeat. Retrying a POST after a 502 could create the same order twice.
4. Load balancing and health checks across `targets`, then the circuit breaker.
5. Request and response transforms last, since they change the payload and not whether the gateway works.

## How I used AI

I used Claude Code for basically all of the code. My job was steering it, deciding what to build and in what order, and reviewing everything before it went in.

I started by planning with it before writing any code. Its first plan was way too ambitious (rate limiting, retries, auth and load balancing all in two hours) so I rewrote the scope myself in `docs/PLAN.md`. Non-negotiables first, and just have routes print that they were reached before doing any real proxying. From there it built one small piece at a time. For each PR it wrote the tests, ran the gateway against the example config, and wrote up what it actually tested. I read every diff and asked about anything I couldn't explain before merging.

Some things I pushed back on along the way:

- It bundled the project setup into the health check PR. After that I held it to one thing per PR.
- It named things in the code after the plan (`OUT_OF_SCOPE_*` in the config loader). Code should just say what it does and the plan belongs in docs. I caught it late and left that one as is to save time, but I kept it out of everything after.
- I had it explain the alternatives and trade-offs for every choice in each PR description, so every decision has a reason I can defend.
- The config PR ended up a lot bigger than the others, so I slowed down to review it properly and we cut rate limiting to make room. I would rather understand all of it than ship more of it.

Reviewing its work also caught some real bugs:

- A path like `//evil.com/api/users` was getting routed as `/api/users` because `new URL()` treats the start as a host. Fixed in the routing PR with a test.
- Starting the gateway on a port that's already taken crashed with a stack trace. Now it prints one line and exits.
- On Windows a refused connection has an empty error message, so the first 502 just said `localhost:3001: `. Now it uses the error code.

## My setup

This wasn't a plain chat with an LLM. I run Claude Code inside a harness I built myself, and most of what kept this project on track comes from it.

- **Rules and hooks I wrote.** A set of standing instructions plus hooks that run on every action. A task doesn't count as done until tests pass and the real thing has been exercised live. Commits get blocked if they include formatting-only churn, so diffs stay small and reviewable.
- **Code quality checks agents have to pass.** A smallest-diff hook compares `git diff` with and without whitespace and blocks any commit with formatting-only churn. A pre-commit review hands the change to a fresh agent with no context to look for problems before it lands. There are standing code rules too (strict TypeScript with no `any`, comments only for why and never what, loading and error states on anything that waits), plus a verify step for typecheck, lint, tests and build, and a multi-agent review I can run against a PR.
- **Done contracts and stop gates.** Before a task starts the agent writes down what done means and how it gets checked. A set of stop hooks won't let it end a turn while that is unmet or while it has unfinished work it could do itself.
- **Guard hooks.** Separate hooks block things like heavy builds running on the shared server, background processes started without a deadline, and internal notes ending up in a repo. A couple of them fired during this project.
- **Memory and an improvement loop.** Corrections I give it get saved and carry over to later sessions, and problems it hits get logged so they get fixed at the source. The rule about keeping the plan out of the code got saved that way during this project, and two problems got logged.
- **A dashboard I built to run it.** Agent sessions run in terminals inside my own command center app, so I can watch what each one is doing.
- **Build on one machine, run on another.** The agent works from my server and runs and tests everything on my laptop over SSH, so every PR here was actually run on the machine I'm presenting from.
- **Browser automation I built.** The agent drives my real browser, which is how each PR showed up as a prefilled draft for me to read before I created and merged it.
- **The PR and testing structure.** The PR template and one-thing-per-PR rule come from how I work day to day, and I added the CI pipeline here so every PR runs the typecheck and tests on GitHub before merge.

All of that is there to catch the AI's mistakes before they reach main, which is why the bugs above got caught in review instead of in production.
