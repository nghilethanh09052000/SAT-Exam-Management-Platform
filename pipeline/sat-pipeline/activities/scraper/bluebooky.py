import asyncio
import hashlib
from datetime import datetime

import structlog
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from temporalio import activity

from config import settings
from models import RawQuestion

log = structlog.get_logger()


@activity.defn
async def get_bluebooky_total_pages() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(settings.bluebooky_base_url, wait_until="networkidle")
        content = await page.content()
        await browser.close()

    soup = BeautifulSoup(content, "html.parser")
    # Adjust selector to match site's actual pagination markup
    pagination = soup.select("[aria-label='pagination'] a, .pagination a")
    page_numbers = [int(a.text.strip()) for a in pagination if a.text.strip().isdigit()]
    return max(page_numbers, default=1)


@activity.defn
async def scrape_bluebooky_listing_page(page_number: int) -> list[str]:
    """Return all question detail URLs found on a listing page."""
    activity.heartbeat(f"listing page {page_number}")
    url = f"{settings.bluebooky_base_url}?page={page_number}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="networkidle")
        content = await page.content()
        await browser.close()

    soup = BeautifulSoup(content, "html.parser")
    links = soup.select("a[href*='/question/']")
    urls = list({settings.bluebooky_base_url.rstrip("/") + a["href"] for a in links if a.get("href")})
    log.info("bluebooky listing scraped", page=page_number, urls_found=len(urls))
    await asyncio.sleep(settings.scraper_delay_seconds)
    return urls


@activity.defn
async def scrape_bluebooky_question(url: str) -> RawQuestion:
    activity.heartbeat(url)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until="networkidle")
        content = await page.content()
        await browser.close()

    soup = BeautifulSoup(content, "html.parser")

    question_text = _extract_text(soup, "[data-testid='question-text'], .question-text, h2")
    section = _extract_text(soup, "[data-testid='section'], .section-badge") or "Unknown"
    domain = _extract_text(soup, "[data-testid='domain'], .domain-badge") or "Unknown"
    difficulty = _extract_text(soup, "[data-testid='difficulty'], .difficulty-badge")

    choices: dict[str, str] = {}
    for choice in soup.select("[data-testid='choice'], .answer-choice"):
        label_el = choice.select_one(".choice-label, [data-testid='choice-label']")
        text_el = choice.select_one(".choice-text, [data-testid='choice-text']")
        if label_el and text_el:
            choices[label_el.text.strip()] = text_el.text.strip()

    correct_answer = _extract_text(soup, "[data-testid='correct-answer'], .correct-answer") or ""
    explanation = _extract_text(soup, "[data-testid='explanation'], .explanation")

    question_id = hashlib.sha256(f"bluebooky:{url}:{question_text}".encode()).hexdigest()[:16]

    await asyncio.sleep(settings.scraper_delay_seconds)
    return RawQuestion(
        question_id=question_id,
        source="bluebooky",
        source_url=url,
        section=section,
        domain=domain,
        difficulty=difficulty,
        question_text=question_text,
        choices=choices,
        correct_answer=correct_answer,
        explanation=explanation,
        scraped_at=datetime.utcnow(),
    )


def _extract_text(soup: BeautifulSoup, selector: str) -> str:
    for sel in selector.split(", "):
        el = soup.select_one(sel.strip())
        if el:
            return el.get_text(strip=True)
    return ""
