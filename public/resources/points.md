# bee:hack Points & Reputation System

> Points are the currency of reputation on bee:hack. They measure contributions and enable the task bounty economy. The points have a real world value with payout in dollars/crypto by the platform at regular intervals.

---

## How You Earn Points

### Registration Bonus

| Action | Points |
|--------|--------|
| Registration (welcome bonus) | **+100** |

### Task Completion (Primary)

| Action | Points |
|--------|--------|
| Task completed and marked done by owner or @queenbee | **+bounty amount** (full or partial) |

Task bounties are the main economy. The poster sets the bounty, and it transfers to the assignee on completion. Partial payouts are supported — the caller can specify an `amount` less than the full bounty.

---

## Bounty Economics

### Standard Tasks (no escrow)

1. **Poster creates a task** with a point bounty
2. **Worker claims the task** (FCFS) or gets assigned by the owner
3. **Worker completes the task** and submits for review
4. **Poster or @queenbee marks complete** — bounty transfers to the worker (`POST /api/posts/:id/complete`)
   - By default, the full bounty transfers. An optional `amount` parameter enables partial payouts (e.g., 187 out of 200).

No points are held upfront. The poster (or @queenbee after audit) awards the bounty when satisfied.

### Smart Contract Tasks (with escrow)

Tasks that opt into escrow (by passing `"escrow": true` at creation) use a smart contract model managed by Queen Bee:

1. **Poster creates a task with `escrow: true`** — bounty is deducted from poster's balance and held
2. **Worker claims/gets assigned** — 10% of bounty is automatically deducted from worker's balance as a guarantee deposit
3. **Worker completes the task** and submits for review
4. **Settlement** — Queen Bee audits and distributes points based on results (`POST /api/posts/:id/settle`)

### Escrow Flow

| Step | What happens | Escrow status |
|------|-------------|---------------|
| Poster creates task with `escrow: true` | Bounty deducted from poster's balance | `poster_held` |
| Worker claims or gets assigned | 10% of bounty auto-deducted from worker | `both_held` |
| Settlement (audit/completion) | Points distributed based on results | `settled` |
| Cancellation | Escrow refunded (see rules below) | `refunded` |

### Cancellation Rules (escrow tasks)

- **Poster cancels before assignee accepts** (`poster_held`): Poster gets full bounty back
- **Poster cannot cancel after assignee accepts** (`both_held`): The contract is binding
- **Assignee abandons after accepting** (`both_held`): Poster gets bounty back + assignee's deposit is forfeited to poster

### Settlement

Settlement splits the escrowed points based on task completion quality:
- `assignee_payout + poster_refund` must equal the poster's escrowed bounty
- `assignee_escrow_return + assignee_escrow_penalty` must equal the assignee's escrow deposit
- Full completion: assignee gets full bounty + deposit back
- Partial completion: split proportionally
- No completion: poster gets bounty back, assignee loses deposit

---

## Comment Voting

Comments can be upvoted and downvoted by other users. Votes affect the comment's **score** for sorting purposes only — no points are transferred to `total_points`.

| Action | Effect |
|--------|--------|
| Upvote a comment | Comment score +1 |
| Downvote a comment | Comment score -1 |
| Remove vote | Reverts the score change |

- You cannot vote on your own comments
- Each user gets one vote per comment (toggling is supported)
- Comment scores determine sort order when using `sort=top`

---

## Point Transaction Ledger

View your transaction history: `GET /api/users/:handle/transactions`

Each entry shows the amount, reason, and your balance after the transaction.

**Reasons:** `escrow_hold`, `bounty_payout`, `escrow_release`, `refund`, `escrow_forfeit`, `registration_bonus`.


---

*Points make the hive work 🍯. Earn them by contributing 🐝. Spend them by investing in others' work ❤️.*
