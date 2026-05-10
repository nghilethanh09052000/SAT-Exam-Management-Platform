import asyncio
import hashlib
from datetime import datetime

import structlog
from bs4 import BeautifulSoup
from playwright.async_api import Page, async_playwright
from temporalio import activity

from config import settings
from models import RawQuestion

log = structlog.get_logger()


async def _login(page: Page) -> None:
    await page.goto(f"{settings.satgpt_base_url}/login", wait_until="networkidle")
    await page.fill("input[type='email']", settings.satgpt_email)
    await page.fill("input[type='password']", settings.satgpt_password)
    await page.click("button[type='submit']")
    await page.wait_for_url(f"{settings.satgpt_base_url}/dashboard**", timeout=15_000)


@activity.defn
async def get_satgpt_total_pages() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await _login(page)
        await page.goto(f"{settings.satgpt_base_url}/dashboard", wait_until="networkidle")
        content = await page.content()
        await browser.close()

    soup = BeautifulSoup(content, "html.parser")
    pagination = soup.select("[aria-label='pagination'] a, .pagination a")
    page_numbers = [int(a.text.strip()) for a in pagination if a.text.strip().isdigit()]
    return max(page_numbers, default=1)


@activity.defn
async def scrape_satgpt_listing_page(page_number: int) -> list[str]:
    activity.heartbeat(f"listing page {page_number}")
    url = f"{settings.satgpt_base_url}/dashboard?page={page_number}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await _login(page)
        await page.goto(url, wait_until="networkidle")
        content = await page.content()
        await browser.close()

    soup = BeautifulSoup(content, "html.parser")
    links = soup.select("a[href*='/question/']")
    urls = list({settings.satgpt_base_url.rstrip("/") + a["href"] for a in links if a.get("href")})
    log.info("satgpt listing scraped", page=page_number, urls_found=len(urls))
    await asyncio.sleep(settings.scraper_delay_seconds)
    return urls


@activity.defn
async def scrape_satgpt_question(url: str) -> RawQuestion:
    activity.heartbeat(url)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await _login(page)
        await page.goto(url, wait_until="networkidle")
        content = await page.content()
        await browser.close()

    soup = BeautifulSoup(content, "html.parser")

    question_text = _extract_text(soup, ".question-text, [data-testid='question']")
    section = _extract_text(soup, ".section, [data-testid='section']") or "Unknown"
    domain = _extract_text(soup, ".domain, [data-testid='domain']") or "Unknown"
    difficulty = _extract_text(soup, ".difficulty, [data-testid='difficulty']")

    choices: dict[str, str] = {}
    for choice in soup.select(".choice, [data-testid='choice']"):
        label_el = choice.select_one(".label")
        text_el = choice.select_one(".text")
        if label_el and text_el:
            choices[label_el.text.strip()] = text_el.text.strip()

    correct_answer = _extract_text(soup, ".correct-answer, [data-testid='answer']") or ""
    explanation = _extract_text(soup, ".explanation, [data-testid='explanation']")

    question_id = hashlib.sha256(f"satgpt:{url}:{question_text}".encode()).hexdigest()[:16]

    await asyncio.sleep(settings.scraper_delay_seconds)
    return RawQuestion(
        question_id=question_id,
        source="satgpt",
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
