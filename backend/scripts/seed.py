"""Create the tables and seed the demo data (FR-1.4). The API also does this on start-up when the database is empty.

python scripts/seed.py           # seed if empty
python scripts/seed.py --reset   # delete everything first (demo reset)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base, make_engine, make_session_factory  # noqa: E402
from app.engines.catalog import load_catalog  # noqa: E402
from app.seed import seed_if_empty  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Aegis database")
    parser.add_argument("--reset", action="store_true", help="drop every table first")
    args = parser.parse_args()
    settings = get_settings()
    engine = make_engine(settings.database_url)
    if args.reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seeded = seed_if_empty(make_session_factory(engine), settings, load_catalog(settings.data_dir))
    print("Seeded demo accounts and products." if seeded else "Database already has users; nothing to do.")


if __name__ == "__main__":
    main()
