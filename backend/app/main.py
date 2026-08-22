import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .api.routes import router
from .engine.journal import Journal
from .sentinel import run_sentinel
from .state import AppState


@asynccontextmanager
async def lifespan(app: FastAPI):
    world = AppState()
    journal = Journal(config.JOURNAL_PATH)
    app.state.world = world
    app.state.journal = journal
    task = asyncio.create_task(run_sentinel(world, journal))
    yield
    task.cancel()


app = FastAPI(title="lead-lag-sentinel", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])
app.include_router(router)
