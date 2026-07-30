"""IDE username validation -- shared by GET /api/v1/user/check-username
and POST /api/v1/user/complete-profile so the two endpoints can never
disagree on what's a valid username.

The `users` table's CHECK constraints (see ../../supabase_migration_users.sql)
mirror this regex and reserved list as a defense-in-depth backstop -- this
module still owns the actual user-facing error copy.
"""

import re

_USERNAME_RE = re.compile(r"^[a-z][a-z0-9_-]{3,29}$")

# Platform routes/identity words that would collide with URLs like
# /u/<username> or otherwise be confusing/impersonation-prone as a handle.
RESERVED_USERNAMES = frozenset(
    {
        "admin",
        "support",
        "root",
        "system",
        "api",
        "help",
        "login",
        "logout",
        "dashboard",
        "www",
        "github",
        "google",
        "meta",
        "null",
        "undefined",
        "me",
    }
)


def validate_username_format(username: str) -> str | None:
    """Returns an error message, or None if the format is valid.
    Does NOT check availability -- callers combine this with a uniqueness
    lookup (see app/services/user_service.py)."""

    if not username:
        return "Username is required."
    if not _USERNAME_RE.match(username):
        if len(username) < 4 or len(username) > 30:
            return "Username must be 4-30 characters."
        if not username[0].isalpha():
            return "Username must start with a letter."
        return "Username can only contain lowercase letters, numbers, underscores, and hyphens."
    if username in RESERVED_USERNAMES:
        return "This username is reserved. Please choose another."
    return None
