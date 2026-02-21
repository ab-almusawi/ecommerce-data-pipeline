"""
Retry utilities with exponential backoff and jitter.
Provides production-grade retry mechanisms for resilient operations.
"""

import functools
import logging
import random
import time
from typing import Callable, Optional, Tuple, Type, TypeVar, Union

from exceptions import IngestionError

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RetryConfig:
    """Configuration for retry behavior."""

    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        jitter_range: Tuple[float, float] = (0.5, 1.5),
        retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
        non_retryable_exceptions: Tuple[Type[Exception], ...] = (),
    ):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.jitter_range = jitter_range
        self.retryable_exceptions = retryable_exceptions
        self.non_retryable_exceptions = non_retryable_exceptions

    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt with exponential backoff and jitter."""
        delay = self.base_delay * (self.exponential_base ** attempt)
        delay = min(delay, self.max_delay)
        
        if self.jitter:
            jitter_factor = random.uniform(*self.jitter_range)
            delay *= jitter_factor
        
        return delay


def retry_with_backoff(
    config: Optional[RetryConfig] = None,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
    on_retry: Optional[Callable[[Exception, int], None]] = None,
):
    """
    Decorator for retrying functions with exponential backoff.
    
    Args:
        config: RetryConfig instance (overrides other params if provided)
        max_attempts: Maximum number of attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        retryable_exceptions: Tuple of exception types to retry
        on_retry: Callback function called on each retry
        
    Returns:
        Decorated function with retry logic
        
    Example:
        @retry_with_backoff(max_attempts=3, base_delay=1.0)
        def call_external_api():
            response = requests.get("https://api.example.com")
            response.raise_for_status()
            return response.json()
    """
    if config is None:
        config = RetryConfig(
            max_attempts=max_attempts,
            base_delay=base_delay,
            max_delay=max_delay,
            retryable_exceptions=retryable_exceptions,
        )

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            last_exception: Optional[Exception] = None
            
            for attempt in range(config.max_attempts):
                try:
                    return func(*args, **kwargs)
                except config.non_retryable_exceptions as e:
                    logger.warning(
                        f"Non-retryable exception in {func.__name__}: {e}"
                    )
                    raise
                except config.retryable_exceptions as e:
                    last_exception = e
                    
                    if attempt < config.max_attempts - 1:
                        delay = config.calculate_delay(attempt)
                        
                        logger.warning(
                            f"Attempt {attempt + 1}/{config.max_attempts} failed for "
                            f"{func.__name__}: {e}. Retrying in {delay:.2f}s"
                        )
                        
                        if on_retry:
                            on_retry(e, attempt + 1)
                        
                        time.sleep(delay)
                    else:
                        logger.error(
                            f"All {config.max_attempts} attempts failed for "
                            f"{func.__name__}: {e}"
                        )
            
            if last_exception:
                raise last_exception
            raise RuntimeError(f"Retry loop completed without success or exception")
        
        return wrapper
    return decorator


class RetryableOperation:
    """
    Context manager for retryable operations with more control.
    
    Example:
        async with RetryableOperation(config) as op:
            for attempt in op:
                try:
                    result = await call_api()
                    break
                except ApiError as e:
                    if not op.should_retry(e):
                        raise
    """

    def __init__(self, config: Optional[RetryConfig] = None):
        self.config = config or RetryConfig()
        self.attempt = 0
        self.last_exception: Optional[Exception] = None

    def __iter__(self):
        return self

    def __next__(self) -> int:
        if self.attempt >= self.config.max_attempts:
            if self.last_exception:
                raise self.last_exception
            raise StopIteration
        
        if self.attempt > 0 and self.last_exception:
            delay = self.config.calculate_delay(self.attempt - 1)
            logger.info(f"Waiting {delay:.2f}s before retry attempt {self.attempt + 1}")
            time.sleep(delay)
        
        current_attempt = self.attempt
        self.attempt += 1
        return current_attempt

    def should_retry(self, exception: Exception) -> bool:
        """Check if exception is retryable and record it."""
        self.last_exception = exception
        
        if isinstance(exception, self.config.non_retryable_exceptions):
            return False
        
        if isinstance(exception, IngestionError) and not exception.retryable:
            return False
        
        return (
            isinstance(exception, self.config.retryable_exceptions)
            and self.attempt < self.config.max_attempts
        )

    def record_success(self):
        """Record successful operation."""
        self.last_exception = None
