#!/usr/bin/env python3
"""Reproducible two-session races for the uncertainty-reduction release.

Run after the full local migration chain has been loaded into a throwaway
PostgreSQL container:

    python supabase/rehearsal/races.py --container stoop-rehearsal

The script uses only the Python standard library and docker exec. Every scenario
uses separate psql processes, then calls the checked-in SQL invariant function.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

HOST = "a0000000-0000-4000-8000-000000000001"
JOINER_A = "a0000000-0000-4000-8000-000000000002"
CONV_A = "c0000000-0000-4000-8000-000000000001"
CONV_B = "c0000000-0000-4000-8000-000000000002"


@dataclass
class Result:
    output: str = ""
    error: BaseException | None = None


class Harness:
    def __init__(self, container: str, database: str, user: str) -> None:
        self.container = container
        self.database = database
        self.user = user

    def psql(self, sql: str, *, tuples: bool = True) -> str:
        command = [
            "docker", "exec", "-i", self.container,
            "psql", "-U", self.user, "-d", self.database,
            "-v", "ON_ERROR_STOP=1", "-q",
        ]
        if tuples:
            command.extend(["-A", "-t"])
        completed = subprocess.run(
            command,
            input=sql,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
        )
        if completed.returncode:
            raise RuntimeError(
                f"psql exited {completed.returncode}: {completed.stderr.strip()}"
            )
        return completed.stdout.strip()

    def load_fixture(self, path: Path) -> None:
        self.psql(path.read_text(encoding="utf-8"), tuples=False)

    def reset(
        self,
        *,
        total: int = 1,
        left: int = 1,
        status_a: str = "pending",
        status_b: str = "pending",
        block: str | None = None,
        messages_from_a: int = 0,
    ) -> None:
        block_sql = "NULL" if block is None else "'" + block.replace("'", "''") + "'"
        self.psql(
            "SELECT rehearsal.reset_race("
            f"{total}, {left}, '{status_a}', '{status_b}', {block_sql}, {messages_from_a}"
            ");"
        )

    def state(self) -> dict[str, Any]:
        raw = self.psql("SELECT rehearsal.race_state();")
        return json.loads(raw.splitlines()[-1])

    def invariants(self) -> None:
        result = self.psql("SELECT rehearsal.assert_invariants();")
        require(result.splitlines()[-1] == "INVARIANTS OK", result)

    def pair(self, first_sql: str, second_sql: str, delay: float = 0.0) -> tuple[str, str]:
        ready = threading.Barrier(3)
        first = Result()
        second = Result()

        def worker(target: Result, sql: str, wait_after_barrier: float) -> None:
            try:
                ready.wait()
                if wait_after_barrier:
                    time.sleep(wait_after_barrier)
                target.output = self.psql(sql)
            except BaseException as exc:  # surface thread errors in the caller
                target.error = exc

        a = threading.Thread(target=worker, args=(first, first_sql, 0.0), daemon=True)
        b = threading.Thread(target=worker, args=(second, second_sql, delay), daemon=True)
        a.start()
        b.start()
        ready.wait()
        a.join(15)
        b.join(15)
        require(not a.is_alive() and not b.is_alive(), "race timed out")
        if first.error:
            raise first.error
        if second.error:
            raise second.error
        return first.output, second.output


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def last_json(output: str) -> dict[str, Any]:
    for line in reversed(output.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            return json.loads(line)
    raise AssertionError(f"no JSON result in: {output!r}")


def rpc(sql: str, hold: float = 0.0) -> str:
    sleep = f"SELECT pg_sleep({hold});" if hold else ""
    return f"BEGIN; {sql}; {sleep} COMMIT;"


def run(container: str, database: str, user: str, fixture: Path) -> None:
    h = Harness(container, database, user)
    h.load_fixture(fixture)

    print("RACE 1: legacy symmetric blocks deny confirmation")
    for direction in ("host_blocks_a", "a_blocks_host"):
        h.reset(status_b="absent", block=direction)
        response = last_json(h.psql(
            f"SELECT public.confirm_conversation('{CONV_A}', '{HOST}', 'confirm');"
        ))
        state = h.state()
        require(response.get("ok") is False and response.get("code") == "blocked", str(response))
        require(state["conv_a"] == "pending" and state["spots_left"] == 1, str(state))
        h.invariants()
    print("RACE 1 PASS")

    print("RACE 2: block-first serializes before confirmation")
    h.reset(status_b="absent")
    block, confirm = h.pair(
        rpc(f"SELECT public.block_and_close('{HOST}', '{JOINER_A}')", 0.8),
        f"SELECT public.confirm_conversation('{CONV_A}', '{HOST}', 'confirm');",
        delay=0.1,
    )
    state = h.state()
    require(last_json(block).get("ok") is True, block)
    require(last_json(confirm).get("ok") is False, confirm)
    require(state["conv_a"] == "declined" and state["blocks"] == 1 and state["spots_left"] == 1, str(state))
    h.invariants()
    print("RACE 2 PASS")

    print("RACE 3: confirm-first is closed and refunded by the committed block")
    h.reset(status_b="absent")
    confirm, block = h.pair(
        rpc(f"SELECT public.confirm_conversation('{CONV_A}', '{HOST}', 'confirm')", 0.8),
        f"SELECT public.block_and_close('{HOST}', '{JOINER_A}');",
        delay=0.1,
    )
    state = h.state()
    require(last_json(confirm).get("ok") is True, confirm)
    require(last_json(block).get("ok") is True, block)
    require(state["conv_a"] == "declined" and state["blocks"] == 1 and state["spots_left"] == 1, str(state))
    h.invariants()
    print("RACE 3 PASS")

    print("RACE 4: block-first prevents a stale message")
    h.reset(status_b="absent")
    block, send = h.pair(
        rpc(f"SELECT public.block_and_close('{HOST}', '{JOINER_A}')", 0.8),
        f"SELECT public.send_conversation_message('{CONV_A}', '{JOINER_A}', 'message that must not land', 50);",
        delay=0.1,
    )
    state = h.state()
    require(last_json(block).get("ok") is True, block)
    require(last_json(send).get("ok") is False, send)
    require(state["fresh_messages"] == 0 and state["conv_a"] == "declined", str(state))
    h.invariants()
    print("RACE 4 PASS")

    print("RACE 5: withdrawal-first prevents a stale message")
    h.reset(status_b="absent")
    withdraw, send = h.pair(
        rpc(f"SELECT public.withdraw_conversation('{CONV_A}', '{JOINER_A}')", 0.8),
        f"SELECT public.send_conversation_message('{CONV_A}', '{JOINER_A}', 'message that must not land', 50);",
        delay=0.1,
    )
    state = h.state()
    require(last_json(withdraw).get("ok") is True, withdraw)
    require(last_json(send).get("ok") is False, send)
    require(state["fresh_messages"] == 0 and state["conv_a"] == "withdrawn", str(state))
    h.invariants()
    print("RACE 5 PASS")

    print("RACE 6: sender-wide quota serializes across conversations")
    h.reset(total=2, left=2)
    h.psql(
        "INSERT INTO public.messages (conversation_id, from_user_id, text, created_at) "
        f"SELECT '{CONV_A}', '{HOST}', 'earlier host message ' || g, now() - interval '1 hour' "
        "FROM generate_series(1,49) g;"
    )
    a, b = h.pair(
        f"SELECT public.send_conversation_message('{CONV_A}', '{HOST}', 'quota race message a', 50);",
        f"SELECT public.send_conversation_message('{CONV_B}', '{HOST}', 'quota race message b', 50);",
    )
    responses = [last_json(a), last_json(b)]
    state = h.state()
    require(sum(r.get("ok") is True for r in responses) == 1, str(responses))
    require(sum(r.get("code") == "rate_limited" for r in responses) == 1, str(responses))
    require(state["fresh_messages"] == 1, str(state))
    h.invariants()
    print("RACE 6 PASS")

    print("RACE 7: final spot has exactly one winner")
    h.reset(total=1, left=1)
    a, b = h.pair(
        f"SELECT public.confirm_conversation('{CONV_A}', '{HOST}', 'confirm');",
        f"SELECT public.confirm_conversation('{CONV_B}', '{HOST}', 'confirm');",
    )
    responses = [last_json(a), last_json(b)]
    state = h.state()
    require(sum(r.get("ok") is True for r in responses) == 1, str(responses))
    require(sum(r.get("code") == "no_spots" for r in responses) == 1, str(responses))
    require([state["conv_a"], state["conv_b"]].count("confirmed") == 1, str(state))
    require(state["spots_left"] == 0 and state["plan_status"] == "full", str(state))
    h.invariants()
    print("RACE 7 PASS")

    print("RACE 8: first request cannot drift across an uncommitted block")
    h.reset(status_a="absent", status_b="absent")
    # Pause block_and_close after its block INSERT but before its conversation
    # scan. The request then creates an uncommitted conversation and holds it
    # open. Without a shared user-pair lock, the scan cannot see that row and
    # both transactions commit a pending conversation across a block.
    h.psql("""
      CREATE OR REPLACE FUNCTION rehearsal.delay_block_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.4);
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER delay_block_insert
        AFTER INSERT ON public.blocks
        FOR EACH ROW EXECUTE FUNCTION rehearsal.delay_block_insert();
    """)
    block, request = h.pair(
        f"SELECT public.block_and_close('{HOST}', '{JOINER_A}');",
        rpc(
            "SELECT public.start_or_reopen_conversation("
            f"'b0000000-0000-4000-8000-000000000001', '{JOINER_A}', "
            "'please let me join', false)",
            0.8,
        ),
        delay=0.1,
    )
    h.psql("""
      DROP TRIGGER delay_block_insert ON public.blocks;
      DROP FUNCTION rehearsal.delay_block_insert();
    """)
    state = h.state()
    require(last_json(block).get("ok") is True, block)
    require(last_json(request).get("ok") is False and last_json(request).get("code") == "blocked", request)
    require(state["conv_a"] is None and state["fresh_messages"] == 0 and state["blocks"] == 1, str(state))
    h.invariants()
    print("RACE 8 PASS")

    print("ALL TWO-SESSION RACES PASSED")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", required=True)
    parser.add_argument("--database", default="postgres")
    parser.add_argument("--user", default="postgres")
    parser.add_argument(
        "--fixture",
        type=Path,
        default=Path(__file__).with_name("05_race_fixture.sql"),
    )
    args = parser.parse_args()
    run(args.container, args.database, args.user, args.fixture)


if __name__ == "__main__":
    main()
