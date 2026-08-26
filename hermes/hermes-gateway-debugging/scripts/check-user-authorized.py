#!/usr/bin/env python3
"""Check whether a user is authorized on a Hermes gateway platform.

Mirrors gateway/authz_mixin._is_user_authorized minus the live in-memory
process env (it reads from disk: .env + pairing store). Useful to confirm a
fix landed without tailing logs or restarting the gateway.

Usage:
    scripts/check-user-authorized.py discord 1051160138746171432
    scripts/check-user-authorized.py telegram 123456789

Exit code 0 = authorized, 1 = not authorized (per on-disk state).
"""
import json
import os
import sys

HERMES_HOME = os.path.expanduser(os.environ.get("HERMES_HOME", "~/.hermes"))
PAIRING_DIR = os.path.join(HERMES_HOME, "platforms", "pairing")


def read_env_allowlist(env_path, var_name):
    try:
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if line.startswith(var_name + "="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return ""


def pairing_approved(platform, user_id):
    path = os.path.join(PAIRING_DIR, f"{platform}-approved.json")
    if not os.path.exists(path):
        return False
    try:
        data = json.load(open(path, encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    return user_id in data


def main():
    if len(sys.argv) < 3:
        print("usage: check-user-authorized.py <platform> <user_id> [env_var]",
              file=sys.stderr)
        return 2
    platform = sys.argv[1].lower()
    user_id = sys.argv[2]
    env_var = sys.argv[3] if len(sys.argv) > 3 else f"{platform.upper()}_ALLOWED_USERS"

    env_path = os.path.join(HERMES_HOME, ".env")
    allow = read_env_allowlist(env_path, env_var)
    allow_ids = {x.strip() for x in allow.split(",") if x.strip()}

    authorized = ("*" in allow_ids) or (user_id in allow_ids) or \
        pairing_approved(platform, user_id)

    print(f"platform      : {platform}")
    print(f"user_id       : {user_id}")
    print(f"env var       : {env_var} = {allow or '(unset)'}")
    print(f"pairing file  : {os.path.join(PAIRING_DIR, platform + '-approved.json')}")
    print(f"AUTHORIZED    : {authorized}")
    return 0 if authorized else 1


if __name__ == "__main__":
    sys.exit(main())
