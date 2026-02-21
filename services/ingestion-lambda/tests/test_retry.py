"""Tests for retry utilities."""

import pytest
import time
from unittest.mock import Mock, patch
from src.retry import RetryConfig, retry_with_backoff, RetryableOperation


class TestRetryConfig:
    """Tests for RetryConfig."""

    def test_default_config(self):
        """Test default retry configuration."""
        config = RetryConfig()
        assert config.max_attempts == 3
        assert config.base_delay == 1.0
        assert config.max_delay == 60.0

    def test_calculate_delay_exponential(self):
        """Test exponential backoff calculation."""
        config = RetryConfig(base_delay=1.0, exponential_base=2.0, jitter=False)
        
        assert config.calculate_delay(0) == 1.0
        assert config.calculate_delay(1) == 2.0
        assert config.calculate_delay(2) == 4.0

    def test_calculate_delay_max_cap(self):
        """Test delay is capped at max_delay."""
        config = RetryConfig(base_delay=10.0, max_delay=30.0, jitter=False)
        
        assert config.calculate_delay(5) == 30.0

    def test_calculate_delay_jitter(self):
        """Test jitter adds randomness."""
        config = RetryConfig(base_delay=1.0, jitter=True, jitter_range=(0.5, 1.5))
        
        delays = [config.calculate_delay(0) for _ in range(10)]
        assert not all(d == delays[0] for d in delays)


class TestRetryWithBackoff:
    """Tests for retry_with_backoff decorator."""

    def test_success_no_retry(self):
        """Test successful call doesn't retry."""
        call_count = 0

        @retry_with_backoff(max_attempts=3, base_delay=0.01)
        def successful_func():
            nonlocal call_count
            call_count += 1
            return "success"

        result = successful_func()
        assert result == "success"
        assert call_count == 1

    def test_retry_on_exception(self):
        """Test retry on exception."""
        call_count = 0

        @retry_with_backoff(max_attempts=3, base_delay=0.01)
        def failing_then_success():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError("Temporary failure")
            return "success"

        result = failing_then_success()
        assert result == "success"
        assert call_count == 3

    def test_max_retries_exceeded(self):
        """Test exception raised after max retries."""
        call_count = 0

        @retry_with_backoff(max_attempts=3, base_delay=0.01)
        def always_failing():
            nonlocal call_count
            call_count += 1
            raise ValueError("Always fails")

        with pytest.raises(ValueError, match="Always fails"):
            always_failing()
        
        assert call_count == 3

    def test_non_retryable_exception(self):
        """Test non-retryable exceptions aren't retried."""
        call_count = 0
        
        config = RetryConfig(
            max_attempts=3,
            base_delay=0.01,
            non_retryable_exceptions=(TypeError,),
            retryable_exceptions=(Exception,),
        )

        @retry_with_backoff(config=config)
        def raises_type_error():
            nonlocal call_count
            call_count += 1
            raise TypeError("Non-retryable")

        with pytest.raises(TypeError):
            raises_type_error()
        
        assert call_count == 1

    def test_on_retry_callback(self):
        """Test on_retry callback is called."""
        retries = []

        def on_retry(exc, attempt):
            retries.append((str(exc), attempt))

        call_count = 0

        @retry_with_backoff(max_attempts=3, base_delay=0.01, on_retry=on_retry)
        def failing_twice():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError(f"Attempt {call_count}")
            return "success"

        result = failing_twice()
        assert result == "success"
        assert len(retries) == 2


class TestRetryableOperation:
    """Tests for RetryableOperation context manager."""

    def test_retryable_operation_success(self):
        """Test successful operation."""
        op = RetryableOperation(RetryConfig(max_attempts=3))
        
        for attempt in op:
            break
        
        op.record_success()
        assert op.last_exception is None

    def test_retryable_operation_retry(self):
        """Test operation with retries."""
        op = RetryableOperation(RetryConfig(max_attempts=3, base_delay=0.01))
        attempts = []
        
        for attempt in op:
            attempts.append(attempt)
            if attempt < 2:
                exc = ValueError("Retry needed")
                if op.should_retry(exc):
                    continue
            break
        
        assert len(attempts) == 3

    def test_should_retry_checks_retryable(self):
        """Test should_retry checks exception type."""
        config = RetryConfig(
            max_attempts=3,
            retryable_exceptions=(ValueError,),
        )
        op = RetryableOperation(config)
        
        assert op.should_retry(ValueError("retryable")) is True
        assert op.should_retry(TypeError("non-retryable")) is False
