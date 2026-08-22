"""Braintrust tracing — strictly optional. Without BRAINTRUST_API_KEY every
wrapper is a no-op passthrough.
"""

import functools

from .. import config

_logger = None
if config.BRAINTRUST_API_KEY:
    try:
        import braintrust
        _logger = braintrust.init_logger(project="lead-lag-sentinel")
    except Exception:
        _logger = None


def traced(name: str):
    def deco(fn):
        if _logger is None:
            return fn

        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            import braintrust
            with braintrust.start_span(name=name) as span:
                out = await fn(*args, **kwargs)
                try:
                    span.log(input={"args": str(args)[:2000]}, output=str(out)[:2000])
                except Exception:
                    pass
                return out
        return wrapper
    return deco
