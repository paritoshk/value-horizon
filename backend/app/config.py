import os

from dotenv import load_dotenv

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

SAIL_API_KEY = os.environ.get("SAIL_API_KEY", "")
FIREWORKS_API_KEY = os.environ.get("FIREWORKS_API_KEY", "")
# LiteLLM reads FIREWORKS_AI_API_KEY; unused unless we fall back.
if FIREWORKS_API_KEY and not os.environ.get("FIREWORKS_AI_API_KEY"):
    os.environ["FIREWORKS_AI_API_KEY"] = FIREWORKS_API_KEY
BRAINTRUST_API_KEY = os.environ.get("BRAINTRUST_API_KEY", "")

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.sailresearch.com/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "zai-org/GLM-5.2-FP8")
LLM_READY = bool(SAIL_API_KEY)

POLL_FAST_S = int(os.environ.get("POLL_FAST_S", "10"))
ANALYST_S = int(os.environ.get("ANALYST_S", "90"))
REFIT_S = int(os.environ.get("REFIT_S", "900"))
REFIT_MIN_NEW_FILLS = int(os.environ.get("REFIT_MIN_NEW_FILLS", "200"))

N_MARKETS = int(os.environ.get("N_MARKETS", "8"))
BACKFILL_FILLS_PER_MARKET = int(os.environ.get("BACKFILL_FILLS_PER_MARKET", "500"))
NULL_DRAWS = int(os.environ.get("NULL_DRAWS", "60"))
BOOTSTRAP_B = int(os.environ.get("BOOTSTRAP_B", "15"))

BUDGET_USD = float(os.environ.get("BUDGET_USD", "1000"))
# Supervisor act threshold on the normalized [-1, 1] score. 0.6 demanded
# near-unanimity; 0.35 = a weighted-majority consensus, still arithmetic.
MIN_SCORE = float(os.environ.get("MIN_SCORE", "0.35"))
CHECKPOINT_PATH = os.environ.get("CHECKPOINT_PATH",
    os.path.join(os.path.dirname(__file__), "..", "checkpoints", "state.json"))
JOURNAL_PATH = os.environ.get("JOURNAL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "checkpoints", "journal.jsonl"))
