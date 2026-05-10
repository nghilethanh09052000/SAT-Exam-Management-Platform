from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models import RawQuestion


@pytest.mark.asyncio
async def test_scrape_bluebooky_question_returns_raw_question() -> None:
    """Smoke-test: parsing logic returns a valid RawQuestion when given known HTML."""
    html = """
    <html><body>
      <div class="question-text">What is 2+2?</div>
      <div class="section-badge">Math</div>
      <div class="domain-badge">Algebra</div>
      <div class="difficulty-badge">Easy</div>
      <div class="answer-choice">
        <span class="choice-label">A</span>
        <span class="choice-text">3</span>
      </div>
      <div class="answer-choice">
        <span class="choice-label">B</span>
        <span class="choice-text">4</span>
      </div>
      <div class="correct-answer">B</div>
      <div class="explanation">2+2=4</div>
    </body></html>
    """

    mock_page = AsyncMock()
    mock_page.goto = AsyncMock()
    mock_page.content = AsyncMock(return_value=html)

    mock_browser = AsyncMock()
    mock_browser.new_page = AsyncMock(return_value=mock_page)
    mock_browser.close = AsyncMock()

    mock_playwright = AsyncMock()
    mock_playwright.__aenter__ = AsyncMock(return_value=mock_playwright)
    mock_playwright.__aexit__ = AsyncMock(return_value=None)
    mock_playwright.chromium.launch = AsyncMock(return_value=mock_browser)

    with patch("activities.scraper.bluebooky.async_playwright", return_value=mock_playwright):
        with patch("activities.scraper.bluebooky.asyncio.sleep", new_callable=AsyncMock):
            from activities.scraper.bluebooky import scrape_bluebooky_question

            # Bypass Temporal activity context for unit test
            result = await scrape_bluebooky_question.__wrapped__("https://bluebooky.com/question/1")  # type: ignore[attr-defined]

    assert isinstance(result, RawQuestion)
    assert result.source == "bluebooky"
    assert result.correct_answer == "B"
    assert result.section == "Math"
    assert "B" in result.choices
