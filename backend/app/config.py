import os

from dotenv import load_dotenv

load_dotenv()

FIREWORKS_API_KEY = os.environ.get("FIREWORKS_API_KEY", "")
# LiteLLM reads FIREWORKS_AI_API_KEY; accept the shorter form too.
if FIREWORKS_API_KEY and not os.environ.get("FIREWORKS_AI_API_KEY"):
    os.environ["FIREWORKS_AI_API_KEY"] = FIREWORKS_API_KEY
BRAINTRUST_API_KEY = os.environ.get("BRAINTRUST_API_KEY", "")

LLM_MODEL = os.environ.get("LLM_MODEL", "fireworks_ai/accounts/fireworks/models/kimi-k2-instruct")

POLL_FAST_S = int(os.environ.get("POLL_FAST_S", "10"))
ANALYST_S = int(os.environ.get("ANALYST_S", "90"))
REFIT_S = int(os.environ.get("REFIT_S", "900"))
REFIT_MIN_NEW_FILLS = int(os.environ.get("REFIT_MIN_NEW_FILLS", "200"))

N_MARKETS = int(os.environ.get("N_MARKETS", "8"))
BACKFILL_FILLS_PER_MARKET = int(os.environ.get("BACKFILL_FILLS_PER_MARKET", "500"))
NULL_DRAWS = int(os.environ.get("NULL_DRAWS", "60"))
BOOTSTRAP_B = int(os.environ.get("BOOTSTRAP_B", "15"))

BUDGET_USD = float(os.environ.get("BUDGET_USD", "1000"))
CHECKPOINT_PATH = os.environ.get("CHECKPOINT_PATH",
    os.path.join(os.path.dirname(__file__), "..", "checkpoints", "state.json"))
JOURNAL_PATH = os.environ.get("JOURNAL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "checkpoints", "journal.jsonl"))
